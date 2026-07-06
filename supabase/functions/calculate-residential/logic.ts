// Pure logic for the calculate-residential Edge Function: types, payload
// validation, and the compatibility/sizing math. Kept free of Deno-specific
// APIs (no `Deno.*`, no `jsr:` imports) so it can be unit tested with a
// regular Node-based test runner (see logic.test.ts) instead of requiring a
// Deno test setup.

export interface SingleLoad {
  powerW: number;
  hoursPerDay: number;
  qty: number;
  ipInRatio?: number;
}

export type PeakCalcMode = 'sum' | 'largest-surge';

/** Mirrors lib/types.ts InverterFlag — kept in sync manually since this file
 * runs on Deno and can't import from the Next.js app. */
export type InverterFlag = 'microgrid' | 'super_backup' | 'dual_voltage' | 'external_ats' | 'external_generator';

/** Mirrors lib/types.ts DesiredFeatureId. */
export type DesiredFeatureId = 'external_ats' | 'microgrid' | 'external_generator' | 'no_pv' | 'white_tariff';

/** Mirrors lib/desired-features.ts DESIRED_FEATURE_DEFINITIONS — add a new
 * flag-based requirement by adding one entry here (and the matching entry in
 * the app-side registry); the solution-filtering code loops over this
 * generically and needs no changes for a new flag-based feature. */
export const DESIRED_FEATURE_DEFINITIONS: { id: DesiredFeatureId; requiresInverterFlag?: InverterFlag }[] = [
  { id: 'external_ats', requiresInverterFlag: 'external_ats' },
  { id: 'microgrid', requiresInverterFlag: 'microgrid' },
  { id: 'external_generator', requiresInverterFlag: 'external_generator' },
  { id: 'no_pv' },
  { id: 'white_tariff' },
];

export const VALID_DESIRED_FEATURES: DesiredFeatureId[] = DESIRED_FEATURE_DEFINITIONS.map((f) => f.id);

/** The inverter flags a set of desired features requires — features without
 * a requiresInverterFlag (e.g. 'no_pv', 'white_tariff') contribute nothing here. */
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

/** Minimum power the recommended inverter must sustain: the household's normal
 * peak, or the white-tariff window's required power if that's higher. */
export function effectiveTargetPowerW(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  peakW: number
): number {
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return peakW;
  return Math.max(peakW, whiteTariff.requiredPowerW);
}

/** Minimum battery energy the recommended solution must provide. When Tarifa
 * Branca is active this replaces the generic backup heuristic with the
 * energy the customer needs for the tariff window, optionally topped up with
 * that same backup reserve when includeBackupReserve is set. */
export function effectiveTargetEnergyWh(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseTargetEnergyWh: number
): number {
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return baseTargetEnergyWh;
  return whiteTariff.requiredEnergyWh + (whiteTariff.includeBackupReserve ? baseTargetEnergyWh : 0);
}

/** Mirrors lib/types.ts WhiteTariffConfig. */
export interface WhiteTariffConfig {
  requiredPowerW: number;
  requiredEnergyWh: number;
  includeBackupReserve: boolean;
  tariffSpreadPerKwh: number;
}

/** Mirrors lib/types.ts MicrogridConfig. */
export interface MicrogridConfig {
  onGridPhases: 1 | 2 | 3;
  onGridApparentPowerVA: number;
  isFundamentalRequirement: boolean;
  photoUrl?: string | null;
}

/** Mirrors lib/types.ts GeneratorConfig. Informational only — not validated
 * against any solution-filtering logic. */
export interface GeneratorConfig {
  voltageV: number;
  phases: 1 | 2 | 3;
  apparentPowerVA: number;
  photoUrl?: string | null;
}

export interface ResidentialOptions {
  topology: 'HighVoltage' | 'LowVoltage';
  batteryModel: string | null;
  inverterModel: string | null;
  gridType: 'singlePhase_220' | 'splitPhase_220' | 'threePhase_220' | 'threePhase_380';
  loads: SingleLoad[];
  peakCalcMode?: PeakCalcMode;
  desiredFeatures: DesiredFeatureId[];
  whiteTariff: WhiteTariffConfig | null;
  microgrid: MicrogridConfig | null;
  generator: GeneratorConfig | null;
  atsPhotoUrl?: string | null;
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

export interface AccessoryRule {
  id: string;
  name: string;
  inclusion: 'required' | 'optional';
  trigger_metric: 'per_solution' | 'inverter_quantity' | 'battery_quantity' | 'battery_ports_used';
  min_quantity: number;
  inverter_model: string | null;
  inverter_models: string[] | null;
  battery_model: string | null;
  grid_topology: string | null;
  battery_topology: ApprovedSolution['battery_topology'] | null;
  quantity_per_match: number;
  comment: string | null;
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

export function totalDailyKwh(loads: SingleLoad[]): number {
  return loads.reduce((acc, l) => acc + (l.powerW * l.hoursPerDay * l.qty) / 1000, 0);
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

export function ruleMetricValue(solution: ApprovedSolution, metric: AccessoryRule['trigger_metric']): number {
  if (metric === 'per_solution') return 1;
  if (metric === 'inverter_quantity') return solution.inverter_quantity;
  if (metric === 'battery_quantity') return solution.battery_quantity;
  return solution.battery_ports_used;
}

export function ruleMatches(
  solution: ApprovedSolution,
  rule: AccessoryRule,
  requestedGridTopology: StandardGridTopology
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
  return ruleMetricValue(solution, rule.trigger_metric) >= rule.min_quantity;
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
  batteryPowerW: number;
  availableEnergyWh: number;
  pvPowerKw: number | null;
  accessories: string[];
  comments: string[];
}

/** Builds the full response payload for one chosen ApprovedSolution: resolves
 * available energy (per-battery-model override or the solution's own
 * figure), rounds pvPowerKw, and applies every matching accessory_rules row
 * (already fetched by the caller) to extend the solution's own accessories/
 * comments. Pure and reusable so the microgrid "economic vs with-microgrid"
 * choice can build two payloads from a single accessory_rules fetch. */
export function buildSolutionPayload(
  solution: ApprovedSolution,
  params: {
    usefulEnergyWhPerBattery: number | null;
    pvPowerKw: number | null;
    accessoryRules: AccessoryRule[];
    standardGridTopology: StandardGridTopology;
  }
): SolutionPayload {
  const availableEnergyWh =
    params.usefulEnergyWhPerBattery === null
      ? solution.available_energy_wh
      : Math.round(params.usefulEnergyWhPerBattery * solution.battery_quantity);

  const accessories = solution.accessories
    .filter((accessory) => accessory.model && accessory.quantity > 0)
    .map((accessory) => (accessory.quantity > 1 ? `${accessory.model} x${accessory.quantity}` : accessory.model!));

  const normalizedAccessoryModels = new Set(
    accessories.map((accessory) => accessory.replace(/ x\d+$/, '').toLowerCase())
  );
  const automaticComments: string[] = [];

  for (const rule of params.accessoryRules) {
    if (!rule.accessories?.model || !ruleMatches(solution, rule, params.standardGridTopology)) continue;

    const normalizedModel = rule.accessories.model.toLowerCase();
    const label =
      rule.quantity_per_match > 1 ? `${rule.accessories.model} x${rule.quantity_per_match}` : rule.accessories.model;

    if (!normalizedAccessoryModels.has(normalizedModel)) {
      accessories.push(rule.inclusion === 'optional' ? `${label} (opcional)` : label);
      normalizedAccessoryModels.add(normalizedModel);
    }

    if (rule.comment) automaticComments.push(rule.comment);
  }

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
    batteryPowerW: solution.battery_power_w,
    availableEnergyWh,
    pvPowerKw: params.pvPowerKw === null ? null : Math.ceil(params.pvPowerKw * 10) / 10,
    accessories,
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
export const VALID_PEAK_CALC_MODES: PeakCalcMode[] = ['sum', 'largest-surge'];

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
      if (typeof whiteTariff.requiredEnergyWh !== 'number' || whiteTariff.requiredEnergyWh < 0) {
        errors.push('whiteTariff.requiredEnergyWh must be a number >= 0');
      }
      if (typeof whiteTariff.includeBackupReserve !== 'boolean') {
        errors.push('whiteTariff.includeBackupReserve must be a boolean');
      }
      if (typeof whiteTariff.tariffSpreadPerKwh !== 'number' || whiteTariff.tariffSpreadPerKwh < 0) {
        errors.push('whiteTariff.tariffSpreadPerKwh must be a number >= 0');
      }
    }
  }

  if (desiredFeatures.includes('microgrid')) {
    const microgrid = options.microgrid as Record<string, unknown> | null | undefined;
    if (!microgrid || typeof microgrid !== 'object') {
      errors.push('microgrid is required when desiredFeatures includes microgrid');
    } else {
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

      if (
        typeof l.hoursPerDay !== 'number' ||
        !Number.isFinite(l.hoursPerDay) ||
        l.hoursPerDay < 0 ||
        l.hoursPerDay > 24
      ) {
        errors.push(`loads[${index}].hoursPerDay must be a number between 0 and 24`);
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
