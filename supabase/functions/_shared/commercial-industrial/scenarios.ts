// Scenario grid — Fase 5 of docs/CI-MODULE-PLAN.md section 5.1. Runs the
// dispatch + tariff + financial engines (Fases 3-4) once per module count in
// the requested sizing range, plus one baseline (no BESS) run shared by all
// of them. Pure: takes an already-resolved BESS spec and unit price (Fase
// 7's repository layer resolves those from the catalog and
// user_stock_items — this module never touches Supabase).

import { annualizeWeeklyDispatch, computeAnnualEnergyCost, computeAnnualSavings } from './tariff.ts';
import { runDispatch, summarizeDispatch, type TariffWindow } from './dispatch.ts';
import { buildCashFlow, computeAnnualRoiPercent, computeCapex, computeDiscountedPaybackYears, computeNpv, computeSimplePaybackYears } from './financial.ts';
import type {
  BaselineResult,
  BessRuntimeParams,
  BessStrategyId,
  CashFlowYear,
  CiBessProduct,
  DispatchPoint,
  FinancialAssumptions,
  LoadCurve,
  ScenarioCandidate,
  SelectedScenarioDetail,
  SizingConfig,
  TariffConfig,
} from './types.ts';

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
  /** Peak Shaving/Hybrid's explicit demand-shaving *discharge* target (plan
   * section 5.2) — distinct from `tariff.contractedDemandKw` (Fase 7 audit,
   * section 5), which bounds CHARGING instead (see dispatch.ts). Typically
   * defaults to `tariff.contractedDemandKw` at the call site absent a
   * dedicated UI field, but kept as its own parameter so the two concepts
   * never get re-conflated. */
  peakShavingTargetKw: number | null;
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

function computeBaseline(input: Pick<ScenarioGridInput, 'curve' | 'tariffWindow' | 'tariff' | 'monthsPerYear'>) {
  // BASE ignores bess params entirely (dispatch.ts) — ZERO_BESS makes the
  // "no battery" intent explicit rather than relying on that implicitly.
  const trace = runDispatch({
    curve: input.curve,
    bess: ZERO_BESS,
    strategy: 'BASE',
    tariffWindow: input.tariffWindow,
    peakShavingTargetKw: null,
    contractedDemandKw: input.tariff.contractedDemandKw,
  });
  const weekly = summarizeDispatch(trace, input.curve.resolutionMinutes);
  const annualized = annualizeWeeklyDispatch(weekly);
  const cost = computeAnnualEnergyCost(annualized, input.tariff, input.monthsPerYear);
  const result: BaselineResult = {
    annualCostBrl: cost.totalCostBrl,
    maxDemandPeakKw: annualized.maxDemandPeakKw,
    maxDemandOffPeakKw: annualized.maxDemandOffPeakKw,
    // Annual figures — see BaselineResult's own doc comment (types.ts) for
    // why these are NOT the representative week's totals.
    energyImportedPeakKwh: annualized.energyImportedPeakKwh,
    energyImportedOffPeakKwh: annualized.energyImportedOffPeakKwh,
    // The literal representative-week totals, unscaled.
    weeklyEnergyImportedPeakKwh: weekly.energyImportedPeakKwh,
    weeklyEnergyImportedOffPeakKwh: weekly.energyImportedOffPeakKwh,
  };
  return { result, cost };
}

/** The dispatch->tariff->financial pipeline for one module count, shared by
 * buildScenarioGrid (which keeps only the aggregate) and
 * materializeScenarioDetail (which keeps the trace and cash flow too).
 * `marginalGain` always comes back null here — it depends on comparing
 * against a sibling candidate, which only the caller knows about. */
function evaluateModuleCount(
  input: ScenarioGridInput,
  moduleCount: number,
  baselineCost: ReturnType<typeof computeAnnualEnergyCost>
): { candidate: ScenarioCandidate; trace: DispatchPoint[]; cashFlow: CashFlowYear[] } {
  const { curve, product, strategy, tariffWindow, tariff, peakShavingTargetKw, unitPriceBrl, additionalCostsBrl, monthsPerYear, financialAssumptions } = input;

  const bess: BessRuntimeParams = {
    totalPowerKw: product.modulePowerKw * moduleCount,
    totalCapacityKwh: product.moduleCapacityKwh * moduleCount,
    socMinPercent: product.socMinPercent,
    socMaxPercent: product.socMaxPercent,
    efficiencyPercent: product.efficiencyPercent,
  };

  const trace = runDispatch({ curve, bess, strategy, tariffWindow, peakShavingTargetKw, contractedDemandKw: tariff.contractedDemandKw });
  const summary = summarizeDispatch(trace, curve.resolutionMinutes);
  const annualized = annualizeWeeklyDispatch(summary);
  const cost = computeAnnualEnergyCost(annualized, tariff, monthsPerYear);
  const savings = computeAnnualSavings(baselineCost, cost);

  const capex = computeCapex(moduleCount, unitPriceBrl, additionalCostsBrl);
  const cashFlow = buildCashFlow(capex, savings.annualSavingsBrl, financialAssumptions);

  const technicalWarnings: string[] = [];
  if (peakShavingTargetKw !== null && (strategy === 'PEAK_SHAVING' || strategy === 'HYBRID')) {
    const achievedMaxDemandKw = Math.max(annualized.maxDemandPeakKw, annualized.maxDemandOffPeakKw);
    if (achievedMaxDemandKw > peakShavingTargetKw + 1e-6) {
      technicalWarnings.push(
        `BESS insuficiente para atingir o alvo de demanda de ${peakShavingTargetKw} kW — demanda residual de ${achievedMaxDemandKw.toFixed(1)} kW`
      );
    }
  }

  const candidate: ScenarioCandidate = {
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
    marginalGain: null,
  };

  return { candidate, trace, cashFlow };
}

/** Runs the full grid. Selection of one candidate afterward is a pure UI
 * concern (Fase 6) — this function has no notion of "selected", so picking
 * one later never changes what was calculated here (plan section 5's
 * acceptance criterion). Candidates never carry dispatch[]/cashFlow[] (plan
 * section 4.5) — use materializeScenarioDetail for the one the user
 * actually selects. */
export function buildScenarioGrid(input: ScenarioGridInput): ScenarioGridResult {
  const { result: baseline, cost: baselineCost } = computeBaseline(input);

  const moduleCounts = buildModuleCountRange(input.sizing);
  const scenarios: ScenarioCandidate[] = [];
  let previousAnnualSavings: number | null = null;

  for (const moduleCount of moduleCounts) {
    const { candidate } = evaluateModuleCount(input, moduleCount, baselineCost);
    candidate.marginalGain = previousAnnualSavings === null ? null : candidate.annualSavings - previousAnnualSavings;
    previousAnnualSavings = candidate.annualSavings;
    scenarios.push(candidate);
  }

  return { baseline, scenarios };
}

/** Re-runs one specific module count with the full point-by-point dispatch
 * trace and cash flow attached — plan section 4.5's materialization rule.
 * Used both to give the recommended scenario full detail right after the
 * first calculation, and later when the user selects a different candidate
 * from the grid. Recomputes its own baseline rather than accepting one, so
 * it never silently drifts from what buildScenarioGrid would produce for
 * the same input. */
export function materializeScenarioDetail(input: ScenarioGridInput, moduleCount: number, marginalGain: number | null): SelectedScenarioDetail {
  const { cost: baselineCost } = computeBaseline(input);
  const { candidate, trace, cashFlow } = evaluateModuleCount(input, moduleCount, baselineCost);
  return { ...candidate, marginalGain, dispatch: trace, cashFlow };
}
