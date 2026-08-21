// Pure load/power/energy math, independent of any store state — split out
// of wizard-store.ts since none of this needs `set`/`get`. Re-exported from
// wizard-store.ts so existing `import { totalPeakW } from '@/lib/store/wizard-store'`
// call sites don't need to change.
//
// The load/power/energy primitives are shared with the Edge Function through
// supabase/functions/_shared/calculation-math.ts. The remaining helpers below
// depend on browser-side domain types and stay in this module.

import type { LoadPhase, ResidentialGridType, SingleLoad } from '@/lib/types';

export { totalDailyKwh, totalNominalW, totalPeakW } from '@/supabase/functions/_shared/calculation-math';

/** Number of live phases the network topology provides. */
export const gridTypePhaseCount: Record<ResidentialGridType, number> = {
  singlePhase_220: 1,
  splitPhase_220: 2,
  threePhase_220: 3,
  threePhase_380: 3,
};

/** Voltages a load can be wired at for each network topology. */
export const gridTypeVoltages: Record<ResidentialGridType, number[]> = {
  singlePhase_220: [220],
  splitPhase_220: [110, 220],
  threePhase_220: [110, 220],
  threePhase_380: [220, 380],
};

/** Voltages that require a phase-to-phase (two-phase) connection instead of
 * phase-to-neutral, for each network topology — e.g. a 220V mono load on a
 * three-phase 220V network is wired between two phases, not phase-neutral. */
export const gridTypePhaseToPhaseVoltages: Record<ResidentialGridType, number[]> = {
  singlePhase_220: [],
  splitPhase_220: [220],
  threePhase_220: [220],
  threePhase_380: [380],
};

export const loadPhases: LoadPhase[] = ['L1', 'L2', 'L3'];

/** Nominal power (W) per phase. Three-phase loads split evenly across L1/L2/L3;
 * mono loads wired phase-to-phase count their full power on both phases they
 * connect to (they're not divided, since each conductor carries the full
 * load current); other mono loads count on their single assigned phase. */
export function totalPowerByPhase(loads: SingleLoad[]): Record<LoadPhase, number> {
  const totals: Record<LoadPhase, number> = { L1: 0, L2: 0, L3: 0 };
  for (const load of loads) {
    const powerW = load.powerW * load.qty;
    if (load.phaseType === 'trifasica') {
      totals.L1 += powerW / 3;
      totals.L2 += powerW / 3;
      totals.L3 += powerW / 3;
    } else {
      const phase = load.phase ?? 'L1';
      totals[phase] += powerW;
      if (load.phase2) totals[load.phase2] += powerW;
    }
  }
  return totals;
}
