import { repeatRuntimePorts } from './battery-ports.ts';
import { evaluateCiAccessories, type CiAccessoryContext, type CiAccessoryItem, type CiAccessoryTarget } from './accessories.ts';
import { evaluateSts } from './sts.ts';
import type { CiStsContext } from './sts-types.ts';
// Scenario grid — Fase 5 of docs/CI-MODULE-PLAN.md section 5.1. Runs the
// dispatch + tariff + financial engines (Fases 3-4) once per module count in
// the requested sizing range, plus one baseline (no BESS) run shared by all
// of them. Pure: takes an already-resolved BESS spec and unit price (Fase
// 7's repository layer resolves those from the catalog and
// user_stock_items — this module never touches Supabase).

import { annualizeWeeklyDispatch, computeAnnualEnergyCost, computeAnnualSavings } from './tariff.ts';
import { runDispatch, summarizeDispatch, type TariffWindow } from './dispatch.ts';
import { buildCashFlow, computeAnnualRoiPercent, computeCapex, computeDiscountedPaybackYears, computeNpv, computeSimplePaybackYears } from './financial.ts';
import { computeBackupRequirements, evaluateCandidateBackup } from './backup.ts';
import type {
  BaselineResult,
  BessRuntimeParams,
  BessStrategyId,
  CashFlowYear,
  CiRuntimePort,
  CiBackupConfig,
  CiBessProduct,
  CiGeneratorConfig,
  CiSolarConfig,
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
> & { ports?:CiRuntimePort[]; modulePeakPowerKw?: number; moduleChargePowerKw?: number; chargeEfficiencyPercent?: number; dischargeEfficiencyPercent?: number };

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
  /** Internal feasibility pass: no CAPEX, cash flow or return calculations. */
  technicalOnly?: boolean;
  preparedBaseline?: ReturnType<typeof prepareScenarioBaseline>;
  gridImportLimitsKw?: (number|null)[];
  accessoryContext?: CiAccessoryContext;
  accessoryTarget?: CiAccessoryTarget;
  baseAccessories?: CiAccessoryItem[];
  stsContext?: CiStsContext;
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
  backup?: CiBackupConfig | null;
  solar?: CiSolarConfig | null;
  generator?: CiGeneratorConfig | null;
}

export interface ScenarioGridResult {
  baseline: BaselineResult;
  scenarios: ScenarioCandidate[];
}

const ZERO_BESS: BessRuntimeParams = { totalPowerKw: 0, totalCapacityKwh: 0, socMinPercent: 0, socMaxPercent: 0, efficiencyPercent: 100 };

export function prepareScenarioBaseline(
  input: Pick<ScenarioGridInput, 'curve' | 'tariffWindow' | 'tariff' | 'monthsPerYear' | 'solar' | 'generator'>
) {
  // BASE ignores bess params entirely (dispatch.ts) — ZERO_BESS makes the
  // "no battery" intent explicit rather than relying on that implicitly.
  const trace = runDispatch({
    curve: input.curve,
    bess: ZERO_BESS,
    strategy: 'BASE',
    tariffWindow: input.tariffWindow,
    peakShavingTargetKw: null,
    contractedDemandKw: input.tariff.contractedDemandKw,
    solar: input.solar,
    generator: input.generator,
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
  return { result, cost, trace };
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
  const { curve, product, strategy, tariffWindow, tariff, peakShavingTargetKw, unitPriceBrl, additionalCostsBrl, monthsPerYear, financialAssumptions, backup } = input;

  const backupRequirements = backup?.enabled ? computeBackupRequirements(backup, curve) : null;
  const backupResult = backupRequirements
    ? evaluateCandidateBackup(
        product.modulePowerKw * moduleCount,
        product.moduleCapacityKwh * moduleCount,
        product,
        backupRequirements
      )
    : undefined;

  // When backup reserve is required, on-grid dispatch must not discharge below the backup reserve floor
  const effectiveSocMinPercent = backupResult && backupResult.status !== 'disabled'
    ? Math.max(product.socMinPercent, backupResult.recommendedSocReservePercent)
    : product.socMinPercent;

  const runtimePorts=product.ports?repeatRuntimePorts(product.ports,moduleCount):undefined;
  const bess: BessRuntimeParams = {
    ports:runtimePorts,
    maxChargePowerKw: (product.moduleChargePowerKw ?? product.modulePowerKw) * moduleCount,
    chargeEfficiencyPercent: product.chargeEfficiencyPercent,
    dischargeEfficiencyPercent: product.dischargeEfficiencyPercent,
    totalPowerKw: product.modulePowerKw * moduleCount,
    totalCapacityKwh: product.moduleCapacityKwh * moduleCount,
    socMinPercent: effectiveSocMinPercent,
    socMaxPercent: product.socMaxPercent,
    efficiencyPercent: product.efficiencyPercent,
  };

  const trace = runDispatch({
    gridImportLimitsKw: input.gridImportLimitsKw,
    curve,
    bess,
    strategy,
    tariffWindow,
    peakShavingTargetKw,
    contractedDemandKw: tariff.contractedDemandKw,
    solar: input.solar,
    generator: input.generator,
  });
  const summary = summarizeDispatch(trace, curve.resolutionMinutes);
  const annualized = annualizeWeeklyDispatch(summary);
  const savings = input.technicalOnly ? {annualSavingsBrl:0,energySavingsBrl:0,demandSavingsBrl:0}
    : computeAnnualSavings(baselineCost,computeAnnualEnergyCost(annualized,tariff,monthsPerYear));

  const sts = evaluateSts(backup, trace, input.stsContext, moduleCount, backupRequirements ?? undefined);
  const meetsBackup = !backupResult || backupResult.status === 'fully_covered';
  if (sts && backupResult) {
    backupResult.meetsTransfer = sts.status === 'selected';
    if (sts.status !== 'selected') { backupResult.status = 'insufficient_transfer'; backupResult.warningMessage = sts.message; }
  }
  const existing = [...(input.baseAccessories ?? []), ...(sts?.selected ? [{productId:sts.selected.spec.accessory_id,model:sts.selected.spec.model,quantity:1,unitPriceBrl:sts.selected.unitPriceBrl,totalBrl:sts.selected.totalBrl,bundled:false,reasons:['STS selecionada pelo dimensionamento elétrico'],ruleIds:[]}] : [])];
  const accessories = evaluateCiAccessories(input.accessoryContext, (input.accessoryTarget ? {...input.accessoryTarget,bess:input.accessoryTarget.bess * moduleCount,pcs:input.accessoryTarget.pcs * moduleCount,battery:input.accessoryTarget.battery * moduleCount,string:input.accessoryTarget.string * moduleCount} : {bess:moduleCount,pcs:0,battery:0,string:0,backup:Boolean(backup?.enabled),generator:Boolean(input.generator?.enabled),lineVoltageV:backup?.sts?.lineVoltageV}), existing);
  const capex = input.technicalOnly ? 0 : computeCapex(moduleCount, unitPriceBrl, additionalCostsBrl) + (sts?.selected?.totalBrl ?? 0) + accessories.additionalCostBrl;
  const cashFlow = input.technicalOnly ? [] : buildCashFlow(capex, savings.annualSavingsBrl, financialAssumptions);

  const technicalWarnings: string[] = [];
  if (sts) technicalWarnings.push(sts.message);
  else if (backup?.enabled) technicalWarnings.push('Transferência não avaliada: nenhuma STS externa configurada. O backup avalia potência e energia do BESS.');
  technicalWarnings.push(...accessories.warnings);
  const meetsProfile=!input.gridImportLimitsKw||input.gridImportLimitsKw.length===trace.length&&trace.every((point,index)=>input.gridImportLimitsKw![index]===null||point.gridImportKw<=input.gridImportLimitsKw![index]!+1e-6);
  if(!meetsProfile)technicalWarnings.push('A composição não sustenta a cobertura de consumo e o alvo de demanda definidos pela curva e pela estratégia.');
  let meetsDemandTarget = true;
  if (peakShavingTargetKw !== null && (strategy === 'PEAK_SHAVING' || strategy === 'HYBRID')) {
    const achievedMaxDemandKw = Math.max(annualized.maxDemandPeakKw, annualized.maxDemandOffPeakKw);
    if (achievedMaxDemandKw > peakShavingTargetKw + 1e-6) {
      meetsDemandTarget = false;
      technicalWarnings.push(
        `BESS insuficiente para atingir o alvo de demanda de ${peakShavingTargetKw} kW — demanda residual de ${achievedMaxDemandKw.toFixed(1)} kW`
      );
    }
  }
  if (backupResult?.warningMessage) {
    technicalWarnings.push(backupResult.warningMessage);
  }

  const candidate: ScenarioCandidate = {
    technicalChecks:{backup:meetsBackup,transfer:!sts||sts.status==='selected',accessories:accessories.valid,dispatch:meetsProfile,demand:meetsDemandTarget},
    scenarioId: `modules-${moduleCount}`,
    moduleCount,
    strategy,
    // Dispatch feasibility alone is insufficient: configured demand, backup and accessory requirements must also be met.
    technicalValidity: (backupResult ? backupResult.status === 'fully_covered' : true) && (!sts || sts.status === 'selected') && accessories.valid && meetsDemandTarget && meetsProfile,
    sts,
    accessories: accessories.items,
    technicalWarnings,
    totalPowerKw: bess.totalPowerKw,
    totalCapacityKwh: bess.totalCapacityKwh,
    usefulCapacityKwh: (bess.totalCapacityKwh * (bess.socMaxPercent - product.socMinPercent)) / 100,
    capex,
    annualSavings: savings.annualSavingsBrl,
    energySavings: savings.energySavingsBrl,
    demandSavings: savings.demandSavingsBrl,
    paybackYearsSimple: input.technicalOnly ? null : computeSimplePaybackYears(cashFlow),
    paybackYearsDiscounted: input.technicalOnly ? null : computeDiscountedPaybackYears(cashFlow),
    roiPercent: input.technicalOnly ? 0 : computeAnnualRoiPercent(capex, savings.annualSavingsBrl),
    npv: input.technicalOnly ? 0 : computeNpv(cashFlow),
    marginalGain: null,
    backupResult,
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
  const { result: baseline, cost: baselineCost } = input.preparedBaseline??prepareScenarioBaseline(input);

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
 * from the grid. Reuses a prepared baseline when supplied by the common
 * catalog pipeline, otherwise computes it with the same input as the grid. */
export function materializeScenarioDetail(input: ScenarioGridInput, moduleCount: number, marginalGain: number | null): SelectedScenarioDetail {
  const { cost: baselineCost } = input.preparedBaseline??prepareScenarioBaseline(input);
  const { candidate, trace, cashFlow } = evaluateModuleCount(input, moduleCount, baselineCost);
  return { ...candidate, marginalGain, dispatch: trace, cashFlow };
}

/** Uses the same physical checks as final materialization, without finances. */
export function evaluateScenarioTechnical(input:ScenarioGridInput):ScenarioCandidate {
  const {cost}=input.preparedBaseline??prepareScenarioBaseline(input);
  return evaluateModuleCount({...input,technicalOnly:true},1,cost).candidate;
}
