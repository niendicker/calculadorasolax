import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildScenarioGrid,
  CI_ENGINE_VERSION,
  materializeScenarioDetail,
  recommendScenario,
  validateCommercialIndustrialOptions,
  type BessProductSpec,
  type CommercialIndustrialOptions,
  type CommercialIndustrialResult,
} from '../_shared/commercial-industrial/index.ts';

// Same header discipline as calculate-residential/index.ts: every response,
// success or error, needs it — the browser enforces CORS on the actual
// response, not just the OPTIONS preflight.
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return Response.json(body, { ...init, headers: CORS_HEADERS });
}

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

interface RequestBody {
  options: CommercialIndustrialOptions;
  /** Resolved by the caller (the Next.js API route, from the user's own
   * user_stock_items row) per the closed decision in plan section 4.3/6.1 —
   * this function never looks up per-user pricing itself. */
  unitPriceBrl: number;
  additionalCostsBrl?: number;
}

/** The full request -> response orchestration, separated from Deno.serve
 * below so it can be exercised directly in tests with a fake `supabase`
 * client instead of needing a live Supabase instance — mirrors
 * calculate-residential/index.ts's handleCalculateResidential. */
export async function handleCalculateCommercialIndustrial(
  req: Request,
  supabase: ReturnType<typeof createClient<any>>
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({ error: 'invalid_payload', details: ['body must be valid JSON'] }, { status: 400 });
    }

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return jsonResponse({ error: 'invalid_payload', details: ['body must be a JSON object'] }, { status: 400 });
    }
    const body = rawBody as Record<string, unknown>;

    const validationErrors = validateCommercialIndustrialOptions(body.options);
    if (validationErrors.length > 0) {
      return jsonResponse({ error: 'invalid_payload', details: validationErrors }, { status: 400 });
    }
    const options = body.options as CommercialIndustrialOptions;

    if (typeof body.unitPriceBrl !== 'number' || !Number.isFinite(body.unitPriceBrl) || body.unitPriceBrl < 0) {
      return jsonResponse({ error: 'invalid_payload', details: ['unitPriceBrl must be a non-negative number'] }, { status: 400 });
    }
    const unitPriceBrl = body.unitPriceBrl;
    const additionalCostsBrl =
      typeof body.additionalCostsBrl === 'number' && Number.isFinite(body.additionalCostsBrl) ? body.additionalCostsBrl : undefined;

    // validateCommercialIndustrialOptions allows a draft (loadCurve/tariff/
    // bessProductId null, sizing incomplete) — a real calculation needs all
    // of it filled in, which is a separate check from contract validity.
    if (!options.loadCurve || !options.tariff || !options.bessProductId) {
      return jsonResponse(
        { error: 'incomplete_configuration', details: ['loadCurve, tariff and bessProductId are all required to calculate'] },
        { status: 422 }
      );
    }

    const { data: productRow, error: productError } = await supabase
      .from('ci_bess_products')
      .select('id, model, module_power_kw, module_capacity_kwh, efficiency_percent, soc_min_percent, soc_max_percent')
      .eq('id', options.bessProductId)
      .eq('active', true)
      .maybeSingle();

    if (productError) {
      console.error(productError);
      return jsonResponse({ error: 'bess_product_lookup_failed' }, { status: 500 });
    }
    if (!productRow) {
      return jsonResponse({ error: 'bess_product_not_found' }, { status: 422 });
    }

    const product = toBessProductSpec(productRow as CiBessProductRow);
    const tariffWindow = { peakStart: options.tariff.peakStart, peakEnd: options.tariff.peakEnd };
    // Peak Shaving/Hybrid's demand-shaving discharge target defaults to the
    // contracted demand (plan section 5.2) — there is no dedicated override
    // field in the contract yet. Kept as its own parameter throughout the
    // engine (Fase 7 audit, section 5) even though it defaults to the same
    // value as `options.tariff.contractedDemandKw`, which separately bounds
    // BESS charging for every strategy (section 4) — the two must not be
    // re-conflated even while they share a default.
    const peakShavingTargetKw = options.tariff.contractedDemandKw;

    const gridInput = {
      curve: options.loadCurve,
      product,
      strategy: options.strategy,
      sizing: options.sizing,
      tariffWindow,
      tariff: options.tariff,
      peakShavingTargetKw,
      unitPriceBrl,
      additionalCostsBrl,
      monthsPerYear: options.financialAssumptions.monthsPerYear,
      financialAssumptions: options.financialAssumptions,
    };

    const { baseline, scenarios } = buildScenarioGrid(gridInput);

    // Only reachable if sizing resolved to an empty module-count range,
    // which validateCommercialIndustrialOptions should already have
    // rejected (positive integers, min <= max) — guarded defensively rather
    // than silently returning a resultless 200.
    if (scenarios.length === 0) {
      return jsonResponse({ error: 'no_scenarios_evaluated' }, { status: 422 });
    }

    const recommendation = recommendScenario(scenarios, options.rankingCriterion, options.financialAssumptions.analysisHorizonYears);
    if (!recommendation) {
      return jsonResponse({ error: 'no_scenarios_evaluated' }, { status: 422 });
    }

    // recommendation.scenarioId is null when no candidate clears the
    // viability bar for options.rankingCriterion (Fase 6 audit, Problems
    // #5/#6/#10) — `selected` is still materialized in that case, but from
    // the SMALLEST evaluated module count (scenarios[0], built in ascending
    // order by buildScenarioGrid) purely for reference. Callers must check
    // `recommendation.scenarioId === null` before labeling `selected`
    // "recomendado" — it explicitly is not.
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
    };

    return jsonResponse(result);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'internal' }, { status: 500 });
  }
}

// Guarded so importing this module (e.g. from index.test.ts) doesn't also
// start a real HTTP listener — only the actual deployed entry point runs it.
if (import.meta.main) {
  Deno.serve((req) =>
    handleCalculateCommercialIndustrial(
      req,
      createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    )
  );
}
