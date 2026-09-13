// Server-side data access for the C&I calculation flow — mirrors
// lib/data/calculation-repository.ts's role for residential: the one place
// that invokes the Edge Function and writes the resulting analytics/history
// row, so the API route layer stays about HTTP concerns (auth, validation,
// status codes), not Supabase calls.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function invokeCommercialIndustrialCalculation(
  supabase: SupabaseClient,
  body: { options: Record<string, unknown>; unitPriceBrl: number; additionalCostsBrl?: number }
) {
  return supabase.functions.invoke('calculate-commercial-industrial', { body });
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
