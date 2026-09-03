// Financial engine — Fase 4 of docs/CI-MODULE-PLAN.md section 11. Turns a
// CAPEX figure and an annual savings figure into a cash-flow projection,
// payback (simple and discounted — both, per the closed decision in section
// 17), annual ROI, and NPV. No tariff/dispatch knowledge here — this only
// does time-value-of-money arithmetic on numbers it's handed.

import type { CashFlowYear, FinancialAssumptions } from './types.ts';

export function computeCapex(moduleCount: number, unitPriceBrl: number, additionalCostsBrl = 0): number {
  return moduleCount * unitPriceBrl + additionalCostsBrl;
}

/** Year 0 is the CAPEX outflow (no savings yet); years 1..analysisHorizonYears
 * carry that year's savings, escalated by annualEnergyInflationPercent
 * (year 1 = the nominal, un-escalated annualSavingsBrl). Discounting uses
 * discountRatePercent, applied from year 0 (so year 0's discounted value
 * equals its nominal value — the investment happens now). */
export function buildCashFlow(capexBrl: number, annualSavingsBrl: number, assumptions: FinancialAssumptions): CashFlowYear[] {
  const discountFactor = 1 + assumptions.discountRatePercent / 100;
  const inflationFactor = 1 + assumptions.annualEnergyInflationPercent / 100;

  const cashFlow: CashFlowYear[] = [
    { year: 0, nominalCashFlow: -capexBrl, discountedCashFlow: -capexBrl, cumulativeNominalCashFlow: -capexBrl },
  ];

  for (let year = 1; year <= assumptions.analysisHorizonYears; year++) {
    const nominalCashFlow = annualSavingsBrl * inflationFactor ** (year - 1);
    const discountedCashFlow = nominalCashFlow / discountFactor ** year;
    const cumulativeNominalCashFlow = cashFlow[year - 1].cumulativeNominalCashFlow + nominalCashFlow;
    cashFlow.push({ year, nominalCashFlow, discountedCashFlow, cumulativeNominalCashFlow });
  }

  return cashFlow;
}

/** Fractional-year point where `cumulativeAt(year)` crosses from negative to
 * non-negative, linearly interpolated within the crossing year. Null if it
 * never crosses within the series (plan section 12.1's "mais módulos sem
 * benefício" / a scenario that never pays for itself). Shared by both
 * payback definitions — they differ only in which cumulative series they
 * walk. */
function findPaybackYear(cashFlow: CashFlowYear[], cumulativeAt: (point: CashFlowYear) => number): number | null {
  if (cumulativeAt(cashFlow[0]) >= 0) return 0;
  for (let i = 1; i < cashFlow.length; i++) {
    const previousCumulative = cumulativeAt(cashFlow[i - 1]);
    const currentCumulative = cumulativeAt(cashFlow[i]);
    if (currentCumulative >= 0 && previousCumulative < 0) {
      const yearCashFlow = currentCumulative - previousCumulative;
      if (yearCashFlow <= 0) return null; // no progress this year, would divide by zero/negative
      return cashFlow[i - 1].year + -previousCumulative / yearCashFlow;
    }
  }
  return null;
}

export function computeSimplePaybackYears(cashFlow: CashFlowYear[]): number | null {
  return findPaybackYear(cashFlow, (point) => point.cumulativeNominalCashFlow);
}

/** Discounted payback walks the *discounted* cash flows' own cumulative sum
 * — not `cumulativeNominalCashFlow`, which is always the nominal series. */
export function computeDiscountedPaybackYears(cashFlow: CashFlowYear[]): number | null {
  let cumulative = 0;
  const discountedCumulative = cashFlow.map((point) => {
    cumulative += point.discountedCashFlow;
    return cumulative;
  });
  const withCumulative = cashFlow.map((point, i) => ({ ...point, cumulativeNominalCashFlow: discountedCumulative[i] }));
  return findPaybackYear(withCumulative, (point) => point.cumulativeNominalCashFlow);
}

export function computeNpv(cashFlow: CashFlowYear[]): number {
  return cashFlow.reduce((sum, point) => sum + point.discountedCashFlow, 0);
}

/** Plan section 11's closed decision: "ROI anual = economia anual / CAPEX" —
 * the un-escalated year-1 savings over CAPEX, not a horizon-cumulative
 * figure. */
export function computeAnnualRoiPercent(capexBrl: number, annualSavingsBrl: number): number {
  if (capexBrl <= 0) return 0;
  return (annualSavingsBrl / capexBrl) * 100;
}

/** Plan section 9/11's warranty-return indicator — "não substitui o
 * horizonte financeiro", just a yes/no signal for the memorial. */
export function isPaybackWithinWarranty(paybackYears: number | null, warrantyYears: number): boolean {
  return paybackYears !== null && paybackYears <= warrantyYears;
}
