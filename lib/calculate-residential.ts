// Single call site for the calculate-residential Edge Function, shared by
// every place that needs a fresh Solution for a set of residentialOptions:
// the Dimensionamento tab's "Calcular" (useCalculation.ts) and a saved
// project's "Atualizar" button (wizard-store.ts's refreshProjectSolution).
// Centralizing this avoids the two call sites drifting apart — e.g. one
// logging simulations to app_simulations and resolving specific error
// messages while the other doesn't.

import type { createClient } from '@/lib/supabase/client';
import { enqueuePendingSimulation } from './metrics-queue';
import { getNetworkErrorMessage, resolveCalculationErrorMessage } from './calculation-error-messages';
import type { ResidentialOptions, Solution } from './types';

export type CalculateResidentialResult = { solution: Solution } | { error: string };

/** Invokes calculate-residential for `batteryModel`, logs the resulting
 * simulation to app_simulations (queuing it locally via enqueuePendingSimulation
 * if that insert fails), and resolves calculation/network errors into a
 * specific, user-facing message. `projectName`/`peakW`/`dailyKwh` are only
 * used for the app_simulations analytics row. */
export async function calculateResidentialSolution({
  supabase,
  residentialOptions,
  batteryModel,
  projectName,
  peakW,
  dailyKwh,
}: {
  supabase: ReturnType<typeof createClient>;
  residentialOptions: ResidentialOptions;
  batteryModel: string;
  projectName: string | null;
  peakW: number;
  dailyKwh: number;
}): Promise<CalculateResidentialResult> {
  try {
    const { data, error: functionError } = await supabase.functions.invoke('calculate-residential', {
      body: { ...residentialOptions, batteryModel },
    });

    if (functionError || !data) {
      return { error: await resolveCalculationErrorMessage(functionError) };
    }

    const solution = data as Solution;

    const { data: userData } = await supabase.auth.getUser();
    const simulationPayload = {
      user_id: userData.user?.id ?? null,
      project_name: projectName,
      topology: residentialOptions.topology,
      grid_type: residentialOptions.gridType,
      peak_w: peakW,
      daily_kwh: dailyKwh,
      loads: residentialOptions.loads,
      inverter_model: solution.inverterModel,
      battery_model: solution.batteryModel,
      // app_simulations is an analytics table keyed on plain accessory
      // names (see admin DashboardPanels.tsx countAccessories) — keep it
      // decoupled from the richer Solution.accessories shape used for display.
      accessories: solution.accessories.map((accessory) => accessory.model),
      solution_code: solution.solutionCode ?? null,
    };
    const { error: simulationError } = await supabase.from('app_simulations').insert(simulationPayload);

    if (simulationError) {
      console.error(simulationError);
      enqueuePendingSimulation(simulationPayload);
    }

    return { solution };
  } catch (err) {
    console.error(err);
    return { error: getNetworkErrorMessage() };
  }
}
