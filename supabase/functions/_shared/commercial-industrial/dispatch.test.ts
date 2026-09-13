import { describe, expect, it } from 'vitest';
import {
  calculateAllowedChargePower,
  checkDispatchInvariants,
  classifyTariffPeriod,
  computeHybridReserve,
  runDispatch,
  summarizeDispatch,
  type TariffWindow,
} from './dispatch';
import type { BessRuntimeParams, LoadCurve, LoadCurveResolutionMinutes } from './types';

const DEFAULT_WINDOW: TariffWindow = { peakStart: '18:00', peakEnd: '21:00' };
// Most tests don't care about the contracted-demand charge ceiling — a huge
// constant keeps `calculateAllowedChargePower` a no-op so existing
// power/SOC-focused assertions aren't accidentally coupled to it. Tests that
// DO care about the ceiling (section 4/31-36 below) pass an explicit value.
const UNLIMITED_DEMAND = 1_000_000;

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

    const trace = runDispatch({
      curve,
      bess: makeBess(),
      strategy: 'BASE',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

    for (const point of trace) {
      expect(point.chargeKw).toBe(0);
      expect(point.dischargeKw).toBe(0);
      expect(point.gridImportKw).toBe(50);
    }
  });
});

describe('runDispatch — PEAK_SHAVING strategy (Fase 7 audit, section 2.1)', () => {
  it('[test 11] discharges above the target to shave a known spike', () => {
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
      peakShavingTargetKw: 100,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

    expect(trace[1].dischargeKw).toBe(100);
    expect(trace[1].gridImportKw).toBe(100);
  });

  it('[test 12] does not discharge unnecessarily below the target', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 20 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000 }),
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 100,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(0);
  });

  it('[test 13] can discharge during the peak window', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 150 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000, initialSocPercent: 100 }),
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 100,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(50);
  });

  it('[test 14] never charges during the peak window, even when load is far below the target', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 10 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000, initialSocPercent: 10 }),
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 100,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].chargeKw).toBe(0);
  });

  it('[test 15] off-peak charging respects contractedDemandKw, not the (possibly lower) Peak Shaving target', () => {
    // target=130 (above load, so PEAK_SHAVING wants to charge) but
    // contractedDemandKw=200 — the OLD (buggy) behavior capped charging at
    // `target - loadKw` = 130-120 = 10kW; the correct behavior allows up to
    // the CONTRACT's headroom, 200-120 = 80kW (the two are deliberately
    // different concepts per section 5).
    const curve = makeCurve([{ hour: 0, powerKw: 120 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 125, totalCapacityKwh: 1000, initialSocPercent: 10 }),
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 130,
      contractedDemandKw: 200,
    });
    expect(trace[0].chargeKw).toBe(80);
  });
});

describe('runDispatch — LOAD_SHIFTING strategy (Fase 7 audit, section 2.2)', () => {
  it('[test 16] charges off-peak', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 50 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000, efficiencyPercent: 100, initialSocPercent: 10 }),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].chargeKw).toBeGreaterThan(0);
  });

  it('[test 17] never charges during the peak window', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 10 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000, initialSocPercent: 10 }),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].chargeKw).toBe(0);
  });

  it('[test 18] discharges only during the peak window', () => {
    const curve = makeCurve(
      [
        { hour: 0, powerKw: 50 },
        { hour: 12, powerKw: 50 },
      ],
      60
    );
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000, initialSocPercent: 100 }),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace.every((p) => p.dischargeKw === 0)).toBe(true);
  });

  it('[test 19] discharge dynamically follows siteLoadKw (40kW -> 40kW, 90kW -> 90kW)', () => {
    const curve = makeCurve(
      [
        { hour: 18, powerKw: 40 },
        { hour: 19, powerKw: 90 },
      ],
      60
    );
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 125, totalCapacityKwh: 1000, initialSocPercent: 100 }),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(40);
    expect(trace[1].dischargeKw).toBe(90);
  });

  it('[test 20] never discharges more power than the load (no export)', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 10 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 100, totalCapacityKwh: 1000, initialSocPercent: 100 }),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(10);
    expect(trace[0].gridImportKw).toBe(0);
  });

  it('[test 21] respects the BESS rated power even when load is far higher (180kW load, 125kW BESS)', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 180 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 125, totalCapacityKwh: 1000, initialSocPercent: 100 }),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(125);
    expect(trace[0].gridImportKw).toBe(55);
  });

  it('[test 22] respects SOC minimum — cannot discharge below it', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 100 }], 60);
    const bess = makeBess({ initialSocPercent: 10, socMinPercent: 10 });
    const trace = runDispatch({
      curve,
      bess,
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(0);
    expect(trace[0].gridImportKw).toBe(100);
  });
});

describe('runDispatch — HYBRID strategy, peak-window discharge', () => {
  it('discharges the full battery power during peak when load allows it', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 150 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalCapacityKwh: 1000, initialSocPercent: 100 }),
      strategy: 'HYBRID',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 100,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(100); // bess.totalPowerKw, not (load - target)
    expect(trace[0].gridImportKw).toBe(50);
  });

  it('[test 27] Load Shifting follows consumption dynamically during peak (40kW load -> 40kW discharge)', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 40 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 125, totalCapacityKwh: 1000, initialSocPercent: 100 }),
      strategy: 'HYBRID',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 100,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(40);
  });

  it('[test 28] Peak Shaving and Load Shifting act simultaneously during peak (residual demand shaved to zero within power limits)', () => {
    // Load 150kW > target 100kW: Load Shifting alone would ask for
    // min(150, totalPower); Peak Shaving alone would ask for 150-100=50.
    // With totalPowerKw=125, the single discharge decision must satisfy
    // both: reduce demand towards the target AND follow consumption,
    // bounded by rated power.
    const curve = makeCurve([{ hour: 18, powerKw: 150 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 125, totalCapacityKwh: 1000, initialSocPercent: 100 }),
      strategy: 'HYBRID',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 100,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(125); // min(loadKw, bess.totalPowerKw)
    expect(trace[0].gridImportKw).toBe(25); // residual demand, still below the unshaved 150kW
  });
});

describe('runDispatch — HYBRID strategy, dynamic ponta reserve (Fase 7 audit, section 3)', () => {
  it('[test 24] does not use the reserve for off-peak Peak Shaving — charges instead when load is below target', () => {
    const curve = makeCurve(
      [
        { hour: 8, powerKw: 50 },
        { hour: 18, powerKw: 150 },
        { hour: 19, powerKw: 150 },
        { hour: 20, powerKw: 150 },
      ],
      60
    );
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 100, totalCapacityKwh: 1000, initialSocPercent: 10 }),
      strategy: 'HYBRID',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 200, // load (50) never exceeds this off-peak
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    // Load (50) < target (200) off-peak -> charge, not discharge, regardless
    // of the reserve.
    expect(trace[0].chargeKw).toBeGreaterThan(0);
    expect(trace[0].dischargeKw).toBe(0);
  });

  it('[test 25] uses energy above the reserve for off-peak Peak Shaving when load exceeds the target', () => {
    const curve = makeCurve(
      [
        { hour: 8, powerKw: 250 }, // off-peak spike, above the 200kW target
        { hour: 18, powerKw: 50 }, // small ponta load — cheap to reserve for
        { hour: 19, powerKw: 50 },
        { hour: 20, powerKw: 50 },
      ],
      60
    );
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 150, totalCapacityKwh: 1000, initialSocPercent: 100 }),
      strategy: 'HYBRID',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 200,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    // Reserve for the (cheap, 50kW * 3h) ponta window is small relative to a
    // fully-charged 1000kWh battery, so there's ample excess energy to shave
    // the 08:00 spike.
    expect(trace[0].dischargeKw).toBeGreaterThan(0);
    expect(trace[0].gridImportKw).toBeLessThan(250);
  });

  it('[test 25b] "Peak Shaving deve parar" when there is no excess above the reserve', () => {
    const curve = makeCurve(
      [
        { hour: 8, powerKw: 250 }, // off-peak spike, above target
        { hour: 18, powerKw: 150 }, // large, expensive ponta load to reserve for
        { hour: 19, powerKw: 150 },
        { hour: 20, powerKw: 150 },
      ],
      60
    );
    const trace = runDispatch({
      curve,
      // Small battery: barely enough for the ponta reserve, no excess left.
      bess: makeBess({ totalPowerKw: 150, totalCapacityKwh: 450, socMinPercent: 0, efficiencyPercent: 100, initialSocPercent: 100 }),
      strategy: 'HYBRID',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 200,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    expect(trace[0].dischargeKw).toBe(0);
    expect(trace[0].chargeKw).toBe(0);
  });

  it('[test 30] a contracted demand far above the actual load never inflates the reserve — off-peak dispatch is pure charging', () => {
    // Mirrors the audit's own example: contracted demand 200kW, load never
    // exceeds 95kW — no economic reason to reserve anything for demand
    // shaving, so Hybrid should behave like plain off-peak charging.
    const points = [];
    for (let hour = 0; hour < 24; hour++) {
      points.push({ hour, powerKw: hour >= 18 && hour < 21 ? 95 : 60 });
    }
    const curve = makeCurve(points, 60);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 50, totalCapacityKwh: 500, initialSocPercent: 10 }),
      strategy: 'HYBRID',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 200,
      contractedDemandKw: 200,
    });
    const offPeakPoints = trace.filter((p) => p.tariffPeriod === 'offPeak');
    expect(offPeakPoints.every((p) => p.dischargeKw === 0)).toBe(true);
    expect(offPeakPoints.some((p) => p.chargeKw > 0)).toBe(true);
  });
});

describe('computeHybridReserve (Fase 7 audit, section 3.1)', () => {
  it('[test 23] computes a positive required reserve ahead of a ponta window with load', () => {
    const curve = makeCurve(
      [
        { hour: 8, powerKw: 50 },
        { hour: 18, powerKw: 100 },
        { hour: 19, powerKw: 100 },
        { hour: 20, powerKw: 100 },
      ],
      60
    );
    const bess = makeBess({ totalPowerKw: 100, totalCapacityKwh: 1000, efficiencyPercent: 100 });
    const reserve = computeHybridReserve(curve, DEFAULT_WINDOW, bess);
    // Before the window: full requirement, 100kW * 3h = 300 kWh (100%
    // efficiency, well under the 1000kWh useful capacity cap).
    expect(reserve[0]).toBeCloseTo(300, 6);
  });

  it('[test 26] the reserve decreases point-by-point through the ponta window as it is consumed', () => {
    const curve = makeCurve(
      [
        { hour: 18, powerKw: 100 },
        { hour: 19, powerKw: 100 },
        { hour: 20, powerKw: 100 },
      ],
      60
    );
    const bess = makeBess({ totalPowerKw: 100, totalCapacityKwh: 1000, efficiencyPercent: 100 });
    const reserve = computeHybridReserve(curve, DEFAULT_WINDOW, bess);
    // 300 -> 200 -> 100, reaching (conceptually) 0 once the window ends.
    expect(reserve[0]).toBeCloseTo(300, 6);
    expect(reserve[1]).toBeCloseTo(200, 6);
    expect(reserve[2]).toBeCloseTo(100, 6);
  });

  it('caps the required reserve at the BESS useful capacity', () => {
    const curve = makeCurve(
      [
        { hour: 18, powerKw: 500 },
        { hour: 19, powerKw: 500 },
        { hour: 20, powerKw: 500 },
      ],
      60
    );
    const bess = makeBess({ totalPowerKw: 500, totalCapacityKwh: 100, socMinPercent: 0, socMaxPercent: 100, efficiencyPercent: 100 });
    const reserve = computeHybridReserve(curve, DEFAULT_WINDOW, bess);
    expect(reserve[0]).toBeLessThanOrEqual(100);
  });

  it('is all-zero when the curve has no peak window at all', () => {
    const curve = makeCurve([{ hour: 8, powerKw: 100 }, { hour: 20, powerKw: 100 }], 60);
    const window: TariffWindow = { peakStart: '00:00', peakEnd: '00:00' };
    const bess = makeBess();
    const reserve = computeHybridReserve(curve, window, bess);
    expect(reserve.every((value) => value === 0)).toBe(true);
  });

  it('is zero after the last ponta window in the curve has passed', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 100 }, { hour: 22, powerKw: 100 }], 60);
    const bess = makeBess({ totalCapacityKwh: 1000, efficiencyPercent: 100 });
    const reserve = computeHybridReserve(curve, DEFAULT_WINDOW, bess);
    expect(reserve[1]).toBe(0); // 22:00 — no more ponta windows in this curve
  });
});

describe('calculateAllowedChargePower (Fase 7 audit, section 4)', () => {
  it('[test 31] demanda contratada 200kW + carga 120kW -> carga BESS máxima 80kW', () => {
    const result = calculateAllowedChargePower({
      siteLoadKw: 120,
      requestedChargeKw: 125,
      contractedDemandKw: 200,
      bessMaxChargePowerKw: 125,
      socLimitedChargePowerKw: 125,
    });
    expect(result).toBe(80);
  });

  it('[test 32] demanda contratada 200kW + carga 50kW + BESS máx. 125kW -> carga BESS máxima 125kW', () => {
    const result = calculateAllowedChargePower({
      siteLoadKw: 50,
      requestedChargeKw: 125,
      contractedDemandKw: 200,
      bessMaxChargePowerKw: 125,
      socLimitedChargePowerKw: 125,
    });
    expect(result).toBe(125);
  });

  it('[test 33] carga = demanda contratada -> BESS não carrega', () => {
    const result = calculateAllowedChargePower({
      siteLoadKw: 200,
      requestedChargeKw: 125,
      contractedDemandKw: 200,
      bessMaxChargePowerKw: 125,
      socLimitedChargePowerKw: 125,
    });
    expect(result).toBe(0);
  });

  it('[test 34] carga > demanda contratada -> BESS não carrega', () => {
    const result = calculateAllowedChargePower({
      siteLoadKw: 220,
      requestedChargeKw: 125,
      contractedDemandKw: 200,
      bessMaxChargePowerKw: 125,
      socLimitedChargePowerKw: 125,
    });
    expect(result).toBe(0);
  });

  it('respects the SOC-limited ceiling even when demand headroom is ample', () => {
    const result = calculateAllowedChargePower({
      siteLoadKw: 0,
      requestedChargeKw: 125,
      contractedDemandKw: 200,
      bessMaxChargePowerKw: 125,
      socLimitedChargePowerKw: 10,
    });
    expect(result).toBe(10);
  });

  it('never returns a negative value', () => {
    const result = calculateAllowedChargePower({
      siteLoadKw: 500,
      requestedChargeKw: 125,
      contractedDemandKw: 200,
      bessMaxChargePowerKw: 125,
      socLimitedChargePowerKw: 125,
    });
    expect(result).toBe(0);
  });
});

describe('runDispatch — dynamic charge balancing across intervals (Fase 7 audit, section 6)', () => {
  it('[test 35] BESS charge power adjusts every interval as siteLoadKw changes, never recomputed only once', () => {
    const curve = makeCurve(
      [
        { hour: 0, powerKw: 100 }, // headroom 100
        { hour: 1, powerKw: 170 }, // headroom 30
        { hour: 2, powerKw: 195 }, // headroom 5
        { hour: 3, powerKw: 200 }, // headroom 0
        { hour: 4, powerKw: 140 }, // headroom 60
      ],
      60
    );
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 100, totalCapacityKwh: 100000, initialSocPercent: 0, socMinPercent: 0 }),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: 200,
    });
    expect(trace[0].chargeKw).toBe(100);
    expect(trace[1].chargeKw).toBe(30);
    expect(trace[2].chargeKw).toBe(5);
    expect(trace[3].chargeKw).toBe(0);
    expect(trace[4].chargeKw).toBe(60);
  });

  it('[test 36] gridImportKw never exceeds contractedDemandKw as a consequence of charging', () => {
    const points: { hour: number; minute: number; powerKw: number }[] = [];
    for (let i = 0; i < 24; i++) points.push({ hour: Math.floor(i / 4), minute: (i % 4) * 15, powerKw: 150 + i * 5 });
    const curve = makeCurve(points, 15);
    const trace = runDispatch({
      curve,
      bess: makeBess({ totalPowerKw: 100, totalCapacityKwh: 100000, initialSocPercent: 0, socMinPercent: 0 }),
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: 200,
    });
    for (const point of trace) {
      if (point.chargeKw > 0) {
        expect(point.gridImportKw).toBeLessThanOrEqual(200 + 1e-9);
      }
    }
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

    const trace = runDispatch({
      curve,
      bess,
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 0,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

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

    const trace = runDispatch({
      curve,
      bess,
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

    expect(trace[0].chargeKw).toBe(0);
  });

  it('a battery starting fully charged cannot charge further on the first interval', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 10 }], 60);
    const bess = makeBess({ initialSocPercent: 100, socMaxPercent: 100 });

    const trace = runDispatch({
      curve,
      bess,
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

    expect(trace[0].chargeKw).toBe(0);
  });

  it('a battery starting fully depleted cannot discharge on the first interval', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 100 }], 60);
    const bess = makeBess({ initialSocPercent: 10, socMinPercent: 10 });

    const trace = runDispatch({
      curve,
      bess,
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

    expect(trace[0].dischargeKw).toBe(0);
    expect(trace[0].gridImportKw).toBe(100);
  });

  it('clamps discharge to the battery power rating (potência insuficiente)', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 100 }], 60);
    const bess = makeBess({ totalPowerKw: 5, totalCapacityKwh: 1000 });

    const trace = runDispatch({
      curve,
      bess,
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 0,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

    expect(trace[0].dischargeKw).toBe(5);
    expect(trace[0].gridImportKw).toBe(95);
  });

  it('never lets discharge exceed the interval load (no grid export)', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 10 }], 60);
    const bess = makeBess({ totalPowerKw: 100, totalCapacityKwh: 1000 });

    const trace = runDispatch({
      curve,
      bess,
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 0,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

    expect(trace[0].dischargeKw).toBe(10);
    expect(trace[0].gridImportKw).toBe(0);
  });

  it('never charges and discharges in the same interval', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 50 }], 60);
    const trace = runDispatch({
      curve,
      bess: makeBess(),
      strategy: 'HYBRID',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 30,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

    expect(trace[0].chargeKw === 0 || trace[0].dischargeKw === 0).toBe(true);
  });
});

describe('runDispatch — resolution independence', () => {
  it('produces proportional energy accounting at 15, 30 and 60 minute resolutions', () => {
    const resolutions: LoadCurveResolutionMinutes[] = [15, 30, 60];
    for (const resolutionMinutes of resolutions) {
      const curve = makeCurve([{ hour: 0, powerKw: 40 }], resolutionMinutes);
      const trace = runDispatch({
        curve,
        bess: makeBess(),
        strategy: 'BASE',
        tariffWindow: DEFAULT_WINDOW,
        peakShavingTargetKw: null,
        contractedDemandKw: UNLIMITED_DEMAND,
      });
      const summary = summarizeDispatch(trace, resolutionMinutes);
      expect(summary.energyImportedOffPeakKwh).toBeCloseTo(40 * (resolutionMinutes / 60), 10);
    }
  });
});

describe('checkDispatchInvariants', () => {
  it('reports no violations for every strategy over a realistic week-shaped curve', () => {
    const points: { hour: number; powerKw: number }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      points.push({ hour, powerKw: hour >= 18 && hour < 21 ? 150 : 60 });
    }
    const curve = makeCurve(points, 60);
    const strategies: Array<'BASE' | 'PEAK_SHAVING' | 'LOAD_SHIFTING' | 'HYBRID'> = [
      'BASE',
      'PEAK_SHAVING',
      'LOAD_SHIFTING',
      'HYBRID',
    ];
    for (const strategy of strategies) {
      const bess = makeBess({ totalCapacityKwh: 500, efficiencyPercent: 95, socMinPercent: 10, socMaxPercent: 100 });
      const trace = runDispatch({
        curve,
        bess,
        strategy,
        tariffWindow: DEFAULT_WINDOW,
        peakShavingTargetKw: 100,
        contractedDemandKw: 200,
      });
      expect(checkDispatchInvariants(trace, bess, 60, 200)).toEqual([]);
    }
  });

  it('flags a SOC value outside [socMin, socMax]', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 10 }], 60);
    const bess = makeBess({ totalCapacityKwh: 200, socMinPercent: 10, socMaxPercent: 100 });
    const trace = runDispatch({
      curve,
      bess,
      strategy: 'BASE',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    trace[0] = { ...trace[0], socKwh: bess.totalCapacityKwh * 2 };
    const violations = checkDispatchInvariants(trace, bess, 60);
    expect(violations.some((v) => v.includes('outside'))).toBe(true);
  });

  it('flags simultaneous charge and discharge in the same interval', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 10 }], 60);
    const bess = makeBess();
    const trace = runDispatch({
      curve,
      bess,
      strategy: 'BASE',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    trace[0] = { ...trace[0], chargeKw: 20, dischargeKw: 5 };
    const violations = checkDispatchInvariants(trace, bess, 60);
    expect(violations.some((v) => v.includes('mutual exclusion'))).toBe(true);
  });

  it('flags negative grid import (implied export to the grid)', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 10 }], 60);
    const bess = makeBess();
    const trace = runDispatch({
      curve,
      bess,
      strategy: 'BASE',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    trace[0] = { ...trace[0], gridImportKw: -5 };
    const violations = checkDispatchInvariants(trace, bess, 60);
    expect(violations.some((v) => v.includes('negative'))).toBe(true);
  });

  it('flags a SOC delta inconsistent with the reported charge/discharge and efficiency', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 0 }, { hour: 1, powerKw: 0 }], 60);
    const bess = makeBess({ totalCapacityKwh: 1000, initialSocPercent: 50, efficiencyPercent: 100 });
    const trace = runDispatch({
      curve,
      bess,
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    trace[1] = { ...trace[1], chargeKw: 100, socKwh: trace[0].socKwh }; // claims a 100kW charge but SOC didn't move
    const violations = checkDispatchInvariants(trace, bess, 60);
    expect(violations.some((v) => v.includes('does not match'))).toBe(true);
  });

  it('[section 7] flags charging that pushes gridImportKw above contractedDemandKw', () => {
    const curve = makeCurve([{ hour: 0, powerKw: 190 }], 60);
    const bess = makeBess({ totalCapacityKwh: 1000, initialSocPercent: 10 });
    const trace = runDispatch({
      curve,
      bess,
      strategy: 'LOAD_SHIFTING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: 200,
    });
    // Tamper with a legitimately-produced trace to simulate a regression.
    trace[0] = { ...trace[0], chargeKw: 50, gridImportKw: 190 + 50 };
    const violations = checkDispatchInvariants(trace, bess, 60, 200);
    expect(violations.some((v) => v.includes('contractedDemandKw'))).toBe(true);
  });

  it('does not flag the contracted-demand rule when the load itself already exceeds it and the BESS is not charging', () => {
    const curve = makeCurve([{ hour: 18, powerKw: 250 }], 60);
    const bess = makeBess({ totalCapacityKwh: 1000, initialSocPercent: 100 });
    const trace = runDispatch({
      curve,
      bess,
      strategy: 'PEAK_SHAVING',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: 200,
      contractedDemandKw: 200,
    });
    expect(checkDispatchInvariants(trace, bess, 60, 200)).toEqual([]);
  });
});

describe('summarizeDispatch — mandatory worked examples (Fase 6 audit, Problem #1)', () => {
  // A report showed ~52x too much "weekly" energy (an annualized value
  // mislabeled as weekly — see BaselineResult in types.ts). These three
  // fixed, hand-computed cases pin down the kW->kWh integration itself so a
  // regression here can never again hide behind annualization math.
  it('100 kW for 1h in 15-min steps (BASE, no BESS) sums to exactly 100 kWh', () => {
    const curve = makeCurve(
      [
        { hour: 0, minute: 0, powerKw: 100 },
        { hour: 0, minute: 15, powerKw: 100 },
        { hour: 0, minute: 30, powerKw: 100 },
        { hour: 0, minute: 45, powerKw: 100 },
      ],
      15
    );
    const trace = runDispatch({
      curve,
      bess: makeBess(),
      strategy: 'BASE',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    const summary = summarizeDispatch(trace, 15);
    expect(summary.energyImportedTotalKwh).toBeCloseTo(100, 10);
  });

  it('100 kW for 24h (BASE, no BESS) sums to exactly 2400 kWh', () => {
    const points = Array.from({ length: 96 }, (_, i) => ({ hour: Math.floor(i / 4), minute: (i % 4) * 15, powerKw: 100 }));
    const curve = makeCurve(points, 15);
    const trace = runDispatch({
      curve,
      bess: makeBess(),
      strategy: 'BASE',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });
    const summary = summarizeDispatch(trace, 15);
    expect(summary.energyImportedTotalKwh).toBeCloseTo(2400, 10);
  });

  it('95 kW for 7 days (BASE, no BESS) sums to exactly 15960 kWh', () => {
    const totalPoints = (7 * 24 * 60) / 15;
    const trace: ReturnType<typeof runDispatch> = [];
    for (let i = 0; i < totalPoints; i++) {
      const minutesFromStart = i * 15;
      const timestamp = new Date(Date.UTC(2026, 7, 24, 0, minutesFromStart)).toISOString();
      trace.push({ timestamp, tariffPeriod: 'offPeak', loadKw: 95, chargeKw: 0, dischargeKw: 0, gridImportKw: 95, socKwh: 0 });
    }
    const summary = summarizeDispatch(trace, 15);
    expect(summary.energyImportedTotalKwh).toBeCloseTo(15960, 6);
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
    const trace = runDispatch({
      curve,
      bess: makeBess(),
      strategy: 'BASE',
      tariffWindow: DEFAULT_WINDOW,
      peakShavingTargetKw: null,
      contractedDemandKw: UNLIMITED_DEMAND,
    });

    const summary = summarizeDispatch(trace, 60);

    expect(summary.maxDemandOffPeakKw).toBe(30);
    expect(summary.maxDemandPeakKw).toBe(80);
    expect(summary.energyImportedOffPeakKwh).toBe(30);
    expect(summary.energyImportedPeakKwh).toBe(80);
    expect(summary.energyImportedTotalKwh).toBe(110);
  });
});
