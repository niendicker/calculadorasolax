import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingSimulationPayload } from '@/lib/api-contracts';

/** Infrastructure boundary for the residential calculation feature. Keeping
 * the function invocation and analytics write here makes it possible to move
 * this flow behind an application API without changing the UI callers. */
export async function invokeResidentialCalculation(
  supabase: SupabaseClient,
  body: Record<string, unknown>
) {
  return supabase.functions.invoke('calculate-residential', { body });
}

export async function recordSimulation(supabase: SupabaseClient, payload: PendingSimulationPayload) {
  return supabase.from('app_simulations').insert(payload);
}
