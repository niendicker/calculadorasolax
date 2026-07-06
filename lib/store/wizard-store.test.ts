import { describe, expect, it, beforeEach } from 'vitest';
import { ACCOUNT_LIMITS } from '@/lib/limits';
import { totalDailyKwh, totalPeakW, totalPowerByPhase, useWizardStore } from './wizard-store';
import type { SingleLoad } from '@/lib/types';

function makeLoad(partial: Partial<SingleLoad> & Pick<SingleLoad, 'powerW' | 'hoursPerDay' | 'qty'>): SingleLoad {
  return {
    id: crypto.randomUUID(),
    name: 'Carga teste',
    ipInRatio: 1,
    ...partial,
  };
}

describe('totalDailyKwh', () => {
  it('returns 0 for no loads', () => {
    expect(totalDailyKwh([])).toBe(0);
  });

  it('sums powerW x hoursPerDay x qty across loads, in kWh', () => {
    const loads = [
      makeLoad({ powerW: 100, hoursPerDay: 5, qty: 2 }), // 1.0 kWh
      makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1 }), // 1.0 kWh
    ];
    expect(totalDailyKwh(loads)).toBeCloseTo(2.0);
  });

  it('ignores ipInRatio (peak ratio does not affect daily energy)', () => {
    const loads = [makeLoad({ powerW: 100, hoursPerDay: 2, qty: 1, ipInRatio: 5 })];
    expect(totalDailyKwh(loads)).toBeCloseTo(0.2);
  });
});

describe('totalPeakW', () => {
  it('returns 0 for no loads', () => {
    expect(totalPeakW([])).toBe(0);
  });

  it('sum mode: adds powerW x ipInRatio x qty for every load at once', () => {
    const loads = [
      makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1, ipInRatio: 3 }), // 3000
      makeLoad({ powerW: 200, hoursPerDay: 1, qty: 2, ipInRatio: 1 }), // 400
    ];
    expect(totalPeakW(loads, 'sum')).toBe(3400);
  });

  it('sum mode is the default when no mode is given', () => {
    const loads = [makeLoad({ powerW: 500, hoursPerDay: 1, qty: 1, ipInRatio: 2 })];
    expect(totalPeakW(loads)).toBe(1000);
  });

  it('largest-surge mode: only the single highest-surge load contributes its extra', () => {
    const loads = [
      makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1, ipInRatio: 3 }), // extra = 2000
      makeLoad({ powerW: 500, hoursPerDay: 1, qty: 1, ipInRatio: 2 }), // extra = 500
      makeLoad({ powerW: 100, hoursPerDay: 1, qty: 4, ipInRatio: 1 }), // extra = 0
    ];
    // nominal sum = 1000 + 500 + 400 = 1900; + largest extra (2000) = 3900
    expect(totalPeakW(loads, 'largest-surge')).toBe(3900);
  });

  it('largest-surge mode matches sum mode for a single unit (qty 1)', () => {
    const loads = [makeLoad({ powerW: 300, hoursPerDay: 1, qty: 1, ipInRatio: 2 })];
    expect(totalPeakW(loads, 'largest-surge')).toBe(totalPeakW(loads, 'sum'));
  });

  it('largest-surge mode only assumes a single physical unit surges, even when qty > 1', () => {
    const loads = [makeLoad({ powerW: 300, hoursPerDay: 1, qty: 2, ipInRatio: 2 })];
    // nominal sum = 300 x 2 = 600; only one unit's extra (300 x (2-1) = 300) counts
    expect(totalPeakW(loads, 'largest-surge')).toBe(900);
    // whereas sum mode assumes every unit surges together: 300 x 2 x 2 = 1200
    expect(totalPeakW(loads, 'sum')).toBe(1200);
  });
});

describe('totalPowerByPhase', () => {
  it('returns zero on all phases for no loads', () => {
    expect(totalPowerByPhase([])).toEqual({ L1: 0, L2: 0, L3: 0 });
  });

  it('assigns a mono load fully to its single phase, defaulting to L1', () => {
    const loads = [makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1, phaseType: 'mono', phase: 'L2' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 0, L2: 1000, L3: 0 });
  });

  it('defaults an unassigned mono load to L1', () => {
    const loads = [makeLoad({ powerW: 500, hoursPerDay: 1, qty: 1, phaseType: 'mono' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 500, L2: 0, L3: 0 });
  });

  it('multiplies mono load power by qty before assigning to its phase', () => {
    const loads = [makeLoad({ powerW: 100, hoursPerDay: 1, qty: 3, phaseType: 'mono', phase: 'L3' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 0, L2: 0, L3: 300 });
  });

  it('splits a trifasica load evenly across all three phases', () => {
    const loads = [makeLoad({ powerW: 3000, hoursPerDay: 1, qty: 1, phaseType: 'trifasica' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 1000, L2: 1000, L3: 1000 });
  });

  it('counts the full power on BOTH phases for a phase-to-phase mono load, not split', () => {
    const loads = [
      makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1, phaseType: 'mono', phase: 'L1', phase2: 'L2' }),
    ];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 1000, L2: 1000, L3: 0 });
  });

  it('accumulates power from multiple loads on the same phase', () => {
    const loads = [
      makeLoad({ powerW: 500, hoursPerDay: 1, qty: 1, phaseType: 'mono', phase: 'L1' }),
      makeLoad({ powerW: 300, hoursPerDay: 1, qty: 1, phaseType: 'mono', phase: 'L1' }),
    ];
    expect(totalPowerByPhase(loads).L1).toBe(800);
  });
});

describe('addLoad limit enforcement', () => {
  beforeEach(() => {
    useWizardStore.setState((s) => ({
      residentialOptions: { ...s.residentialOptions, loads: [] },
    }));
  });

  it('adds a load and returns true while under the per-project limit', () => {
    const added = useWizardStore.getState().addLoad(makeLoad({ powerW: 100, hoursPerDay: 1, qty: 1 }));
    expect(added).toBe(true);
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);
  });

  it('returns false and does not add once the project already has ACCOUNT_LIMITS.loadsPerProject loads', () => {
    for (let i = 0; i < ACCOUNT_LIMITS.loadsPerProject; i++) {
      expect(useWizardStore.getState().addLoad(makeLoad({ powerW: 100, hoursPerDay: 1, qty: 1 }))).toBe(true);
    }
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(ACCOUNT_LIMITS.loadsPerProject);

    const added = useWizardStore.getState().addLoad(makeLoad({ powerW: 100, hoursPerDay: 1, qty: 1 }));
    expect(added).toBe(false);
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(ACCOUNT_LIMITS.loadsPerProject);
  });
});
