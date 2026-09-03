import { describe, expect, it } from 'vitest';
import { buildModuleCountRange, buildScenarioGrid, materializeScenarioDetail, type BessProductSpec, type ScenarioGridInput } from './scenarios';
import { checkDispatchInvariants } from './dispatch';
import { hasNoMarginalBenefit } from './ranking';
import { WEEKS_PER_YEAR } from './tariff';
import type { LoadCurve, SizingConfig, TariffConfig } from './types';

describe('buildModuleCountRange', () => {
  it('returns exactly the requested count in fixed mode', () => {
    const sizing: SizingConfig = { mode: 'fixed', moduleCount: 4, minModules: null, maxModules: null };
    expect(buildModuleCountRange(sizing)).toEqual([4]);
  });

  it('returns an empty range when fixed mode has no moduleCount', () => {
    const sizing: SizingConfig = { mode: 'fixed', moduleCount: null, minModules: null, maxModules: null };
    expect(buildModuleCountRange(sizing)).toEqual([]);
  });

  it('returns every integer in [minModules, maxModules] in auto mode', () => {
    const sizing: SizingConfig = { mode: 'auto', moduleCount: null, minModules: 2, maxModules: 5 };
    expect(buildModuleCountRange(sizing)).toEqual([2, 3, 4, 5]);
  });

  it('returns an empty range when auto mode is missing a bound', () => {
    const sizing: SizingConfig = { mode: 'auto', moduleCount: null, minModules: 2, maxModules: null };
    expect(buildModuleCountRange(sizing)).toEqual([]);
  });
});

function makeCurve(): LoadCurve {
  return {
    points: [
      { timestamp: '2026-08-24T00:00:00Z', powerKw: 50 },
      { timestamp: '2026-08-24T18:00:00Z', powerKw: 120 },
    ],
    resolutionMinutes: 60,
    timezone: 'UTC',
    profileBasis: 'representative_period',
    periodStart: '2026-08-24',
    periodEnd: '2026-08-30',
    source: 'manual',
  };
}

function makeTariff(overrides: Partial<TariffConfig> = {}): TariffConfig {
  return {
    energyRatePeakBrlPerMwh: 1200,
    energyRateOffPeakBrlPerMwh: 450,
    demandRateBrlPerKwMonth: 35,
    contractedDemandKw: 100,
    peakStart: '18:00',
    peakEnd: '21:00',
    tariffModality: 'verde',
    market: 'cativo',
    icmsPercent: 0,
    pisCofinsPercent: 0,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ScenarioGridInput> = {}): ScenarioGridInput {
  const product: BessProductSpec = {
    modulePowerKw: 50,
    moduleCapacityKwh: 100,
    efficiencyPercent: 100,
    socMinPercent: 0,
    socMaxPercent: 100,
  };
  return {
    curve: makeCurve(),
    product,
    strategy: 'PEAK_SHAVING',
    sizing: { mode: 'fixed', moduleCount: 1, minModules: null, maxModules: null },
    tariffWindow: { peakStart: '18:00', peakEnd: '21:00' },
    tariff: makeTariff(),
    peakShavingTargetKw: 100,
    unitPriceBrl: 5000,
    monthsPerYear: 12,
    financialAssumptions: { discountRatePercent: 10, analysisHorizonYears: 10, annualEnergyInflationPercent: 0, monthsPerYear: 12 },
    ...overrides,
  };
}

describe('buildScenarioGrid', () => {
  it('evaluates exactly the requested count in fixed mode', () => {
    const { scenarios } = buildScenarioGrid(makeInput({ sizing: { mode: 'fixed', moduleCount: 3, minModules: null, maxModules: null } }));
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].moduleCount).toBe(3);
  });

  it('evaluates only the permitted quantities in auto mode', () => {
    const { scenarios } = buildScenarioGrid(makeInput({ sizing: { mode: 'auto', moduleCount: null, minModules: 1, maxModules: 3 } }));
    expect(scenarios.map((s) => s.moduleCount)).toEqual([1, 2, 3]);
  });

  it('sizes power/capacity/CAPEX proportionally to module count', () => {
    const { scenarios } = buildScenarioGrid(makeInput({ sizing: { mode: 'auto', moduleCount: null, minModules: 1, maxModules: 2 } }));
    expect(scenarios[0].totalPowerKw).toBe(50);
    expect(scenarios[1].totalPowerKw).toBe(100);
    expect(scenarios[0].capex).toBe(5000);
    expect(scenarios[1].capex).toBe(10000);
  });

  it('uses the same baseline (curve and premises) for every candidate', () => {
    const { baseline, scenarios } = buildScenarioGrid(makeInput({ sizing: { mode: 'auto', moduleCount: null, minModules: 1, maxModules: 2 } }));
    // Baseline reflects the raw curve, independent of module count.
    expect(baseline.maxDemandPeakKw).toBe(120);
    for (const scenario of scenarios) {
      expect(scenario.annualSavings).toBeGreaterThan(0); // both beat the unmitigated baseline
    }
  });

  it('identifies a scenario with no marginal benefit once the target is already fully shaved', () => {
    // 1 module (50 kW) already covers the 20 kW excess over the 100 kW
    // target — modules 2 and 3 add power/capacity nothing is left to use.
    const { scenarios } = buildScenarioGrid(makeInput({ sizing: { mode: 'auto', moduleCount: null, minModules: 1, maxModules: 3 } }));

    expect(scenarios[0].marginalGain).toBeNull(); // no predecessor to compare against
    expect(hasNoMarginalBenefit(scenarios[1])).toBe(true);
    expect(hasNoMarginalBenefit(scenarios[2])).toBe(true);
    expect(scenarios[1].annualSavings).toBeCloseTo(scenarios[0].annualSavings, 6);
  });

  it('flags a technical warning when the BESS cannot fully reach the demand target', () => {
    const undersizedProduct: BessProductSpec = { modulePowerKw: 5, moduleCapacityKwh: 10, efficiencyPercent: 100, socMinPercent: 0, socMaxPercent: 100 };
    const { scenarios } = buildScenarioGrid(makeInput({ product: undersizedProduct }));
    expect(scenarios[0].technicalWarnings.some((w) => w.includes('insuficiente'))).toBe(true);
  });

  it('reports the true representative-week energy separately from the annualized figure (Fase 6 audit, Problem #1)', () => {
    // makeCurve() is 2 points on ONE representative week — the raw
    // (non-annualized) totals must equal the curve's own kW*h integration,
    // NOT be inflated by WEEKS_PER_YEAR. The annual fields, conversely, must
    // be exactly WEEKS_PER_YEAR times the weekly ones.
    const { baseline } = buildScenarioGrid(makeInput());
    // curve: 50kW off-peak for 1h + 120kW peak for 1h (resolutionMinutes=60)
    expect(baseline.weeklyEnergyImportedOffPeakKwh).toBeCloseTo(50, 6);
    expect(baseline.weeklyEnergyImportedPeakKwh).toBeCloseTo(120, 6);
    expect(baseline.energyImportedOffPeakKwh).toBeCloseTo(50 * WEEKS_PER_YEAR, 6);
    expect(baseline.energyImportedPeakKwh).toBeCloseTo(120 * WEEKS_PER_YEAR, 6);
  });

  it('never depends on which scenario a caller later selects — selection is not an input', () => {
    // buildScenarioGrid has no "selected" parameter at all; calling it twice
    // with the same input is the only way to check this, and it must be
    // deterministic (plan section 1: "cálculos determinísticos").
    const input = makeInput({ sizing: { mode: 'auto', moduleCount: null, minModules: 1, maxModules: 2 } });
    expect(buildScenarioGrid(input)).toEqual(buildScenarioGrid(input));
  });
});

describe('materializeScenarioDetail', () => {
  it('reproduces the same aggregates as the matching grid candidate, plus dispatch and cash flow', () => {
    const input = makeInput({ sizing: { mode: 'auto', moduleCount: null, minModules: 1, maxModules: 2 } });
    const { scenarios } = buildScenarioGrid(input);
    const gridCandidate = scenarios[1]; // moduleCount 2

    const detail = materializeScenarioDetail(input, 2, gridCandidate.marginalGain);

    const { dispatch, cashFlow, ...aggregates } = detail;
    expect(aggregates).toEqual(gridCandidate);
    expect(dispatch.length).toBe(input.curve.points.length);
    expect(cashFlow.length).toBeGreaterThan(0);
  });

  it("never mutates the grid's own scenario when a caller later augments the detail with a different marginalGain", () => {
    const input = makeInput({ sizing: { mode: 'fixed', moduleCount: 1, minModules: null, maxModules: null } });
    const { scenarios } = buildScenarioGrid(input);

    const detail = materializeScenarioDetail(input, 1, 999);

    expect(detail.marginalGain).toBe(999);
    expect(scenarios[0].marginalGain).toBeNull();
  });
});

describe('Fase 7 audit — integrated sanity check (section 9)', () => {
  // A tiny, fully hand-verifiable scenario: 4 hourly intervals, LOAD_SHIFTING,
  // 100% efficiency (so energy conservation is exact), demandRateBrlPerKwMonth
  // =0 (isolates energy savings from demand savings), contractedDemandKw=200.
  // Peak intervals come FIRST in the curve because evaluateModuleCount always
  // starts a BESS at socMaxPercent (scenarios.ts never sets
  // initialSocPercent — see BessRuntimeParams's own doc comment) — this
  // scenario's battery therefore starts fully charged (100kWh, since
  // totalCapacityKwh=100) and gets exercised in a realistic
  // discharge-then-recharge order:
  //
  //   Peak (hour 18): load=180kW -> BESS discharges min(180, 100 rated, 100
  //     stored)=100kW -> gridImport=80kW. Stored energy drops to 0.
  //   Peak (hour 19): load=100kW -> nothing left to discharge (SOC=0) ->
  //     gridImport=100kW (full load).
  //   Off-peak (hour 20): load=150kW -> BESS charges min(100 rated, 200-150
  //     headroom, 100 SOC-limited)=50kW -> gridImport=200kW (exactly at the
  //     contract). Stored energy: 50kWh.
  //   Off-peak (hour 21): same load -> charges 50kW again (SOC-limited to
  //     exactly 50kW, since only 50kWh of headroom remains before socMax) ->
  //     gridImport=200kW. Stored energy: 100kWh (back to full).
  //
  // Baseline (no BESS): energy = 180+100+150+150 = 580kWh total, split
  //   280kWh peak / 300kWh off-peak.
  //   cost = 300*R$0.50 + 280*R$1.00 = R$150 + R$280 = R$430.
  // With BESS: energy = 80+100+200+200 = 580kWh total (IDENTICAL — 100%
  //   efficiency arbitrage only shifts WHEN energy is bought, never how
  //   much), split 180kWh peak / 400kWh off-peak.
  //   cost = 400*R$0.50 + 180*R$1.00 = R$200 + R$180 = R$380.
  //   savings = R$430 - R$380 = R$50, exactly 100kWh * (R$1.00-R$0.50) —
  //   the arbitraged energy times the price spread.
  it('matches a full manual calculation: charge/discharge power, SOC, energy, cost, savings, peak demand, and the contracted-demand limit', () => {
    const curve: LoadCurve = {
      points: [
        { timestamp: '2026-08-24T18:00:00Z', powerKw: 180 }, // peak
        { timestamp: '2026-08-24T19:00:00Z', powerKw: 100 }, // peak
        { timestamp: '2026-08-24T20:00:00Z', powerKw: 150 }, // off-peak
        { timestamp: '2026-08-24T21:00:00Z', powerKw: 150 }, // off-peak
      ],
      resolutionMinutes: 60,
      timezone: 'UTC',
      profileBasis: 'representative_period',
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      source: 'manual',
    };
    const tariff = makeTariff({
      energyRatePeakBrlPerMwh: 1000, // R$1,00/kWh
      energyRateOffPeakBrlPerMwh: 500, // R$0,50/kWh
      demandRateBrlPerKwMonth: 0, // isolates energy savings for this check
      contractedDemandKw: 200,
    });
    const input = makeInput({
      curve,
      tariff,
      tariffWindow: { peakStart: '18:00', peakEnd: '20:00' },
      strategy: 'LOAD_SHIFTING',
      peakShavingTargetKw: null,
      product: { modulePowerKw: 100, moduleCapacityKwh: 100, efficiencyPercent: 100, socMinPercent: 0, socMaxPercent: 100 },
      sizing: { mode: 'fixed', moduleCount: 1, minModules: null, maxModules: null },
    });

    const { baseline, scenarios } = buildScenarioGrid(input);
    const scenario = scenarios[0];
    const detail = materializeScenarioDetail(input, 1, null);

    // Charge/discharge power and SOC, interval by interval.
    const [peak1, peak2, offPeak1, offPeak2] = detail.dispatch;
    expect(peak1.dischargeKw).toBeCloseTo(100, 6);
    expect(peak1.gridImportKw).toBeCloseTo(80, 6);
    expect(peak1.socKwh).toBeCloseTo(0, 6); // fully drained serving the first peak hour

    expect(peak2.dischargeKw).toBeCloseTo(0, 6); // nothing left to give
    expect(peak2.gridImportKw).toBeCloseTo(100, 6);

    expect(offPeak1.chargeKw).toBeCloseTo(50, 6);
    expect(offPeak1.gridImportKw).toBeCloseTo(200, 6);
    expect(offPeak1.socKwh).toBeCloseTo(50, 6);

    expect(offPeak2.chargeKw).toBeCloseTo(50, 6);
    expect(offPeak2.gridImportKw).toBeCloseTo(200, 6);
    expect(offPeak2.socKwh).toBeCloseTo(100, 6); // back to full

    // Respect for the contracted demand: charging never pushes grid import
    // past it (section 4/7's invariant), verified directly, not just via
    // checkDispatchInvariants.
    for (const point of detail.dispatch) {
      if (point.chargeKw > 0) expect(point.gridImportKw).toBeLessThanOrEqual(200 + 1e-9);
    }
    expect(checkDispatchInvariants(detail.dispatch, { totalPowerKw: 100, totalCapacityKwh: 100, socMinPercent: 0, socMaxPercent: 100, efficiencyPercent: 100 }, 60, 200)).toEqual([]);

    // Weekly (non-annualized) energy split, straight from the curve.
    expect(baseline.weeklyEnergyImportedOffPeakKwh).toBeCloseTo(300, 6);
    expect(baseline.weeklyEnergyImportedPeakKwh).toBeCloseTo(280, 6);

    // Cost without BESS vs. with BESS, and the resulting savings — computed
    // independently here (not read from the engine) and then compared.
    const weeklyBaselineCostBrl = 300 * 0.5 + 280 * 1.0;
    const weeklyScenarioCostBrl = 400 * 0.5 + 180 * 1.0;
    const weeklySavingsBrl = weeklyBaselineCostBrl - weeklyScenarioCostBrl;
    expect(weeklyBaselineCostBrl).toBeCloseTo(430, 6);
    expect(weeklyScenarioCostBrl).toBeCloseTo(380, 6);
    expect(weeklySavingsBrl).toBeCloseTo(50, 6);

    // The engine reports these annualized (BaselineResult/ScenarioCandidate
    // convention) — WEEKS_PER_YEAR times the manually-computed weekly
    // figures.
    expect(baseline.annualCostBrl).toBeCloseTo(weeklyBaselineCostBrl * WEEKS_PER_YEAR, 3);
    expect(scenario.annualSavings).toBeCloseTo(weeklySavingsBrl * WEEKS_PER_YEAR, 3);
    expect(scenario.demandSavings).toBeCloseTo(0, 6); // demandRateBrlPerKwMonth=0 isolates this to zero

    // Peak demand: NOT annualized (annualizeWeeklyDispatch scales energy
    // only, never demand — a week's peak IS the year's expected peak).
    // Baseline's worst peak-period import was 180kW (hour 18);
    // LOAD_SHIFTING only had enough energy to shave the first peak hour, so
    // the achieved peak (100kW, at hour 19) is lower but not zero.
    expect(baseline.maxDemandPeakKw).toBeCloseTo(180, 6);
    expect(scenario.totalPowerKw).toBe(100);
  });
});
