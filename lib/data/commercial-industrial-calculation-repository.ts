// Server-side data access for the C&I calculation flow — mirrors
// lib/data/calculation-repository.ts's role for residential: the one place
// that invokes the Edge Function and writes the resulting analytics/history
// row, so the API route layer stays about HTTP concerns (auth, validation,
// status codes), not Supabase calls.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildScenarioGrid,
  CI_ENGINE_VERSION,
  materializeScenarioDetail,
  recommendScenario,
  type BessProductSpec,
  type CommercialIndustrialOptions,
  type CommercialIndustrialResult,
} from '@/supabase/functions/_shared/commercial-industrial';

interface CiBessProductRow {
  id: string;
  model: string;
  module_power_kw: number;
  module_capacity_kwh: number;
  efficiency_percent: number;
  soc_min_percent: number;
  soc_max_percent: number;
}

function toBessProductSpec(row: CiBessProductRow): BessProductSpec {
  return {
    modulePowerKw: Number(row.module_power_kw),
    moduleCapacityKwh: Number(row.module_capacity_kwh),
    efficiencyPercent: Number(row.efficiency_percent),
    socMinPercent: Number(row.soc_min_percent),
    socMaxPercent: Number(row.soc_max_percent),
  };
}

async function computeInputFingerprint(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function calculateCommercialIndustrialDirect(
  supabase: SupabaseClient,
  body: { options: Record<string, unknown>; unitPriceBrl: number; additionalCostsBrl?: number }
): Promise<{ data: CommercialIndustrialResult | null; error: unknown }> {
  try {
    const options = body.options as unknown as CommercialIndustrialOptions;
    if (!options?.loadCurve || !options?.tariff || !options?.bessProductId) {
      return { data: null, error: { message: 'incomplete_configuration' } };
    }

    const { data: productRow, error: productError } = await supabase
      .from('ci_bess_products')
      .select('id, model, module_power_kw, module_capacity_kwh, efficiency_percent, soc_min_percent, soc_max_percent')
      .eq('id', options.bessProductId)
      .eq('active', true)
      .maybeSingle();

    if (productError || !productRow) {
      return { data: null, error: productError || { message: 'bess_product_not_found' } };
    }

    const product = toBessProductSpec(productRow as CiBessProductRow);
    const tariffWindow = { peakStart: options.tariff.peakStart, peakEnd: options.tariff.peakEnd };
    const peakShavingTargetKw = options.tariff.contractedDemandKw;

    const gridInput = {
      curve: options.loadCurve,
      product,
      strategy: options.strategy,
      sizing: options.sizing,
      tariffWindow,
      tariff: options.tariff,
      peakShavingTargetKw,
      unitPriceBrl: body.unitPriceBrl,
      additionalCostsBrl: body.additionalCostsBrl,
      monthsPerYear: options.financialAssumptions.monthsPerYear,
      financialAssumptions: options.financialAssumptions,
      backup: options.backup,
      solar: options.solar,
      generator: options.generator,
    };

    const { baseline, scenarios } = buildScenarioGrid(gridInput);
    if (scenarios.length === 0) {
      return { data: null, error: { message: 'no_scenarios_evaluated' } };
    }

    const recommendation = recommendScenario(
      scenarios,
      options.rankingCriterion,
      options.financialAssumptions.analysisHorizonYears
    );
    if (!recommendation) {
      return { data: null, error: { message: 'no_scenarios_evaluated' } };
    }

    const detailCandidate = recommendation.scenarioId
      ? scenarios.find((s) => s.scenarioId === recommendation.scenarioId)!
      : scenarios[0];
    const selected = materializeScenarioDetail(gridInput, detailCandidate.moduleCount, detailCandidate.marginalGain);

    const result: CommercialIndustrialResult = {
      engineVersion: CI_ENGINE_VERSION,
      inputFingerprint: await computeInputFingerprint(body),
      baseline,
      scenarios,
      recommendation,
      selected,
      assumptions: {
        tariff: options.tariff,
        financial: options.financialAssumptions,
        loadCurve: {
          resolutionMinutes: options.loadCurve.resolutionMinutes,
          profileBasis: options.loadCurve.profileBasis,
          periodStart: options.loadCurve.periodStart,
          periodEnd: options.loadCurve.periodEnd,
          timezone: options.loadCurve.timezone,
        },
      },
      warnings: scenarios.flatMap((s) => s.technicalWarnings),
      backup: selected.backupResult,
    };

    return { data: result, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function invokeCommercialIndustrialCalculation(
  supabase: SupabaseClient,
  body: { options: Record<string, unknown>; unitPriceBrl: number; additionalCostsBrl?: number }
) {
  try {
    const res = await supabase.functions.invoke('calculate-commercial-industrial', { body });
    if (!res.error && res.data) {
      const data = res.data as CommercialIndustrialResult;
      const options = body.options as unknown as CommercialIndustrialOptions;
      const solarExpected = Boolean(options?.solar?.enabled && (options.solar.installedPowerKwp ?? 0) > 0);
      const hasSolar = Boolean(data?.selected?.dispatch?.some((p) => (p.solarGenerationKw ?? 0) > 0));

      const genExpected = Boolean(
        options?.generator?.enabled &&
        (options.generator.ratedPowerKva ?? 0) > 0 &&
        (options.generator.dispatchMode === 'peak_support' || options.generator.dispatchMode === 'peak_and_blackout')
      );
      const hasGen = Boolean(data?.selected?.dispatch?.some((p) => (p.generatorKw ?? 0) > 0));

      if ((!solarExpected || hasSolar) && (!genExpected || hasGen)) {
        return res;
      }
    }
  } catch {
    // remote invocation failed, fall back below
  }

  return calculateCommercialIndustrialDirect(supabase, body);
}

/** Looks up the current user's own price for a C&I BESS product — the
 * closed pricing decision (plan section 4.3/6.1): ci_bess_products carries
 * no cost, user_stock_items (extended with product_type = 'ci_bess') does,
 * exactly like it already does for inverters/batteries. */
export async function findUserBessUnitPrice(supabase: SupabaseClient, userId: string, productModel: string) {
  const { data, error } = await supabase
    .from('user_stock_items')
    .select('unit_value')
    .eq('user_id', userId)
    .eq('product_type', 'ci_bess')
    .eq('product_model', productModel)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.unit_value) : null;
}

export async function checkUserCiAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, feature_flags')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const row = data as { role?: string; feature_flags?: string[] };
  return row.role === 'admin' || (Array.isArray(row.feature_flags) && row.feature_flags.includes('ci'));
}

export async function checkUserCiBackupAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, feature_flags')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const row = data as { role?: string; feature_flags?: string[] };
  return row.role === 'admin' || (Array.isArray(row.feature_flags) && row.feature_flags.includes('ci_backup'));
}

export async function findBessProductModel(supabase: SupabaseClient, bessProductId: string) {
  const { data, error } = await supabase.from('ci_bess_products').select('model').eq('id', bessProductId).eq('active', true).maybeSingle();
  if (error) throw error;
  return data?.model ?? null;
}

export interface CiProjectRow {
  id: string;
  installation_type: string;
  calculation_options: Record<string, unknown>;
}

/** RLS on `projects` already scopes this to the caller's own row — a
 * project belonging to another user or that doesn't exist both resolve to
 * `null` here, indistinguishably, which is the point (plan's security
 * section: no way to tell "not yours" from "doesn't exist" by ID alone). */
export async function findOwnCiProject(supabase: SupabaseClient, projectId: string): Promise<CiProjectRow | null> {
  const { data, error } = await supabase.from('projects').select('id, installation_type, calculation_options').eq('id', projectId).maybeSingle();
  if (error) throw error;
  return data as CiProjectRow | null;
}

export async function recordCalculationRun(
  supabase: SupabaseClient,
  payload: {
    project_id: string;
    user_id: string;
    installation_type: 'commercial_industrial';
    engine_version: string;
    input_fingerprint: string;
    input_snapshot: Record<string, unknown>;
    result_snapshot: Record<string, unknown>;
    selected_scenario_id: string | null;
  }
) {
  return supabase.from('project_calculation_runs').insert(payload);
}

export async function cacheProjectCalculationResult(
  supabase: SupabaseClient,
  projectId: string,
  result: Record<string, unknown>,
  engineVersion: string
) {
  return supabase
    .from('projects')
    .update({ calculation_result: result, calculation_version: engineVersion, updated_at: new Date().toISOString() })
    .eq('id', projectId);
}

export interface CalculationRunSummary {
  id: string;
  engine_version: string;
  selected_scenario_id: string | null;
  status: string;
  created_at: string;
}

export async function listCalculationRuns(supabase: SupabaseClient, projectId: string): Promise<CalculationRunSummary[]> {
  const { data, error } = await supabase
    .from('project_calculation_runs')
    .select('id, engine_version, selected_scenario_id, status, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CalculationRunSummary[];
}
