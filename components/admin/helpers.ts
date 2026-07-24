import type { createClient } from '@/lib/supabase/client';
import {
  batteryFlagLabels,
  inverterFlagLabels,
  inverterGridTypeLabels,
  legacyInverterGridTypeMap,
  type AccessoryRuleRow,
  type BatteryFlag,
  type BatteryRow,
  type BatteryTopology,
  type EssBatteryConfig,
  type EssCompatibilityRuleRow,
  type GeneratedSolutionPayload,
  type GridTopology,
  type InverterFlag,
  type InverterGridType,
  type InverterRow,
  type SolutionRow,
  type TriggerMetric,
} from './types';

export const INVERTER_COLUMNS =
  'id, model, nickname, power_kw, standard_power_kva, peak_power_kva, phases, topology, grid_types, max_battery_qty, battery_ports, battery_voltage_min_v, battery_voltage_max_v, battery_current_max_a, max_power_per_phase_w, flags, pv_oversizing_percent, image_url, documents';

export const BATTERY_COLUMNS =
  'id, model, nickname, capacity_kwh, topology, standard_power_kw, peak_power_kw, min_soc_percent, nominal_voltage_v, voltage_min_v, voltage_max_v, recommended_current_a, max_current_a, flags, max_association_qty, expansion_model, image_url, documents';

export const ACCESSORY_COLUMNS = 'id, model, nickname, description, active, image_url, documents';

export const LOAD_CATALOG_COLUMNS = 'id, name_pt, name_en, name_zh, power_w, category, ip_in_ratio, active';

export const PRESET_COLUMNS = 'id, name, description, loads, display_order';

export const ACCESSORY_RULE_COLUMNS =
  'id, accessory_id, name, inclusion, trigger_metric, min_quantity, inverter_model, inverter_models, battery_model, grid_topology, battery_topology, quantity_per_match, scale_with_metric, metric_divisor, comment, desired_features, active, accessories (model)';

export const ESS_RULE_COLUMNS =
  'id, name, inverter_model, battery_model, battery_topology, grid_topology, max_parallel_inverters, min_battery_qty, max_battery_qty, battery_configs, comment, active, created_at';

export const SOLUTION_COLUMNS =
  'id, source_file, solution_code, schema_version, inverter_model, inverter_quantity, battery_ports_used, nominal_voltage_v, rated_power_w, peak_power_w, grid_topology, battery_model, battery_topology, battery_quantity, battery_power_w, available_energy_wh, accessories, comments, raw_solution, active';

export const SIMULATION_COLUMNS =
  'id, user_id, project_name, client_name, topology, grid_type, peak_w, daily_kwh, loads, inverter_model, battery_model, accessories, solution_code, created_at';

export const ACTIVITY_LOG_COLUMNS =
  'id, actor_id, actor_email, entity_type, action, target_id, target_label, summary, before_data, after_data, created_at';

export function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampNumber(value: unknown, min: number, max: number, fallback = min) {
  const parsed = toNumber(value, fallback);
  return Math.min(max, Math.max(min, parsed));
}

/** Some battery lines scale via a "Master" unit plus electrically-identical
 * "Slave"/expansion units instead of more of the same model (e.g. "T58 V2
 * Master" + "T58 Slave"). Energy/power math already treats battery_quantity
 * as N identical units, which holds true either way — this only changes what's
 * displayed for units 2..N, using the Master row's expansion_model. */
export function batteryQuantityBreakdown(
  model: string,
  quantity: number,
  batteries: Pick<BatteryRow, 'model' | 'expansion_model'>[]
): { model: string; qty: number }[] {
  const expansionModel = batteries.find((battery) => battery.model === model)?.expansion_model;
  if (expansionModel && quantity > 1) {
    return [
      { model, qty: 1 },
      { model: expansionModel, qty: quantity - 1 },
    ];
  }
  return [{ model, qty: quantity }];
}

/** Expansion/Slave models (e.g. "T58 Slave") only ever exist as units 2..N of
 * some other "Master" battery's bank — they aren't a real standalone base
 * model, so they must never be offered directly wherever an admin or user
 * picks a battery to build/configure a solution around. */
export function expansionModelSet(batteries: Pick<BatteryRow, 'expansion_model'>[]): Set<string> {
  return new Set(
    batteries.map((battery) => battery.expansion_model).filter((model): model is string => Boolean(model))
  );
}

export function normalizeInverterGridType(value: string): InverterGridType | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (inverterGridTypeLabels.has(trimmed as InverterGridType)) return trimmed as InverterGridType;
  return legacyInverterGridTypeMap[trimmed] ?? null;
}

export function normalizeInverterGridTypes(value: unknown): InverterGridType[] {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  return Array.from(
    new Set(
      values
        .map((item) => normalizeInverterGridType(String(item)))
        .filter((item): item is InverterGridType => Boolean(item))
    )
  );
}

export function formatInverterGridType(value: string) {
  const normalized = normalizeInverterGridType(value);
  return normalized ? inverterGridTypeLabels.get(normalized) ?? value : value;
}

export function phasesFromInverterGridTypes(value: unknown, fallback = 1) {
  const gridTypes = normalizeInverterGridTypes(value);
  if (gridTypes.some((gridType) => gridType.startsWith('3P_'))) return 3;
  if (gridTypes.some((gridType) => gridType.startsWith('2P_'))) return 2;
  if (gridTypes.some((gridType) => gridType.startsWith('1P_'))) return 1;
  const fallbackValue = Number(fallback);
  return Math.min(3, Math.max(1, Number.isFinite(fallbackValue) ? fallbackValue : 1));
}

export function normalizeInverterFlags(value: unknown): InverterFlag[] {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  return Array.from(
    new Set(
      values
        .map((item) => String(item).trim())
        .filter((item): item is InverterFlag => inverterFlagLabels.has(item as InverterFlag))
    )
  );
}

export function normalizeBatteryFlags(value: unknown): BatteryFlag[] {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  return Array.from(
    new Set(
      values
        .map((item) => String(item).trim())
        .filter((item): item is BatteryFlag => batteryFlagLabels.has(item as BatteryFlag))
    )
  );
}

export function formatTriggerMetric(value: TriggerMetric) {
  if (value === 'per_solution') return 'Por solução';
  if (value === 'inverter_quantity') return 'Qtd. inversores';
  if (value === 'battery_quantity') return 'Qtd. baterias';
  if (value === 'battery_ports_used') return 'Portas de bateria';
  return 'Baterias por porta';
}

export function accessoryRuleInverterModels(rule: Partial<AccessoryRuleRow>) {
  if (Array.isArray(rule.inverter_models) && rule.inverter_models.length > 0) {
    return rule.inverter_models.filter(Boolean);
  }
  return rule.inverter_model ? [rule.inverter_model] : [];
}

export function accessoryRuleDesiredFeatures(rule: Partial<AccessoryRuleRow>) {
  return Array.isArray(rule.desired_features) ? rule.desired_features.filter(Boolean) : [];
}

export function batteryAssociationMax(battery: BatteryRow | undefined) {
  return clampNumber(battery?.max_association_qty, 1, 15, 15);
}

export function normalizeEssBatteryConfigs(rule: Partial<EssCompatibilityRuleRow>, batteries: BatteryRow[] = []): EssBatteryConfig[] {
  const batteryByModel = new Map(batteries.map((battery) => [battery.model, battery]));
  const rawConfigs = Array.isArray(rule.battery_configs) ? rule.battery_configs : [];
  const configs = rawConfigs
    .map((config) => {
      const battery = batteryByModel.get(config.battery_model);
      const topology = battery?.topology ?? config.battery_topology;
      if (!config.battery_model || !topology) return null;
      const associationMax = batteryAssociationMax(battery);
      const minQty = clampNumber(config.min_battery_qty, 1, Math.min(7, associationMax), 1);
      const maxQty = Math.max(minQty, clampNumber(config.max_battery_qty, 1, associationMax, associationMax));
      return {
        battery_model: config.battery_model,
        battery_topology: topology,
        min_battery_qty: minQty,
        max_battery_qty: maxQty,
      };
    })
    .filter((config): config is EssBatteryConfig => Boolean(config));

  if (configs.length > 0) return configs;
  if (!rule.battery_model) return [];

  const battery = batteryByModel.get(rule.battery_model);
  const topology = battery?.topology ?? rule.battery_topology;
  if (!topology) return [];
  const associationMax = batteryAssociationMax(battery);
  const minQty = clampNumber(rule.min_battery_qty, 1, Math.min(7, associationMax), 1);
  const maxQty = Math.max(minQty, clampNumber(rule.max_battery_qty, 1, associationMax, associationMax));
  return [
    {
      battery_model: rule.battery_model,
      battery_topology: topology,
      min_battery_qty: minQty,
      max_battery_qty: maxQty,
    },
  ];
}

export function inverterSupportedBatteryTopologies(inverter: InverterRow | undefined): BatteryTopology[] {
  if (!inverter) return [];
  if (inverter.topology === 'BOTH') return ['HV', 'LV'];
  return [inverter.topology];
}

export function generatedGridToApprovedTopology(gridType: InverterGridType): Extract<GridTopology, '1p_220V' | '2p_220V' | '3p_220V' | '3p_380V'> {
  if (gridType === '2P_220V') return '2p_220V';
  if (gridType === '3P_220V') return '3p_220V';
  if (gridType === '3P_380V') return '3p_380V';
  return '1p_220V';
}

export function nominalVoltageForGrid(gridType: InverterGridType) {
  return gridType === '3P_380V' ? 380 : 220;
}

export function slugPart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

type MetricSolution = Pick<SolutionRow, 'inverter_quantity' | 'battery_quantity' | 'battery_ports_used'>;

/** Total physical battery ports in use across every inverter — battery_ports_used
 * is stored per inverter (see buildRuleGeneratedSolutions), so the solution-wide
 * total needs multiplying by inverter_quantity. */
export function solutionTotalBatteryPorts(solution: Pick<SolutionRow, 'inverter_quantity' | 'battery_ports_used'>) {
  return solution.inverter_quantity * solution.battery_ports_used;
}

export function solutionRuleMetricValue(solution: MetricSolution, metric: TriggerMetric) {
  if (metric === 'per_solution') return 1;
  if (metric === 'inverter_quantity') return solution.inverter_quantity;
  if (metric === 'battery_quantity') return solution.battery_quantity;
  if (metric === 'battery_quantity_per_port') return solution.battery_quantity / Math.max(1, solutionTotalBatteryPorts(solution));
  // 'battery_ports_used': total physical ports in use across every inverter,
  // not just the per-inverter count stored on the solution row — a rule
  // gating/scaling on this metric means "per port in the whole solution".
  return solutionTotalBatteryPorts(solution);
}

/** The quantity a matching accessory rule contributes once scale_with_metric
 * is applied. 'battery_quantity_per_port' is special-cased: it gates on the
 * average batteries-per-port (see solutionRuleMetricValue) but *scales* by
 * the total port count instead — "1 per port once a port is dense enough",
 * not "1 per unit of average density", which wouldn't be a whole number of
 * accessories. Every other metric scales by ceil(its own value / metric_divisor). */
export function accessoryRuleAppliedQuantity(solution: MetricSolution, rule: Pick<AccessoryRuleRow, 'quantity_per_match' | 'scale_with_metric' | 'trigger_metric' | 'metric_divisor'>) {
  if (!rule.scale_with_metric) return rule.quantity_per_match;
  if (rule.trigger_metric === 'battery_quantity_per_port') {
    return rule.quantity_per_match * solutionTotalBatteryPorts(solution);
  }
  return rule.quantity_per_match * Math.ceil(solutionRuleMetricValue(solution, rule.trigger_metric) / Math.max(1, rule.metric_divisor));
}

export function accessoryRuleMatches(
  solution: GeneratedSolutionPayload,
  rule: AccessoryRuleRow,
  generatedGridType?: InverterGridType
) {
  if (!rule.active) return false;
  // Feature-gated rules depend on what a future customer enables in the
  // wizard, which this bulk generator has no knowledge of — they're only
  // ever evaluated live, per request, by the calculate-residential Edge
  // Function (see ruleMatches there). Baking one in here would apply it to
  // every generated solution regardless of the customer's actual choice.
  if (accessoryRuleDesiredFeatures(rule).length > 0) return false;
  const inverterModels = accessoryRuleInverterModels(rule);
  if (inverterModels.length > 0 && !inverterModels.includes(solution.inverter_model)) return false;
  if (rule.battery_model && rule.battery_model !== solution.battery_model) return false;
  if (rule.grid_topology) {
    const ruleGrid = normalizeInverterGridType(rule.grid_topology);
    const solutionGrid = generatedGridType ?? normalizeInverterGridType(solution.grid_topology);
    if (ruleGrid && solutionGrid && ruleGrid !== solutionGrid) return false;
    if (!ruleGrid && rule.grid_topology !== solution.grid_topology) return false;
  }
  if (rule.battery_topology && rule.battery_topology !== solution.battery_topology) return false;
  return solutionRuleMetricValue(solution, rule.trigger_metric) >= rule.min_quantity;
}

export function applyAccessoryRules(
  solution: GeneratedSolutionPayload,
  rules: AccessoryRuleRow[],
  generatedGridType?: InverterGridType
) {
  const accessories = new Map<string, number>();
  const comments: string[] = [];

  for (const rule of rules) {
    if (!rule.accessories?.model || !accessoryRuleMatches(solution, rule, generatedGridType)) continue;
    const matchQty = accessoryRuleAppliedQuantity(solution, rule);
    const currentQty = accessories.get(rule.accessories.model) ?? 0;
    accessories.set(rule.accessories.model, currentQty + matchQty);
    if (rule.comment) comments.push(rule.comment);
    if (rule.inclusion === 'optional') comments.push(`Acessório opcional: ${rule.accessories.model}.`);
  }

  return {
    accessories: Array.from(accessories.entries()).map(([model, quantity]) => ({ model, quantity })),
    comments,
  };
}

export function buildRuleGeneratedSolutions({
  inverters,
  batteries,
  accessoryRules,
  essRules,
  filterInverterModels,
  filterBatteryModels,
}: {
  inverters: InverterRow[];
  batteries: BatteryRow[];
  accessoryRules: AccessoryRuleRow[];
  essRules: EssCompatibilityRuleRow[];
  filterInverterModels?: Set<string> | null;
  filterBatteryModels?: Set<string> | null;
}) {
  const inverterByModel = new Map(inverters.map((inv) => [inv.model, inv]));
  const batteryByModel = new Map(batteries.map((bat) => [bat.model, bat]));
  const slaveModels = expansionModelSet(batteries);
  const generated: GeneratedSolutionPayload[] = [];
  const seen = new Set<string>();

  for (const rule of essRules) {
    if (!rule.active || !rule.inverter_model) continue;
    const inverter = inverterByModel.get(rule.inverter_model);
    if (!inverter) continue;
    if (filterInverterModels && !filterInverterModels.has(inverter.model)) continue;
    const batteryConfigs = normalizeEssBatteryConfigs(rule, batteries);
    if (batteryConfigs.length === 0) continue;

    const inverterGridTypes = normalizeInverterGridTypes(inverter.grid_types);
    const ruleGridType = rule.grid_topology ? normalizeInverterGridType(rule.grid_topology) : null;
    const validGridTypes = (ruleGridType ? [ruleGridType] : inverterGridTypes)
      .filter((gt) => inverterGridTypes.includes(gt));

    const maxParallelInverters = Math.max(1, toNumber(rule.max_parallel_inverters, 1));
    const maxPorts = Math.max(1, toNumber(inverter.battery_ports, 1));

    for (const batteryConfig of batteryConfigs) {
      const battery = batteryByModel.get(batteryConfig.battery_model);
      if (!battery) continue;
      if (slaveModels.has(battery.model)) continue;
      if (batteryConfig.battery_topology !== battery.topology) continue;
      if (filterBatteryModels && !filterBatteryModels.has(battery.model)) continue;

      // min/max are per-port quantities (displayed as "Min/porta" / "Max/porta" in the ESS rule editor)
      const minBatPerPort = batteryConfig.min_battery_qty;
      const maxBatPerPort = batteryConfig.max_battery_qty;

      for (const gridType of validGridTypes) {
        // Iterate in the order: vary batPerPort first, then ports, then inverter count
        // so the output order is: 1I×1P×1B, 1I×1P×2B … 1I×2P×1B … 2I×1P×1B …
        for (let inverterQty = 1; inverterQty <= maxParallelInverters; inverterQty++) {
          for (let portsActive = 1; portsActive <= maxPorts; portsActive++) {
            for (let batPerPort = minBatPerPort; batPerPort <= maxBatPerPort; batPerPort++) {
              const totalBatteries = inverterQty * portsActive * batPerPort;

              const approvedGridTopology = generatedGridToApprovedTopology(gridType);
              // Encode all three dimensions so codes are unambiguous
              const solutionCode = [
                'rules',
                slugPart(inverter.model),
                slugPart(battery.model),
                gridType,
                `${inverterQty}I`,
                `${portsActive}P`,
                `${batPerPort}B`,
              ].join('_');
              if (seen.has(solutionCode)) continue;
              seen.add(solutionCode);

              const ratedPowerW = Math.max(1, Math.round(toNumber(inverter.standard_power_kva, inverter.power_kw) * 1000 * inverterQty));
              const peakPowerW = Math.max(ratedPowerW, Math.round(toNumber(inverter.peak_power_kva, inverter.power_kw) * 1000 * inverterQty));
              const batteryPowerW = Math.max(1, Math.round(toNumber(battery.standard_power_kw, battery.capacity_kwh) * 1000 * totalBatteries));
              const availableEnergyWh = Math.max(
                1,
                Math.round(toNumber(battery.capacity_kwh) * (1 - toNumber(battery.min_soc_percent, 10) / 100) * 1000 * totalBatteries)
              );

              const baseSolution: GeneratedSolutionPayload = {
                source_file: 'generated-rules',
                solution_code: solutionCode,
                schema_version: '1.0',
                inverter_model: inverter.model,
                inverter_quantity: inverterQty,
                battery_ports_used: portsActive,
                nominal_voltage_v: nominalVoltageForGrid(gridType),
                rated_power_w: ratedPowerW,
                peak_power_w: peakPowerW,
                grid_topology: approvedGridTopology,
                battery_model: battery.model,
                battery_topology: battery.topology,
                battery_quantity: totalBatteries,
                battery_power_w: batteryPowerW,
                available_energy_wh: availableEnergyWh,
                accessories: [],
                comments: [`Gerada por regra ESS para ${formatInverterGridType(gridType)}.`],
                raw_solution: {},
                active: true,
              };

              const ruleExtras = applyAccessoryRules(baseSolution, accessoryRules, gridType);
              const solution = {
                ...baseSolution,
                accessories: ruleExtras.accessories.length > 0 ? ruleExtras.accessories : [{ model: null, quantity: 0 }],
                comments: [...baseSolution.comments, ...ruleExtras.comments],
              };
              solution.raw_solution = {
                id: solution.solution_code,
                generatedBy: 'admin_rules',
                gridType,
                inverter: {
                  model: solution.inverter_model,
                  quantity: solution.inverter_quantity,
                  batteryPortsUsed: solution.battery_ports_used,
                  batteriesPerPort: batPerPort,
                  nominalVoltageV: solution.nominal_voltage_v,
                  ratedPowerW: solution.rated_power_w,
                  peakPowerW: solution.peak_power_w,
                  topology: solution.grid_topology,
                },
                battery: {
                  model: solution.battery_model,
                  quantity: solution.battery_quantity,
                  powerW: solution.battery_power_w,
                  availableEnergyWh: solution.available_energy_wh,
                  minSocPercent: battery.min_soc_percent,
                },
                accessories: solution.accessories,
                comments: solution.comments,
              };
              generated.push(solution);
            }
          }
        }
      }
    }
  }

  // Sort: inverter → battery → inverterQty → portsActive → batPerPort
  return generated.sort((a, b) => {
    const invCmp = a.inverter_model.localeCompare(b.inverter_model);
    if (invCmp) return invCmp;
    const batCmp = a.battery_model.localeCompare(b.battery_model);
    if (batCmp) return batCmp;
    const invQtyCmp = a.inverter_quantity - b.inverter_quantity;
    if (invQtyCmp) return invQtyCmp;
    const portsCmp = a.battery_ports_used - b.battery_ports_used;
    if (portsCmp) return portsCmp;
    // batPerPort = total / (inverterQty × portsActive)
    const aBpp = a.battery_quantity / a.inverter_quantity / a.battery_ports_used;
    const bBpp = b.battery_quantity / b.inverter_quantity / b.battery_ports_used;
    return aBpp - bBpp;
  });
}

export function selectClasses(className = '') {
  return `h-10 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:px-2.5 md:text-sm ${className}`;
}

export function textareaClasses(className = '') {
  return `min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:px-2.5 md:text-sm ${className}`;
}

export function sanitizePathPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'produto';
}

export async function fetchApprovedSolutions(supabase: ReturnType<typeof createClient>) {
  const pageSize = 1000;
  const rows: SolutionRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('approved_solutions')
      .select(SOLUTION_COLUMNS)
      .order('rated_power_w', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { data: rows, error };

    const page = (data ?? []) as SolutionRow[];
    rows.push(...page);

    if (page.length < pageSize) return { data: rows, error: null };
  }
}
