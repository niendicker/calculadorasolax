// Domain contracts for the C&I (Commercial & Industrial) BESS module — see
// docs/CI-MODULE-PLAN.md section 4. Pure types only: no React, Zustand,
// Supabase, or engine logic here (that separation is itself a Fase 1
// acceptance criterion). C&I types intentionally do not depend on
// ResidentialOptions/Solution — the two domains are independent, sharing
// only project/client/auth infrastructure at a higher layer.

export type BessStrategyId = 'BASE' | 'PEAK_SHAVING' | 'LOAD_SHIFTING' | 'HYBRID';

export type LoadCurveResolutionMinutes = 15 | 30 | 60;

/** MVP only supports `representative_period` (a typical week — see
 * LOAD_CURVE_MAX_POINTS). `representative_day` and `annual_series` are part
 * of the contract for forward compatibility but not accepted by the Fase 2
 * importer yet (plan section 5.4). */
export type LoadCurveProfileBasis = 'representative_day' | 'representative_period' | 'annual_series';

export type LoadCurveSource = 'manual' | 'csv' | 'xlsx';

export interface LoadCurvePoint {
  /** ISO 8601 timestamp. */
  timestamp: string;
  powerKw: number;
}

export interface LoadCurve {
  points: LoadCurvePoint[];
  resolutionMinutes: LoadCurveResolutionMinutes;
  timezone: string;
  profileBasis: LoadCurveProfileBasis;
  /** ISO date (YYYY-MM-DD) bounds of the represented period. */
  periodStart: string;
  periodEnd: string;
  source: LoadCurveSource;
}

/** Everything about a LoadCurve that the user declares up front — as opposed
 * to `points`, which comes from the file itself. Kept separate so a parser
 * (Fase 2's load-curve.ts) can validate the file against what was declared,
 * never infer it silently (plan section 4.2). */
export type LoadCurveMetadata = Omit<LoadCurve, 'points' | 'source'>;

/** MVP cap (plan section 4.2/17): one representative week at 15-minute
 * resolution — 4 points/hour * 24 hours * 7 days. Applies regardless of the
 * curve's actual resolution (a 60-minute curve tops out at 168 points, well
 * under this). */
export const LOAD_CURVE_MAX_POINTS = 672;

export type TariffModality = 'verde' | 'azul';
export type TariffMarket = 'cativo' | 'livre';

export interface TariffConfig {
  energyRatePeakBrlPerMwh: number;
  energyRateOffPeakBrlPerMwh: number;
  demandRateBrlPerKwMonth: number;
  contractedDemandKw: number;
  /** HH:mm, local to `LoadCurve.timezone`. */
  peakStart: string;
  peakEnd: string;
  tariffModality: TariffModality;
  market: TariffMarket;
  icmsPercent: number;
  pisCofinsPercent: number;
  annualEnergyInflationPercent: number;
}

export type SizingMode = 'fixed' | 'auto';

export interface SizingConfig {
  mode: SizingMode;
  /** Required when mode === 'fixed'; ignored otherwise. */
  moduleCount: number | null;
  /** Required when mode === 'auto'; ignored otherwise. */
  minModules: number | null;
  maxModules: number | null;
}

export interface FinancialAssumptions {
  discountRatePercent: number;
  analysisHorizonYears: number;
  annualEnergyInflationPercent: number;
  businessDaysPerMonth: number;
  monthsPerYear: number;
}

/** Form defaults (plan section 11) — editable per project, never frozen into
 * the engine. analysisHorizonYears mirrors a BESS product's typical warranty
 * order of magnitude; discountRatePercent is a didactic PT-BR business
 * cost-of-capital reference, not a regulated figure. */
export const DEFAULT_FINANCIAL_ASSUMPTIONS: FinancialAssumptions = {
  discountRatePercent: 12,
  analysisHorizonYears: 10,
  annualEnergyInflationPercent: 0,
  businessDaysPerMonth: 22,
  monthsPerYear: 12,
};

/** A BESS product from the admin-managed catalog (`ci_bess_products`,
 * Fase 7). Deliberately carries no cost/markup fields — pricing follows the
 * existing `user_stock_items` pattern (plan section 4.3/6.1), resolved per
 * user, not baked into the shared catalog row. */
export interface CiBessProduct {
  id: string;
  model: string;
  manufacturer: string;
  description: string | null;
  active: boolean;
  modulePowerKw: number;
  moduleCapacityKwh: number;
  efficiencyPercent: number;
  socMinPercent: number;
  socMaxPercent: number;
  warrantyYears: number;
  imageUrl: string | null;
  documents: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CommercialIndustrialOptions {
  loadCurve: LoadCurve | null;
  tariff: TariffConfig | null;
  bessProductId: string | null;
  strategy: BessStrategyId;
  sizing: SizingConfig;
  financialAssumptions: FinancialAssumptions;
}

// ─── Engine result (plan section 4.5) ───────────────────────────────────

export const CI_ENGINE_VERSION = 'ci-v1';

export type TariffPeriod = 'peak' | 'offPeak';

/** One simulated interval of BESS operation — the unit `dispatch[]` is made
 * of. Only ever attached to the scenario the user actually selected/saved
 * (plan section 4.5); candidates in the comparison grid never carry this. */
export interface DispatchPoint {
  timestamp: string;
  tariffPeriod: TariffPeriod;
  loadKw: number;
  chargeKw: number;
  dischargeKw: number;
  gridImportKw: number;
  socKwh: number;
}

export interface CashFlowYear {
  year: number;
  nominalCashFlow: number;
  discountedCashFlow: number;
  cumulativeNominalCashFlow: number;
}

/** Aggregates every scenario in the comparison grid carries — enough for the
 * comparison table and ranking, without the point-by-point trace. */
export interface ScenarioCandidate {
  scenarioId: string;
  moduleCount: number;
  strategy: BessStrategyId;
  technicalValidity: boolean;
  technicalWarnings: string[];
  totalPowerKw: number;
  totalCapacityKwh: number;
  usefulCapacityKwh: number;
  capex: number;
  annualSavings: number;
  energySavings: number;
  demandSavings: number;
  paybackYearsSimple: number | null;
  paybackYearsDiscounted: number | null;
  roiPercent: number;
  npv: number;
  /** Delta vs. the next-smaller module count in the same strategy; null for
   * the smallest evaluated count. */
  marginalGain: number | null;
}

/** The selected/recommended scenario's full detail — everything a
 * `ScenarioCandidate` has, plus the point-by-point trace and cash flow (plan
 * section 4.5's materialization rule). */
export interface SelectedScenarioDetail extends ScenarioCandidate {
  dispatch: DispatchPoint[];
  cashFlow: CashFlowYear[];
}

export interface BaselineResult {
  annualCostBrl: number;
  maxDemandPeakKw: number;
  maxDemandOffPeakKw: number;
  energyImportedKwh: number;
}

export interface CommercialIndustrialResult {
  engineVersion: string;
  /** Stable hash of the input options this result was computed from — lets
   * the UI detect a stale result without deep-comparing objects. */
  inputFingerprint: string;
  baseline: BaselineResult;
  scenarios: ScenarioCandidate[];
  recommendation: {
    scenarioId: string;
    reason: string;
  };
  /** Present once the user has selected/saved a scenario; carries the full
   * trace for that one candidate only. */
  selected: SelectedScenarioDetail | null;
  assumptions: {
    tariff: TariffConfig;
    financial: FinancialAssumptions;
    loadCurve: Pick<LoadCurve, 'resolutionMinutes' | 'profileBasis' | 'periodStart' | 'periodEnd' | 'timezone'>;
  };
  warnings: string[];
}
