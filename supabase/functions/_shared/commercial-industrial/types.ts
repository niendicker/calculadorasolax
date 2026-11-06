import type { CiAccessoryContext, CiAccessoryItem } from './accessories.ts';
import type { CiStsSelection, CiStsResult, CiStsContext } from './sts-types.ts';
import type { CiModularComposition, CiModularSelection, CiPcsCatalogEntry, CiBatteryCatalogEntry, CiCompatibilityRule, CiModularPrices } from './modular-types.ts';
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

export interface LoadCurveManualConfig {
  presetId: string | null;
  weekdayKw: number[];
  weekendKw: number[];
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
  manualConfig?: LoadCurveManualConfig;
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
  /** Was also duplicated on TariffConfig in an earlier draft of the
   * contract; this is the one canonical field — it only matters for
   * escalating years 2+ of the cash-flow projection (Fase 4's
   * financial.ts), not the single representative week the dispatch engine
   * simulates. */
  annualEnergyInflationPercent: number;
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

/** How buildScenarioGrid's results (scenarios.ts) get ranked — see ranking.ts. */
export type RankingCriterion = 'PAYBACK' | 'ROI' | 'NPV';

// ─── Backup & Grid Outage Contracts (docs/CI-BACKUP-PLAN.md) ───────────

export interface CiCriticalLoad {
  id: string;
  name: string;
  powerW: number;
  quantity: number;
  usageMode?: 'fixed' | 'fraction';
  usageFactor?: number;
  fixedHours?: number;
}

export type CiBackupInputMode = 'simple' | 'detailed';

export interface CiBackupConfig {
  sts?: CiStsSelection;
  enabled: boolean;
  inputMode: CiBackupInputMode;
  targetPowerKw: number;
  targetPeakPowerKw?: number;
  autonomyHours: number;
  loads: CiCriticalLoad[];
  safetyMarginPercent: number;
  minSocReservePercent?: number;
}

export const DEFAULT_CI_BACKUP_CONFIG: CiBackupConfig = {
  enabled: false,
  inputMode: 'simple',
  targetPowerKw: 0,
  targetPeakPowerKw: 0,
  autonomyHours: 4,
  loads: [],
  safetyMarginPercent: 10,
};

export interface CiBackupResult {
  requiredContinuousPowerKw: number;
  requiredPeakPowerKw: number;
  requiredEnergyKwh: number;
  meetsPower: boolean;
  meetsEnergy: boolean;
  effectiveAutonomyHours: number;
  minModulesForBackup: number;
  recommendedSocReservePercent: number;
  status: 'fully_covered' | 'partially_covered' | 'insufficient_power' | 'insufficient_transfer' | 'disabled';
  meetsTransfer?: boolean;
  warningMessage?: string;
}

// ─── Solar PV & Generator Contracts ────────────────────────────────────

export interface CiSolarConfig {
  enabled: boolean;
  installedPowerKwp: number;
  inverterPowerKw: number;
  /** Average daily yield in kWh/kWp (typical Brazil: 4.0 - 5.5). Defaults to 4.5. */
  dailyYieldKwhPerKwp: number;
  /** Whether excess solar should be stored in BESS before exporting (default true). */
  prioritizeBessCharging: boolean;
  /** Optional custom generation points for representative week, normalized to kW. */
  generationPoints?: number[];
  /** Imported AC generation, with explicit timestamps to preserve alignment with consumption. */
  generationCurve?: LoadCurve;
}

export const DEFAULT_CI_SOLAR_CONFIG: CiSolarConfig = {
  enabled: false,
  installedPowerKwp: 50,
  inverterPowerKw: 50,
  dailyYieldKwhPerKwp: 4.5,
  prioritizeBessCharging: true,
};

export type CiGeneratorFuelType = 'diesel' | 'natural_gas' | 'biogas';
export type CiGeneratorDispatchMode = 'blackout_only' | 'peak_and_blackout' | 'peak_support';

export interface CiGeneratorConfig {
  enabled: boolean;
  ratedPowerKva: number;
  powerFactor: number;
  fuelType: CiGeneratorFuelType;
  fuelCostBrlPerUnit: number;
  /** Specific fuel consumption (e.g. liters/kWh or m³/kWh). Defaults to 0.28 L/kWh for diesel. */
  specificConsumption: number;
  dispatchMode: CiGeneratorDispatchMode;
}

export const DEFAULT_CI_GENERATOR_CONFIG: CiGeneratorConfig = {
  enabled: false,
  ratedPowerKva: 0,
  powerFactor: 0.8,
  fuelType: 'diesel',
  fuelCostBrlPerUnit: 6.2,
  specificConsumption: 0.28,
  dispatchMode: 'blackout_only',
};

export interface CommercialIndustrialOptions {
  selectedAccessoryIds?: string[];
  /** Absent means the existing integrated BESS catalog. */
  bessSystem?: { kind: 'integrated' } | CiModularSelection;
  loadCurve: LoadCurve | null;
  tariff: TariffConfig | null;
  bessProductId: string | null;
  strategy: BessStrategyId;
  sizing: SizingConfig;
  financialAssumptions: FinancialAssumptions;
  rankingCriterion: RankingCriterion;
  backup?: CiBackupConfig;
  solar?: CiSolarConfig;
  generator?: CiGeneratorConfig;
}

// ─── Engine result (plan section 4.5) ───────────────────────────────────

export const CI_ENGINE_VERSION = 'ci-v4';

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
  solarGenerationKw?: number;
  generatorKw?: number;
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
  accessories?: CiAccessoryItem[];
  sts?: CiStsResult;
  composition?: CiModularComposition;
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
  /** Contingency & backup evaluation if ci_backup is active. */
  backupResult?: CiBackupResult;
}

/** The selected/recommended scenario's full detail — everything a
 * `ScenarioCandidate` has, plus the point-by-point trace and cash flow (plan
 * section 4.5's materialization rule). */
export interface SelectedScenarioDetail extends ScenarioCandidate {
  dispatch: DispatchPoint[];
  cashFlow: CashFlowYear[];
}

export interface BaselineResult {
  /** Annual (projected) cost — i.e. the raw representative-week dispatch
   * scaled by tariff.ts's WEEKS_PER_YEAR (~52.18) before pricing. */
  annualCostBrl: number;
  maxDemandPeakKw: number;
  maxDemandOffPeakKw: number;
  /** Split by tariff period so Fase 4's tariff.ts can price peak/off-peak TE
   * separately without needing the baseline's full point-by-point trace
   * (which, unlike a selected scenario, is never persisted — plan section
   * 4.5). **Annual** figures (raw representative-week energy × WEEKS_PER_YEAR
   * — see tariff.ts's `annualizeWeeklyDispatch`), NOT the week itself. Use
   * `weeklyEnergyImportedPeakKwh`/`weeklyEnergyImportedOffPeakKwh` below for
   * the literal representative-week total (e.g. a "energia importada na
   * semana" display). Mislabeling this pair as weekly was Fase 6's Problem
   * #1 (a report showed an annualized value as "energia semanal", ~52x too
   * high) — keep the annual/weekly distinction explicit at every call site. */
  energyImportedPeakKwh: number;
  energyImportedOffPeakKwh: number;
  /** The literal representative-week totals (no WEEKS_PER_YEAR scaling) —
   * straight from dispatch.ts's `summarizeDispatch`. Added alongside the
   * (pre-existing, now annual) fields above rather than renaming them, to
   * avoid breaking persisted `calculation_result` JSONB rows. */
  weeklyEnergyImportedPeakKwh: number;
  weeklyEnergyImportedOffPeakKwh: number;
}

/** Runtime BESS sizing for one simulation — moduleCount * catalog spec
 * already resolved into totals (plan section 4.3: totals are derived, not
 * stored). `efficiencyPercent` is the round-trip figure from the catalog;
 * the dispatch engine splits it into charge/discharge legs via its square
 * root, per the plan's documented MVP convention. */
export interface BessRuntimeParams {
  maxChargePowerKw?: number;
  chargeEfficiencyPercent?: number;
  dischargeEfficiencyPercent?: number;
  totalPowerKw: number;
  totalCapacityKwh: number;
  socMinPercent: number;
  socMaxPercent: number;
  efficiencyPercent: number;
  /** Defaults to socMaxPercent when omitted (plan section 5.2: "bateria
   * começa com SOC explicitamente definido, preferencialmente o SOC
   * máximo"). */
  initialSocPercent?: number;
}

export interface CommercialIndustrialResult {
  stsContext?: CiStsContext;
  accessoryContext?: CiAccessoryContext;
  engineVersion: string;
  /** Stable hash of the input options this result was computed from — lets
   * the UI detect a stale result without deep-comparing objects. */
  inputFingerprint: string;
  baseline: BaselineResult;
  scenarios: ScenarioCandidate[];
  /** `scenarioId: null` means no candidate met the viability bar for
   * `rankingCriterion` (e.g. no scenario pays back within the analysis
   * horizon) — never coerced into "recommending" the least-bad option
   * anyway. `selected` (below) may still be populated for reference in that
   * case (materialized from the smallest evaluated module count), but
   * callers must not label it "recomendado" when this is null. */
  recommendation: {
    scenarioId: string | null;
    reason: string;
  };
  /** Present once the user has selected/saved a scenario; carries the full
   * trace for that one candidate only. */
  selected: SelectedScenarioDetail | null;
  assumptions: {
    equipment?: { pcs: CiPcsCatalogEntry; battery: CiBatteryCatalogEntry; compatibility: CiCompatibilityRule; prices: CiModularPrices };
    tariff: TariffConfig;
    financial: FinancialAssumptions;
    loadCurve: Pick<LoadCurve, 'resolutionMinutes' | 'profileBasis' | 'periodStart' | 'periodEnd' | 'timezone'>;
  };
  warnings: string[];
  /** Consolidated backup metrics if backup calculation was enabled. */
  backup?: CiBackupResult;
}
