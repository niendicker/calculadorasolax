// Pure logic for the calculate-residential Edge Function: types, payload
// validation, and the compatibility/sizing math. Kept free of Deno-specific
// APIs (no `Deno.*`, no `jsr:` imports) so it can be unit tested with a
// regular Node-based test runner (see logic.test.ts) instead of requiring a
// Deno test setup.

export interface SingleLoad {
  powerW: number;
  qty: number;
  ipInRatio?: number;
  /** Fraction (0-1) of the shared operationHours this load is actually
   * drawing power; scales energy (kWh), not peak power. Only used when
   * usageMode is 'fraction' (or unset). Mirrors lib/types.ts SingleLoad. */
  usageFactor?: number;
  /** 'fraction' (default) scales the shared operationHours by usageFactor;
   * 'fixed' uses fixedHours directly instead. Mirrors lib/types.ts SingleLoad. */
  usageMode?: 'fraction' | 'fixed';
  /** Hours/day this load runs, independent of the shared operationHours —
   * only used when usageMode is 'fixed'. Mirrors lib/types.ts SingleLoad. */
  fixedHours?: number;
  /** Whether this load counts toward peak power when peakCalcMode is
   * 'select'. Mirrors lib/types.ts SingleLoad. */
  includedInPeak?: boolean;
}

export type PeakCalcMode = 'sum' | 'largest-surge' | 'select';

/** Mirrors lib/types.ts InverterFlag — kept in sync manually since this file
 * runs on Deno and can't import from the Next.js app. */
export type InverterFlag = 'microgrid' | 'super_backup' | 'dual_voltage' | 'external_ats' | 'external_generator';

/** Mirrors lib/types.ts DesiredFeatureId. */
export type DesiredFeatureId = 'backup' | 'external_ats' | 'microgrid' | 'external_generator' | 'pv' | 'white_tariff';

/** Mirrors lib/desired-features.ts DESIRED_FEATURE_DEFINITIONS — add a new
 * flag-based requirement by adding one entry here (and the matching entry in
 * the app-side registry); the solution-filtering code loops over this
 * generically and needs no changes for a new flag-based feature. */
export const DESIRED_FEATURE_DEFINITIONS: { id: DesiredFeatureId; requiresInverterFlag?: InverterFlag }[] = [
  { id: 'backup' },
  { id: 'external_ats', requiresInverterFlag: 'external_ats' },
  { id: 'microgrid', requiresInverterFlag: 'microgrid' },
  { id: 'external_generator', requiresInverterFlag: 'external_generator' },
  { id: 'pv' },
  { id: 'white_tariff' },
];

export const VALID_DESIRED_FEATURES: DesiredFeatureId[] = DESIRED_FEATURE_DEFINITIONS.map((f) => f.id);

/** The inverter flags a set of desired features requires — features without
 * a requiresInverterFlag (e.g. 'pv', 'white_tariff') contribute nothing here. */
export function requiredInverterFlags(desiredFeatures: DesiredFeatureId[]): InverterFlag[] {
  return DESIRED_FEATURE_DEFINITIONS.filter(
    (feature) => desiredFeatures.includes(feature.id) && feature.requiresInverterFlag
  ).map((feature) => feature.requiresInverterFlag!);
}

/** Whether an inverter's flags satisfy every required flag. */
export function inverterSatisfiesRequiredFlags(
  inverterFlags: string[] | null | undefined,
  required: InverterFlag[]
): boolean {
  if (required.length === 0) return true;
  const flags = new Set(inverterFlags ?? []);
  return required.every((flag) => flags.has(flag));
}

/** Of the given desired features, which ones (that require an inverter flag)
 * are the reason no candidate inverter satisfies them — so the error
 * returned to the client can say *which* functionality has no available
 * inverter, instead of a generic "no solution" message.
 *
 * A feature is unambiguously blocking when zero candidate inverters have its
 * flag at all. If every required flag individually has some support but no
 * single inverter satisfies all of them together (a combination conflict —
 * e.g. two different features are each covered by a different inverter,
 * with no overlap), every flag-requiring feature in the input is reported,
 * since the combination as a whole is what's unavailable. */
export function blockingDesiredFeatures(
  desiredFeatures: DesiredFeatureId[],
  candidateInverters: { flags: string[] | null | undefined }[]
): DesiredFeatureId[] {
  const flagRequiring = DESIRED_FEATURE_DEFINITIONS.filter(
    (feature) => desiredFeatures.includes(feature.id) && feature.requiresInverterFlag
  );
  if (flagRequiring.length === 0) return [];

  const requiredFlags = flagRequiring.map((feature) => feature.requiresInverterFlag!);
  const someInverterSatisfiesAll = candidateInverters.some((inverter) =>
    inverterSatisfiesRequiredFlags(inverter.flags, requiredFlags)
  );
  if (someInverterSatisfiesAll) return [];

  const unsupported = flagRequiring.filter(
    (feature) => !candidateInverters.some((inverter) => (inverter.flags ?? []).includes(feature.requiresInverterFlag!))
  );
  if (unsupported.length > 0) return unsupported.map((feature) => feature.id);

  return flagRequiring.map((feature) => feature.id);
}

/** Whether a solution can coexist with the on-grid system described by
 * microgrid: the on-grid apparent power must stay under both the inverter's
 * rated power and the battery bank's power, and — when the inverter declares
 * a per-phase limit — under that limit once split across the on-grid
 * system's own phases (avoids overloading a single phase). */
export function solutionSupportsMicrogrid(
  solution: ApprovedSolution,
  inverterMaxPowerPerPhaseW: number | null,
  microgrid: MicrogridConfig
): boolean {
  if (microgrid.onGridApparentPowerVA >= solution.rated_power_w) return false;
  if (microgrid.onGridApparentPowerVA >= solution.battery_power_w) return false;
  if (inverterMaxPowerPerPhaseW !== null) {
    const perPhaseVA = microgrid.onGridApparentPowerVA / microgrid.onGridPhases;
    if (perPhaseVA >= inverterMaxPowerPerPhaseW) return false;
  }
  return true;
}

/** The subset of an `inverters` row index.ts needs for flag/microgrid
 * compatibility checks. */
export interface InverterCapabilities {
  model: string;
  flags: string[] | null;
  max_power_per_phase_w: number | null;
}

/** Whether microgrid should be enforced as a hard filter on the baseline
 * recommendation, or left out of it (to be offered as a separate
 * microgridAlternative by resolveMicrogridSelection instead). Only relevant
 * when 'microgrid' is actually a desired feature — otherwise it's a no-op. */
export function computeHardFilterFeatures(
  desiredFeatures: DesiredFeatureId[],
  microgridIsFundamental: boolean
): DesiredFeatureId[] {
  const microgridSelected = desiredFeatures.includes('microgrid');
  return microgridSelected && !microgridIsFundamental
    ? desiredFeatures.filter((feature) => feature !== 'microgrid')
    : desiredFeatures;
}

/** Narrows compatibleSolutions to those whose inverter satisfies every
 * requiredFlags entry. `blocked` is true when that leaves nothing — the
 * caller is expected to then compute blockingDesiredFeatures for the error
 * response using the same candidateInverters list. A no-op (never blocks)
 * when requiredFlags is empty. */
export function filterSolutionsByRequiredFlags(
  compatibleSolutions: ApprovedSolution[],
  requiredFlags: InverterFlag[],
  candidateInverters: InverterCapabilities[]
): { compatibleSolutions: ApprovedSolution[]; blocked: boolean } {
  if (requiredFlags.length === 0) return { compatibleSolutions, blocked: false };

  const matchingModels = new Set(
    candidateInverters
      .filter((inverter) => inverterSatisfiesRequiredFlags(inverter.flags, requiredFlags))
      .map((inverter) => inverter.model)
  );
  const filtered = compatibleSolutions.filter((solution) => matchingModels.has(solution.inverter_model));
  return { compatibleSolutions: filtered, blocked: filtered.length === 0 };
}

/** Decides how microgrid compatibility affects the final solution set, given
 * compatibleSolutions already ranked best-first by every other requirement:
 * - When microgrid is a hard requirement, it's enforced directly — the
 *   returned compatibleSolutions become the microgrid-compatible subset
 *   (`blocked: true` when that subset is empty, meaning no solution can
 *   satisfy it at all).
 * - Otherwise compatibleSolutions is left untouched (microgrid was excluded
 *   from the baseline's hard filters upstream, by computeHardFilterFeatures)
 *   and, if the best microgrid-compatible candidate differs from the best
 *   overall one, it's surfaced separately as microgridAlternativeSolution —
 *   never blocking in this branch. */
export function resolveMicrogridSelection(
  compatibleSolutions: ApprovedSolution[],
  microgridConfig: MicrogridConfig,
  microgridIsFundamental: boolean,
  candidateInverters: InverterCapabilities[]
): { compatibleSolutions: ApprovedSolution[]; microgridAlternativeSolution: ApprovedSolution | null; blocked: boolean } {
  const inverterByModel = new Map(candidateInverters.map((inverter) => [inverter.model, inverter]));
  const microgridCompatibleSolutions = compatibleSolutions.filter((candidate) => {
    const inverter = inverterByModel.get(candidate.inverter_model);
    if (!inverter) return false;
    if (!inverterSatisfiesRequiredFlags(inverter.flags, ['microgrid'])) return false;
    return solutionSupportsMicrogrid(candidate, inverter.max_power_per_phase_w, microgridConfig);
  });

  if (microgridIsFundamental) {
    if (!microgridCompatibleSolutions.length) {
      return { compatibleSolutions, microgridAlternativeSolution: null, blocked: true };
    }
    return { compatibleSolutions: microgridCompatibleSolutions, microgridAlternativeSolution: null, blocked: false };
  }

  const economicTop = compatibleSolutions[0];
  const microgridTop = microgridCompatibleSolutions[0] ?? null;
  const microgridAlternativeSolution = microgridTop && microgridTop.id !== economicTop.id ? microgridTop : null;
  return { compatibleSolutions, microgridAlternativeSolution, blocked: false };
}

/** Raises a power floor (continuous/rated or surge/peak) to also cover the
 * white-tariff window's required power when that's higher. Used for both:
 * the inverter's rated_power_w must sustain requiredPowerW for the whole
 * window (not just survive it as a brief surge), so callers pass nominalW
 * as baseW for that check, and peakW as baseW for the peak_power_w check. */
export function effectiveTargetPowerW(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseW: number
): number {
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return baseW;
  return Math.max(baseW, whiteTariff.requiredPowerW);
}

/** Minimum battery energy the recommended solution must provide. When Tarifa
 * Branca is active this replaces the generic backup heuristic with the
 * energy the customer needs to cover both expensive windows (ponta +
 * intermediária), optionally topped up with that same backup reserve when
 * includeBackupReserve is set. */
export function effectiveTargetEnergyWh(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseTargetEnergyWh: number
): number {
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return baseTargetEnergyWh;
  return (
    whiteTariff.pontaEnergyWh +
    whiteTariff.intermediateEnergyWh +
    (whiteTariff.includeBackupReserve ? baseTargetEnergyWh : 0)
  );
}

/** Mirrors lib/types.ts WhiteTariffConfig. */
export interface WhiteTariffConfig {
  requiredPowerW: number;
  pontaEnergyWh: number;
  intermediateEnergyWh: number;
  includeBackupReserve: boolean;
  pontaTariffPerKwh: number;
  intermediateTariffPerKwh: number;
  foraPontaTariffPerKwh: number;
}

/** Mirrors lib/types.ts MicrogridConfig. */
export interface MicrogridConfig {
  voltageV: number;
  onGridPhases: 1 | 2 | 3;
  onGridApparentPowerVA: number;
  isFundamentalRequirement: boolean;
  photoUrl?: string | null;
  powerNoticeAcknowledged?: boolean;
}

/** Mirrors lib/types.ts GeneratorConfig. Informational only — not validated
 * against any solution-filtering logic. */
export interface GeneratorConfig {
  voltageV: number;
  phases: 1 | 2 | 3;
  apparentPowerVA: number;
  photoUrl?: string | null;
  ownAtsAcknowledged?: boolean;
}

/** Mirrors lib/types.ts PvConfig. */
export interface PvConfig {
  monthlyConsumptionKwh: number;
  hsp: number;
}

export interface ResidentialOptions {
  topology: 'HighVoltage' | 'LowVoltage';
  batteryModel: string | null;
  inverterModel: string | null;
  gridType: 'singlePhase_220' | 'splitPhase_220' | 'threePhase_220' | 'threePhase_380';
  loads: SingleLoad[];
  peakCalcMode?: PeakCalcMode;
  operationHours: number;
  desiredFeatures: DesiredFeatureId[];
  whiteTariff: WhiteTariffConfig | null;
  microgrid: MicrogridConfig | null;
  generator: GeneratorConfig | null;
  pv: PvConfig | null;
  atsPhotoUrl?: string | null;
  atsBackupAcknowledged?: boolean;
}

export interface ApprovedSolution {
  id: string;
  source_file: string;
  solution_code: string;
  inverter_model: string;
  inverter_quantity: number;
  battery_ports_used: number;
  rated_power_w: number;
  peak_power_w: number;
  grid_topology: '1p_220V' | '2p_220V' | '3p_220V' | '3p_380V';
  battery_model: string;
  battery_topology: 'HV' | 'LV';
  battery_quantity: number;
  battery_power_w: number;
  available_energy_wh: number;
  accessories: { model: string | null; quantity: number }[];
  comments: string[];
}

export interface CapacityTargets {
  minRatedPowerW: number;
  targetPowerW: number;
  targetEnergyWh: number;
  usefulEnergyWhPerBattery: number | null;
}

/** Used only by index.ts's relaxed fallback query, when no candidate fully
 * satisfies every capacity requirement (the strict, gte-filtered query came
 * back empty) — ranks candidates by how close each gets to satisfying ALL
 * three capacity dimensions at once (maximin over the power/peak/energy
 * adequacy ratios), so the fallback favors the least-bad overall compromise
 * instead of just being the biggest inverter with an emptier battery bank
 * (or vice versa — a plain "sort by rated_power_w descending" would silently
 * privilege closing the power shortfall over the energy shortfall for
 * reasons unrelated to which one the customer actually needs). Ties are
 * broken by the same cheapest-first order the strict path already uses.
 * Never used when a candidate is already fully adequate. */
export function rankByLeastShortfall(candidates: ApprovedSolution[], targets: CapacityTargets): ApprovedSolution[] {
  function effectiveEnergyWh(candidate: ApprovedSolution): number {
    return targets.usefulEnergyWhPerBattery !== null
      ? targets.usefulEnergyWhPerBattery * candidate.battery_quantity
      : candidate.available_energy_wh;
  }

  function ratio(provided: number, required: number): number {
    return required > 0 ? provided / required : Infinity;
  }

  function worstRatio(candidate: ApprovedSolution): number {
    return Math.min(
      ratio(candidate.rated_power_w, targets.minRatedPowerW),
      ratio(candidate.peak_power_w, targets.targetPowerW),
      ratio(effectiveEnergyWh(candidate), targets.targetEnergyWh)
    );
  }

  return [...candidates].sort((a, b) => {
    const diff = worstRatio(b) - worstRatio(a);
    if (diff !== 0) return diff;
    return (
      a.rated_power_w - b.rated_power_w ||
      effectiveEnergyWh(a) - effectiveEnergyWh(b) ||
      a.battery_power_w - b.battery_power_w ||
      a.battery_quantity - b.battery_quantity
    );
  });
}

export interface AccessoryRule {
  id: string;
  name: string;
  inclusion: 'required' | 'optional';
  trigger_metric: 'per_solution' | 'inverter_quantity' | 'battery_quantity' | 'battery_ports_used' | 'battery_quantity_per_port';
  min_quantity: number;
  inverter_model: string | null;
  inverter_models: string[] | null;
  battery_model: string | null;
  grid_topology: string | null;
  battery_topology: ApprovedSolution['battery_topology'] | null;
  quantity_per_match: number;
  /** Mirrors components/admin/types.ts AccessoryRuleRow.scale_with_metric:
   * when true, the applied quantity is quantity_per_match multiplied by
   * ceil(trigger_metric's live value / metric_divisor) instead of a flat
   * quantity_per_match. */
  scale_with_metric: boolean;
  /** Mirrors components/admin/types.ts AccessoryRuleRow.metric_divisor. */
  metric_divisor: number;
  comment: string | null;
  /** Empty/null = no feature condition (matches regardless). Non-empty = the
   * customer must have enabled at least one of these (OR). Mirrors
   * lib/types.ts DesiredFeatureId. */
  desired_features: string[] | null;
  /** Mirrors components/admin/types.ts AccessoryRuleRow.excludes_accessory_models:
   * accessory models to drop from the final list whenever this rule matches,
   * even if their own rule also matched. */
  excludes_accessory_models: string[] | null;
  /** Mirrors components/admin/types.ts AccessoryRuleRow.bundled: true when this
   * accessory ships bundled with the inverter (e.g. a WiFi dongle or CTs that
   * come in the box) — surfaced as its own "Incluso" badge instead of
   * Obrigatório/Opcional on the customer-facing card. */
  bundled: boolean;
  accessories: { model: string } | null;
}

export interface EssCompatibilityRule {
  id: string;
  inverter_model: string;
  battery_model: string;
  battery_topology: ApprovedSolution['battery_topology'] | null;
  grid_topology: string | null;
  max_parallel_inverters: number | null;
  min_battery_qty: number | null;
  max_battery_qty: number | null;
  battery_configs: {
    battery_model: string;
    battery_topology: ApprovedSolution['battery_topology'];
    min_battery_qty: number | null;
    max_battery_qty: number | null;
  }[] | null;
  active: boolean;
}

export interface BatteryCatalogRow {
  capacity_kwh: number;
  min_soc_percent: number | null;
}

export const batteryTopologyMap: Record<ResidentialOptions['topology'], 'HV' | 'LV'> = {
  HighVoltage: 'HV',
  LowVoltage: 'LV',
};

export const gridTopologyMap: Record<ResidentialOptions['gridType'], ApprovedSolution['grid_topology']> = {
  singlePhase_220: '1p_220V',
  splitPhase_220: '2p_220V',
  threePhase_220: '3p_220V',
  threePhase_380: '3p_380V',
};

export type StandardGridTopology = '1P_220V' | '2P_220V' | '3P_220V' | '3P_380V';

export const standardGridTopologyMap: Record<ResidentialOptions['gridType'], StandardGridTopology> = {
  singlePhase_220: '1P_220V',
  splitPhase_220: '2P_220V',
  threePhase_220: '3P_220V',
  threePhase_380: '3P_380V',
};

export function normalizeStandardGridTopology(value: string | null): StandardGridTopology | null {
  if (!value) return null;
  if (value === '1P_220V' || value === '2P_220V' || value === '3P_220V' || value === '3P_380V') {
    return value;
  }
  if (value === '1p_220V') return '1P_220V';
  if (value === '2p_220V') return '2P_220V';
  if (value === '3p_220V') return '3P_220V';
  if (value === '3p_380V') return '3P_380V';
  return null;
}

export function clampNumber(value: unknown, min: number, max: number, fallback = min): number {
  const parsed = Number(value);
  const numberValue = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, numberValue));
}

export function totalPeakW(loads: SingleLoad[], mode: PeakCalcMode = 'sum'): number {
  if (loads.length === 0) return 0;

  if (mode === 'sum') {
    return loads.reduce((acc, l) => acc + l.powerW * (l.ipInRatio ?? 1) * l.qty, 0);
  }

  if (mode === 'select') {
    return loads
      .filter((l) => l.includedInPeak ?? true)
      .reduce((acc, l) => acc + l.powerW * (l.ipInRatio ?? 1) * l.qty, 0);
  }

  // 'largest-surge': only the single highest-surge load unit starts at a time;
  // everything else runs at nominal power.
  const nominalSum = loads.reduce((acc, l) => acc + l.powerW * l.qty, 0);
  const largestExtra = loads.reduce((max, l) => {
    const extra = l.powerW * ((l.ipInRatio ?? 1) - 1);
    return extra > max ? extra : max;
  }, 0);
  return nominalSum + largestExtra;
}

export function totalNominalW(loads: SingleLoad[]): number {
  return loads.reduce((acc, l) => acc + l.powerW * l.qty, 0);
}

/** operationHours is shared across every load (see ResidentialOptions) — each
 * load's usageFactor still scales its own share of that shared time, unless
 * the load opts out with usageMode 'fixed', which uses its own fixedHours
 * instead of the shared time entirely. */
export function totalDailyKwh(loads: SingleLoad[], operationHours: number): number {
  return loads.reduce((acc, l) => {
    const hours = l.usageMode === 'fixed' ? Math.max(0, l.fixedHours ?? 0) : operationHours * (l.usageFactor ?? 1);
    return acc + (l.powerW * l.qty * hours) / 1000;
  }, 0);
}

/** PV peak power sized from the customer's own average monthly consumption
 * and the installation site's HSP (peak sun hours/day) — independent of the
 * load-based dailyKwh used for battery/inverter sizing. Capped at the
 * recommended inverter's rated power scaled by its own pv_oversizing_percent
 * (e.g. 5kW rated x 100% oversizing = 10kWp max), so the suggestion never
 * exceeds what that inverter model is allowed to carry. */
export function computePvPowerKw(
  pv: Pick<PvConfig, 'monthlyConsumptionKwh' | 'hsp'>,
  ratedPowerW: number,
  pvOversizingPercent: number
): number {
  if (pv.monthlyConsumptionKwh <= 0 || pv.hsp <= 0) return 0;
  const rawPvKw = pv.monthlyConsumptionKwh / 30 / pv.hsp;
  const maxPvKw = (ratedPowerW / 1000) * (1 + pvOversizingPercent / 100);
  return Math.min(rawPvKw, maxPvKw);
}

/** Theoretical-max monthly generation (kWh) from a PV array at the site's
 * HSP — not adjusted for self-consumption/load overlap. */
export function computePvMonthlyGenerationKwh(pvPowerKw: number, hsp: number): number {
  return pvPowerKw * hsp * 30;
}

export function matchingEssBatteryConfig(rule: EssCompatibilityRule, batteryModel: string) {
  const configs = Array.isArray(rule.battery_configs) ? rule.battery_configs : [];
  const config = configs.find((item) => item.battery_model === batteryModel);
  if (config) return config;
  if (rule.battery_model === batteryModel && rule.battery_topology) {
    return {
      battery_model: rule.battery_model,
      battery_topology: rule.battery_topology,
      min_battery_qty: rule.min_battery_qty,
      max_battery_qty: rule.max_battery_qty,
    };
  }
  return null;
}

/** Total physical battery ports in use across every inverter — battery_ports_used
 * is stored per inverter (see buildRuleGeneratedSolutions in
 * components/admin/helpers.ts), so the solution-wide total needs multiplying
 * by inverter_quantity. Mirrors components/admin/helpers.ts solutionTotalBatteryPorts. */
export function solutionTotalBatteryPorts(solution: Pick<ApprovedSolution, 'inverter_quantity' | 'battery_ports_used'>): number {
  return solution.inverter_quantity * solution.battery_ports_used;
}

export function ruleMetricValue(solution: ApprovedSolution, metric: AccessoryRule['trigger_metric']): number {
  if (metric === 'per_solution') return 1;
  if (metric === 'inverter_quantity') return solution.inverter_quantity;
  if (metric === 'battery_quantity') return solution.battery_quantity;
  if (metric === 'battery_quantity_per_port') return solution.battery_quantity / Math.max(1, solutionTotalBatteryPorts(solution));
  // 'battery_ports_used': total physical ports in use across every inverter,
  // not just the per-inverter count stored on the solution row — a rule
  // gating/scaling on this metric means "per port in the whole solution".
  return solutionTotalBatteryPorts(solution);
}

/** Mirrors components/admin/helpers.ts accessoryRuleAppliedQuantity: the
 * quantity a matching rule contributes once scale_with_metric is on.
 * 'battery_quantity_per_port' gates on the average batteries-per-port but
 * *scales* by the total port count instead of its own value — "1 per port
 * once a port is dense enough", not "1 per unit of average density". */
export function accessoryRuleAppliedQuantity(
  solution: ApprovedSolution,
  rule: Pick<AccessoryRule, 'quantity_per_match' | 'scale_with_metric' | 'trigger_metric' | 'metric_divisor'>
): number {
  if (!rule.scale_with_metric) return rule.quantity_per_match;
  if (rule.trigger_metric === 'battery_quantity_per_port') {
    return rule.quantity_per_match * solutionTotalBatteryPorts(solution);
  }
  return rule.quantity_per_match * Math.ceil(ruleMetricValue(solution, rule.trigger_metric) / Math.max(1, rule.metric_divisor));
}

export function ruleMatches(
  solution: ApprovedSolution,
  rule: AccessoryRule,
  requestedGridTopology: StandardGridTopology,
  desiredFeatures: DesiredFeatureId[]
): boolean {
  const inverterModels = Array.isArray(rule.inverter_models) && rule.inverter_models.length > 0
    ? rule.inverter_models
    : rule.inverter_model
      ? [rule.inverter_model]
      : [];
  if (inverterModels.length > 0 && !inverterModels.includes(solution.inverter_model)) return false;
  if (rule.battery_model && rule.battery_model !== solution.battery_model) return false;
  if (
    rule.grid_topology &&
    normalizeStandardGridTopology(rule.grid_topology) !== requestedGridTopology
  ) {
    return false;
  }
  if (rule.battery_topology && rule.battery_topology !== solution.battery_topology) return false;
  if (
    rule.desired_features &&
    rule.desired_features.length > 0 &&
    !rule.desired_features.some((feature) => desiredFeatures.includes(feature as DesiredFeatureId))
  ) {
    return false;
  }
  return ruleMetricValue(solution, rule.trigger_metric) >= rule.min_quantity;
}

/** Mirrors lib/types.ts AccessoryLine. */
export interface AccessoryLine {
  model: string;
  qty: number;
  optional: boolean;
  appliesTo: 'inverter' | 'battery' | 'system';
  comment: string | null;
  /** Mirrors AccessoryRule.bundled: true when this item ships bundled with
   * the inverter rather than being separately required/optional. */
  bundled: boolean;
}

export interface SolutionPayload {
  solutionId: string;
  solutionCode: string;
  sourceFile: string;
  inverterId: string;
  inverterModel: string;
  inverterQty: number;
  inverterRatedPowerW: number;
  inverterPeakPowerW: number;
  batteryId: string;
  batteryModel: string;
  batteryQty: number;
  /** Number of battery ports in use per inverter — each port is its own
   * physical string and needs its own Master unit, so the client needs this
   * (together with inverterQty) to know how many Master vs. Slave/expansion
   * units batteryQty actually breaks down into. */
  batteryPortsUsed: number;
  batteryPowerW: number;
  availableEnergyWh: number;
  pvPowerKw: number | null;
  /** Theoretical-max monthly generation (kWh), present whenever pvPowerKw is. */
  pvMonthlyGenerationKwh?: number | null;
  accessories: AccessoryLine[];
  comments: string[];
}

/** What component an accessory rule's match conditions target: a rule scoped
 * to inverter model(s) only applies to the inverter, one scoped to a battery
 * model only applies to the battery; a rule with both (or neither) is a
 * system-level/general accessory. Mirrors the multi-rule Set version of this
 * inference in components/admin/editors/AccessoriesEditor.tsx
 * (accessoryCategories), collapsed to a single value since here we're
 * classifying one already-matched rule for one accessory line. */
export function accessoryAppliesTo(rule: AccessoryRule): 'inverter' | 'battery' | 'system' {
  const hasInverter =
    (Array.isArray(rule.inverter_models) && rule.inverter_models.length > 0) || Boolean(rule.inverter_model);
  const hasBattery = Boolean(rule.battery_model);
  if (hasInverter && !hasBattery) return 'inverter';
  if (hasBattery && !hasInverter) return 'battery';
  return 'system';
}

/** Builds the full response payload for one chosen ApprovedSolution: resolves
 * available energy (per-battery-model override or the solution's own
 * figure), sizes pvPowerKw from the customer's own consumption/HSP (capped by
 * this solution's inverter oversizing allowance), and applies every matching
 * accessory_rules row (already fetched by the caller) to extend the
 * solution's own accessories/comments. Pure and reusable so the microgrid
 * "economic vs with-microgrid" choice can build two payloads from a single
 * accessory_rules fetch. */
export function buildSolutionPayload(
  solution: ApprovedSolution,
  params: {
    usefulEnergyWhPerBattery: number | null;
    pv: PvConfig | null;
    /** The recommended inverter's pv_oversizing_percent (e.g. 50 or 100) — see InvertersEditor. */
    pvOversizingPercent: number;
    accessoryRules: AccessoryRule[];
    standardGridTopology: StandardGridTopology;
    desiredFeatures: DesiredFeatureId[];
  }
): SolutionPayload {
  const availableEnergyWh =
    params.usefulEnergyWhPerBattery === null
      ? solution.available_energy_wh
      : Math.round(params.usefulEnergyWhPerBattery * solution.battery_quantity);

  const accessories: AccessoryLine[] = solution.accessories
    .filter((accessory) => accessory.model && accessory.quantity > 0)
    .map((accessory) => ({
      model: accessory.model!,
      qty: accessory.quantity,
      optional: false,
      appliesTo: 'system',
      comment: null,
      bundled: false,
    }));

  const accessoryByModel = new Map(accessories.map((accessory) => [accessory.model.toLowerCase(), accessory]));
  const automaticComments: string[] = [];
  const excludedModels = new Set<string>();

  for (const rule of params.accessoryRules) {
    if (!rule.accessories?.model || !ruleMatches(solution, rule, params.standardGridTopology, params.desiredFeatures)) continue;

    const normalizedModel = rule.accessories.model.toLowerCase();
    const existing = accessoryByModel.get(normalizedModel);

    if (existing) {
      // Already present (baked into the solution's own accessory list) but a
      // rule also matches it: enrich it with the rule's metadata instead of
      // leaving it stuck at the base-list defaults — otherwise the comment
      // still lands in the generic `comments` list below while the card
      // itself would keep showing "Obrigatório" with no explanation.
      existing.optional = rule.inclusion === 'optional';
      existing.appliesTo = accessoryAppliesTo(rule);
      existing.bundled = rule.bundled;
      if (rule.comment) existing.comment = rule.comment;
    } else {
      const line: AccessoryLine = {
        model: rule.accessories.model,
        qty: accessoryRuleAppliedQuantity(solution, rule),
        optional: rule.inclusion === 'optional',
        appliesTo: accessoryAppliesTo(rule),
        comment: rule.comment ?? null,
        bundled: rule.bundled,
      };
      accessories.push(line);
      accessoryByModel.set(normalizedModel, line);
    }

    if (rule.comment) automaticComments.push(rule.comment);
    for (const excluded of rule.excludes_accessory_models ?? []) excludedModels.add(excluded.toLowerCase());
  }

  // Two different accessories can cover the same physical need (e.g. an
  // ATS-bundled enclosure making a separate paralleling bracket redundant) —
  // a matched rule can declare the other one excluded so only one survives,
  // regardless of which rule matched first or whether the excluded one was
  // already baked into the solution's own accessory list.
  const finalAccessories = accessories.filter((accessory) => !excludedModels.has(accessory.model.toLowerCase()));

  const rawPvPowerKw = params.pv ? computePvPowerKw(params.pv, solution.rated_power_w, params.pvOversizingPercent) : null;
  const pvPowerKw = rawPvPowerKw === null ? null : Math.ceil(rawPvPowerKw * 10) / 10;
  const pvMonthlyGenerationKwh =
    pvPowerKw !== null && params.pv ? computePvMonthlyGenerationKwh(pvPowerKw, params.pv.hsp) : null;

  return {
    solutionId: solution.id,
    solutionCode: solution.solution_code,
    sourceFile: solution.source_file,
    inverterId: solution.id,
    inverterModel: solution.inverter_model,
    inverterQty: solution.inverter_quantity,
    inverterRatedPowerW: solution.rated_power_w,
    inverterPeakPowerW: solution.peak_power_w,
    batteryId: solution.id,
    batteryModel: solution.battery_model,
    batteryQty: solution.battery_quantity,
    batteryPortsUsed: solution.battery_ports_used,
    batteryPowerW: solution.battery_power_w,
    availableEnergyWh,
    pvPowerKw,
    pvMonthlyGenerationKwh,
    accessories: finalAccessories,
    comments: Array.from(new Set([...solution.comments, ...automaticComments])),
  };
}

export const VALID_TOPOLOGIES: ResidentialOptions['topology'][] = ['HighVoltage', 'LowVoltage'];
export const VALID_GRID_TYPES: ResidentialOptions['gridType'][] = [
  'singlePhase_220',
  'splitPhase_220',
  'threePhase_220',
  'threePhase_380',
];
export const VALID_PEAK_CALC_MODES: PeakCalcMode[] = ['sum', 'largest-surge', 'select'];

/** Validates the untrusted JSON body before it is treated as ResidentialOptions.
 * Returns a list of human-readable issues; an empty list means the payload is valid. */
export function validateResidentialOptions(raw: unknown): string[] {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['payload must be a JSON object'];
  }

  const options = raw as Record<string, unknown>;

  if (!VALID_TOPOLOGIES.includes(options.topology as ResidentialOptions['topology'])) {
    errors.push('topology must be one of: ' + VALID_TOPOLOGIES.join(', '));
  }

  if (!VALID_GRID_TYPES.includes(options.gridType as ResidentialOptions['gridType'])) {
    errors.push('gridType must be one of: ' + VALID_GRID_TYPES.join(', '));
  }

  if (options.batteryModel !== null && typeof options.batteryModel !== 'string') {
    errors.push('batteryModel must be a string or null');
  }

  if (options.inverterModel !== null && typeof options.inverterModel !== 'string') {
    errors.push('inverterModel must be a string or null');
  }

  if (
    options.peakCalcMode !== undefined &&
    !VALID_PEAK_CALC_MODES.includes(options.peakCalcMode as PeakCalcMode)
  ) {
    errors.push('peakCalcMode must be one of: ' + VALID_PEAK_CALC_MODES.join(', '));
  }

  if (
    typeof options.operationHours !== 'number' ||
    !Number.isFinite(options.operationHours) ||
    options.operationHours < 0 ||
    options.operationHours > 24
  ) {
    errors.push('operationHours must be a number between 0 and 24');
  }

  if (options.desiredFeatures !== undefined) {
    if (!Array.isArray(options.desiredFeatures)) {
      errors.push('desiredFeatures must be an array');
    } else if (options.desiredFeatures.some((f) => !VALID_DESIRED_FEATURES.includes(f as DesiredFeatureId))) {
      errors.push('desiredFeatures must only contain: ' + VALID_DESIRED_FEATURES.join(', '));
    }
  }

  const desiredFeatures = Array.isArray(options.desiredFeatures) ? (options.desiredFeatures as unknown[]) : [];

  if (desiredFeatures.includes('white_tariff')) {
    const whiteTariff = options.whiteTariff as Record<string, unknown> | null | undefined;
    if (!whiteTariff || typeof whiteTariff !== 'object') {
      errors.push('whiteTariff is required when desiredFeatures includes white_tariff');
    } else {
      if (typeof whiteTariff.requiredPowerW !== 'number' || whiteTariff.requiredPowerW < 0) {
        errors.push('whiteTariff.requiredPowerW must be a number >= 0');
      }
      if (typeof whiteTariff.pontaEnergyWh !== 'number' || whiteTariff.pontaEnergyWh < 0) {
        errors.push('whiteTariff.pontaEnergyWh must be a number >= 0');
      }
      if (typeof whiteTariff.intermediateEnergyWh !== 'number' || whiteTariff.intermediateEnergyWh < 0) {
        errors.push('whiteTariff.intermediateEnergyWh must be a number >= 0');
      }
      if (typeof whiteTariff.includeBackupReserve !== 'boolean') {
        errors.push('whiteTariff.includeBackupReserve must be a boolean');
      }
      if (typeof whiteTariff.pontaTariffPerKwh !== 'number' || whiteTariff.pontaTariffPerKwh < 0) {
        errors.push('whiteTariff.pontaTariffPerKwh must be a number >= 0');
      }
      if (typeof whiteTariff.intermediateTariffPerKwh !== 'number' || whiteTariff.intermediateTariffPerKwh < 0) {
        errors.push('whiteTariff.intermediateTariffPerKwh must be a number >= 0');
      }
      if (typeof whiteTariff.foraPontaTariffPerKwh !== 'number' || whiteTariff.foraPontaTariffPerKwh < 0) {
        errors.push('whiteTariff.foraPontaTariffPerKwh must be a number >= 0');
      }
    }
  }

  if (desiredFeatures.includes('microgrid')) {
    const microgrid = options.microgrid as Record<string, unknown> | null | undefined;
    if (!microgrid || typeof microgrid !== 'object') {
      errors.push('microgrid is required when desiredFeatures includes microgrid');
    } else {
      if (typeof microgrid.voltageV !== 'number' || microgrid.voltageV <= 0) {
        errors.push('microgrid.voltageV must be a number > 0');
      }
      if (![1, 2, 3].includes(microgrid.onGridPhases as number)) {
        errors.push('microgrid.onGridPhases must be 1, 2, or 3');
      }
      if (typeof microgrid.onGridApparentPowerVA !== 'number' || microgrid.onGridApparentPowerVA < 0) {
        errors.push('microgrid.onGridApparentPowerVA must be a number >= 0');
      }
      if (typeof microgrid.isFundamentalRequirement !== 'boolean') {
        errors.push('microgrid.isFundamentalRequirement must be a boolean');
      }
    }
  }

  if (desiredFeatures.includes('external_generator')) {
    const generator = options.generator as Record<string, unknown> | null | undefined;
    if (!generator || typeof generator !== 'object') {
      errors.push('generator is required when desiredFeatures includes external_generator');
    } else {
      if (typeof generator.voltageV !== 'number' || generator.voltageV <= 0) {
        errors.push('generator.voltageV must be a number > 0');
      }
      if (![1, 2, 3].includes(generator.phases as number)) {
        errors.push('generator.phases must be 1, 2, or 3');
      }
      if (typeof generator.apparentPowerVA !== 'number' || generator.apparentPowerVA < 0) {
        errors.push('generator.apparentPowerVA must be a number >= 0');
      }
    }
  }

  if (desiredFeatures.includes('pv')) {
    const pv = options.pv as Record<string, unknown> | null | undefined;
    if (!pv || typeof pv !== 'object') {
      errors.push('pv is required when desiredFeatures includes pv');
    } else {
      if (typeof pv.monthlyConsumptionKwh !== 'number' || pv.monthlyConsumptionKwh <= 0) {
        errors.push('pv.monthlyConsumptionKwh must be a number > 0');
      }
      if (typeof pv.hsp !== 'number' || pv.hsp <= 0) {
        errors.push('pv.hsp must be a number > 0');
      }
    }
  }

  if (!Array.isArray(options.loads) || options.loads.length === 0) {
    errors.push('loads must be a non-empty array');
  } else {
    options.loads.forEach((load: unknown, index: number) => {
      if (!load || typeof load !== 'object') {
        errors.push(`loads[${index}] must be an object`);
        return;
      }
      const l = load as Record<string, unknown>;

      if (typeof l.powerW !== 'number' || !Number.isFinite(l.powerW) || l.powerW <= 0) {
        errors.push(`loads[${index}].powerW must be a positive number`);
      }

      if (typeof l.qty !== 'number' || !Number.isInteger(l.qty) || l.qty <= 0) {
        errors.push(`loads[${index}].qty must be a positive integer`);
      }

      if (
        l.ipInRatio !== undefined &&
        (typeof l.ipInRatio !== 'number' || !Number.isFinite(l.ipInRatio) || l.ipInRatio < 1)
      ) {
        errors.push(`loads[${index}].ipInRatio must be a number >= 1`);
      }
    });
  }

  return errors;
}
