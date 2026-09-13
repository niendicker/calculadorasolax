import { describe, expect, it } from 'vitest';
import {
  buildCashFlow,
  computeAnnualRoiPercent,
  computeCapex,
  computeDiscountedPaybackYears,
  computeNpv,
  computeSimplePaybackYears,
  isPaybackWithinWarranty,
} from './financial';
import type { FinancialAssumptions } from './types';

function makeAssumptions(overrides: Partial<FinancialAssumptions> = {}): FinancialAssumptions {
  return {
    discountRatePercent: 10,
    analysisHorizonYears: 5,
    annualEnergyInflationPercent: 0,
    monthsPerYear: 12,
    ...overrides,
  };
}

describe('computeCapex', () => {
  it('multiplies module count by unit price and adds extra costs', () => {
    expect(computeCapex(3, 5000)).toBe(15000);
    expect(computeCapex(3, 5000, 2000)).toBe(17000);
  });
});

describe('buildCashFlow', () => {
  it('produces a year-0 outflow followed by flat nominal savings when inflation is zero', () => {
    const cashFlow = buildCashFlow(10000, 3000, makeAssumptions());

    expect(cashFlow).toHaveLength(6); // year 0..5
    expect(cashFlow[0]).toEqual({ year: 0, nominalCashFlow: -10000, discountedCashFlow: -10000, cumulativeNominalCashFlow: -10000 });
    expect(cashFlow[1].nominalCashFlow).toBe(3000);
    expect(cashFlow[3].cumulativeNominalCashFlow).toBe(-1000); // -10000 + 3*3000
    expect(cashFlow[5].cumulativeNominalCashFlow).toBe(5000); // -10000 + 5*3000
  });

  it('escalates nominal savings year over year by the inflation rate', () => {
    const cashFlow = buildCashFlow(0, 1000, makeAssumptions({ annualEnergyInflationPercent: 10, analysisHorizonYears: 3 }));

    expect(cashFlow[1].nominalCashFlow).toBeCloseTo(1000, 6);
    expect(cashFlow[2].nominalCashFlow).toBeCloseTo(1100, 6);
    expect(cashFlow[3].nominalCashFlow).toBeCloseTo(1210, 6);
  });
});

describe('computeSimplePaybackYears', () => {
  it('interpolates the fractional year the cumulative nominal flow crosses zero', () => {
    const cashFlow = buildCashFlow(10000, 3000, makeAssumptions());
    // -10000, -7000, -4000, -1000, 2000, 5000 -> crosses between year 3 and 4
    expect(computeSimplePaybackYears(cashFlow)).toBeCloseTo(3 + 1000 / 3000, 6);
  });

  it('returns null when the investment never pays back within the horizon', () => {
    const cashFlow = buildCashFlow(10000, 0, makeAssumptions());
    expect(computeSimplePaybackYears(cashFlow)).toBeNull();
  });

  it('returns null for a scenario that costs more than it saves (negative annual savings)', () => {
    const cashFlow = buildCashFlow(10000, -500, makeAssumptions());
    expect(computeSimplePaybackYears(cashFlow)).toBeNull();
  });

  it('returns 0 when CAPEX is already covered at year 0 (a zero/negative-cost scenario)', () => {
    const cashFlow = buildCashFlow(0, 1000, makeAssumptions());
    expect(computeSimplePaybackYears(cashFlow)).toBe(0);
  });
});

describe('computeDiscountedPaybackYears', () => {
  it('takes longer than the simple payback for the same cash flow (discounting delays it)', () => {
    const cashFlow = buildCashFlow(10000, 3000, makeAssumptions());
    const simple = computeSimplePaybackYears(cashFlow)!;
    const discounted = computeDiscountedPaybackYears(cashFlow)!;
    expect(discounted).toBeGreaterThan(simple);
  });
});

describe('computeNpv', () => {
  it('matches the textbook discounted cash flow formula', () => {
    const capex = 10000;
    const annualSavings = 3000;
    const assumptions = makeAssumptions();
    const cashFlow = buildCashFlow(capex, annualSavings, assumptions);

    const discountFactor = 1 + assumptions.discountRatePercent / 100;
    const expectedNpv =
      -capex +
      Array.from({ length: assumptions.analysisHorizonYears }, (_, i) => annualSavings / discountFactor ** (i + 1)).reduce(
        (a, b) => a + b,
        0
      );

    expect(computeNpv(cashFlow)).toBeCloseTo(expectedNpv, 6);
  });
});

describe('computeAnnualRoiPercent', () => {
  it('divides year-1 savings by CAPEX', () => {
    expect(computeAnnualRoiPercent(10000, 3000)).toBe(30);
  });

  it('returns 0 for a non-positive CAPEX instead of dividing by zero', () => {
    expect(computeAnnualRoiPercent(0, 3000)).toBe(0);
  });
});

describe('isPaybackWithinWarranty', () => {
  it('is true when payback happens before the warranty ends', () => {
    expect(isPaybackWithinWarranty(3.33, 10)).toBe(true);
  });

  it('is false when payback happens after the warranty ends', () => {
    expect(isPaybackWithinWarranty(3.33, 3)).toBe(false);
  });

  it('is false when there is no payback at all', () => {
    expect(isPaybackWithinWarranty(null, 10)).toBe(false);
  });
});
