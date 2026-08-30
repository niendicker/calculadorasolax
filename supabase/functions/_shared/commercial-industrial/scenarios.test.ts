import { describe, expect, it } from 'vitest';
import { buildModuleCountRange, buildScenarioGrid, materializeScenarioDetail, type BessProductSpec, type ScenarioGridInput } from './scenarios';
import { hasNoMarginalBenefit } from './ranking';
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
    targetDemandKw: 100,
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
