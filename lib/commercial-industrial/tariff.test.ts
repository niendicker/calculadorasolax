import { describe, expect, it } from 'vitest';
import { annualizeWeeklyDispatch, computeAnnualEnergyCost, computeAnnualSavings, WEEKS_PER_YEAR } from './tariff';
import { runDispatch, summarizeDispatch, type TariffWindow } from './dispatch';
import type { BessRuntimeParams, LoadCurve, TariffConfig } from './types';

const WINDOW: TariffWindow = { peakStart: '18:00', peakEnd: '21:00' };

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

describe('annualizeWeeklyDispatch', () => {
  it('scales energy by WEEKS_PER_YEAR but leaves demand untouched', () => {
    const annualized = annualizeWeeklyDispatch({
      maxDemandPeakKw: 80,
      maxDemandOffPeakKw: 30,
      energyImportedPeakKwh: 100,
      energyImportedOffPeakKwh: 200,
      energyImportedTotalKwh: 300,
    });

    expect(annualized.energyImportedPeakKwh).toBeCloseTo(100 * WEEKS_PER_YEAR, 6);
    expect(annualized.energyImportedOffPeakKwh).toBeCloseTo(200 * WEEKS_PER_YEAR, 6);
    expect(annualized.maxDemandPeakKw).toBe(80);
    expect(annualized.maxDemandOffPeakKw).toBe(30);
  });
});

describe('computeAnnualEnergyCost', () => {
  it('computes energy and demand cost with no taxes, manually verifiable', () => {
    const annualized = {
      energyImportedPeakKwh: 1000, // 1 MWh
      energyImportedOffPeakKwh: 2000, // 2 MWh
      energyImportedTotalKwh: 3000,
      maxDemandPeakKw: 50,
      maxDemandOffPeakKw: 20,
    };
    const tariff = makeTariff({ contractedDemandKw: 30 });

    const cost = computeAnnualEnergyCost(annualized, tariff, 12);

    // energy: 1 MWh * 1200 + 2 MWh * 450 = 1200 + 900 = 2100
    expect(cost.energyCostBrl).toBeCloseTo(2100, 6);
    // billed demand = max(50, 20, 30) = 50; 50 * 35 * 12 = 21000
    expect(cost.billedDemandKw).toBe(50);
    expect(cost.demandCostBrl).toBeCloseTo(21000, 6);
    expect(cost.totalCostBrl).toBeCloseTo(23100, 6);
  });

  it('bills at least the contracted demand even if measured demand is lower', () => {
    const annualized = {
      energyImportedPeakKwh: 0,
      energyImportedOffPeakKwh: 0,
      energyImportedTotalKwh: 0,
      maxDemandPeakKw: 10,
      maxDemandOffPeakKw: 10,
    };
    const cost = computeAnnualEnergyCost(annualized, makeTariff({ contractedDemandKw: 100 }), 12);
    expect(cost.billedDemandKw).toBe(100);
  });

  it('applies ICMS and PIS/COFINS as a combined additive markup', () => {
    const annualized = {
      energyImportedPeakKwh: 1000,
      energyImportedOffPeakKwh: 0,
      energyImportedTotalKwh: 1000,
      maxDemandPeakKw: 0,
      maxDemandOffPeakKw: 0,
    };
    const tariff = makeTariff({ energyRatePeakBrlPerMwh: 1000, contractedDemandKw: 0, icmsPercent: 18, pisCofinsPercent: 9.25 });

    const cost = computeAnnualEnergyCost(annualized, tariff, 12);

    // 1 MWh * 1000 = 1000 pre-tax; * 1.2725 = 1272.5
    expect(cost.energyCostBrl).toBeCloseTo(1272.5, 6);
  });
});

describe('computeAnnualSavings', () => {
  it('splits savings into energy and demand components', () => {
    const baseline = { energyCostBrl: 5000, demandCostBrl: 3000, totalCostBrl: 8000, billedDemandKw: 100 };
    const scenario = { energyCostBrl: 4000, demandCostBrl: 2500, totalCostBrl: 6500, billedDemandKw: 80 };

    const savings = computeAnnualSavings(baseline, scenario);

    expect(savings.energySavingsBrl).toBe(1000);
    expect(savings.demandSavingsBrl).toBe(500);
    expect(savings.annualSavingsBrl).toBe(1500);
  });

  it('can be negative when a scenario costs more than baseline', () => {
    const baseline = { energyCostBrl: 1000, demandCostBrl: 0, totalCostBrl: 1000, billedDemandKw: 0 };
    const scenario = { energyCostBrl: 1200, demandCostBrl: 0, totalCostBrl: 1200, billedDemandKw: 0 };
    expect(computeAnnualSavings(baseline, scenario).annualSavingsBrl).toBe(-200);
  });
});

describe('end-to-end: equal peak/off-peak tariff produces zero energy savings at 100% efficiency', () => {
  it('Load Shifting neither saves nor costs energy when there is no price differential to arbitrage', () => {
    const curve: LoadCurve = {
      points: [
        { timestamp: '2026-08-24T00:00:00Z', powerKw: 50 },
        { timestamp: '2026-08-24T18:00:00Z', powerKw: 50 },
      ],
      resolutionMinutes: 60,
      timezone: 'UTC',
      profileBasis: 'representative_period',
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      source: 'manual',
    };
    const bess: BessRuntimeParams = {
      // Matches the curve's own load level: within this test's tiny 2-point
      // window, whatever gets charged off-peak must equal what's needed
      // (and can be) discharged at peak, so leftover stored energy doesn't
      // distort the total imported energy this narrow window measures. A
      // full representative week wouldn't need this — there'd be enough
      // peak intervals for any off-peak surplus to be used eventually.
      totalPowerKw: 50,
      totalCapacityKwh: 1000,
      socMinPercent: 0,
      socMaxPercent: 100,
      efficiencyPercent: 100,
      initialSocPercent: 10,
    };
    const equalTariff = makeTariff({ energyRatePeakBrlPerMwh: 800, energyRateOffPeakBrlPerMwh: 800, contractedDemandKw: 0 });

    const baselineTrace = runDispatch({ curve, bess, strategy: 'BASE', tariffWindow: WINDOW, targetDemandKw: null });
    const scenarioTrace = runDispatch({ curve, bess, strategy: 'LOAD_SHIFTING', tariffWindow: WINDOW, targetDemandKw: null });

    const baselineCost = computeAnnualEnergyCost(
      annualizeWeeklyDispatch(summarizeDispatch(baselineTrace, 60)),
      equalTariff,
      12
    );
    const scenarioCost = computeAnnualEnergyCost(
      annualizeWeeklyDispatch(summarizeDispatch(scenarioTrace, 60)),
      equalTariff,
      12
    );

    expect(computeAnnualSavings(baselineCost, scenarioCost).energySavingsBrl).toBeCloseTo(0, 6);
  });
});
