// Scenario grid — Fase 5 of docs/CI-MODULE-PLAN.md section 5.1. Runs the
// dispatch + tariff + financial engines (Fases 3-4) once per module count in
// the requested sizing range, plus one baseline (no BESS) run shared by all
// of them. Pure: takes an already-resolved BESS spec and unit price (Fase
// 7's repository layer resolves those from the catalog and
// user_stock_items — this module never touches Supabase).

import { annualizeWeeklyDispatch, computeAnnualEnergyCost, computeAnnualSavings } from './tariff';
import { runDispatch, summarizeDispatch, type TariffWindow } from './dispatch';
import { buildCashFlow, computeAnnualRoiPercent, computeCapex, computeDiscountedPaybackYears, computeNpv, computeSimplePaybackYears } from './financial';
import type {
  BaselineResult,
  BessRuntimeParams,
  BessStrategyId,
  CiBessProduct,
  FinancialAssumptions,
  LoadCurve,
  ScenarioCandidate,
  SizingConfig,
  TariffConfig,
} from './types';

export type BessProductSpec = Pick<
  CiBessProduct,
  'modulePowerKw' | 'moduleCapacityKwh' | 'efficiencyPercent' | 'socMinPercent' | 'socMaxPercent'
>;

/** Resolves a SizingConfig into the explicit list of module counts to
 * evaluate — "fixed" is exactly the one requested count, "auto" is every
 * integer in [minModules, maxModules] (plan section 5's acceptance
 * criteria: fixed evaluates exactly what was asked, auto evaluates only
 * permitted quantities — nothing outside the declared range). */
export function buildModuleCountRange(sizing: SizingConfig): number[] {
  if (sizing.mode === 'fixed') {
    if (sizing.moduleCount === null) return [];
    return [sizing.moduleCount];
  }
  if (sizing.minModules === null || sizing.maxModules === null) return [];
  const counts: number[] = [];
  for (let count = sizing.minModules; count <= sizing.maxModules; count++) counts.push(count);
  return counts;
}

export interface ScenarioGridInput {
  curve: LoadCurve;
  product: BessProductSpec;
  strategy: BessStrategyId;
  sizing: SizingConfig;
  tariffWindow: TariffWindow;
  tariff: TariffConfig;
  /** Peak Shaving/Hybrid's explicit target (plan section 5.2) — typically
   * the tariff's contractedDemandKw, but the caller decides that. */
  targetDemandKw: number | null;
  /** Resolved per the closed decision in plan section 4.3/6.1 — the user's
   * own price for this product (user_stock_items), not a catalog cost. */
  unitPriceBrl: number;
  additionalCostsBrl?: number;
  monthsPerYear: number;
  financialAssumptions: FinancialAssumptions;
}

export interface ScenarioGridResult {
  baseline: BaselineResult;
  scenarios: ScenarioCandidate[];
}

const ZERO_BESS: BessRuntimeParams = { totalPowerKw: 0, totalCapacityKwh: 0, socMinPercent: 0, socMaxPercent: 0, efficiencyPercent: 100 };

/** Runs the full grid. Selection of one candidate afterward is a pure UI
 * concern (Fase 6) — this function has no notion of "selected", so picking
 * one later never changes what was calculated here (plan section 5's
 * acceptance criterion). */
export function buildScenarioGrid(input: ScenarioGridInput): ScenarioGridResult {
  const { curve, product, strategy, sizing, tariffWindow, tariff, targetDemandKw, unitPriceBrl, additionalCostsBrl, monthsPerYear, financialAssumptions } = input;

  // BASE ignores bess params entirely (dispatch.ts) — ZERO_BESS makes the
  // "no battery" intent explicit rather than relying on that implicitly.
  const baselineTrace = runDispatch({ curve, bess: ZERO_BESS, strategy: 'BASE', tariffWindow, targetDemandKw: null });
  const baselineAnnualized = annualizeWeeklyDispatch(summarizeDispatch(baselineTrace, curve.resolutionMinutes));
  const baselineCost = computeAnnualEnergyCost(baselineAnnualized, tariff, monthsPerYear);
  const baseline: BaselineResult = {
    annualCostBrl: baselineCost.totalCostBrl,
    maxDemandPeakKw: baselineAnnualized.maxDemandPeakKw,
    maxDemandOffPeakKw: baselineAnnualized.maxDemandOffPeakKw,
    energyImportedPeakKwh: baselineAnnualized.energyImportedPeakKwh,
    energyImportedOffPeakKwh: baselineAnnualized.energyImportedOffPeakKwh,
  };

  const moduleCounts = buildModuleCountRange(sizing);
  const scenarios: ScenarioCandidate[] = [];
  let previousAnnualSavings: number | null = null;

  for (const moduleCount of moduleCounts) {
    const bess: BessRuntimeParams = {
      totalPowerKw: product.modulePowerKw * moduleCount,
      totalCapacityKwh: product.moduleCapacityKwh * moduleCount,
      socMinPercent: product.socMinPercent,
      socMaxPercent: product.socMaxPercent,
      efficiencyPercent: product.efficiencyPercent,
    };

    const trace = runDispatch({ curve, bess, strategy, tariffWindow, targetDemandKw });
    const summary = summarizeDispatch(trace, curve.resolutionMinutes);
    const annualized = annualizeWeeklyDispatch(summary);
    const cost = computeAnnualEnergyCost(annualized, tariff, monthsPerYear);
    const savings = computeAnnualSavings(baselineCost, cost);

    const capex = computeCapex(moduleCount, unitPriceBrl, additionalCostsBrl);
    const cashFlow = buildCashFlow(capex, savings.annualSavingsBrl, financialAssumptions);

    const technicalWarnings: string[] = [];
    if (targetDemandKw !== null && (strategy === 'PEAK_SHAVING' || strategy === 'HYBRID')) {
      const achievedMaxDemandKw = Math.max(annualized.maxDemandPeakKw, annualized.maxDemandOffPeakKw);
      if (achievedMaxDemandKw > targetDemandKw + 1e-6) {
        technicalWarnings.push(
          `BESS insuficiente para atingir o alvo de demanda de ${targetDemandKw} kW — demanda residual de ${achievedMaxDemandKw.toFixed(1)} kW`
        );
      }
    }

    const marginalGain = previousAnnualSavings === null ? null : savings.annualSavingsBrl - previousAnnualSavings;
    previousAnnualSavings = savings.annualSavingsBrl;

    scenarios.push({
      scenarioId: `modules-${moduleCount}`,
      moduleCount,
      strategy,
      // Every candidate is technically valid by construction — dispatch.ts
      // clamps every physical limit rather than ever requesting the
      // impossible, so there is no scenario a physical rule invalidates
      // outright. technicalWarnings still surfaces when the result falls
      // short of what the strategy was asked to achieve (undersized BESS).
      technicalValidity: true,
      technicalWarnings,
      totalPowerKw: bess.totalPowerKw,
      totalCapacityKwh: bess.totalCapacityKwh,
      usefulCapacityKwh: (bess.totalCapacityKwh * (bess.socMaxPercent - bess.socMinPercent)) / 100,
      capex,
      annualSavings: savings.annualSavingsBrl,
      energySavings: savings.energySavingsBrl,
      demandSavings: savings.demandSavingsBrl,
      paybackYearsSimple: computeSimplePaybackYears(cashFlow),
      paybackYearsDiscounted: computeDiscountedPaybackYears(cashFlow),
      roiPercent: computeAnnualRoiPercent(capex, savings.annualSavingsBrl),
      npv: computeNpv(cashFlow),
      marginalGain,
    });
  }

  return { baseline, scenarios };
}
