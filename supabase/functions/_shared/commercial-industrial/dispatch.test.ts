import { describe, expect, it } from 'vitest';
import { classifyTariffPeriod, runDispatch, summarizeDispatch, type TariffWindow } from './dispatch';
import type { BessRuntimeParams, LoadCurve, LoadCurveResolutionMinutes } from './types';

const DEFAULT_WINDOW: TariffWindow = { peakStart: '18:00', peakEnd: '21:00' };

function makeCurve(
  pointsSpec: { hour: number; minute?: number; powerKw: number }[],
  resolutionMinutes: LoadCurveResolutionMinutes = 15
): LoadCurve {
  return {
    points: pointsSpec.map((p) => ({
      timestamp: `2026-08-24T${String(p.hour).padStart(2, '0')}:${String(p.minute ?? 0).padStart(2, '0')}:00.000Z`,
      powerKw: p.powerKw,
    })),
    resolutionMinutes,
    timezone: 'UTC',
    profileBasis: 'representative_period',
    periodStart: '2026-08-24',
    periodEnd: '2026-08-30',
    source: 'manual',
  };
}

function makeBess(overrides: Partial<BessRuntimeParams> = {}): BessRuntimeParams {
  return {
    totalPowerKw: 100,
    totalCapacityKwh: 200,
    socMinPercent: 10,
    socMaxPercent: 100,
    efficiencyPercent: 90,
    ...overrides,
  };
}

describe('classifyTariffPeriod', () => {
  it('classifies an ordinary (non-wrapping) window', () => {
    expect(classifyTariffPeriod('2026-08-24T18:00:00Z', 'UTC', DEFAULT_WINDOW)).toBe('peak');
    expect(classifyTariffPeriod('2026-08-24T20:59:00Z', 'UTC', DEFAULT_WINDOW)).toBe('peak');
    expect(classifyTariffPeriod('2026-08-24T21:00:00Z', 'UTC', DEFAULT_WINDOW)).toBe('offPeak');
    expect(classifyTariffPeriod('2026-08-24T17:59:00Z', 'UTC', DEFAULT_WINDOW)).toBe('offPeak');
  });

  it('classifies a window that wraps past midnight', () => {
    const window: TariffWindow = { peakStart: '22:00', peakEnd: '06:00' };
    expect(classifyTariffPeriod('2026-08-24T23:00:00Z', 'UTC', window)).toBe('peak');
    expect(classifyTariffPeriod('2026-08-24T02:00:00Z', 'UTC', window)).toBe('peak');
    expect(classifyTariffPeriod('2026-08-24T12:00:00Z', 'UTC', window)).toBe('offPeak');
  });

  it('treats an equal start/end as "no peak window" (curva sem período de ponta)', () => {
    const window: TariffWindow = { peakStart: '00:00', peakEnd: '00:00' };
    expect(classifyTariffPeriod('2026-08-24T18:00:00Z', 'UTC', window)).toBe('offPeak');
  });
});

describe('runDispatch — BASE strategy', () => {
  it('passes a constant load straight through with no BESS action', () => {
    const curve = makeCurve([
      { hour: 0, powerKw: 50 },
      { hour: 1, powerKw: 50 },
      { hour: 2, powerKw: 50 },
    ], 60);

    const trace = runDispatch({ curve, bess: makeBess(), strategy: 'BASE', tariffWindow: DEFAULT_WINDOW, targetDemandKw: null });

    for (const point of trace) {
      expect(point.chargeKw).toBe(0);
      expect(point.dischargeKw).toBe(0);
      expect(point.gridImportKw).toBe(50);
    }
  });
});

describe('runDispatch — PEAK_SHAVING strategy', () => {
  it('shaves a single known spike down to the target demand', () => {
    const curve = makeCurve([
      { hour: 0, powerKw: 50 },
      { hour: 1, powerKw: 200 },
      { hour: 2, powerKw: 50 },
    ], 60);

    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000, initialSocPercent: 50 }),
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      targetDemandKw: 100,
    });

    expect(trace[1].dischargeKw).toBe(100);
    expect(trace[1].gridImportKw).toBe(100);
    // Below-target intervals opportunistically recharge, capped so as not to
    // exceed the target themselves.
    expect(trace[0].chargeKw).toBe(50);
    expect(trace[0].gridImportKw).toBe(100);
  });

  it('does not create a new peak above the target while recharging', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 20 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000 }),
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      targetDemandKw: 100,
    });
    expect(trace[0].gridImportKw).toBeLessThanOrEqual(100);
  });
});

describe('runDispatch — LOAD_SHIFTING strategy', () => {
  it('shifts a known amount of energy from off-peak charge to peak discharge', () => {
    const curve = makeCurve(
      [
        { hour: 0, powerKw: 50 },
        { hour: 1, powerKw: 50 },
        { hour: 18, powerKw: 50 },
        { hour: 19, powerKw: 50 },
      ],
      60
    );

    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000, efficiencyPercent: 100, initialSocPercent: 10 }),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      targetDemandKw: null,
    });

    const [offPeak1, offPeak2, peak1, peak2] = trace;
    expect(offPeak1.chargeKw).toBe(100);
    expect(offPeak2.chargeKw).toBe(100);
    // Discharge never exceeds the interval's own load — no export to grid.
    expect(peak1.dischargeKw).toBe(50);
    expect(peak1.gridImportKw).toBe(0);
    expect(peak2.dischargeKw).toBe(50);
    expect(peak2.gridImportKw).toBe(0);
  });

  it('never discharges when the curve has no peak window at all', () => {
    const curve = makeCurve(
      [
        { hour: 0, powerKw: 50 },
        { hour: 12, powerKw: 50 },
        { hour: 18, powerKw: 50 },
      ],
      60
    );
    const window: TariffWindow = { peakStart: '00:00', peakEnd: '00:00' };

    const trace = runDispatch({
      curve,
      bess: makeBess(),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: window,
      targetDemandKw: null,
    });

    expect(trace.every((p) => p.tariffPeriod === 'offPeak')).toBe(true);
    expect(trace.every((p) => p.dischargeKw === 0)).toBe(true);
  });
});

describe('runDispatch — HYBRID strategy', () => {
  it('shaves peak-period demand to target and opportunistically charges off-peak', () => {
    const curve = makeCurve(
      [
        { hour: 0, powerKw: 50 },
        { hour: 18, powerKw: 150 },
      ],
      60
    );

    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000, initialSocPercent: 10 }),
      strategy: 'HYBRID',
      tariffWindow: DEFAULT_WINDOW,
      targetDemandKw: 100,
    });

    expect(trace[0].chargeKw).toBe(100); // full-power off-peak charge, Load-Shifting-style
    expect(trace[1].dischargeKw).toBe(50); // 150 - 100 target, Peak-Shaving-style
    expect(trace[1].gridImportKw).toBe(100);
  });
});

describe('runDispatch — SOC and physical limits', () => {
  it('stops discharging once SOC reaches socMinPercent (energia insuficiente)', () => {
    const curve = makeCurve(
      [
        { hour: 18, powerKw: 100 },
        { hour: 19, powerKw: 100 },
        { hour: 20, powerKw: 100 },
      ],
      60
    );
    // Small capacity relative to the demanded discharge: only enough above
    // socMin for one hour at full power.
    const bess = makeBess({ totalPowerKw: 100, totalCapacityKwh: 100, socMinPercent: 50, socMaxPercent: 100, efficiencyPercent: 100 });

    const trace = runDispatch({ curve, bess, strategy: 'PEAK_SHAVING', tariffWindow: DEFAULT_WINDOW, targetDemandKw: 0 });

    for (const point of trace) {
      const socPercent = (point.socKwh / bess.totalCapacityKwh) * 100;
      expect(socPercent).toBeGreaterThanOrEqual(bess.socMinPercent - 1e-9);
    }
    // First hour drains the available 50 kWh in one hour at 100 kW; later
    // hours have nothing left to give.
    expect(trace[0].dischargeKw).toBe(50);
    expect(trace[1].dischargeKw).toBe(0);
    expect(trace[2].dischargeKw).toBe(0);
  });

  it('stops charging once SOC reaches socMaxPercent', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 0 }], 60);
    const bess = makeBess({ totalCapacityKwh: 200, socMaxPercent: 60, initialSocPercent: 60, efficiencyPercent: 100 });

    const trace = runDispatch({ curve, bess, strategy: 'LOAD_SHIFTING', tariffWindow: DEFAULT_WINDOW, targetDemandKw: null });

    expect(trace[0].chargeKw).toBe(0);
  });

  it('a battery starting fully charged cannot charge further on the first interval', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 10 }], 60);
    const bess = makeBess({ initialSocPercent: 100, socMaxPercent: 100 });

    const trace = runDispatch({ curve, bess, strategy: 'LOAD_SHIFTING', tariffWindow: DEFAULT_WINDOW, targetDemandKw: null });

    expect(trace[0].chargeKw).toBe(0);
  });

  it('a battery starting fully depleted cannot discharge on the first interval', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 100 }], 60);
    const bess = makeBess({ initialSocPercent: 10, socMinPercent: 10 });

    const trace = runDispatch({ curve, bess, strategy: 'LOAD_SHIFTING', tariffWindow: DEFAULT_WINDOW, targetDemandKw: null });

    expect(trace[0].dischargeKw).toBe(0);
    expect(trace[0].gridImportKw).toBe(100);
  });

  it('clamps discharge to the battery power rating (potência insuficiente)', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 100 }], 60);
    const bess = makeBess({ totalPowerKw: 5, totalCapacityKwh: 1000 });

    const trace = runDispatch({ curve, bess, strategy: 'PEAK_SHAVING', tariffWindow: DEFAULT_WINDOW, targetDemandKw: 0 });

    expect(trace[0].dischargeKw).toBe(5);
    expect(trace[0].gridImportKw).toBe(95);
  });

  it('never lets discharge exceed the interval load (no grid export)', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 10 }], 60);
    const bess = makeBess({ totalPowerKw: 100, totalCapacityKwh: 1000 });

    const trace = runDispatch({ curve, bess, strategy: 'PEAK_SHAVING', tariffWindow: DEFAULT_WINDOW, targetDemandKw: 0 });

    expect(trace[0].dischargeKw).toBe(10);
    expect(trace[0].gridImportKw).toBe(0);
  });

  it('never charges and discharges in the same interval', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 50 }], 60);
    const trace = runDispatch({ curve, bess: makeBess(), strategy: 'HYBRID', tariffWindow: DEFAULT_WINDOW, targetDemandKw: 30 });

    expect(trace[0].chargeKw === 0 || trace[0].dischargeKw === 0).toBe(true);
  });
});

describe('runDispatch — resolution independence', () => {
  it('produces proportional energy accounting at 15, 30 and 60 minute resolutions', () => {
    const resolutions: LoadCurveResolutionMinutes[] = [15, 30, 60];
    for (const resolutionMinutes of resolutions) {
      const curve = makeCurve([{ hour: 0, powerKw: 40 }], resolutionMinutes);
      const trace = runDispatch({ curve, bess: makeBess(), strategy: 'BASE', tariffWindow: DEFAULT_WINDOW, targetDemandKw: null });
      const summary = summarizeDispatch(trace, resolutionMinutes);
      expect(summary.energyImportedOffPeakKwh).toBeCloseTo(40 * (resolutionMinutes / 60), 10);
    }
  });
});

describe('summarizeDispatch', () => {
  it('splits max demand and imported energy by tariff period', () => {
    const curve = makeCurve(
      [
        { hour: 0, powerKw: 30 },
        { hour: 18, powerKw: 80 },
      ],
      60
    );
    const trace = runDispatch({ curve, bess: makeBess(), strategy: 'BASE', tariffWindow: DEFAULT_WINDOW, targetDemandKw: null });

    const summary = summarizeDispatch(trace, 60);

    expect(summary.maxDemandOffPeakKw).toBe(30);
    expect(summary.maxDemandPeakKw).toBe(80);
    expect(summary.energyImportedOffPeakKwh).toBe(30);
    expect(summary.energyImportedPeakKwh).toBe(80);
    expect(summary.energyImportedTotalKwh).toBe(110);
  });
});
