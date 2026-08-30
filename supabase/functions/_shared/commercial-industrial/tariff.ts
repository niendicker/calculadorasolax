// Tariff costing — Fase 4 of docs/CI-MODULE-PLAN.md section 5.1/11. Turns a
// week's worth of dispatch aggregates (Fase 3's DispatchSummary) into an
// annual R$ cost. Pure: no financial time-value math here (that's
// financial.ts) and no simulation (that's dispatch.ts).

import type { DispatchSummary } from './dispatch.ts';
import type { TariffConfig } from './types.ts';

/** The MVP load curve is one representative week (plan section 4.2/5.4),
 * already mixing weekday and weekend days in their real proportion — so
 * annualizing it is "repeat this week ~52 times", not a business-days-per-
 * month formula (which was for a single-typical-day model the MVP no
 * longer uses). Only energy scales this way; a week's peak demand is taken
 * as-is, not multiplied. */
export const WEEKS_PER_YEAR = 365.25 / 7;

export interface AnnualizedDispatch {
  energyImportedPeakKwh: number;
  energyImportedOffPeakKwh: number;
  energyImportedTotalKwh: number;
  maxDemandPeakKw: number;
  maxDemandOffPeakKw: number;
}

export function annualizeWeeklyDispatch(weekly: DispatchSummary): AnnualizedDispatch {
  return {
    energyImportedPeakKwh: weekly.energyImportedPeakKwh * WEEKS_PER_YEAR,
    energyImportedOffPeakKwh: weekly.energyImportedOffPeakKwh * WEEKS_PER_YEAR,
    energyImportedTotalKwh: weekly.energyImportedTotalKwh * WEEKS_PER_YEAR,
    // Demand does not annualize by repetition — the week's peak is already
    // the year's expected peak for a representative week.
    maxDemandPeakKw: weekly.maxDemandPeakKw,
    maxDemandOffPeakKw: weekly.maxDemandOffPeakKw,
  };
}

export interface AnnualEnergyCost {
  energyCostBrl: number;
  demandCostBrl: number;
  totalCostBrl: number;
  /** The demand actually billed — the higher of what was measured and what
   * was contracted (Grupo A bills at least the contracted amount). */
  billedDemandKw: number;
}

/** Computes one year's tariff cost from an annualized dispatch.
 *
 * Tax handling (documented per plan section 11's "definições devem ser
 * documentadas"): ICMS and PIS/COFINS are applied as a simple additive
 * markup on the pre-tax cost, not the "por dentro" gross-up Brazilian tax
 * law technically requires. This is the MVP simplification — flagged
 * explicitly rather than silently approximated, to be revisited with the
 * business/tax team before this is treated as billing-grade.
 *
 * Demand billing (documented, plan section 4.4's contract has a single
 * demandRateBrlPerKwMonth/contractedDemandKw — no separate peak/off-peak
 * demand rate, unlike real "Azul" tariffs): billed demand is the highest of
 * peak/off-peak measured demand and the contracted demand, at the single
 * rate. No overrun penalty multiplier — out of scope for this contract,
 * noted here as a future extension rather than silently applied. */
export function computeAnnualEnergyCost(
  annualized: AnnualizedDispatch,
  tariff: TariffConfig,
  monthsPerYear: number
): AnnualEnergyCost {
  const taxMultiplier = 1 + (tariff.icmsPercent + tariff.pisCofinsPercent) / 100;

  const energyCostBrl =
    ((annualized.energyImportedPeakKwh / 1000) * tariff.energyRatePeakBrlPerMwh +
      (annualized.energyImportedOffPeakKwh / 1000) * tariff.energyRateOffPeakBrlPerMwh) *
    taxMultiplier;

  const billedDemandKw = Math.max(annualized.maxDemandPeakKw, annualized.maxDemandOffPeakKw, tariff.contractedDemandKw);
  const demandCostBrl = billedDemandKw * tariff.demandRateBrlPerKwMonth * monthsPerYear * taxMultiplier;

  return {
    energyCostBrl,
    demandCostBrl,
    totalCostBrl: energyCostBrl + demandCostBrl,
    billedDemandKw,
  };
}

export interface AnnualSavings {
  energySavingsBrl: number;
  demandSavingsBrl: number;
  annualSavingsBrl: number;
}

/** Plan section 11's "economia de energia"/"economia de demanda" — the
 * per-component difference between the baseline (no BESS) and a scenario's
 * cost, plus their sum. Can be negative (a scenario more expensive than
 * baseline), most commonly for Load Shifting under an equal peak/off-peak
 * tariff — round-trip losses have a real cost when there is no price
 * differential to arbitrage against; see tariff.test.ts. */
export function computeAnnualSavings(baseline: AnnualEnergyCost, scenario: AnnualEnergyCost): AnnualSavings {
  const energySavingsBrl = baseline.energyCostBrl - scenario.energyCostBrl;
  const demandSavingsBrl = baseline.demandCostBrl - scenario.demandCostBrl;
  return {
    energySavingsBrl,
    demandSavingsBrl,
    annualSavingsBrl: energySavingsBrl + demandSavingsBrl,
  };
}
