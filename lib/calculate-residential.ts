// Single call site for the calculate-residential Edge Function, shared by
// every place that needs a fresh Solution for a set of residentialOptions:
// the Dimensionamento tab's "Calcular" (useCalculation.ts) and a saved
// project's "Atualizar" button (wizard-store.ts's refreshProjectSolution).
// Centralizing this avoids the two call sites drifting apart — e.g. one
// logging simulations to app_simulations and resolving specific error
// messages while the other doesn't.

import { enqueuePendingSimulation } from './metrics-queue';
import type { PendingSimulationPayload } from './api-contracts';
import { getNetworkErrorMessage } from './calculation-error-messages';
import type { ResidentialOptions, Solution } from './types';

export type CalculateResidentialResult = { solution: Solution } | { error: string };

/** Invokes calculate-residential for `batteryModel`, logs the resulting
 * simulation to app_simulations (queuing it locally via enqueuePendingSimulation
 * if that insert fails), and resolves calculation/network errors into a
 * specific, user-facing message. `projectName`/`peakW`/`dailyKwh` are only
 * used for the app_simulations analytics row. */
export async function calculateResidentialSolution({
  residentialOptions,
  batteryModel,
  projectName,
  peakW,
  dailyKwh,
  isDemo = false,
}: {
  residentialOptions: ResidentialOptions;
  batteryModel: string;
  projectName: string | null;
  peakW: number;
  dailyKwh: number;
  isDemo?: boolean;
}): Promise<CalculateResidentialResult> {
  try {
    const response = await fetch('/api/calculations/residential', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      ...residentialOptions,
      batteryModel,
      projectName,
      peakW,
      dailyKwh,
      ...(isDemo ? { isDemo: true } : {}),
      }),
    });
    const body = (await response.json()) as {
      solution?: Solution;
      error?: string;
      simulationPending?: boolean;
      simulationPayload?: PendingSimulationPayload;
    };

    if (!response.ok || !body.solution) {
      return { error: body.error ?? getNetworkErrorMessage() };
    }

    if (body.simulationPending && body.simulationPayload) {
      enqueuePendingSimulation(body.simulationPayload);
    }

    return { solution: body.solution };
  } catch (err) {
    console.error(err);
    return { error: getNetworkErrorMessage() };
  }
}
