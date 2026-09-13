import { describe, expect, it } from 'vitest';
import { validateCommercialIndustrialOptions } from './validation';
import { LOAD_CURVE_MAX_POINTS, type CommercialIndustrialOptions } from './types';

function makeLoadCurve(overrides: Partial<CommercialIndustrialOptions['loadCurve']> = {}) {
  return {
    points: [
      { timestamp: '2026-08-24T00:00:00.000Z', powerKw: 100 },
      { timestamp: '2026-08-24T00:15:00.000Z', powerKw: 120 },
      { timestamp: '2026-08-24T00:30:00.000Z', powerKw: 90 },
    ],
    resolutionMinutes: 15,
    timezone: 'America/Sao_Paulo',
    profileBasis: 'representative_period',
    periodStart: '2026-08-24',
    periodEnd: '2026-08-30',
    source: 'csv',
    ...overrides,
  };
}

function makeTariff(overrides: Partial<CommercialIndustrialOptions['tariff']> = {}) {
  return {
    energyRatePeakBrlPerMwh: 1200,
    energyRateOffPeakBrlPerMwh: 450,
    demandRateBrlPerKwMonth: 35,
    contractedDemandKw: 500,
    peakStart: '18:00',
    peakEnd: '21:00',
    tariffModality: 'verde',
    market: 'cativo',
    icmsPercent: 18,
    pisCofinsPercent: 9.25,
    ...overrides,
  };
}

function makeOptions(overrides: Partial<CommercialIndustrialOptions> = {}): CommercialIndustrialOptions {
  return {
    loadCurve: makeLoadCurve() as CommercialIndustrialOptions['loadCurve'],
    tariff: makeTariff() as CommercialIndustrialOptions['tariff'],
    bessProductId: 'product-1',
    strategy: 'HYBRID',
    sizing: { mode: 'fixed', moduleCount: 2, minModules: null, maxModules: null },
    financialAssumptions: {
      discountRatePercent: 12,
      analysisHorizonYears: 10,
      annualEnergyInflationPercent: 0,
      monthsPerYear: 12,
    },
    rankingCriterion: 'PAYBACK',
    ...overrides,
  };
}

describe('validateCommercialIndustrialOptions', () => {
  it('accepts a fully valid configuration', () => {
    expect(validateCommercialIndustrialOptions(makeOptions())).toEqual([]);
  });

  it('accepts a null loadCurve/tariff (not yet configured)', () => {
    expect(validateCommercialIndustrialOptions(makeOptions({ loadCurve: null, tariff: null }))).toEqual([]);
  });

  it('rejects a non-object payload', () => {
    expect(validateCommercialIndustrialOptions(null)).toEqual(['payload must be a JSON object']);
    expect(validateCommercialIndustrialOptions('nope')).toEqual(['payload must be a JSON object']);
  });

  describe('loadCurve', () => {
    it('rejects more than LOAD_CURVE_MAX_POINTS points', () => {
      const points = Array.from({ length: LOAD_CURVE_MAX_POINTS + 1 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, i * 15)).toISOString(),
        powerKw: 10,
      }));
      const errors = validateCommercialIndustrialOptions(makeOptions({ loadCurve: makeLoadCurve({ points }) as never }));
      expect(errors).toContain(`loadCurve.points must not exceed ${LOAD_CURVE_MAX_POINTS} points`);
    });

    it('rejects negative power', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({
          loadCurve: makeLoadCurve({
            points: [{ timestamp: '2026-08-24T00:00:00.000Z', powerKw: -1 }],
          }) as never,
        })
      );
      expect(errors).toContain('loadCurve.points[0].powerKw must be a non-negative finite number');
    });

    it('rejects duplicated timestamps', () => {
      const ts = '2026-08-24T00:00:00.000Z';
      const errors = validateCommercialIndustrialOptions(
        makeOptions({
          loadCurve: makeLoadCurve({
            points: [
              { timestamp: ts, powerKw: 10 },
              { timestamp: ts, powerKw: 20 },
            ],
          }) as never,
        })
      );
      expect(errors.some((e) => e.includes('duplicated'))).toBe(true);
    });

    it('rejects out-of-order timestamps', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({
          loadCurve: makeLoadCurve({
            points: [
              { timestamp: '2026-08-24T00:15:00.000Z', powerKw: 10 },
              { timestamp: '2026-08-24T00:00:00.000Z', powerKw: 20 },
            ],
          }) as never,
        })
      );
      expect(errors.some((e) => e.includes('out of chronological order'))).toBe(true);
    });

    it('rejects an invalid resolutionMinutes', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({ loadCurve: makeLoadCurve({ resolutionMinutes: 5 as never }) as never })
      );
      expect(errors.some((e) => e.startsWith('loadCurve.resolutionMinutes'))).toBe(true);
    });

    it('rejects an invalid profileBasis', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({ loadCurve: makeLoadCurve({ profileBasis: 'monthly' as never }) as never })
      );
      expect(errors.some((e) => e.startsWith('loadCurve.profileBasis'))).toBe(true);
    });
  });

  describe('tariff', () => {
    it('rejects an invalid tariffModality', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({ tariff: makeTariff({ tariffModality: 'branca' as never }) as never })
      );
      expect(errors.some((e) => e.startsWith('tariff.tariffModality'))).toBe(true);
    });

    it('rejects a malformed peakStart', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({ tariff: makeTariff({ peakStart: '25:99' }) as never })
      );
      expect(errors).toContain('tariff.peakStart must be a HH:mm string');
    });

    it('rejects icmsPercent out of range', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({ tariff: makeTariff({ icmsPercent: 150 }) as never })
      );
      expect(errors).toContain('tariff.icmsPercent must be a number between 0 and 100');
    });
  });

  describe('sizing', () => {
    it('rejects fixed mode without a positive moduleCount', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({ sizing: { mode: 'fixed', moduleCount: 0, minModules: null, maxModules: null } })
      );
      expect(errors.some((e) => e.startsWith('sizing.moduleCount'))).toBe(true);
    });

    it('rejects auto mode with minModules greater than maxModules', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({ sizing: { mode: 'auto', moduleCount: null, minModules: 5, maxModules: 2 } })
      );
      expect(errors).toContain('sizing.minModules must not be greater than sizing.maxModules');
    });

    it('accepts a valid auto-mode range', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({ sizing: { mode: 'auto', moduleCount: null, minModules: 1, maxModules: 6 } })
      );
      expect(errors).toEqual([]);
    });
  });

  describe('financialAssumptions', () => {
    it('rejects a negative discount rate', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({
          financialAssumptions: {
            discountRatePercent: -1,
            analysisHorizonYears: 10,
            annualEnergyInflationPercent: 0,
            monthsPerYear: 12,
          },
        })
      );
      expect(errors).toContain('financialAssumptions.discountRatePercent must be a number between 0 and 100');
    });

    it('rejects an analysisHorizonYears above 30', () => {
      const errors = validateCommercialIndustrialOptions(
        makeOptions({
          financialAssumptions: {
            discountRatePercent: 12,
            analysisHorizonYears: 31,
            annualEnergyInflationPercent: 0,
            monthsPerYear: 12,
          },
        })
      );
      expect(errors).toContain('financialAssumptions.analysisHorizonYears must be an integer between 1 and 30');
    });
  });

  it('rejects an invalid strategy', () => {
    const errors = validateCommercialIndustrialOptions(makeOptions({ strategy: 'MAGIC' as never }));
    expect(errors.some((e) => e.startsWith('strategy'))).toBe(true);
  });

  it('rejects an invalid rankingCriterion', () => {
    const errors = validateCommercialIndustrialOptions(makeOptions({ rankingCriterion: 'CHEAPEST' as never }));
    expect(errors.some((e) => e.startsWith('rankingCriterion'))).toBe(true);
  });

  it('rejects a non-string, non-null bessProductId', () => {
    const errors = validateCommercialIndustrialOptions(makeOptions({ bessProductId: 42 as never }));
    expect(errors).toContain('bessProductId must be a string or null');
  });
});
