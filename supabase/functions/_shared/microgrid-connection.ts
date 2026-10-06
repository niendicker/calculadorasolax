/** How an existing on-grid inverter connects to the hybrid system's backup
 * side under Microrrede — shared by the browser and the Deno function so the
 * per-phase limit shown in the panel is the one the solution is filtered by.
 *
 * On-grid inverters are either monofásico (220V) or trifásico; there is no
 * bifásico on-grid inverter. What used to be entered as a "bifásico 110/220V"
 * on-grid is really a 220V monofásico connected fase-fase. */

export type MicrogridGridType = 'singlePhase_220' | 'splitPhase_220' | 'threePhase_220' | 'threePhase_380';

export type OnGridPhases = 1 | 3;

export type OnGridConnection = 'phaseNeutral' | 'phaseToPhase' | 'threePhase';

/** On-grid phases/voltage each network can host. A 220V monofásico goes
 * fase-neutro where 220V exists between phase and neutral (220V monofásica,
 * 380V trifásica) and fase-fase where it only exists between phases (110/220V
 * bifásica, 220V trifásica). */
export const microgridOnGridOptions: Record<MicrogridGridType, { phases: OnGridPhases; voltageV: 220 | 380 }[]> = {
  singlePhase_220: [{ phases: 1, voltageV: 220 }],
  splitPhase_220: [{ phases: 1, voltageV: 220 }],
  threePhase_220: [
    { phases: 3, voltageV: 220 },
    { phases: 1, voltageV: 220 },
  ],
  threePhase_380: [
    { phases: 3, voltageV: 380 },
    { phases: 1, voltageV: 220 },
  ],
};

/** Phase-to-neutral voltage of each network — what each phase of the hybrid
 * inverter is rated against. */
const phaseNeutralVoltageV: Record<MicrogridGridType, number> = {
  singlePhase_220: 220,
  splitPhase_220: 110,
  threePhase_220: 127,
  threePhase_380: 220,
};

/** Legacy configs may still carry onGridPhases: 2 — always a 220V
 * monofásico wired fase-fase, so it maps to 1 with no change in the per-phase
 * load (both split the power in half on a 110/220V network). */
export function normalizeOnGridPhases(phases: number): OnGridPhases {
  return phases === 3 ? 3 : 1;
}

/** The connection implied by the network and the on-grid phase count, and the
 * share of the on-grid power each loaded phase of the hybrid carries. A
 * fase-fase load draws P/V_ff on both phases, which each phase sees as
 * P × V_fn / V_ff. With no grid type chosen yet, a monofásico is assumed
 * fase-neutro (full power on one phase — the conservative reading). */
export function microgridOnGridConnection(
  gridType: MicrogridGridType | null,
  phases: number
): { connection: OnGridConnection; perPhaseFactor: number } {
  if (normalizeOnGridPhases(phases) === 3) return { connection: 'threePhase', perPhaseFactor: 1 / 3 };
  if (gridType === 'splitPhase_220' || gridType === 'threePhase_220') {
    return { connection: 'phaseToPhase', perPhaseFactor: phaseNeutralVoltageV[gridType] / 220 };
  }
  return { connection: 'phaseNeutral', perPhaseFactor: 1 };
}

export function microgridPerPhasePowerW(gridType: MicrogridGridType | null, phases: number, onGridPowerVA: number): number {
  return onGridPowerVA * microgridOnGridConnection(gridType, phases).perPhaseFactor;
}
