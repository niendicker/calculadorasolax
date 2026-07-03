'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Boxes,
  Battery,
  Cable,
  CircleHelp,
  BarChart3,
  Database,
  EyeOff,
  FileClock,
  FileText,
  ImageIcon,
  Loader2,
  LogOut,
  Menu,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
  Users,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import type { ProductDocument } from '@/lib/types';
import { cn } from '@/lib/utils';

type TabKey = 'metrics' | 'users' | 'solutions' | 'inverters' | 'batteries' | 'accessories' | 'loads' | 'rules' | 'logs';

type InverterGridType = '1P_220V' | '2P_220V' | '3P_220V' | '3P_380V';
type GridTopology = '1p_220V' | '3p_220V' | '3p_380V' | InverterGridType;
type InverterFlag = 'microgrid' | 'super_backup' | 'dual_voltage' | 'external_ats';
type BatteryFlag = 'ip65' | 'ip66';
type BatteryTopology = 'HV' | 'LV';
type Inclusion = 'required' | 'optional';
type TriggerMetric = 'per_solution' | 'inverter_quantity' | 'battery_quantity' | 'battery_ports_used';
type ProductEditorTab = 'general' | 'media';

const inverterGridTypeOptions: { value: InverterGridType; label: string }[] = [
  { value: '1P_220V', label: 'Monofásica 220V' },
  { value: '2P_220V', label: 'Bifásica 220V' },
  { value: '3P_220V', label: 'Trifásica 220V' },
  { value: '3P_380V', label: 'Trifásica 380V' },
];

const inverterGridTypeLabels = new Map(
  inverterGridTypeOptions.map((option) => [option.value, option.label])
);

const legacyInverterGridTypeMap: Record<string, InverterGridType> = {
  singlePhase_220: '1P_220V',
  splitPhase_220: '2P_220V',
  threePhase_220: '3P_220V',
  threePhase_380: '3P_380V',
  '1p_220V': '1P_220V',
  '2p_220V': '2P_220V',
  '3p_220V': '3P_220V',
  '3p_380V': '3P_380V',
};

const inverterFlagOptions: { value: InverterFlag; label: string }[] = [
  { value: 'microgrid', label: 'Microrrede' },
  { value: 'super_backup', label: 'Super-Backup' },
  { value: 'dual_voltage', label: 'Dual Voltage' },
  { value: 'external_ats', label: 'ATS Externo' },
];

const inverterFlagLabels = new Map(
  inverterFlagOptions.map((option) => [option.value, option.label])
);

const batteryFlagOptions: { value: BatteryFlag; label: string }[] = [
  { value: 'ip65', label: 'IP65' },
  { value: 'ip66', label: 'IP66' },
];

const batteryFlagLabels = new Map(
  batteryFlagOptions.map((option) => [option.value, option.label])
);

const productEditorTabOptions: { value: ProductEditorTab; label: string }[] = [
  { value: 'general', label: 'Informações' },
  { value: 'media', label: 'Mídias' },
];

interface InverterRow {
  id: string;
  model: string;
  power_kw: number;
  standard_power_kva: number | null;
  peak_power_kva: number | null;
  phases: number;
  topology: 'HV' | 'LV' | 'BOTH';
  grid_types: string[];
  max_battery_qty: number;
  battery_ports: number;
  battery_voltage_min_v: number | null;
  battery_voltage_max_v: number | null;
  battery_current_max_a: number | null;
  flags: InverterFlag[];
  pv_oversizing_percent: number;
  image_url: string | null;
  documents: ProductDocument[];
}

interface BatteryRow {
  id: string;
  model: string;
  capacity_kwh: number;
  topology: BatteryTopology;
  standard_power_kw: number | null;
  peak_power_kw: number | null;
  min_soc_percent: number;
  nominal_voltage_v: number | null;
  voltage_min_v: number | null;
  voltage_max_v: number | null;
  recommended_current_a: number | null;
  max_current_a: number | null;
  flags: BatteryFlag[];
  max_association_qty: number;
  image_url: string | null;
  documents: ProductDocument[];
}

interface AccessoryRow {
  id: string;
  model: string;
  description: string | null;
  active: boolean;
  image_url: string | null;
  documents: ProductDocument[];
}

interface LoadCatalogRow {
  id: string;
  name_pt: string;
  name_en: string;
  name_zh: string;
  power_w: number;
  category: string;
  ip_in_ratio: number;
}

interface AccessoryRuleRow {
  id: string;
  accessory_id: string;
  name: string;
  inclusion: Inclusion;
  trigger_metric: TriggerMetric;
  min_quantity: number;
  inverter_model: string | null;
  inverter_models: string[] | null;
  battery_model: string | null;
  grid_topology: GridTopology | null;
  battery_topology: BatteryTopology | null;
  quantity_per_match: number;
  comment: string | null;
  active: boolean;
  accessories?: { model: string } | null;
}

interface EssBatteryConfig {
  battery_model: string;
  battery_topology: BatteryTopology;
  min_battery_qty: number;
  max_battery_qty: number;
}

interface EssCompatibilityRuleRow {
  id: string;
  inverter_model: string;
  battery_model: string;
  battery_topology: BatteryTopology | null;
  grid_topology: GridTopology | null;
  max_parallel_inverters: number;
  min_battery_qty: number;
  max_battery_qty: number;
  battery_configs: EssBatteryConfig[];
  comment: string | null;
  active: boolean;
  created_at: string;
}

interface SolutionRow {
  id: string;
  source_file: string;
  solution_code: string;
  schema_version: string;
  inverter_model: string;
  inverter_quantity: number;
  battery_ports_used: number;
  nominal_voltage_v: number;
  rated_power_w: number;
  peak_power_w: number;
  grid_topology: GridTopology;
  battery_model: string;
  battery_topology: BatteryTopology;
  battery_quantity: number;
  battery_power_w: number;
  available_energy_wh: number;
  accessories: { model: string | null; quantity: number }[];
  comments: string[];
  raw_solution: unknown;
  active: boolean;
}

type GeneratedSolutionPayload = Omit<SolutionRow, 'id'>;

async function fetchApprovedSolutions(supabase: ReturnType<typeof createClient>) {
  const pageSize = 1000;
  const rows: SolutionRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('approved_solutions')
      .select('*')
      .order('rated_power_w', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { data: rows, error };

    const page = (data ?? []) as SolutionRow[];
    rows.push(...page);

    if (page.length < pageSize) return { data: rows, error: null };
  }
}

interface UserProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: 'user' | 'admin';
  company_name: string | null;
  created_at: string;
  updated_at: string;
}

interface SimulationRow {
  id: string;
  user_id: string | null;
  project_name: string | null;
  client_name: string | null;
  topology: string | null;
  grid_type: string | null;
  peak_w: number;
  daily_kwh: number;
  loads: { name?: string; powerW?: number; qty?: number; hoursPerDay?: number }[];
  inverter_model: string | null;
  battery_model: string | null;
  accessories: string[];
  solution_code: string | null;
  created_at: string;
}

type AdminLogEntity = 'inverter' | 'battery' | 'accessory' | 'solution' | 'rule' | 'load_catalog_item';
type AdminLogAction = 'create' | 'update' | 'delete' | 'deactivate';

interface AdminActivityLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  entity_type: AdminLogEntity;
  action: AdminLogAction;
  target_id: string | null;
  target_label: string;
  summary: string;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
}

const tabs: { key: TabKey; label: string; icon: typeof Database }[] = [
  { key: 'metrics', label: 'Indicadores', icon: BarChart3 },
  { key: 'batteries', label: 'Baterias', icon: Battery },
  { key: 'inverters', label: 'Inversores', icon: Zap },
  { key: 'accessories', label: 'Acessórios', icon: Cable },
  { key: 'loads', label: 'Cargas', icon: Plug },
  { key: 'rules', label: 'Regras', icon: CircleHelp },
  { key: 'solutions', label: 'Combinações', icon: Boxes },
  { key: 'users', label: 'Usuários', icon: Users },
  { key: 'logs', label: 'Logs', icon: FileClock },
];

const emptyInverter: Partial<InverterRow> = {
  model: '',
  power_kw: 0,
  standard_power_kva: 0,
  peak_power_kva: 0,
  phases: 1,
  topology: 'HV',
  grid_types: [],
  max_battery_qty: 1,
  battery_ports: 1,
  battery_voltage_min_v: null,
  battery_voltage_max_v: null,
  battery_current_max_a: null,
  flags: [],
  pv_oversizing_percent: 100,
  image_url: '',
  documents: [],
};

const emptyBattery: Partial<BatteryRow> = {
  model: '',
  capacity_kwh: 0,
  topology: 'HV',
  standard_power_kw: null,
  peak_power_kw: null,
  min_soc_percent: 10,
  nominal_voltage_v: null,
  voltage_min_v: null,
  voltage_max_v: null,
  recommended_current_a: null,
  max_current_a: null,
  flags: [],
  max_association_qty: 15,
  image_url: '',
  documents: [],
};

const emptyAccessory: Partial<AccessoryRow> = {
  model: '',
  description: '',
  active: true,
  image_url: '',
  documents: [],
};

const emptyLoadCatalogItem: Partial<LoadCatalogRow> = {
  name_pt: '',
  name_en: '',
  name_zh: '',
  power_w: 0,
  category: '',
  ip_in_ratio: 1,
};

const emptyRule: Partial<AccessoryRuleRow> = {
  accessory_id: '',
  name: '',
  inclusion: 'required',
  trigger_metric: 'per_solution',
  min_quantity: 1,
  inverter_model: null,
  inverter_models: [],
  battery_model: null,
  grid_topology: null,
  battery_topology: null,
  quantity_per_match: 1,
  comment: '',
  active: true,
};

const emptyEssRule: Partial<EssCompatibilityRuleRow> = {
  inverter_model: '',
  battery_model: '',
  battery_topology: null,
  grid_topology: null,
  max_parallel_inverters: 1,
  min_battery_qty: 1,
  max_battery_qty: 2,
  battery_configs: [],
  comment: '',
  active: true,
};

const emptySolution: Partial<SolutionRow> = {
  source_file: 'admin',
  solution_code: '',
  schema_version: '1.0',
  inverter_model: '',
  inverter_quantity: 1,
  battery_ports_used: 1,
  nominal_voltage_v: 220,
  rated_power_w: 0,
  peak_power_w: 0,
  grid_topology: '1p_220V',
  battery_model: '',
  battery_topology: 'HV',
  battery_quantity: 1,
  battery_power_w: 0,
  available_energy_wh: 0,
  accessories: [],
  comments: [],
  raw_solution: {},
  active: true,
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNumber(value: unknown, min: number, max: number, fallback = min) {
  const parsed = toNumber(value, fallback);
  return Math.min(max, Math.max(min, parsed));
}

function parseJson<T>(value: string, fallback: T): T {
  if (!value.trim()) return fallback;
  return JSON.parse(value) as T;
}

function normalizeInverterGridType(value: string): InverterGridType | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (inverterGridTypeLabels.has(trimmed as InverterGridType)) return trimmed as InverterGridType;
  return legacyInverterGridTypeMap[trimmed] ?? null;
}

function normalizeInverterGridTypes(value: unknown): InverterGridType[] {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  return Array.from(
    new Set(
      values
        .map((item) => normalizeInverterGridType(String(item)))
        .filter((item): item is InverterGridType => Boolean(item))
    )
  );
}

function formatInverterGridType(value: string) {
  const normalized = normalizeInverterGridType(value);
  return normalized ? inverterGridTypeLabels.get(normalized) ?? value : value;
}

function phasesFromInverterGridTypes(value: unknown, fallback = 1) {
  const gridTypes = normalizeInverterGridTypes(value);
  if (gridTypes.some((gridType) => gridType.startsWith('3P_'))) return 3;
  if (gridTypes.some((gridType) => gridType.startsWith('2P_'))) return 2;
  if (gridTypes.some((gridType) => gridType.startsWith('1P_'))) return 1;
  const fallbackValue = Number(fallback);
  return Math.min(3, Math.max(1, Number.isFinite(fallbackValue) ? fallbackValue : 1));
}

function normalizeInverterFlags(value: unknown): InverterFlag[] {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  return Array.from(
    new Set(
      values
        .map((item) => String(item).trim())
        .filter((item): item is InverterFlag => inverterFlagLabels.has(item as InverterFlag))
    )
  );
}

function formatInverterFlags(value: unknown) {
  return normalizeInverterFlags(value)
    .map((flag) => inverterFlagLabels.get(flag) ?? flag)
    .join(', ');
}

function normalizeBatteryFlags(value: unknown): BatteryFlag[] {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  return Array.from(
    new Set(
      values
        .map((item) => String(item).trim())
        .filter((item): item is BatteryFlag => batteryFlagLabels.has(item as BatteryFlag))
    )
  );
}

function formatBatteryFlags(value: unknown) {
  return normalizeBatteryFlags(value)
    .map((flag) => batteryFlagLabels.get(flag) ?? flag)
    .join(', ');
}

function formatTriggerMetric(value: TriggerMetric) {
  if (value === 'per_solution') return 'Por solução';
  if (value === 'inverter_quantity') return 'Qtd. inversores';
  if (value === 'battery_quantity') return 'Qtd. baterias';
  return 'Portas de bateria';
}

function accessoryRuleInverterModels(rule: Partial<AccessoryRuleRow>) {
  if (Array.isArray(rule.inverter_models) && rule.inverter_models.length > 0) {
    return rule.inverter_models.filter(Boolean);
  }
  return rule.inverter_model ? [rule.inverter_model] : [];
}

function batteryAssociationMax(battery: BatteryRow | undefined) {
  return clampNumber(battery?.max_association_qty, 1, 15, 15);
}

function normalizeEssBatteryConfigs(rule: Partial<EssCompatibilityRuleRow>, batteries: BatteryRow[] = []): EssBatteryConfig[] {
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

function inverterSupportedBatteryTopologies(inverter: InverterRow | undefined): BatteryTopology[] {
  if (!inverter) return [];
  if (inverter.topology === 'BOTH') return ['HV', 'LV'];
  return [inverter.topology];
}

function generatedGridToApprovedTopology(gridType: InverterGridType): Extract<GridTopology, '1p_220V' | '3p_220V' | '3p_380V'> {
  if (gridType === '3P_220V') return '3p_220V';
  if (gridType === '3P_380V') return '3p_380V';
  return '1p_220V';
}

function nominalVoltageForGrid(gridType: InverterGridType) {
  return gridType === '3P_380V' ? 380 : 220;
}

function slugPart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function solutionRuleMetricValue(solution: Pick<SolutionRow, 'inverter_quantity' | 'battery_quantity' | 'battery_ports_used'>, metric: TriggerMetric) {
  if (metric === 'per_solution') return 1;
  if (metric === 'inverter_quantity') return solution.inverter_quantity;
  if (metric === 'battery_quantity') return solution.battery_quantity;
  return solution.battery_ports_used;
}

function accessoryRuleMatches(
  solution: GeneratedSolutionPayload,
  rule: AccessoryRuleRow,
  generatedGridType?: InverterGridType
) {
  if (!rule.active) return false;
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

function applyAccessoryRules(
  solution: GeneratedSolutionPayload,
  rules: AccessoryRuleRow[],
  generatedGridType?: InverterGridType
) {
  const accessories = new Map<string, number>();
  const comments: string[] = [];

  for (const rule of rules) {
    if (!rule.accessories?.model || !accessoryRuleMatches(solution, rule, generatedGridType)) continue;
    const currentQty = accessories.get(rule.accessories.model) ?? 0;
    accessories.set(rule.accessories.model, currentQty + rule.quantity_per_match);
    if (rule.comment) comments.push(rule.comment);
    if (rule.inclusion === 'optional') comments.push(`Acessório opcional: ${rule.accessories.model}.`);
  }

  return {
    accessories: Array.from(accessories.entries()).map(([model, quantity]) => ({ model, quantity })),
    comments,
  };
}

function buildRuleGeneratedSolutions({
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

function selectClasses(className = '') {
  return `h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${className}`;
}

function textareaClasses(className = '') {
  return `min-h-20 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${className}`;
}

function sanitizePathPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'produto';
}

export function AdminPanel() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<TabKey>('metrics');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inverters, setInverters] = useState<InverterRow[]>([]);
  const [batteries, setBatteries] = useState<BatteryRow[]>([]);
  const [accessories, setAccessories] = useState<AccessoryRow[]>([]);
  const [loadCatalogItems, setLoadCatalogItems] = useState<LoadCatalogRow[]>([]);
  const [rules, setRules] = useState<AccessoryRuleRow[]>([]);
  const [essRules, setEssRules] = useState<EssCompatibilityRuleRow[]>([]);
  const [solutions, setSolutions] = useState<SolutionRow[]>([]);
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [simulations, setSimulations] = useState<SimulationRow[]>([]);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLogRow[]>([]);

  const [inverterForm, setInverterForm] = useState<Partial<InverterRow>>(emptyInverter);
  const [batteryForm, setBatteryForm] = useState<Partial<BatteryRow>>(emptyBattery);
  const [accessoryForm, setAccessoryForm] = useState<Partial<AccessoryRow>>(emptyAccessory);
  const [loadCatalogForm, setLoadCatalogForm] = useState<Partial<LoadCatalogRow>>(emptyLoadCatalogItem);
  const [ruleForm, setRuleForm] = useState<Partial<AccessoryRuleRow>>(emptyRule);
  const [essRuleForm, setEssRuleForm] = useState<Partial<EssCompatibilityRuleRow>>(emptyEssRule);
  const [solutionForm, setSolutionForm] = useState<Partial<SolutionRow>>(emptySolution);
  const [solutionAccessories, setSolutionAccessories] = useState<{ model: string | null; quantity: number }[]>([]);
  const [solutionComments, setSolutionComments] = useState<string[]>([]);
  const [solutionQuery, setSolutionQuery] = useState('');

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(timer);
  }, [status]);

  async function loadData(showSkeleton = true) {
    if (showSkeleton) setLoading(true);
    setError(null);

    const [
      inverterResult,
      batteryResult,
      accessoryResult,
      loadCatalogResult,
      ruleResult,
      essRuleResult,
      solutionResult,
      userResult,
      simulationResult,
      activityLogResult,
    ] = await Promise.all([
      supabase.from('inverters').select('*').order('model'),
      supabase.from('batteries').select('*').order('model'),
      supabase.from('accessories').select('*').order('model'),
      supabase.from('load_catalog').select('*').order('category').order('name_pt'),
      supabase
        .from('accessory_rules')
        .select('*, accessories (model)')
        .order('created_at', { ascending: false }),
      supabase
        .from('ess_compatibility_rules')
        .select('*')
        .order('created_at', { ascending: false }),
      fetchApprovedSolutions(supabase),
      supabase
        .from('profiles')
        .select('id, email, full_name, phone, role, company_name, created_at, updated_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('app_simulations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('admin_activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150),
    ]);

    const firstError =
      inverterResult.error ??
      batteryResult.error ??
      accessoryResult.error ??
      loadCatalogResult.error ??
      ruleResult.error ??
      essRuleResult.error ??
      solutionResult.error ??
      userResult.error ??
      simulationResult.error ??
      activityLogResult.error;

    if (firstError) {
      setError(firstError.message);
    } else {
      setInverters((inverterResult.data ?? []) as InverterRow[]);
      setBatteries((batteryResult.data ?? []) as BatteryRow[]);
      setAccessories((accessoryResult.data ?? []) as AccessoryRow[]);
      setLoadCatalogItems((loadCatalogResult.data ?? []) as LoadCatalogRow[]);
      setRules((ruleResult.data ?? []) as AccessoryRuleRow[]);
      setEssRules((essRuleResult.data ?? []) as EssCompatibilityRuleRow[]);
      setSolutions((solutionResult.data ?? []) as SolutionRow[]);
      setUsers((userResult.data ?? []) as UserProfileRow[]);
      setSimulations((simulationResult.data ?? []) as SimulationRow[]);
      setActivityLogs((activityLogResult.data ?? []) as AdminActivityLogRow[]);
    }

    if (showSkeleton) setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredSolutions = solutions.filter((solution) => {
    const text = `${solution.solution_code} ${solution.inverter_model} ${solution.battery_model} ${solution.grid_topology}`.toLowerCase();
    return text.includes(solutionQuery.toLowerCase());
  });

  function setSuccess(message: string) {
    setStatus(message);
    setError(null);
  }

  function setFailure(message: string) {
    setError(message);
    setStatus(null);
  }

  async function recordActivityLog({
    entityType,
    action,
    targetId,
    targetLabel,
    summary,
    beforeData,
    afterData,
  }: {
    entityType: AdminLogEntity;
    action: AdminLogAction;
    targetId?: string | null;
    targetLabel: string;
    summary: string;
    beforeData?: unknown;
    afterData?: unknown;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: logError } = await supabase.from('admin_activity_logs').insert({
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      entity_type: entityType,
      action,
      target_id: targetId ?? null,
      target_label: targetLabel || 'Registro sem nome',
      summary,
      before_data: beforeData ?? null,
      after_data: afterData ?? null,
    });

    if (logError) setFailure(`Registro salvo, mas o log falhou: ${logError.message}`);
  }

  async function uploadProductAsset(
    table: 'inverters' | 'batteries' | 'accessories',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) {
    const extension = file.name.split('.').pop();
    const path = `${table}/${sanitizePathPart(model || 'produto')}/${kind}/${crypto.randomUUID()}${
      extension ? `.${extension}` : ''
    }`;

    const { error: uploadError } = await supabase.storage
      .from('product-assets')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from('product-assets').getPublicUrl(path);
    return data.publicUrl;
  }

  function editSolution(solution: SolutionRow) {
    setSolutionForm(solution);
    setSolutionAccessories(solution.accessories ?? []);
    setSolutionComments(solution.comments ?? []);
  }

  function resetSolution() {
    setSolutionForm(emptySolution);
    setSolutionAccessories([]);
    setSolutionComments([]);
  }

  async function saveInverter(afterPersist?: () => void) {
    setSaving(true);
    setStatus(inverterForm.id ? 'Atualizando inversor...' : 'Salvando inversor...');
    setError(null);
    const action: AdminLogAction = inverterForm.id ? 'update' : 'create';
    const beforeData = inverterForm.id ? inverters.find((row) => row.id === inverterForm.id) : null;
    const gridTypes = normalizeInverterGridTypes(inverterForm.grid_types);
    const payload = {
      model: inverterForm.model?.trim(),
      power_kw: toNumber(inverterForm.power_kw),
      standard_power_kva: toNumber(inverterForm.standard_power_kva),
      peak_power_kva: toNumber(inverterForm.peak_power_kva),
      phases: phasesFromInverterGridTypes(gridTypes, inverterForm.phases),
      topology: inverterForm.topology,
      grid_types: gridTypes,
      max_battery_qty: toNumber(inverterForm.max_battery_qty, 1),
      battery_ports: clampNumber(inverterForm.battery_ports, 1, 2, 1),
      battery_voltage_min_v: toNullableNumber(inverterForm.battery_voltage_min_v),
      battery_voltage_max_v: toNullableNumber(inverterForm.battery_voltage_max_v),
      battery_current_max_a: toNullableNumber(inverterForm.battery_current_max_a),
      flags: normalizeInverterFlags(inverterForm.flags),
      pv_oversizing_percent: inverterForm.pv_oversizing_percent === 50 ? 50 : 100,
      image_url: inverterForm.image_url?.trim() || null,
      documents: inverterForm.documents ?? [],
    };

    const request = inverterForm.id
      ? supabase.from('inverters').update(payload).eq('id', inverterForm.id)
      : supabase.from('inverters').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    afterPersist?.();
    await recordActivityLog({
      entityType: 'inverter',
      action,
      targetId: inverterForm.id ?? null,
      targetLabel: payload.model || 'Inversor sem modelo',
      summary: `${action === 'create' ? 'Criou' : 'Atualizou'} o inversor ${payload.model || 'sem modelo'}.`,
      beforeData,
      afterData: payload,
    });
    setInverterForm(emptyInverter);
    setSuccess('Inversor salvo.');
    await loadData();
  }

  async function saveBattery(afterPersist?: () => void) {
    setSaving(true);
    setStatus(batteryForm.id ? 'Atualizando bateria...' : 'Salvando bateria...');
    setError(null);
    const action: AdminLogAction = batteryForm.id ? 'update' : 'create';
    const beforeData = batteryForm.id ? batteries.find((row) => row.id === batteryForm.id) : null;
    const payload = {
      model: batteryForm.model?.trim(),
      capacity_kwh: toNumber(batteryForm.capacity_kwh),
      topology: batteryForm.topology,
      standard_power_kw:
        batteryForm.nominal_voltage_v != null && batteryForm.recommended_current_a != null
          ? (batteryForm.nominal_voltage_v * batteryForm.recommended_current_a) / 1000
          : null,
      peak_power_kw:
        batteryForm.nominal_voltage_v != null && batteryForm.max_current_a != null
          ? (batteryForm.nominal_voltage_v * batteryForm.max_current_a) / 1000
          : null,
      min_soc_percent: batteryForm.min_soc_percent === 5 ? 5 : 10,
      nominal_voltage_v: toNullableNumber(batteryForm.nominal_voltage_v),
      voltage_min_v: toNullableNumber(batteryForm.voltage_min_v),
      voltage_max_v: toNullableNumber(batteryForm.voltage_max_v),
      recommended_current_a: toNullableNumber(batteryForm.recommended_current_a),
      max_current_a: toNullableNumber(batteryForm.max_current_a),
      flags: normalizeBatteryFlags(batteryForm.flags),
      max_association_qty: clampNumber(batteryForm.max_association_qty, 1, 15, 15),
      image_url: batteryForm.image_url?.trim() || null,
      documents: batteryForm.documents ?? [],
    };

    const request = batteryForm.id
      ? supabase.from('batteries').update(payload).eq('id', batteryForm.id)
      : supabase.from('batteries').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    afterPersist?.();
    await recordActivityLog({
      entityType: 'battery',
      action,
      targetId: batteryForm.id ?? null,
      targetLabel: payload.model || 'Bateria sem modelo',
      summary: `${action === 'create' ? 'Criou' : 'Atualizou'} a bateria ${payload.model || 'sem modelo'}.`,
      beforeData,
      afterData: payload,
    });
    setBatteryForm(emptyBattery);
    setSuccess('Bateria salva.');
    await loadData();
  }

  async function saveAccessory(afterPersist?: () => void) {
    setSaving(true);
    setStatus(accessoryForm.id ? 'Atualizando acessório...' : 'Salvando acessório...');
    setError(null);
    const action: AdminLogAction = accessoryForm.id ? 'update' : 'create';
    const beforeData = accessoryForm.id ? accessories.find((row) => row.id === accessoryForm.id) : null;
    const payload = {
      model: accessoryForm.model?.trim(),
      description: accessoryForm.description?.trim() || null,
      active: accessoryForm.active ?? true,
      image_url: accessoryForm.image_url?.trim() || null,
      documents: accessoryForm.documents ?? [],
    };

    const request = accessoryForm.id
      ? supabase.from('accessories').update(payload).eq('id', accessoryForm.id)
      : supabase.from('accessories').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    afterPersist?.();
    await recordActivityLog({
      entityType: 'accessory',
      action,
      targetId: accessoryForm.id ?? null,
      targetLabel: payload.model || 'Acessório sem modelo',
      summary: `${action === 'create' ? 'Criou' : 'Atualizou'} o acessório ${payload.model || 'sem modelo'}.`,
      beforeData,
      afterData: payload,
    });
    setAccessoryForm(emptyAccessory);
    setSuccess('Acessório salvo.');
    await loadData();
  }

  async function saveLoadCatalogItem(afterPersist?: () => void) {
    setSaving(true);
    setStatus(loadCatalogForm.id ? 'Atualizando carga...' : 'Salvando carga...');
    setError(null);
    const action: AdminLogAction = loadCatalogForm.id ? 'update' : 'create';
    const beforeData = loadCatalogForm.id
      ? loadCatalogItems.find((row) => row.id === loadCatalogForm.id)
      : null;
    const payload = {
      name_pt: loadCatalogForm.name_pt?.trim(),
      name_en: loadCatalogForm.name_en?.trim() || loadCatalogForm.name_pt?.trim(),
      name_zh: loadCatalogForm.name_zh?.trim() || loadCatalogForm.name_pt?.trim(),
      power_w: toNumber(loadCatalogForm.power_w),
      category: loadCatalogForm.category?.trim() || 'Outros',
      ip_in_ratio: Math.max(1, toNumber(loadCatalogForm.ip_in_ratio, 1)),
    };

    const request = loadCatalogForm.id
      ? supabase.from('load_catalog').update(payload).eq('id', loadCatalogForm.id)
      : supabase.from('load_catalog').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    afterPersist?.();
    await recordActivityLog({
      entityType: 'load_catalog_item',
      action,
      targetId: loadCatalogForm.id ?? null,
      targetLabel: payload.name_pt || 'Carga sem nome',
      summary: `${action === 'create' ? 'Criou' : 'Atualizou'} a carga ${payload.name_pt || 'sem nome'}.`,
      beforeData,
      afterData: payload,
    });
    setLoadCatalogForm(emptyLoadCatalogItem);
    setSuccess('Carga salva.');
    await loadData();
  }

  async function saveRule(afterPersist?: () => void) {
    setSaving(true);
    setStatus(ruleForm.id ? 'Atualizando regra...' : 'Salvando regra...');
    setError(null);
    const action: AdminLogAction = ruleForm.id ? 'update' : 'create';
    const beforeData = ruleForm.id ? rules.find((row) => row.id === ruleForm.id) : null;
    const inverterModels = accessoryRuleInverterModels(ruleForm);
    const payload = {
      accessory_id: ruleForm.accessory_id,
      name: ruleForm.name?.trim(),
      inclusion: ruleForm.inclusion,
      trigger_metric: ruleForm.trigger_metric,
      min_quantity: toNumber(ruleForm.min_quantity, 1),
      inverter_model: inverterModels[0] ?? null,
      inverter_models: inverterModels,
      battery_model: ruleForm.battery_model || null,
      grid_topology: ruleForm.grid_topology ? normalizeInverterGridType(ruleForm.grid_topology) : null,
      battery_topology: ruleForm.battery_topology || null,
      quantity_per_match: toNumber(ruleForm.quantity_per_match, 1),
      comment: ruleForm.comment?.trim() || null,
      active: ruleForm.active ?? true,
    };

    const request = ruleForm.id
      ? supabase.from('accessory_rules').update(payload).eq('id', ruleForm.id)
      : supabase.from('accessory_rules').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    afterPersist?.();
    await recordActivityLog({
      entityType: 'rule',
      action,
      targetId: ruleForm.id ?? null,
      targetLabel: payload.name || 'Regra sem nome',
      summary: `${action === 'create' ? 'Criou' : 'Atualizou'} a regra ${payload.name || 'sem nome'}.`,
      beforeData,
      afterData: payload,
    });
    setRuleForm(emptyRule);
    setSuccess('Regra salva.');
    await loadData();
  }

  async function saveEssRule(afterPersist?: () => void) {
    setSaving(true);
    setStatus(essRuleForm.id ? 'Atualizando regra ESS...' : 'Salvando regra ESS...');
    setError(null);
    const action: AdminLogAction = essRuleForm.id ? 'update' : 'create';
    const beforeData = essRuleForm.id ? essRules.find((row) => row.id === essRuleForm.id) : null;
    const batteryConfigs = normalizeEssBatteryConfigs(essRuleForm, batteries);
    const primaryBatteryConfig = batteryConfigs[0];
    const payload = {
      inverter_model: essRuleForm.inverter_model?.trim(),
      battery_model: primaryBatteryConfig?.battery_model ?? null,
      battery_topology: primaryBatteryConfig?.battery_topology ?? null,
      grid_topology: null,
      max_parallel_inverters: clampNumber(essRuleForm.max_parallel_inverters, 1, 10, 1),
      min_battery_qty: primaryBatteryConfig?.min_battery_qty ?? 1,
      max_battery_qty: primaryBatteryConfig?.max_battery_qty ?? 2,
      battery_configs: batteryConfigs,
      comment: essRuleForm.comment?.trim() || null,
      active: essRuleForm.active ?? true,
    };

    const request = essRuleForm.id
      ? supabase.from('ess_compatibility_rules').update(payload).eq('id', essRuleForm.id)
      : supabase.from('ess_compatibility_rules').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    afterPersist?.();
    await recordActivityLog({
      entityType: 'rule',
      action,
      targetId: essRuleForm.id ?? null,
      targetLabel: `${payload.inverter_model || '-'} + ${payload.battery_model || '-'}`,
      summary: `${action === 'create' ? 'Criou' : 'Atualizou'} regra ESS para ${
        payload.inverter_model || '-'
      } com ${payload.battery_model || '-'}.`,
      beforeData,
      afterData: payload,
    });
    setEssRuleForm(emptyEssRule);
    setSuccess('Regra ESS salva.');
    await loadData();
  }

  async function saveSolution(afterPersist?: () => void) {
    setSaving(true);
    setStatus(solutionForm.id ? 'Atualizando combinação...' : 'Salvando combinação...');
    setError(null);
    const action: AdminLogAction = solutionForm.id ? 'update' : 'create';
    const beforeData = solutionForm.id ? solutions.find((row) => row.id === solutionForm.id) : null;

    try {
      const accessoriesJson = solutionAccessories.filter((a) => a.model?.trim());
      const commentsJson = solutionComments.filter((c) => c.trim());
      const rawSolution = {
        id: solutionForm.solution_code,
        inverter: {
          model: solutionForm.inverter_model,
          quantity: toNumber(solutionForm.inverter_quantity, 1),
          batteryPortsUsed: toNumber(solutionForm.battery_ports_used, 1),
          nominalVoltageV: toNumber(solutionForm.nominal_voltage_v, 220),
          ratedPowerW: toNumber(solutionForm.rated_power_w),
          peakPowerW: toNumber(solutionForm.peak_power_w),
          topology: solutionForm.grid_topology,
        },
        battery: {
          model: solutionForm.battery_model,
          quantity: toNumber(solutionForm.battery_quantity, 1),
          powerW: toNumber(solutionForm.battery_power_w),
          availableEnergyWh: toNumber(solutionForm.available_energy_wh),
        },
        accessories: accessoriesJson,
        comments: commentsJson,
      };

      const payload = {
        source_file: solutionForm.source_file?.trim() || 'admin',
        solution_code: solutionForm.solution_code?.trim(),
        schema_version: solutionForm.schema_version || '1.0',
        inverter_model: solutionForm.inverter_model?.trim(),
        inverter_quantity: toNumber(solutionForm.inverter_quantity, 1),
        battery_ports_used: toNumber(solutionForm.battery_ports_used, 1),
        nominal_voltage_v: toNumber(solutionForm.nominal_voltage_v, 220),
        rated_power_w: toNumber(solutionForm.rated_power_w),
        peak_power_w: toNumber(solutionForm.peak_power_w),
        grid_topology: solutionForm.grid_topology,
        battery_model: solutionForm.battery_model?.trim(),
        battery_topology: solutionForm.battery_topology,
        battery_quantity: toNumber(solutionForm.battery_quantity, 1),
        battery_power_w: toNumber(solutionForm.battery_power_w),
        available_energy_wh: toNumber(solutionForm.available_energy_wh),
        accessories: accessoriesJson,
        comments: commentsJson,
        raw_solution: rawSolution,
        active: solutionForm.active ?? true,
      };

      const request = solutionForm.id
        ? supabase.from('approved_solutions').update(payload).eq('id', solutionForm.id)
        : supabase.from('approved_solutions').insert(payload);
      const { error: saveError } = await request;

      if (saveError) return setFailure(saveError.message);
      afterPersist?.();
      await recordActivityLog({
        entityType: 'solution',
        action,
        targetId: solutionForm.id ?? null,
        targetLabel: payload.solution_code || 'Combinação sem código',
        summary: `${action === 'create' ? 'Criou' : 'Atualizou'} a combinação ${
          payload.solution_code || 'sem código'
        }.`,
        beforeData,
        afterData: payload,
      });
      resetSolution();
      setSuccess('Combinação salva.');
      await loadData();
    } catch (jsonError) {
      setFailure(jsonError instanceof Error ? jsonError.message : 'JSON inválido.');
    } finally {
      setSaving(false);
    }
  }

  async function applyGeneratedSolutions(generatedSolutions: GeneratedSolutionPayload[], afterApply?: () => void, cleanupStale = false) {
    if (generatedSolutions.length === 0) {
      setFailure('Nenhuma combinação para gerar.');
      return;
    }

    setSaving(true);
    setStatus(`Aprovando ${generatedSolutions.length} combinação${generatedSolutions.length > 1 ? 'ões' : ''}...`);
    setError(null);

    const { error: upsertError } = await supabase
      .from('approved_solutions')
      .upsert(generatedSolutions, { onConflict: 'solution_code' });

    if (upsertError) {
      setSaving(false);
      return setFailure(upsertError.message);
    }

    if (cleanupStale) {
      const newCodes = new Set(generatedSolutions.map((s) => s.solution_code));
      // Only clean up stale rows for the inverter+battery pairs actually present in this
      // batch, so combinations for batteries/inverters left out of the current generation
      // (e.g. by the filter chips) are never touched.
      const touchedPairs = new Set(
        generatedSolutions.map((s) => `${s.inverter_model}::${s.battery_model}`)
      );
      const { data: existingGenerated } = await supabase
        .from('approved_solutions')
        .select('id, solution_code, inverter_model, battery_model')
        .eq('source_file', 'generated-rules');
      const staleIds = (existingGenerated ?? [])
        .filter(
          (s) =>
            touchedPairs.has(`${s.inverter_model}::${s.battery_model}`) &&
            !newCodes.has(s.solution_code)
        )
        .map((s) => s.id);
      if (staleIds.length > 0) {
        await supabase.from('approved_solutions').delete().in('id', staleIds);
      }
    }

    setSaving(false);
    afterApply?.();

    await recordActivityLog({
      entityType: 'solution',
      action: 'update',
      targetId: null,
      targetLabel: 'Combinações geradas por regras',
      summary: `Gerou/atualizou ${generatedSolutions.length} combinações a partir das regras.`,
      beforeData: null,
      afterData: {
        count: generatedSolutions.length,
        source_file: 'generated-rules',
      },
    });

    setSuccess(`${generatedSolutions.length} combinação${generatedSolutions.length > 1 ? 'ões' : ''} gerada${generatedSolutions.length > 1 ? 's' : ''}/atualizada${generatedSolutions.length > 1 ? 's' : ''}.`);
    await loadData();
  }

  function getLogTarget(table: string, id: string) {
    if (table === 'inverters') {
      const row = inverters.find((item) => item.id === id);
      return { entityType: 'inverter' as const, label: row?.model ?? 'Inversor removido', beforeData: row };
    }
    if (table === 'batteries') {
      const row = batteries.find((item) => item.id === id);
      return { entityType: 'battery' as const, label: row?.model ?? 'Bateria removida', beforeData: row };
    }
    if (table === 'accessories') {
      const row = accessories.find((item) => item.id === id);
      return { entityType: 'accessory' as const, label: row?.model ?? 'Acessório removido', beforeData: row };
    }
    if (table === 'load_catalog') {
      const row = loadCatalogItems.find((item) => item.id === id);
      return { entityType: 'load_catalog_item' as const, label: row?.name_pt ?? 'Carga removida', beforeData: row };
    }
    if (table === 'approved_solutions') {
      const row = solutions.find((item) => item.id === id);
      return { entityType: 'solution' as const, label: row?.solution_code ?? 'Combinação removida', beforeData: row };
    }
    if (table === 'ess_compatibility_rules') {
      const row = essRules.find((item) => item.id === id);
      return {
        entityType: 'rule' as const,
        label: row ? `${row.inverter_model} + ${row.battery_model}` : 'Regra ESS removida',
        beforeData: row,
      };
    }
    const row = rules.find((item) => item.id === id);
    return { entityType: 'rule' as const, label: row?.name ?? 'Regra removida', beforeData: row };
  }

  async function removeRow(table: string, id: string, soft = false) {
    setSaving(true);
    setRemovingIds((current) => new Set(current).add(id));
    setStatus(soft ? 'Inativando registro...' : 'Removendo registro...');
    setError(null);
    const logTarget = getLogTarget(table, id);
    const request = soft
      ? supabase.from(table).update({ active: false }).eq('id', id)
      : supabase.from(table).delete().eq('id', id);
    const { error: removeError } = await request;
    setSaving(false);

    if (removeError) {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      return setFailure(removeError.message);
    }
    await recordActivityLog({
      entityType: logTarget.entityType,
      action: soft ? 'deactivate' : 'delete',
      targetId: id,
      targetLabel: logTarget.label,
      summary: `${soft ? 'Inativou' : 'Removeu'} ${logTarget.label}.`,
      beforeData: logTarget.beforeData,
      afterData:
        soft && logTarget.beforeData && typeof logTarget.beforeData === 'object'
          ? { ...logTarget.beforeData, active: false }
          : null,
    });
    setSuccess(`${soft ? 'Registro inativado' : 'Registro removido'} com sucesso.`);
    await loadData(false);
    setRemovingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  async function sendPasswordReset(email: string) {
    if (!email) return;
    setSaving(true);
    setStatus('Enviando email de redefinição...');
    setError(null);
    const origin = window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/pt/reset-password`,
    });
    setSaving(false);

    if (resetError) return setFailure(resetError.message);
    setSuccess(`Email de redefinição enviado para ${email}.`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/pt/login');
    router.refresh();
  }

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  }

  return (
    <main className="h-screen overflow-hidden bg-background">
      <div className="mx-auto grid h-full w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-4 px-4 py-5">
        <header className="z-20 flex flex-col gap-3 border-b bg-background px-1 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Administração de soluções</h1>
            <p className="text-sm text-muted-foreground">
              Cadastre produtos, combinações aprovadas e regras automáticas de acessórios.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => loadData()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="hidden min-h-0 gap-2 overflow-y-auto rounded-lg border bg-card p-2 lg:flex lg:flex-col">
            <div className="flex flex-1 flex-col gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Button
                    key={tab.key}
                    type="button"
                    aria-current={activeTab === tab.key ? 'page' : undefined}
                    variant={activeTab === tab.key ? 'default' : 'ghost'}
                    className="justify-start"
                    onClick={() => selectTab(tab.key)}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </Button>
                );
              })}
            </div>
            <Separator />
            <Button variant="outline" className="justify-start" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </nav>

          <section className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1">
            {(status || error) && (
              <div
                role={error ? 'alert' : 'status'}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  error ? 'border-destructive/40 text-destructive' : 'border-emerald-300 text-emerald-700'
                }`}
              >
                {error ?? status}
              </div>
            )}

            {loading ? (
              <AdminLoadingSkeleton />
            ) : (
              <>
                {activeTab === 'metrics' && <MetricsPanel simulations={simulations} users={users} />}

                {activeTab === 'users' && (
                  <UsersPanel users={users} onResetPassword={sendPasswordReset} saving={saving} />
                )}

                {activeTab === 'solutions' && (
                  <SolutionsEditor
                    solutions={filteredSolutions}
                    query={solutionQuery}
                    setQuery={setSolutionQuery}
                    form={solutionForm}
                    setForm={setSolutionForm}
                    accessories={solutionAccessories}
                    setAccessories={setSolutionAccessories}
                    comments={solutionComments}
                    setComments={setSolutionComments}
                    inverters={inverters}
                    batteries={batteries}
                    accessoryRules={rules}
                    essRules={essRules}
                    onEdit={editSolution}
                    onNew={resetSolution}
                    onSave={saveSolution}
                    onApplyGenerated={applyGeneratedSolutions}
                    onRemove={(id) => removeRow('approved_solutions', id, true)}
                    onDelete={(id) => removeRow('approved_solutions', id)}
                    removingIds={removingIds}
                    saving={saving}
                  />
                )}

                {activeTab === 'inverters' && (
                  <InvertersEditor
                    rows={inverters}
                    form={inverterForm}
                    setForm={setInverterForm}
                    onSave={saveInverter}
                    onRemove={(id) => removeRow('inverters', id)}
                    removingIds={removingIds}
                    uploadAsset={uploadProductAsset}
                    saving={saving}
                  />
                )}

                {activeTab === 'batteries' && (
                  <BatteriesEditor
                    rows={batteries}
                    form={batteryForm}
                    setForm={setBatteryForm}
                    onSave={saveBattery}
                    onRemove={(id) => removeRow('batteries', id)}
                    removingIds={removingIds}
                    uploadAsset={uploadProductAsset}
                    saving={saving}
                  />
                )}

                {activeTab === 'accessories' && (
                  <AccessoriesEditor
                    rows={accessories}
                    form={accessoryForm}
                    setForm={setAccessoryForm}
                    onSave={saveAccessory}
                    onRemove={(id) => removeRow('accessories', id)}
                    removingIds={removingIds}
                    uploadAsset={uploadProductAsset}
                    rules={rules}
                    saving={saving}
                  />
                )}

                {activeTab === 'loads' && (
                  <LoadCatalogEditor
                    rows={loadCatalogItems}
                    form={loadCatalogForm}
                    setForm={setLoadCatalogForm}
                    onSave={saveLoadCatalogItem}
                    onRemove={(id) => removeRow('load_catalog', id)}
                    removingIds={removingIds}
                    saving={saving}
                  />
                )}

                {activeTab === 'rules' && (
                  <RulesEditor
                    rows={rules}
                    form={ruleForm}
                    setForm={setRuleForm}
                    essRows={essRules}
                    essForm={essRuleForm}
                    setEssForm={setEssRuleForm}
                    accessories={accessories}
                    inverters={inverters}
                    batteries={batteries}
                    onSave={saveRule}
                    onSaveEss={saveEssRule}
                    onRemove={(id) => removeRow('accessory_rules', id)}
                    onRemoveEss={(id) => removeRow('ess_compatibility_rules', id)}
                    removingIds={removingIds}
                    saving={saving}
                  />
                )}

                {activeTab === 'logs' && <ActivityLogsPanel logs={activityLogs} />}
              </>
            )}
          </section>
        </div>
      </div>

      <Button
        type="button"
        size="icon-lg"
        className="fixed bottom-4 left-4 z-30 shadow-lg lg:hidden"
        aria-label="Abrir menu"
        onClick={() => setMobileMenuOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu administrativo">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r bg-card px-4 py-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold leading-tight">Administração</p>
                <p className="text-xs text-muted-foreground">SolaX Calculator</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <nav className="mt-8 flex flex-col gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Button
                    key={tab.key}
                    type="button"
                    aria-current={activeTab === tab.key ? 'page' : undefined}
                    variant={activeTab === tab.key ? 'default' : 'ghost'}
                    className="justify-start"
                    onClick={() => selectTab(tab.key)}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </Button>
                );
              })}
            </nav>

            <div className="mt-auto grid gap-2">
              <Button variant="outline" onClick={() => loadData()} disabled={loading}>
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </Button>
              <Button variant="outline" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  children,
  asDiv,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  asDiv?: boolean;
}) {
  const className = 'flex flex-col gap-1.5 text-sm font-medium';
  if (asDiv) {
    return (
      <div className={className}>
        <span>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className={className}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function InfoLabel({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <span className="group relative inline-flex">
        <CircleHelp
          className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary"
          tabIndex={0}
          aria-label={tip}
        />
        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-md border bg-popover px-2 py-1.5 text-xs font-normal leading-snug text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {tip}
        </span>
      </span>
    </span>
  );
}

function AdminLoadingSkeleton() {
  return (
    <div className="space-y-4" aria-label="Carregando dados administrativos">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 pt-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((__, rowIndex) => (
                <div key={rowIndex} className="space-y-2">
                  <div className="flex justify-between gap-3">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function NumberInput(props: React.ComponentProps<typeof Input>) {
  return <Input type="number" inputMode="decimal" onFocus={(e) => e.target.select()} {...props} />;
}

function NumberWithUnitField({
  label,
  tip,
  icon,
  unit,
  onClear,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'type' | 'inputMode'> & {
  label: string;
  tip: string;
  icon: React.ReactNode;
  unit: string;
  onClear?: () => void;
}) {
  const hasValue = props.value !== undefined && props.value !== null && props.value !== '';
  return (
    <Field label={<InfoLabel label={label} tip={tip} />}>
      <div className="flex h-8 items-center rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <span className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
        <Input
          {...props}
          value={props.value ?? ''}
          type="number"
          inputMode="decimal"
          onFocus={(e) => e.target.select()}
          className="h-full border-0 bg-transparent px-1 py-0 focus-visible:border-transparent focus-visible:ring-0"
        />
        {onClear && hasValue && (
          <button
            type="button"
            aria-label="Limpar campo"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClear}
            className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <span className="mr-2 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {unit}
        </span>
      </div>
    </Field>
  );
}

function Actions({
  onSave,
  onNew,
  onCancel,
  saving,
}: {
  onSave: () => void;
  onNew?: () => void;
  onCancel?: () => void;
  saving: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-wrap gap-2 border-t bg-card/80 px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur-md backdrop-saturate-150">
      <Button onClick={onSave} disabled={saving}>
        <Save className="h-4 w-4" />
        Salvar
      </Button>
      {onNew && (
        <Button variant="outline" onClick={onNew} disabled={saving}>
          <Plus className="h-4 w-4" />
          Novo
        </Button>
      )}
      {onCancel && (
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" />
          Fechar
        </Button>
      )}
    </div>
  );
}

function ProductMediaFields({
  table,
  model,
  imageUrl,
  documents,
  setImageUrl,
  setDocuments,
  uploadAsset,
}: {
  table: 'inverters' | 'batteries' | 'accessories';
  model: string | undefined;
  imageUrl: string | null | undefined;
  documents: ProductDocument[] | undefined;
  setImageUrl: (url: string) => void;
  setDocuments: (documents: ProductDocument[]) => void;
  uploadAsset: (
    table: 'inverters' | 'batteries' | 'accessories',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) => Promise<string>;
}) {
  const currentDocuments = documents ?? [];

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    const url = await uploadAsset(table, model, 'image', file);
    setImageUrl(url);
  }

  async function uploadDocument(file: File | undefined) {
    if (!file) return;
    const url = await uploadAsset(table, model, 'documents', file);
    setDocuments([...currentDocuments, { name: file.name, url }]);
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="h-4 w-4" />
          Mídia do produto
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Adicione uma imagem do produto e materiais técnicos para o relatório do cliente.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
        <div className="overflow-hidden rounded-lg border bg-background">
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Imagem do produto" className="h-36 w-full object-contain p-3" />
            </>
          ) : (
            <div className="flex h-36 flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              Nenhuma imagem
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Field label="Imagem do produto">
            <Input
              value={imageUrl ?? ''}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="URL da imagem"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <label className={`${buttonVariants({ variant: 'outline' })} cursor-pointer`}>
                <ImageIcon className="h-4 w-4" />
                Enviar imagem
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={(event) => uploadImage(event.target.files?.[0])}
                />
            </label>
            {imageUrl && (
              <Button type="button" variant="ghost" onClick={() => setImageUrl('')}>
                <X className="h-4 w-4" />
                Remover imagem
              </Button>
            )}
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Documentos para clientes
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Datasheets, manuais, certificados ou guias rápidos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={`${buttonVariants({ variant: 'outline' })} cursor-pointer`}>
                <FileText className="h-4 w-4" />
                Enviar arquivo
                <input
                  className="sr-only"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={(event) => uploadDocument(event.target.files?.[0])}
                />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDocuments([...currentDocuments, { name: 'Datasheet', url: '' }])}
            >
              <Plus className="h-4 w-4" />
              Adicionar link
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          {currentDocuments.length === 0 && (
            <div className="rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
              Nenhum documento anexado.
            </div>
          )}
          {currentDocuments.map((document, index) => (
            <div key={index} className="grid gap-2 rounded-lg border bg-background p-2">
              <Input
                value={document.name}
                onChange={(event) => {
                  const next = [...currentDocuments];
                  next[index] = { ...document, name: event.target.value };
                  setDocuments(next);
                }}
                placeholder="Nome do documento"
              />
              <div className="flex gap-2">
                <Input
                  value={document.url}
                  onChange={(event) => {
                    const next = [...currentDocuments];
                    next[index] = { ...document, url: event.target.value };
                    setDocuments(next);
                  }}
                  placeholder="URL do documento"
                />
                <ConfirmDeleteButton
                  ariaLabel={`Remover documento ${document.name}`}
                  title="Remover documento?"
                  description="O anexo será removido deste produto ao salvar o cadastro."
                  confirmLabel="Remover"
                  onConfirm={() => setDocuments(currentDocuments.filter((_, itemIndex) => itemIndex !== index))}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MediaSummary({
  imageUrl,
  documents,
}: {
  imageUrl: string | null | undefined;
  documents: ProductDocument[] | undefined;
}) {
  const documentCount = documents?.filter((document) => document.url).length ?? 0;

  return (
    <div className="flex flex-wrap gap-1">
      {imageUrl ? <Badge variant="secondary">imagem</Badge> : <Badge variant="outline">sem imagem</Badge>}
      <Badge variant={documentCount > 0 ? 'secondary' : 'outline'}>
        {documentCount} doc{documentCount === 1 ? '' : 's'}
      </Badge>
    </div>
  );
}

function UsersPanel({
  users,
  onResetPassword,
  saving,
}: {
  users: UserProfileRow[];
  onResetPassword: (email: string) => void;
  saving: boolean;
}) {
  const [query, setQuery] = useState('');

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.full_name, user.email, user.company_name, user.phone].some((value) => value?.toLowerCase().includes(q))
    );
  }, [users, query]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader title="Usuários cadastrados" count={visibleUsers.length} />
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar usuário"
            className="pl-8"
            placeholder="Buscar por nome, email ou empresa..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {visibleUsers.length === 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado para essa busca.</p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleUsers.map((user) => (
          <Card key={user.id} size="sm">
            <CardHeader>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate">{user.full_name || user.email}</CardTitle>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant={user.role === 'admin' ? 'secondary' : 'outline'}>
                  {user.role === 'admin' ? 'admin' : 'usuário'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 text-sm">
                <DetailItem label="Telefone" value={user.phone || '-'} />
                <DetailItem label="Empresa" value={user.company_name || '-'} />
                <DetailItem
                  label="Cadastro"
                  value={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
                    new Date(user.created_at)
                  )}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={saving || !user.email}
                onClick={() => onResetPassword(user.email)}
              >
                <RefreshCw className="h-4 w-4" />
                Resetar senha
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function MetricsPanel({
  simulations,
  users,
}: {
  simulations: SimulationRow[];
  users: UserProfileRow[];
}) {
  const gridTypeCounts = countBy(simulations, (simulation) => simulation.grid_type || 'Não informado');
  const topologyCounts = countBy(simulations, (simulation) => simulation.topology || 'Não informado');
  const inverterCounts = countBy(simulations, (simulation) => simulation.inverter_model || 'Não informado');
  const batteryCounts = countBy(simulations, (simulation) => simulation.battery_model || 'Não informado');
  const loadCounts = countLoads(simulations);
  const accessoryCounts = countAccessories(simulations);
  const totalDailyKwh = simulations.reduce((acc, simulation) => acc + Number(simulation.daily_kwh || 0), 0);
  const totalPeakW = simulations.reduce((acc, simulation) => acc + Number(simulation.peak_w || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Usuários" value={String(users.length)} />
        <MetricCard label="Simulações" value={String(simulations.length)} />
        <MetricCard label="Pico médio" value={simulations.length ? `${(totalPeakW / simulations.length / 1000).toFixed(2)} kW` : '0 kW'} />
        <MetricCard label="Consumo médio" value={simulations.length ? `${(totalDailyKwh / simulations.length).toFixed(2)} kWh/dia` : '0 kWh/dia'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Tipos de rede mais usados" rows={gridTypeCounts} />
        <ChartCard title="Topologias mais usadas" rows={topologyCounts} />
        <ChartCard title="Cargas mais usadas" rows={loadCounts} />
        <ChartCard title="Inversores mais recomendados" rows={inverterCounts} />
        <ChartCard title="Baterias mais recomendadas" rows={batteryCounts} />
        <ChartCard title="Acessórios mais recomendados" rows={accessoryCounts} />
      </div>
    </div>
  );
}

function ActivityLogsPanel({ logs }: { logs: AdminActivityLogRow[] }) {
  const [query, setQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<AdminLogEntity | 'all'>('all');

  const entityOptions = useMemo(() => {
    const values = new Set<AdminLogEntity>();
    for (const log of logs) values.add(log.entity_type);
    return Array.from(values).map((value) => ({
      value,
      label: entityLabel(value),
      count: logs.filter((log) => log.entity_type === value).length,
    }));
  }, [logs]);

  const visibleLogs = useMemo(() => {
    const byEntity = entityFilter === 'all' ? logs : logs.filter((log) => log.entity_type === entityFilter);
    const q = query.trim().toLowerCase();
    if (!q) return byEntity;
    return byEntity.filter((log) =>
      [log.actor_email, log.target_label, log.summary].some((value) => value?.toLowerCase().includes(q))
    );
  }, [logs, entityFilter, query]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader title="Logs de alterações" count={visibleLogs.length} />
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar log por usuário ou item"
            className="pl-8"
            placeholder="Buscar por usuário ou item..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {entityOptions.length > 1 && (
        <div className="rounded-lg border bg-card p-3">
          <SegmentedTabs
            label="Entidade"
            value={entityFilter}
            options={[{ value: 'all', label: 'Todos', count: logs.length }, ...entityOptions]}
            onChange={(value) => setEntityFilter(value as AdminLogEntity | 'all')}
          />
        </div>
      )}

      {logs.length === 0 ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Ainda não há alterações registradas em produtos, combinações ou regras.
            </p>
          </CardContent>
        </Card>
      ) : visibleLogs.length === 0 ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado para esse filtro.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {visibleLogs.map((log) => (
            <Card key={log.id} size="sm">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{log.target_label}</CardTitle>
                    <p className="text-sm text-muted-foreground">{log.summary}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Badge variant="secondary">{entityLabel(log.entity_type)}</Badge>
                    <Badge variant={log.action === 'delete' || log.action === 'deactivate' ? 'outline' : 'secondary'}>
                      {actionLabel(log.action)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <DetailItem label="Usuário" value={log.actor_email || '-'} />
                  <DetailItem
                    label="Data"
                    value={new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(log.created_at))}
                  />
                  <DetailItem label="ID" value={log.target_id || '-'} />
                </div>
                <details className="rounded-lg border bg-muted/30 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Ver dados da alteração</summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <JsonBlock title="Antes" value={log.before_data} />
                    <JsonBlock title="Depois" value={log.after_data} />
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function entityLabel(entityType: AdminLogEntity) {
  const labels: Record<AdminLogEntity, string> = {
    inverter: 'Inversor',
    battery: 'Bateria',
    accessory: 'Acessório',
    solution: 'Combinação',
    rule: 'Regra',
    load_catalog_item: 'Carga',
  };
  return labels[entityType];
}

function actionLabel(action: AdminLogAction) {
  const labels: Record<AdminLogAction, string> = {
    create: 'Criação',
    update: 'Edição',
    delete: 'Remoção',
    deactivate: 'Inativação',
  };
  return labels[action];
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-72 overflow-auto rounded-lg bg-background p-2 text-xs">
        {value ? JSON.stringify(value, null, 2) : '-'}
      </pre>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const topRows = rows.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {topRows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Ainda não há dados suficientes.
          </p>
        ) : (
          <div className="space-y-3">
            {topRows.map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{row.label}</span>
                  <span className="font-medium">{row.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function countLoads(simulations: SimulationRow[]) {
  const counts = new Map<string, number>();
  for (const simulation of simulations) {
    for (const load of simulation.loads ?? []) {
      const name = load.name || 'Carga sem nome';
      counts.set(name, (counts.get(name) ?? 0) + Number(load.qty || 1));
    }
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function countAccessories(simulations: SimulationRow[]) {
  const counts = new Map<string, number>();
  for (const simulation of simulations) {
    for (const accessory of simulation.accessories ?? []) {
      counts.set(accessory, (counts.get(accessory) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function SolutionsEditor(props: {
  solutions: SolutionRow[];
  query: string;
  setQuery: (value: string) => void;
  form: Partial<SolutionRow>;
  setForm: (value: Partial<SolutionRow>) => void;
  accessories: { model: string | null; quantity: number }[];
  setAccessories: (value: { model: string | null; quantity: number }[]) => void;
  comments: string[];
  setComments: (value: string[]) => void;
  inverters: InverterRow[];
  batteries: BatteryRow[];
  accessoryRules: AccessoryRuleRow[];
  essRules: EssCompatibilityRuleRow[];
  onEdit: (row: SolutionRow) => void;
  onNew: () => void;
  onSave: (afterPersist?: () => void) => void;
  onApplyGenerated: (generatedSolutions: GeneratedSolutionPayload[], afterApply?: () => void, cleanupStale?: boolean) => void;
  onRemove: (id: string) => void;
  onDelete: (id: string) => void;
  removingIds: Set<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [mainTab, setMainTab] = useState<'approved' | 'generated'>('approved');
  const [selectedInverter, setSelectedInverter] = useState<string>('all');
  const [selectedBattery, setSelectedBattery] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [applyingCode, setApplyingCode] = useState<string | null>(null);
  const [filterInverterModels, setFilterInverterModels] = useState<string[]>([]);
  const [filterBatteryModels, setFilterBatteryModels] = useState<string[]>([]);
  const [generatedQuery, setGeneratedQuery] = useState('');
  const [pendingGenerated, setPendingGenerated] = useState<GeneratedSolutionPayload[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('solax-admin-pending-generated');
      return stored ? (JSON.parse(stored) as GeneratedSolutionPayload[]) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem('solax-admin-pending-generated', JSON.stringify(pendingGenerated)); } catch {}
  }, [pendingGenerated]);

  const existingGeneratedCodes = useMemo(
    () =>
      new Set(
        props.solutions
          .filter((s) => s.source_file === 'generated-rules')
          .map((s) => s.solution_code)
      ),
    [props.solutions]
  );

  const pendingNewCount = pendingGenerated.filter((s) => !existingGeneratedCodes.has(s.solution_code)).length;
  const pendingUpdateCount = pendingGenerated.length - pendingNewCount;

  const filteredPending = useMemo(() => {
    const q = generatedQuery.trim().toLowerCase();
    if (!q) return pendingGenerated;
    return pendingGenerated.filter((s) =>
      s.solution_code.toLowerCase().includes(q) ||
      s.inverter_model.toLowerCase().includes(q) ||
      s.battery_model.toLowerCase().includes(q)
    );
  }, [pendingGenerated, generatedQuery]);

  const groupedGenerated = useMemo(() => {
    const byGrid = new Map<string, Map<string, GeneratedSolutionPayload[]>>();
    for (const s of filteredPending) {
      if (!byGrid.has(s.grid_topology)) byGrid.set(s.grid_topology, new Map());
      const byBatt = byGrid.get(s.grid_topology)!;
      if (!byBatt.has(s.battery_model)) byBatt.set(s.battery_model, []);
      byBatt.get(s.battery_model)!.push(s);
    }
    return byGrid;
  }, [filteredPending]);

  const gridTopologyLabel: Record<string, string> = {
    '1p_220V': 'Monofásico 220V',
    '3p_220V': 'Trifásico 220V',
    '3p_380V': 'Trifásico 380V',
  };

  const registeredInverterModels = useMemo(
    () => new Set(props.inverters.map((inverter) => inverter.model)),
    [props.inverters]
  );
  const registeredBatteryModels = useMemo(
    () => new Set(props.batteries.map((battery) => battery.model)),
    [props.batteries]
  );
  const catalogSolutions = useMemo(
    () =>
      props.solutions.filter(
        (solution) =>
          registeredInverterModels.has(solution.inverter_model) &&
          registeredBatteryModels.has(solution.battery_model)
      ),
    [props.solutions, registeredInverterModels, registeredBatteryModels]
  );

  const inverterGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const solution of catalogSolutions) {
      counts.set(solution.inverter_model, (counts.get(solution.inverter_model) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ value: label, label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogSolutions]);

  const solutionsByInverter =
    selectedInverter === 'all'
      ? catalogSolutions
      : catalogSolutions.filter((solution) => solution.inverter_model === selectedInverter);

  const batteryGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const solution of solutionsByInverter) {
      counts.set(solution.battery_model, (counts.get(solution.battery_model) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ value: label, label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [solutionsByInverter]);

  const solutionsByBattery =
    selectedBattery === 'all'
      ? solutionsByInverter
      : solutionsByInverter.filter((solution) => solution.battery_model === selectedBattery);

  const statusGroups = useMemo(() => {
    let active = 0, inactive = 0;
    for (const s of solutionsByBattery) {
      if (s.active) active++; else inactive++;
    }
    return { active, inactive };
  }, [solutionsByBattery]);

  const visibleSolutions =
    selectedStatus === 'all'
      ? solutionsByBattery
      : solutionsByBattery.filter((s) => (selectedStatus === 'active') === s.active);

  useEffect(() => {
    if (selectedInverter !== 'all' && !registeredInverterModels.has(selectedInverter)) {
      setSelectedInverter('all');
      setSelectedBattery('all');
    }
  }, [selectedInverter, registeredInverterModels]);

  useEffect(() => {
    if (selectedBattery !== 'all' && !registeredBatteryModels.has(selectedBattery)) {
      setSelectedBattery('all');
    }
  }, [selectedBattery, registeredBatteryModels]);

  useEffect(() => {
    setSelectedStatus('all');
  }, [selectedInverter, selectedBattery]);

  function openNew() {
    props.onNew();
    setFormOpen(true);
  }

  function openEdit(solution: SolutionRow) {
    props.onEdit(solution);
    setFormOpen(true);
  }

  const [generateWarning, setGenerateWarning] = useState<string | null>(null);

  function generateAndStore() {
    const invFilter = filterInverterModels.length > 0 ? new Set(filterInverterModels) : null;
    const batFilter = filterBatteryModels.length > 0 ? new Set(filterBatteryModels) : null;
    const newSolutions = buildRuleGeneratedSolutions({
      inverters: props.inverters,
      batteries: props.batteries,
      accessoryRules: props.accessoryRules,
      essRules: props.essRules,
      filterInverterModels: invFilter,
      filterBatteryModels: batFilter,
    });

    if (newSolutions.length === 0) {
      const hasFilter = invFilter || batFilter;
      setGenerateWarning(
        hasFilter
          ? 'Nenhuma combinação gerada para os modelos selecionados. Verifique se existem regras ESS ativas cobrindo esse inversor e bateria.'
          : 'Nenhuma combinação gerada. Verifique se existem regras ESS ativas com inversor, bateria e redes compatíveis.'
      );
      setMainTab('generated');
      return;
    }

    setGenerateWarning(null);
    setPendingGenerated((prev) => {
      // Keep pending solutions that fall outside the current filter scope —
      // they belong to other products and shouldn't be replaced.
      const toKeep = prev.filter((s) => {
        const coveredByFilter =
          (!invFilter || invFilter.has(s.inverter_model)) &&
          (!batFilter || batFilter.has(s.battery_model));
        return !coveredByFilter;
      });
      return [...toKeep, ...newSolutions];
    });
    setMainTab('generated');
  }

  function removePending(solutionCode: string) {
    setPendingGenerated((prev) => prev.filter((s) => s.solution_code !== solutionCode));
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeader
            title="Combinações"
            count={mainTab === 'approved' ? visibleSolutions.length : filteredPending.length}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {mainTab === 'approved' && (
              <>
                <label className="relative block sm:w-80">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar combinações aprovadas"
                    className="pl-8"
                    placeholder="Buscar código, inversor ou bateria"
                    value={props.query}
                    onChange={(event) => props.setQuery(event.target.value)}
                  />
                </label>
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Nova combinação
                </Button>
              </>
            )}
            {mainTab === 'generated' && (
              <>
                <label className="relative block sm:w-80">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar combinações geradas"
                    className="pl-8"
                    placeholder="Buscar código, inversor ou bateria"
                    value={generatedQuery}
                    onChange={(event) => setGeneratedQuery(event.target.value)}
                  />
                </label>
                <Button onClick={generateAndStore} disabled={props.saving}>
                  <Zap className="h-4 w-4" />
                  {pendingGenerated.length > 0 ? 'Gerar novamente' : 'Gerar combinações'}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-1 w-fit rounded-lg border bg-card p-1">
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${mainTab === 'approved' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setMainTab('approved')}
          >
            Aprovadas ({catalogSolutions.length})
          </button>
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${mainTab === 'generated' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setMainTab('generated')}
          >
            Geradas{pendingGenerated.length > 0 ? ` (${pendingGenerated.length})` : ''}
          </button>
        </div>

        {mainTab === 'approved' && (
          <>
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <SegmentedTabs
                label="Inversor"
                value={selectedInverter}
                options={[{ value: 'all', label: 'Todos', count: catalogSolutions.length }, ...inverterGroups]}
                onChange={(value) => {
                  setSelectedInverter(value);
                  setSelectedBattery('all');
                }}
              />
              <SegmentedTabs
                label="Bateria"
                value={selectedBattery}
                options={[{ value: 'all', label: 'Todas', count: solutionsByInverter.length }, ...batteryGroups]}
                onChange={setSelectedBattery}
              />
              {(statusGroups.active > 0 && statusGroups.inactive > 0) && (
                <SegmentedTabs
                  label="Status"
                  value={selectedStatus}
                  options={[
                    { value: 'all', label: 'Todas', count: solutionsByBattery.length },
                    { value: 'active', label: 'Ativas', count: statusGroups.active },
                    { value: 'inactive', label: 'Inativas', count: statusGroups.inactive },
                  ]}
                  onChange={(v) => setSelectedStatus(v as 'all' | 'active' | 'inactive')}
                />
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {visibleSolutions.map((solution) => {
                const removing = props.removingIds.has(solution.id);
                return (
                  <Card key={solution.id} size="sm" className={removing ? 'relative opacity-70' : 'relative'}>
                    {removing && <RemovingOverlay label="Removendo..." />}
                    <CardHeader>
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="truncate">{solution.solution_code}</CardTitle>
                          <p className="truncate text-xs text-muted-foreground">{solution.source_file}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${solution.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400'}`}>
                          {solution.active ? 'ativa' : 'inativa'}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid gap-2 text-sm">
                        <DetailItem label="Inversor" value={`${solution.inverter_model} x${solution.inverter_quantity}`} />
                        <DetailItem label="Bateria" value={`${solution.battery_model} x${solution.battery_quantity}`} />
                        <DetailItem label="Rede" value={solution.grid_topology} />
                        <DetailItem label="Potência" value={`${solution.rated_power_w} W`} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(solution)}>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>
                        <ConfirmDeleteButton
                          ariaLabel={`Inativar combinação ${solution.solution_code}`}
                          title="Inativar combinação?"
                          description="A combinação ficará inativa e deixará de ser usada nas recomendações."
                          confirmLabel="Inativar"
                          icon={<EyeOff className="h-4 w-4" />}
                          disabled={removing}
                          onConfirm={() => props.onRemove(solution.id)}
                        />
                        <ConfirmDeleteButton
                          ariaLabel={`Excluir combinação ${solution.solution_code}`}
                          title="Excluir combinação?"
                          description="A combinação será removida permanentemente do cadastro."
                          confirmLabel="Excluir"
                          disabled={removing}
                          onConfirm={() => props.onDelete(solution.id)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {visibleSolutions.length === 0 && (
                <div className="rounded-lg border border-dashed bg-background p-6 text-sm text-muted-foreground md:col-span-2 2xl:col-span-3">
                  Nenhuma combinação encontrada para o agrupamento selecionado.
                </div>
              )}
            </div>
          </>
        )}

        {mainTab === 'generated' && (
          <div className="space-y-4">
            {/* Generation filter panel */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="space-y-3">
                <div className="space-y-3 min-w-0">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inversores</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setFilterInverterModels([])}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterInverterModels.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        Todos
                      </button>
                      {props.inverters.map((inv) => (
                        <button
                          key={inv.model}
                          onClick={() => setFilterInverterModels((prev) =>
                            prev.includes(inv.model) ? prev.filter((m) => m !== inv.model) : [...prev, inv.model]
                          )}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterInverterModels.includes(inv.model) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                        >
                          {inv.model}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Baterias</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setFilterBatteryModels([])}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterBatteryModels.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        Todas
                      </button>
                      {props.batteries.map((bat) => (
                        <button
                          key={bat.model}
                          onClick={() => setFilterBatteryModels((prev) =>
                            prev.includes(bat.model) ? prev.filter((m) => m !== bat.model) : [...prev, bat.model]
                          )}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterBatteryModels.includes(bat.model) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                        >
                          {bat.model}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {generateWarning && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {generateWarning}
                </p>
              )}
            </div>

            {pendingGenerated.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background p-6 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma combinação pendente.</p>
                <p className="mt-1 text-xs text-muted-foreground">Configure os filtros acima e clique em "Gerar combinações".</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span><span className="font-medium text-foreground">{filteredPending.length}</span>{generatedQuery ? ` de ${pendingGenerated.length}` : ''} pendentes</span>
                    {pendingNewCount > 0 && <span><span className="font-medium text-foreground">{pendingNewCount}</span> novas</span>}
                    {pendingUpdateCount > 0 && <span><span className="font-medium text-foreground">{pendingUpdateCount}</span> atualizações</span>}
                  </div>
                  <Button
                    onClick={() => props.onApplyGenerated(pendingGenerated, () => setPendingGenerated([]), true)}
                    disabled={props.saving}
                  >
                    <Save className="h-4 w-4" />
                    Aprovar todas ({pendingGenerated.length})
                  </Button>
                </div>

                {Array.from(groupedGenerated.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([grid, byBattery]) => (
                    <div key={grid} className="space-y-2">
                      <div className="flex items-center gap-2 pt-1">
                        <h3 className="text-sm font-semibold">{gridTopologyLabel[grid] ?? grid}</h3>
                        <span className="text-xs text-muted-foreground">
                          · {Array.from(byBattery.values()).reduce((n, arr) => n + arr.length, 0)} combinações
                        </span>
                      </div>

                      {Array.from(byBattery.entries())
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([battery, solutions]) => (
                          <div key={battery} className="rounded-lg border">
                            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
                              <span className="text-sm font-medium">{battery}</span>
                              <span className="text-xs text-muted-foreground">
                                {solutions.length} combinação{solutions.length !== 1 ? 'ões' : ''}
                              </span>
                            </div>
                            <div className="divide-y">
                              {solutions.map((solution) => {
                                const isNew = !existingGeneratedCodes.has(solution.solution_code);
                                const isApplying = applyingCode === solution.solution_code;
                                return (
                                  <div key={solution.solution_code} className="flex items-start gap-3 p-3 sm:items-center">
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">{solution.solution_code}</span>
                                        <Badge variant={isNew ? 'default' : 'outline'}>
                                          {isNew ? 'Nova' : 'Atualização'}
                                        </Badge>
                                      </div>
                                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                                        <span>Inv ×{solution.inverter_quantity}</span>
                                        <span>Bat ×{solution.battery_quantity} · {solution.battery_topology}</span>
                                        <span>{(solution.rated_power_w / 1000).toFixed(1)} kW / {(solution.peak_power_w / 1000).toFixed(1)} kW pico</span>
                                        <span>{(solution.available_energy_wh / 1000).toFixed(1)} kWh</span>
                                        {solution.accessories.length > 0 && (
                                          <span>{solution.accessories.map((a) => `${a.model} ×${a.quantity}`).join(', ')}</span>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={props.saving}
                                      onClick={() => {
                                        setApplyingCode(solution.solution_code);
                                        props.onApplyGenerated([solution], () => {
                                          setApplyingCode(null);
                                          removePending(solution.solution_code);
                                          setMainTab('generated');
                                        });
                                      }}
                                    >
                                      {isApplying
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Save className="h-3.5 w-3.5" />}
                                      Aprovar
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={`Descartar combinação ${solution.solution_code}`}
                                      disabled={props.saving}
                                      onClick={() => removePending(solution.solution_code)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
              </>
            )}
          </div>
        )}
      </section>

      <EditorModal
        open={formOpen}
        title={form.id ? 'Editar combinação' : 'Nova combinação'}
        onClose={() => setFormOpen(false)}
        size="lg"
      >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código">
              <Input
                value={form.solution_code ?? ''}
                onChange={(event) => setForm({ ...form, solution_code: event.target.value })}
              />
            </Field>
            <Field label="Origem">
              <Input
                value={form.source_file ?? ''}
                onChange={(event) => setForm({ ...form, source_file: event.target.value })}
              />
            </Field>
          </div>

          <Separator />

          <Field label="Modelo do inversor">
            <input
              className={selectClasses()}
              list="admin-inverters"
              value={form.inverter_model ?? ''}
              onChange={(event) => setForm({ ...form, inverter_model: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumberWithUnitField
              label="Qtd. inversores"
              tip="Quantidade de inversores usados nesta combinação aprovada."
              icon={<Boxes className="h-4 w-4" />}
              unit="un."
              value={form.inverter_quantity ?? 1}
              onChange={(event) => setForm({ ...form, inverter_quantity: toNumber(event.target.value, 1) })}
            />
            <NumberWithUnitField
              label="Portas"
              tip="Número de portas de bateria usadas nesta combinação."
              icon={<Cable className="h-4 w-4" />}
              unit="un."
              value={form.battery_ports_used ?? 1}
              onChange={(event) => setForm({ ...form, battery_ports_used: toNumber(event.target.value, 1) })}
            />
            <NumberWithUnitField
              label="Potência nominal"
              tip="Potência nominal total disponível na combinação."
              icon={<Zap className="h-4 w-4" />}
              unit="W"
              value={form.rated_power_w ?? 0}
              onChange={(event) => setForm({ ...form, rated_power_w: toNumber(event.target.value) })}
            />
            <NumberWithUnitField
              label="Potência pico"
              tip="Potência máxima de pico disponível na combinação."
              icon={<Zap className="h-4 w-4" />}
              unit="W"
              value={form.peak_power_w ?? 0}
              onChange={(event) => setForm({ ...form, peak_power_w: toNumber(event.target.value) })}
            />
            <NumberWithUnitField
              label="Tensão"
              tip="Tensão nominal de saída da combinação."
              icon={<Cable className="h-4 w-4" />}
              unit="V"
              value={form.nominal_voltage_v ?? 220}
              onChange={(event) => setForm({ ...form, nominal_voltage_v: toNumber(event.target.value, 220) })}
            />
            <Field label="Rede">
              <select
                className={selectClasses()}
                value={form.grid_topology ?? '1p_220V'}
                onChange={(event) => setForm({ ...form, grid_topology: event.target.value as GridTopology })}
              >
                <option value="1p_220V">1p 220V</option>
                <option value="3p_220V">3p 220V</option>
                <option value="3p_380V">3p 380V</option>
              </select>
            </Field>
          </div>

          <Separator />

          <Field label="Modelo da bateria">
            <input
              className={selectClasses()}
              list="admin-batteries"
              value={form.battery_model ?? ''}
              onChange={(event) => setForm({ ...form, battery_model: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Topologia bateria">
              <select
                className={selectClasses()}
                value={form.battery_topology ?? 'HV'}
                onChange={(event) => setForm({ ...form, battery_topology: event.target.value as BatteryTopology })}
              >
                <option value="HV">HV</option>
                <option value="LV">LV</option>
              </select>
            </Field>
            <NumberWithUnitField
              label="Qtd. baterias"
              tip="Quantidade total de baterias nesta combinação."
              icon={<Battery className="h-4 w-4" />}
              unit="un."
              value={form.battery_quantity ?? 1}
              onChange={(event) => setForm({ ...form, battery_quantity: toNumber(event.target.value, 1) })}
            />
            <NumberWithUnitField
              label="Potência bateria"
              tip="Potência total disponível pelo banco de baterias."
              icon={<Zap className="h-4 w-4" />}
              unit="W"
              value={form.battery_power_w ?? 0}
              onChange={(event) => setForm({ ...form, battery_power_w: toNumber(event.target.value) })}
            />
            <NumberWithUnitField
              label="Energia disponível"
              tip="Energia útil disponível no banco de baterias."
              icon={<Battery className="h-4 w-4" />}
              unit="Wh"
              value={form.available_energy_wh ?? 0}
              onChange={(event) => setForm({ ...form, available_energy_wh: toNumber(event.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Acessórios</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => props.setAccessories([...props.accessories, { model: '', quantity: 1 }])}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
            {props.accessories.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">Nenhum acessório</p>
            ) : (
              <div className="space-y-2">
                {props.accessories.map((acc, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      list="admin-accessories"
                      placeholder="Modelo do acessório"
                      value={acc.model ?? ''}
                      onChange={(event) => {
                        const next = [...props.accessories];
                        next[index] = { ...acc, model: event.target.value };
                        props.setAccessories(next);
                      }}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    <input
                      type="number"
                      min={1}
                      value={acc.quantity}
                      onChange={(event) => {
                        const next = [...props.accessories];
                        next[index] = { ...acc, quantity: Math.max(1, Number(event.target.value)) };
                        props.setAccessories(next);
                      }}
                      className="h-8 w-16 shrink-0 rounded-lg border border-input bg-background px-2 text-center text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover acessório"
                      onClick={() => props.setAccessories(props.accessories.filter((_, i) => i !== index))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Comentários</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => props.setComments([...props.comments, ''])}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
            {props.comments.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">Nenhum comentário</p>
            ) : (
              <div className="space-y-2">
                {props.comments.map((comment, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      placeholder="Texto do comentário"
                      value={comment}
                      onChange={(event) => {
                        const next = [...props.comments];
                        next[index] = event.target.value;
                        props.setComments(next);
                      }}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover comentário"
                      onClick={() => props.setComments(props.comments.filter((_, i) => i !== index))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            Ativa para recomendação
          </label>
          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
      </EditorModal>

      <datalist id="admin-inverters">
        {props.inverters.map((inverter) => (
          <option key={inverter.id} value={inverter.model} />
        ))}
      </datalist>
      <datalist id="admin-batteries">
        {props.batteries.map((battery) => (
          <option key={battery.id} value={battery.model} />
        ))}
      </datalist>
      <datalist id="admin-accessories">
        {Array.from(new Set(props.accessoryRules.map((r) => r.accessories?.model).filter(Boolean))).map((model) => (
          <option key={model} value={model ?? ''} />
        ))}
      </datalist>
    </div>
  );
}

function ToggleChipsInput<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  function toggle(item: T) {
    if (value.includes(item)) {
      onChange(value.filter((v) => v !== item));
    } else {
      onChange([...value, item]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/60 hover:text-foreground'
            )}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function InlineOptionTabs<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  const activeValue = value ?? options[0]?.value;

  return (
    <div
      className="grid gap-1 rounded-lg bg-muted p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = activeValue === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            className={cn(
              'h-8 rounded-md px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function InvertersEditor(props: {
  rows: InverterRow[];
  form: Partial<InverterRow>;
  setForm: (value: Partial<InverterRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  uploadAsset: (
    table: 'inverters' | 'batteries' | 'accessories',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) => Promise<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<ProductEditorTab>('general');
  const [selectedPhase, setSelectedPhase] = useState<'all' | '1' | '2' | '3'>('all');
  const [query, setQuery] = useState('');

  const phaseOptions = useMemo(() => {
    const counts = { '1': 0, '2': 0, '3': 0 };
    for (const row of props.rows) {
      const key = String(row.phases) as '1' | '2' | '3';
      if (key in counts) counts[key]++;
    }
    const labels: Record<string, string> = { '1': 'Monofásico', '2': 'Bifásico', '3': 'Trifásico' };
    return [
      { value: 'all', label: 'Todos', count: props.rows.length },
      ...(['1', '2', '3'] as const)
        .filter((p) => counts[p] > 0)
        .map((p) => ({ value: p, label: labels[p], count: counts[p] })),
    ];
  }, [props.rows]);

  const visibleRows = useMemo(() => {
    const byPhase =
      selectedPhase === 'all' ? props.rows : props.rows.filter((row) => String(row.phases) === selectedPhase);
    const q = query.trim().toLowerCase();
    if (!q) return byPhase;
    return byPhase.filter((row) => row.model.toLowerCase().includes(q));
  }, [props.rows, selectedPhase, query]);

  function openNew() {
    setForm(emptyInverter);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  function openEdit(row: InverterRow) {
    setForm(row);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Inversores"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar inversor' : 'Novo inversor'}
      newLabel="Novo inversor"
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      search={
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar inversor por modelo"
            className="pl-8"
            placeholder="Buscar por modelo..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      filter={
        phaseOptions.length > 2 ? (
          <div className="rounded-lg border bg-card p-3">
            <SegmentedTabs
              label="Padrão de rede"
              value={selectedPhase}
              options={phaseOptions}
              onChange={(value) => setSelectedPhase(value as typeof selectedPhase)}
            />
          </div>
        ) : undefined
      }
      form={
        <>
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <InlineOptionTabs options={productEditorTabOptions} value={activeFormTab} onChange={setActiveFormTab} />
          {activeFormTab === 'general' ? (
            <>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">CA</p>
                <div className="grid grid-cols-2 gap-3">
                  <NumberWithUnitField
                    label="Potência padrão"
                    tip="Potência aparente nominal do inversor."
                    icon={<Zap className="h-4 w-4" />}
                    unit="kVA"
                    value={form.standard_power_kva ?? form.power_kw ?? 0}
                    onChange={(event) => setForm({ ...form, standard_power_kva: toNumber(event.target.value), power_kw: toNumber(event.target.value) })}
                  />
                  <NumberWithUnitField
                    label="Potência pico"
                    tip="Potência aparente máxima de pico do inversor."
                    icon={<Zap className="h-4 w-4" />}
                    unit="kVA"
                    value={form.peak_power_kva ?? 0}
                    onChange={(event) => setForm({ ...form, peak_power_kva: toNumber(event.target.value) })}
                  />
                </div>
                <Field asDiv label="Tipo de rede">
                  <ToggleChipsInput
                    options={inverterGridTypeOptions}
                    value={normalizeInverterGridTypes(form.grid_types)}
                    onChange={(grid_types) => setForm({ ...form, grid_types, phases: phasesFromInverterGridTypes(grid_types, form.phases) })}
                  />
                </Field>
                <Field asDiv label="Sobredimensionamento FV">
                  <InlineOptionTabs
                    options={[
                      { value: 50 as const, label: '50%' },
                      { value: 100 as const, label: '100%' },
                    ]}
                    value={form.pv_oversizing_percent === 50 ? 50 : 100}
                    onChange={(pv_oversizing_percent) => setForm({ ...form, pv_oversizing_percent })}
                  />
                </Field>
              </div>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Bateria</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field asDiv label="Topologia">
                    <InlineOptionTabs
                      options={[
                        { value: 'HV' as const, label: 'HV' },
                        { value: 'LV' as const, label: 'LV' },
                      ]}
                      value={form.topology === 'LV' ? 'LV' : 'HV'}
                      onChange={(topology) => setForm({ ...form, topology })}
                    />
                  </Field>
                  <Field asDiv label="Portas">
                    <InlineOptionTabs
                      options={[
                        { value: 1, label: '1' },
                        { value: 2, label: '2' },
                      ]}
                      value={form.battery_ports ?? 1}
                      onChange={(battery_ports) => setForm({ ...form, battery_ports })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <NumberWithUnitField
                    label="Tensão mín."
                    tip="Menor tensão de bateria aceita pelo inversor."
                    icon={<Cable className="h-4 w-4" />}
                    unit="V"
                    placeholder="—"
                    value={form.battery_voltage_min_v ?? undefined}
                    onChange={(event) => setForm({ ...form, battery_voltage_min_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, battery_voltage_min_v: null })}
                  />
                  <NumberWithUnitField
                    label="Tensão máx."
                    tip="Maior tensão de bateria aceita pelo inversor."
                    icon={<Cable className="h-4 w-4" />}
                    unit="V"
                    placeholder="—"
                    value={form.battery_voltage_max_v ?? undefined}
                    onChange={(event) => setForm({ ...form, battery_voltage_max_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, battery_voltage_max_v: null })}
                  />
                  <NumberWithUnitField
                    label="Corrente máx."
                    tip="Corrente máxima de bateria por porta, suportada pelo inversor."
                    icon={<Activity className="h-4 w-4" />}
                    unit="A"
                    placeholder="—"
                    value={form.battery_current_max_a ?? undefined}
                    onChange={(event) => setForm({ ...form, battery_current_max_a: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, battery_current_max_a: null })}
                  />
                </div>
              </div>
              <Field asDiv label="Funcionalidades">
                <ToggleChipsInput
                  options={inverterFlagOptions}
                  value={normalizeInverterFlags(form.flags)}
                  onChange={(flags) => setForm({ ...form, flags })}
                />
              </Field>
            </>
          ) : (
            <ProductMediaFields
              table="inverters"
              model={form.model}
              imageUrl={form.image_url}
              documents={form.documents}
              setImageUrl={(image_url) => setForm({ ...form, image_url })}
              setDocuments={(documents) => setForm({ ...form, documents })}
              uploadAsset={props.uploadAsset}
            />
          )}
          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
        </>
      }
      items={visibleRows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.topology, `${row.phases} fase${row.phases === 1 ? '' : 's'}`],
        details: [
          ['Potência', `${row.standard_power_kva ?? row.power_kw} / ${row.peak_power_kva ?? '—'} kVA`],
          ['Portas bat.', `${row.battery_ports ?? 1}× · ${row.battery_current_max_a ?? '—'} A`],
          ['Redes', normalizeInverterGridTypes(row.grid_types).map(formatInverterGridType).join(', ') || '—'],
          ['Tensão bat.', `${row.battery_voltage_min_v ?? '—'} – ${row.battery_voltage_max_v ?? '—'} V`],
          ['Sobredim. FV', `${row.pv_oversizing_percent ?? 100}%`],
        ],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `O inversor ${row.model} e todos os seus dados serão removidos do cadastro.`,
      }))}
    />
  );
}

function BatteriesEditor(props: {
  rows: BatteryRow[];
  form: Partial<BatteryRow>;
  setForm: (value: Partial<BatteryRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  uploadAsset: (
    table: 'inverters' | 'batteries' | 'accessories',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) => Promise<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<ProductEditorTab>('general');
  const [selectedTopology, setSelectedTopology] = useState<'all' | 'HV' | 'LV'>('all');
  const [query, setQuery] = useState('');

  const topologyOptions = useMemo(() => {
    const counts = { HV: 0, LV: 0 };
    for (const row of props.rows) {
      if (row.topology in counts) counts[row.topology as 'HV' | 'LV']++;
    }
    return [
      { value: 'all', label: 'Todas', count: props.rows.length },
      { value: 'HV', label: 'HV', count: counts.HV },
      { value: 'LV', label: 'LV', count: counts.LV },
    ];
  }, [props.rows]);

  const visibleRows = useMemo(() => {
    const byTopology =
      selectedTopology === 'all' ? props.rows : props.rows.filter((row) => row.topology === selectedTopology);
    const q = query.trim().toLowerCase();
    if (!q) return byTopology;
    return byTopology.filter((row) => row.model.toLowerCase().includes(q));
  }, [props.rows, selectedTopology, query]);

  function openNew() {
    setForm(emptyBattery);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  function openEdit(row: BatteryRow) {
    setForm(row);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Baterias"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar bateria' : 'Nova bateria'}
      newLabel="Nova bateria"
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      search={
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar bateria por modelo"
            className="pl-8"
            placeholder="Buscar por modelo..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      filter={
        <div className="rounded-lg border bg-card p-3">
          <SegmentedTabs
            label="Tecnologia"
            value={selectedTopology}
            options={topologyOptions}
            onChange={(value) => setSelectedTopology(value as typeof selectedTopology)}
          />
        </div>
      }
      form={
        <>
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <InlineOptionTabs options={productEditorTabOptions} value={activeFormTab} onChange={setActiveFormTab} />
          {activeFormTab === 'general' ? (
            <>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Configuração</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberWithUnitField
                    label="Capacidade"
                    tip="Energia nominal total do modelo de bateria."
                    icon={<Battery className="h-4 w-4" />}
                    unit="kWh"
                    value={form.capacity_kwh ?? 0}
                    onChange={(event) => setForm({ ...form, capacity_kwh: toNumber(event.target.value) })}
                  />
                  <Field label={<InfoLabel label="Potência padrão" tip="Calculada automaticamente: Tensão nominal × Corrente recomendada." />}>
                    <div className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed bg-muted/40 px-2.5 text-sm text-muted-foreground">
                      <Zap className="h-3.5 w-3.5 shrink-0" />
                      {form.nominal_voltage_v != null && form.recommended_current_a != null
                        ? `${((form.nominal_voltage_v * form.recommended_current_a) / 1000).toFixed(2)} kW`
                        : '—'}
                    </div>
                  </Field>
                  <Field label={<InfoLabel label="Potência pico" tip="Calculada automaticamente: Tensão nominal × Corrente máxima." />}>
                    <div className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed bg-muted/40 px-2.5 text-sm text-muted-foreground">
                      <Zap className="h-3.5 w-3.5 shrink-0" />
                      {form.nominal_voltage_v != null && form.max_current_a != null
                        ? `${((form.nominal_voltage_v * form.max_current_a) / 1000).toFixed(2)} kW`
                        : '—'}
                    </div>
                  </Field>
                  <Field asDiv label={<InfoLabel label="SOC mínimo" tip="Percentual reservado da bateria. A energia útil é calculada descontando esse valor da capacidade." />}>
                    <InlineOptionTabs
                      options={[
                        { value: 5, label: '5%' },
                        { value: 10, label: '10%' },
                      ]}
                      value={form.min_soc_percent === 5 ? 5 : 10}
                      onChange={(min_soc_percent) => setForm({ ...form, min_soc_percent })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field asDiv label="Topologia">
                    <InlineOptionTabs
                      options={[
                        { value: 'HV' as const, label: 'HV' },
                        { value: 'LV' as const, label: 'LV' },
                      ]}
                      value={form.topology === 'LV' ? 'LV' : 'HV'}
                      onChange={(topology) => setForm({ ...form, topology })}
                    />
                  </Field>
                  <Field label={<InfoLabel label="Associação máxima" tip="Quantidade máxima deste modelo em qualquer banco ou porta de bateria de um inversor." />}>
                    <select
                      className={selectClasses()}
                      value={form.max_association_qty ?? 15}
                      onChange={(event) => setForm({ ...form, max_association_qty: toNumber(event.target.value, 15) })}
                    >
                      {Array.from({ length: 15 }, (_, index) => index + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Elétricas</p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  <NumberWithUnitField
                    label="Tensão nominal"
                    tip="Tensão nominal do modelo de bateria."
                    icon={<Cable className="h-4 w-4" />}
                    unit="V"
                    placeholder="—"
                    value={form.nominal_voltage_v ?? undefined}
                    onChange={(event) => setForm({ ...form, nominal_voltage_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, nominal_voltage_v: null })}
                  />
                  <NumberWithUnitField
                    label="Tensão mín."
                    tip="Menor tensão operacional permitida para o banco de baterias."
                    icon={<Cable className="h-4 w-4" />}
                    unit="V"
                    placeholder="—"
                    value={form.voltage_min_v ?? undefined}
                    onChange={(event) => setForm({ ...form, voltage_min_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, voltage_min_v: null })}
                  />
                  <NumberWithUnitField
                    label="Tensão máx."
                    tip="Maior tensão operacional permitida para o banco de baterias."
                    icon={<Cable className="h-4 w-4" />}
                    unit="V"
                    placeholder="—"
                    value={form.voltage_max_v ?? undefined}
                    onChange={(event) => setForm({ ...form, voltage_max_v: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, voltage_max_v: null })}
                  />
                  <NumberWithUnitField
                    label="Corrente rec."
                    tip="Corrente recomendada para operação contínua."
                    icon={<Activity className="h-4 w-4" />}
                    unit="A"
                    placeholder="—"
                    value={form.recommended_current_a ?? undefined}
                    onChange={(event) => setForm({ ...form, recommended_current_a: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, recommended_current_a: null })}
                  />
                  <NumberWithUnitField
                    label="Corrente máx."
                    tip="Corrente máxima suportada pela bateria."
                    icon={<Activity className="h-4 w-4" />}
                    unit="A"
                    placeholder="—"
                    value={form.max_current_a ?? undefined}
                    onChange={(event) => setForm({ ...form, max_current_a: toNullableNumber(event.target.value) })}
                    onClear={() => setForm({ ...form, max_current_a: null })}
                  />
                </div>
              </div>
              <Field asDiv label={<InfoLabel label="Flags" tip="Características estruturadas do produto, como grau de proteção IP. Novas flags podem ser adicionadas no código." />}>
                <ToggleChipsInput
                  options={batteryFlagOptions}
                  value={normalizeBatteryFlags(form.flags)}
                  onChange={(flags) => setForm({ ...form, flags })}
                />
              </Field>
            </>
          ) : (
            <ProductMediaFields
              table="batteries"
              model={form.model}
              imageUrl={form.image_url}
              documents={form.documents}
              setImageUrl={(image_url) => setForm({ ...form, image_url })}
              setDocuments={(documents) => setForm({ ...form, documents })}
              uploadAsset={props.uploadAsset}
            />
          )}
          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
        </>
      }
      items={visibleRows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.topology],
        details: [
          ['Capacidade / Útil', `${row.capacity_kwh} / ${(Number(row.capacity_kwh || 0) * (1 - Number(row.min_soc_percent ?? 10) / 100)).toFixed(2)} kWh`],
          ['Potência', `${row.standard_power_kw ?? '—'} / ${row.peak_power_kw ?? '—'} kW`],
          ['Tensão', `${row.nominal_voltage_v ?? '—'} V (${row.voltage_min_v ?? '—'} – ${row.voltage_max_v ?? '—'} V)`],
          ['Corrente', `${row.recommended_current_a ?? '—'} / ${row.max_current_a ?? '—'} A`],
        ],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `A bateria ${row.model} e todos os seus dados serão removidos do cadastro.`,
      }))}
    />
  );
}

type AccessoryCategory = 'all' | 'system' | 'inverter' | 'battery';

function accessoryCategories(accessoryId: string, rules: AccessoryRuleRow[]): Set<'system' | 'inverter' | 'battery'> {
  const cats = new Set<'system' | 'inverter' | 'battery'>();
  const matched = rules.filter((r) => r.accessory_id === accessoryId);
  if (matched.length === 0) { cats.add('system'); return cats; }
  for (const rule of matched) {
    const hasInverter = accessoryRuleInverterModels(rule).length > 0;
    const hasBattery = !!rule.battery_model;
    if (hasInverter) cats.add('inverter');
    if (hasBattery) cats.add('battery');
    if (!hasInverter && !hasBattery) cats.add('system');
  }
  return cats;
}

function AccessoriesEditor(props: {
  rows: AccessoryRow[];
  form: Partial<AccessoryRow>;
  setForm: (value: Partial<AccessoryRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  uploadAsset: (
    table: 'inverters' | 'batteries' | 'accessories',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) => Promise<string>;
  rules: AccessoryRuleRow[];
  saving: boolean;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<ProductEditorTab>('general');
  const [selectedCategory, setSelectedCategory] = useState<AccessoryCategory>('all');
  const [query, setQuery] = useState('');

  const categoryOptions = useMemo(() => {
    const counts = { system: 0, inverter: 0, battery: 0 };
    for (const row of props.rows) {
      const cats = accessoryCategories(row.id, props.rules);
      if (cats.has('system')) counts.system++;
      if (cats.has('inverter')) counts.inverter++;
      if (cats.has('battery')) counts.battery++;
    }
    return [
      { value: 'all', label: 'Todos', count: props.rows.length },
      ...(counts.system > 0 ? [{ value: 'system', label: 'Sistema', count: counts.system }] : []),
      ...(counts.inverter > 0 ? [{ value: 'inverter', label: 'Por inversor', count: counts.inverter }] : []),
      ...(counts.battery > 0 ? [{ value: 'battery', label: 'Por bateria', count: counts.battery }] : []),
    ] as { value: string; label: string; count: number }[];
  }, [props.rows, props.rules]);

  const visibleRows = useMemo(() => {
    const byCategory =
      selectedCategory === 'all'
        ? props.rows
        : props.rows.filter((row) => accessoryCategories(row.id, props.rules).has(selectedCategory as 'system' | 'inverter' | 'battery'));
    const q = query.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((row) => row.model.toLowerCase().includes(q));
  }, [props.rows, props.rules, selectedCategory, query]);

  function openNew() {
    setForm(emptyAccessory);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  function openEdit(row: AccessoryRow) {
    setForm(row);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Acessórios"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar acessório' : 'Novo acessório'}
      newLabel="Novo acessório"
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      search={
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar acessório por modelo"
            className="pl-8"
            placeholder="Buscar por modelo..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      filter={
        categoryOptions.length > 2 ? (
          <div className="rounded-lg border bg-card p-3">
            <SegmentedTabs
              label="Categoria"
              value={selectedCategory}
              options={categoryOptions}
              onChange={(value) => setSelectedCategory(value as AccessoryCategory)}
            />
          </div>
        ) : undefined
      }
      form={
        <>
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <InlineOptionTabs options={productEditorTabOptions} value={activeFormTab} onChange={setActiveFormTab} />
          {activeFormTab === 'general' ? (
            <>
              <Field label="Descrição">
                <textarea
                  className={textareaClasses()}
                  value={form.description ?? ''}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active ?? true}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                />
                Ativo
              </label>
            </>
          ) : (
            <ProductMediaFields
              table="accessories"
              model={form.model}
              imageUrl={form.image_url}
              documents={form.documents}
              setImageUrl={(image_url) => setForm({ ...form, image_url })}
              setDocuments={(documents) => setForm({ ...form, documents })}
              uploadAsset={props.uploadAsset}
            />
          )}
          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
        </>
      }
      items={visibleRows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.active ? 'ativo' : 'inativo'],
        description: row.description ?? undefined,
        details: [],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `O acessório ${row.model} será removido do cadastro e das regras que o referenciam.`,
      }))}
    />
  );
}

function LoadCatalogEditor(props: {
  rows: LoadCatalogRow[];
  form: Partial<LoadCatalogRow>;
  setForm: (value: Partial<LoadCatalogRow>) => void;
  onSave: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [query, setQuery] = useState('');

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of props.rows) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }
    return [
      { value: 'all', label: 'Todas', count: props.rows.length },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, count]) => ({ value: category, label: category, count })),
    ];
  }, [props.rows]);

  const existingCategories = useMemo(
    () => Array.from(new Set(props.rows.map((row) => row.category))).sort((a, b) => a.localeCompare(b)),
    [props.rows]
  );

  const visibleRows = useMemo(() => {
    const byCategory =
      selectedCategory === 'all' ? props.rows : props.rows.filter((row) => row.category === selectedCategory);
    const q = query.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((row) =>
      [row.name_pt, row.name_en, row.name_zh].some((name) => name.toLowerCase().includes(q))
    );
  }, [props.rows, selectedCategory, query]);

  function openNew() {
    setForm(emptyLoadCatalogItem);
    setFormOpen(true);
  }

  function openEdit(row: LoadCatalogRow) {
    setForm(row);
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Cargas"
      count={visibleRows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar carga' : 'Nova carga'}
      newLabel="Nova carga"
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      search={
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar carga por nome"
            className="pl-8"
            placeholder="Buscar por nome..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      filter={
        categoryOptions.length > 2 ? (
          <div className="rounded-lg border bg-card p-3">
            <SegmentedTabs
              label="Categoria"
              value={selectedCategory}
              options={categoryOptions}
              onChange={setSelectedCategory}
            />
          </div>
        ) : undefined
      }
      form={
        <>
          <Field label="Nome (PT)">
            <Input
              value={form.name_pt ?? ''}
              onChange={(event) => setForm({ ...form, name_pt: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<InfoLabel label="Nome (EN)" tip="Se vazio, usa o nome em português como padrão." />}>
              <Input
                value={form.name_en ?? ''}
                onChange={(event) => setForm({ ...form, name_en: event.target.value })}
              />
            </Field>
            <Field label={<InfoLabel label="Nome (ZH)" tip="Se vazio, usa o nome em português como padrão." />}>
              <Input
                value={form.name_zh ?? ''}
                onChange={(event) => setForm({ ...form, name_zh: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberWithUnitField
              label="Potência"
              tip="Potência aparente nominal do equipamento."
              icon={<Zap className="h-4 w-4" />}
              unit="W"
              value={form.power_w ?? 0}
              onChange={(event) => setForm({ ...form, power_w: toNumber(event.target.value) })}
            />
            <NumberWithUnitField
              label="IP/IN"
              tip="Relação entre a potência aparente de partida (pico) e a nominal. Motores/compressores costumam usar 2-3; cargas resistivas/eletrônicas usam 1."
              icon={<Activity className="h-4 w-4" />}
              unit="×"
              min={1}
              step={0.1}
              value={form.ip_in_ratio ?? 1}
              onChange={(event) => setForm({ ...form, ip_in_ratio: toNumber(event.target.value, 1) })}
            />
          </div>
          <Field label="Categoria">
            <Input
              list="load-catalog-categories"
              value={form.category ?? ''}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              placeholder="Ex.: Climatização, Refrigeração..."
            />
            <datalist id="load-catalog-categories">
              {existingCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
        </>
      }
      items={visibleRows.map((row) => ({
        id: row.id,
        title: row.name_pt,
        badges: [row.category],
        details: [
          ['Potência', `${row.power_w} W`],
          ['IP/IN', `${row.ip_in_ratio}×`],
        ],
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
        removeDescription: `A carga "${row.name_pt}" será removida do catálogo.`,
      }))}
    />
  );
}

function InverterModelsInput({
  inverters,
  value,
  onChange,
}: {
  inverters: InverterRow[];
  value: Partial<AccessoryRuleRow>;
  onChange: (models: string[]) => void;
}) {
  const selected = accessoryRuleInverterModels(value);

  function toggle(model: string) {
    if (selected.includes(model)) {
      onChange(selected.filter((item) => item !== model));
      return;
    }
    onChange([...selected, model]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {inverters.map((inverter) => {
          const active = selected.includes(inverter.model);
          return (
            <button
              key={inverter.id}
              type="button"
              aria-pressed={active}
              className={cn(
                'inline-flex max-w-full items-center rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/60 hover:text-foreground'
              )}
              onClick={() => toggle(inverter.model)}
            >
              <span className="truncate">{inverter.model}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length === 0 ? 'Qualquer inversor.' : `${selected.length} inversor(es) selecionado(s).`}
      </p>
    </div>
  );
}

function EssBatteryConfigsInput({
  batteries,
  supportedTopologies,
  value,
  onChange,
}: {
  batteries: BatteryRow[];
  supportedTopologies: BatteryTopology[];
  value: Partial<EssCompatibilityRuleRow>;
  onChange: (configs: EssBatteryConfig[]) => void;
}) {
  const configs = normalizeEssBatteryConfigs(value, batteries);
  const configByModel = new Map(configs.map((config) => [config.battery_model, config]));
  const availableBatteries = batteries.filter((battery) => supportedTopologies.includes(battery.topology));

  function toggleBattery(battery: BatteryRow) {
    const existing = configByModel.get(battery.model);
    if (existing) {
      onChange(configs.filter((config) => config.battery_model !== battery.model));
      return;
    }
    const associationMax = batteryAssociationMax(battery);
    onChange([
      ...configs,
      {
        battery_model: battery.model,
        battery_topology: battery.topology,
        min_battery_qty: 1,
        max_battery_qty: associationMax,
      },
    ]);
  }

  function updateConfig(model: string, patch: Partial<EssBatteryConfig>) {
    onChange(
      configs.map((config) => {
        if (config.battery_model !== model) return config;
        const battery = batteries.find((item) => item.model === model);
        const associationMax = batteryAssociationMax(battery);
        const minQty = clampNumber(patch.min_battery_qty ?? config.min_battery_qty, 1, Math.min(7, associationMax), 1);
        const maxQty = Math.max(minQty, clampNumber(patch.max_battery_qty ?? config.max_battery_qty, 1, associationMax, associationMax));
        return { ...config, ...patch, min_battery_qty: minQty, max_battery_qty: maxQty };
      })
    );
  }

  if (supportedTopologies.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Selecione um inversor para listar baterias compatíveis.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {availableBatteries.map((battery) => {
          const active = configByModel.has(battery.model);
          return (
            <button
              key={battery.id}
              type="button"
              aria-pressed={active}
              className={cn(
                'inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/60 hover:text-foreground'
              )}
              onClick={() => toggleBattery(battery)}
            >
              <span className="truncate">{battery.model}</span>
              <span className={active ? 'text-primary-foreground/80' : 'text-muted-foreground'}>{battery.topology}</span>
            </button>
          );
        })}
      </div>
      {availableBatteries.length === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Nenhuma bateria compatível com a topologia do inversor.
        </p>
      )}
      {configs.length > 0 && (
        <div className="space-y-2">
          {configs.map((config) => {
            const battery = batteries.find((item) => item.model === config.battery_model);
            const associationMax = batteryAssociationMax(battery);
            const minLimit = Math.min(7, associationMax);
            return (
              <div
                key={config.battery_model}
                className="grid gap-2 rounded-lg border bg-card p-2 sm:grid-cols-[minmax(0,1fr)_170px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{config.battery_model}</p>
                  <p className="text-xs text-muted-foreground">
                    {config.battery_topology} · associação máx. {associationMax}/porta
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="min-w-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 dark:border-blue-800 dark:bg-blue-950/40">
                    <span className="block text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">Min/porta</span>
                    <select
                      className="h-7 w-full bg-transparent text-sm font-semibold text-blue-900 outline-none dark:text-blue-100"
                      value={config.min_battery_qty}
                      onChange={(event) => updateConfig(config.battery_model, { min_battery_qty: toNumber(event.target.value, 1) })}
                    >
                      {Array.from({ length: minLimit }, (_, index) => index + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-0 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 dark:border-rose-800 dark:bg-rose-950/40">
                    <span className="block text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400">Max/porta</span>
                    <select
                      className="h-7 w-full bg-transparent text-sm font-semibold text-rose-900 outline-none dark:text-rose-100"
                      value={config.max_battery_qty}
                      onChange={(event) => updateConfig(config.battery_model, { max_battery_qty: toNumber(event.target.value, associationMax) })}
                    >
                      {Array.from({ length: associationMax }, (_, index) => index + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RulesEditor(props: {
  rows: AccessoryRuleRow[];
  form: Partial<AccessoryRuleRow>;
  setForm: (value: Partial<AccessoryRuleRow>) => void;
  essRows: EssCompatibilityRuleRow[];
  essForm: Partial<EssCompatibilityRuleRow>;
  setEssForm: (value: Partial<EssCompatibilityRuleRow>) => void;
  accessories: AccessoryRow[];
  inverters: InverterRow[];
  batteries: BatteryRow[];
  onSave: (afterPersist?: () => void) => void;
  onSaveEss: (afterPersist?: () => void) => void;
  onRemove: (id: string) => void;
  onRemoveEss: (id: string) => void;
  removingIds: Set<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const { essForm, setEssForm } = props;
  const [rulesTab, setRulesTab] = useState<'accessories' | 'ess'>('ess');
  const [formOpen, setFormOpen] = useState(false);
  const [essFormOpen, setEssFormOpen] = useState(false);
  const [query, setQuery] = useState('');

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.rows;
    return props.rows.filter((row) =>
      [row.name, row.accessories?.model, row.comment].some((value) => value?.toLowerCase().includes(q))
    );
  }, [props.rows, query]);

  const visibleEssRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.essRows;
    return props.essRows.filter((row) =>
      [row.inverter_model, row.battery_model, row.comment, ...normalizeEssBatteryConfigs(row, props.batteries).map((config) => config.battery_model)].some(
        (value) => value?.toLowerCase().includes(q)
      )
    );
  }, [props.essRows, props.batteries, query]);
  const registeredGridTypeOptions = useMemo(() => {
    const values = new Set<InverterGridType>();
    for (const inverter of props.inverters) {
      for (const gridType of normalizeInverterGridTypes(inverter.grid_types)) {
        values.add(gridType);
      }
    }
    return inverterGridTypeOptions.filter((option) => values.has(option.value));
  }, [props.inverters]);

  function openNew() {
    setForm(emptyRule);
    setFormOpen(true);
  }

  function openEdit(row: AccessoryRuleRow) {
    setForm(row);
    setFormOpen(true);
  }

  function openNewEss() {
    setEssForm(emptyEssRule);
    setEssFormOpen(true);
  }

  function openEditEss(row: EssCompatibilityRuleRow) {
    setEssForm(row);
    setEssFormOpen(true);
  }

  const selectedEssInverter = props.inverters.find((inverter) => inverter.model === essForm.inverter_model);
  const selectedEssInverterGridTypes = normalizeInverterGridTypes(selectedEssInverter?.grid_types);
  const selectedEssInverterTopologies = inverterSupportedBatteryTopologies(selectedEssInverter);

  return (
    <div className="space-y-4">
      <SegmentedTabs
        label="Tipo de regra"
        value={rulesTab}
        options={[
          { value: 'ess', label: 'ESS', count: props.essRows.length },
          { value: 'accessories', label: 'Acessórios', count: props.rows.length },
        ]}
        onChange={(value) => setRulesTab(value as 'accessories' | 'ess')}
      />

      {rulesTab === 'accessories' && (
        <CatalogLayout
          title="Regras de acessórios"
          count={visibleRows.length}
          formOpen={formOpen}
          formTitle={form.id ? 'Editar regra' : 'Nova regra'}
          newLabel="Nova regra"
          onNew={openNew}
          onClose={() => setFormOpen(false)}
          search={
            <label className="relative block sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar regra"
                className="pl-8"
                placeholder="Buscar por nome ou acessório..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          }
          form={
        <>
          <Field label="Nome da regra">
            <Input value={form.name ?? ''} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Acessório">
            <select
              className={selectClasses()}
              value={form.accessory_id ?? ''}
              onChange={(event) => setForm({ ...form, accessory_id: event.target.value })}
            >
              <option value="">Selecione</option>
              {props.accessories.map((accessory) => (
                <option key={accessory.id} value={accessory.id}>
                  {accessory.model}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inclusão">
              <select
                className={selectClasses()}
                value={form.inclusion ?? 'required'}
                onChange={(event) => setForm({ ...form, inclusion: event.target.value as Inclusion })}
              >
                <option value="required">Obrigatório</option>
                <option value="optional">Opcional</option>
              </select>
            </Field>
            <NumberWithUnitField
              label="Quantidade do acessório"
              tip="Quantidade adicionada quando a regra for aplicada."
              icon={<Boxes className="h-4 w-4" />}
              unit="un."
              value={form.quantity_per_match ?? 1}
              onChange={(event) => setForm({ ...form, quantity_per_match: toNumber(event.target.value, 1) })}
            />
            <Field label="Limiar baseado em">
              <select
                className={selectClasses()}
                value={form.trigger_metric ?? 'battery_quantity'}
                onChange={(event) => {
                  const trigger_metric = event.target.value as TriggerMetric;
                  setForm({
                    ...form,
                    trigger_metric,
                    min_quantity: trigger_metric === 'per_solution' ? 1 : form.min_quantity,
                  });
                }}
              >
                <option value="per_solution">Por solução</option>
                <option value="inverter_quantity">Qtd. inversores</option>
                <option value="battery_quantity">Qtd. baterias</option>
                <option value="battery_ports_used">Portas de bateria</option>
              </select>
            </Field>
            <NumberWithUnitField
              label="Quantidade mínima"
              tip="Valor mínimo do critério escolhido para ativar a regra."
              icon={<Search className="h-4 w-4" />}
              unit="un."
              value={form.min_quantity ?? 1}
              disabled={form.trigger_metric === 'per_solution'}
              onChange={(event) => setForm({ ...form, min_quantity: toNumber(event.target.value, 1) })}
            />
          </div>

          <Separator />
          <p className="text-sm text-muted-foreground">
            Filtros vazios valem para qualquer combinação.
          </p>
          <Field asDiv label="Inversor">
            <InverterModelsInput
              inverters={props.inverters}
              value={form}
              onChange={(inverter_models) =>
                setForm({
                  ...form,
                  inverter_models,
                  inverter_model: inverter_models[0] ?? null,
                })
              }
            />
          </Field>
          <Field label="Bateria">
            <select
              className={selectClasses()}
              value={form.battery_model ?? ''}
              onChange={(event) => setForm({ ...form, battery_model: event.target.value || null })}
            >
              <option value="">Qualquer</option>
              {props.batteries.map((battery) => (
                <option key={battery.id} value={battery.model}>
                  {battery.model}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Comentário automático">
            <textarea
              className={textareaClasses()}
              value={form.comment ?? ''}
              onChange={(event) => setForm({ ...form, comment: event.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            Ativa
          </label>
          <Actions onSave={() => props.onSave(() => setFormOpen(false))} saving={props.saving} />
        </>
          }
          items={visibleRows.map((row) => ({
            id: row.id,
            title: row.name,
            badges: [row.inclusion === 'required' ? 'obrigatório' : 'opcional', row.active ? 'ativa' : 'inativa'],
            details: [
              ['Acessório', row.accessories?.model ?? '—'],
              ['Condição', row.trigger_metric === 'per_solution' ? 'Por solução' : `${formatTriggerMetric(row.trigger_metric)} >= ${row.min_quantity}`],
              ['Quantidade', String(row.quantity_per_match), true],
              ['Inversores', accessoryRuleInverterModels(row).length > 0 ? accessoryRuleInverterModels(row) : ['Qualquer'], true],
            ],
            description: row.comment ?? undefined,
            removing: props.removingIds.has(row.id),
            onEdit: () => openEdit(row),
            onRemove: () => props.onRemove(row.id),
            removeDescription: `A regra "${row.name}" será removida e não será mais aplicada às combinações.`,
          }))}
        />
      )}

      {rulesTab === 'ess' && (
        <CatalogLayout
          title="Regras ESS"
          count={visibleEssRows.length}
          formOpen={essFormOpen}
          formTitle={essForm.id ? 'Editar compatibilidade ESS' : 'Nova compatibilidade ESS'}
          newLabel="Nova regra ESS"
          onNew={openNewEss}
          onClose={() => setEssFormOpen(false)}
          search={
            <label className="relative block sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar regra ESS"
                className="pl-8"
                placeholder="Buscar por inversor ou bateria..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          }
          form={
            <>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Inversor</p>
                <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                  <Field label="Modelo">
                    <select
                      className={selectClasses()}
                      value={essForm.inverter_model ?? ''}
                      onChange={(event) => setEssForm({ ...essForm, inverter_model: event.target.value, grid_topology: null })}
                    >
                      <option value="">Selecione</option>
                      {props.inverters.map((inverter) => (
                        <option key={inverter.id} value={inverter.model}>
                          {inverter.model}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Máximo paralelo">
                    <select
                      className={selectClasses()}
                      value={essForm.max_parallel_inverters ?? 1}
                      onChange={(event) => setEssForm({ ...essForm, max_parallel_inverters: toNumber(event.target.value, 1) })}
                    >
                      {Array.from({ length: 10 }, (_, index) => index + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Redes do inversor:{' '}
                  <span className="font-medium text-foreground">
                    {selectedEssInverterGridTypes.length > 0
                      ? selectedEssInverterGridTypes.map(formatInverterGridType).join(', ')
                      : 'Selecione um inversor'}
                  </span>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">Bateria</p>
                <p className="text-xs text-muted-foreground">
                  Topologias compatíveis: {selectedEssInverterTopologies.join(', ') || 'selecione um inversor'}.
                </p>
                <EssBatteryConfigsInput
                  batteries={props.batteries}
                  supportedTopologies={selectedEssInverterTopologies}
                  value={essForm}
                  onChange={(battery_configs) =>
                    setEssForm({
                      ...essForm,
                      battery_configs,
                      battery_model: battery_configs[0]?.battery_model ?? '',
                      battery_topology: battery_configs[0]?.battery_topology ?? null,
                      min_battery_qty: battery_configs[0]?.min_battery_qty ?? 1,
                      max_battery_qty: battery_configs[0]?.max_battery_qty ?? 2,
                    })
                  }
                />
              </div>

              <Field label="Comentário">
                <textarea
                  className={textareaClasses()}
                  value={essForm.comment ?? ''}
                  onChange={(event) => setEssForm({ ...essForm, comment: event.target.value })}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={essForm.active ?? true}
                  onChange={(event) => setEssForm({ ...essForm, active: event.target.checked })}
                />
                Ativa
              </label>
              <Actions onSave={() => props.onSaveEss(() => setEssFormOpen(false))} saving={props.saving} />
            </>
          }
          items={visibleEssRows.map((row) => {
            const inverter = props.inverters.find((item) => item.model === row.inverter_model);
            const gridTypes = normalizeInverterGridTypes(inverter?.grid_types);
            const batteryConfigs = normalizeEssBatteryConfigs(row, props.batteries);
            const batteryTags = batteryConfigs.map(
              (config) => `${config.battery_model} (${config.min_battery_qty}–${config.max_battery_qty})`
            );
            return {
              id: row.id,
              title: `${row.inverter_model} + ${batteryConfigs.length} bateria${batteryConfigs.length === 1 ? '' : 's'}`,
              badges: [row.active ? 'ativa' : 'inativa', ...Array.from(new Set(batteryConfigs.map((config) => config.battery_topology)))],
              details: [
                ['Inversor', [row.inverter_model ?? '']],
                ['Baterias', batteryTags.length > 0 ? batteryTags : ['—']],
                ['Redes do inversor', gridTypes.map(formatInverterGridType).join(', ') || '—'],
                ['Máx. paralelo', String(row.max_parallel_inverters ?? 1)],
              ],
              description: row.comment ?? undefined,
              removing: props.removingIds.has(row.id),
              onEdit: () => openEditEss(row),
              onRemove: () => props.onRemoveEss(row.id),
              removeDescription: `A regra ESS de ${row.inverter_model} será removida e as combinações geradas por ela não serão mais atualizadas.`,
            };
          })}
        />
      )}
    </div>
  );
}

function EditorModal({
  open,
  title,
  children,
  footer,
  onClose,
  size = 'md',
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;

  const maxW = size === 'xl' ? 'max-w-6xl' : size === 'lg' ? 'max-w-5xl' : 'max-w-[46rem]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 px-3 py-4 sm:px-6 sm:py-8"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${maxW} rounded-lg bg-card text-card-foreground shadow-xl ring-1 ring-border`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-lg border-b bg-card px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <Button variant="ghost" size="icon-sm" aria-label={`Fechar ${title}`} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-4 pt-4">
          <div className="space-y-4">{children}</div>
        </div>
        {footer && (
          <div className="flex flex-wrap items-center gap-2 rounded-b-lg border-t bg-card px-4 py-3">
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}

function CatalogLayout({
  title,
  count,
  formOpen,
  formTitle,
  newLabel = 'Novo',
  onNew,
  onClose,
  form,
  filter,
  search,
  items,
}: {
  title: string;
  count: number;
  formOpen: boolean;
  formTitle: string;
  newLabel?: string;
  onNew: () => void;
  onClose: () => void;
  form: React.ReactNode;
  filter?: React.ReactNode;
  search?: React.ReactNode;
  items: {
    id: string;
    title: string;
    description?: string;
    badges?: string[];
    details: [string, string | string[], true?][];
    media?: React.ReactNode;
    removing?: boolean;
    onEdit: () => void;
    onRemove: () => void;
    removeDescription?: string;
  }[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader title={title} count={count} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {search}
          <Button onClick={onNew}>
            <Plus className="h-4 w-4" />
            {newLabel}
          </Button>
        </div>
      </div>

      {filter}

      <EditorModal open={formOpen} title={formTitle} onClose={onClose}>
        {form}
      </EditorModal>

      <RecordCardGrid items={items} />
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">
        {count} registro{count === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function SegmentedTabs({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; count: number }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <Badge variant="outline">
          {options.find((option) => option.value === value)?.count ?? 0}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              }`}
              onClick={() => onChange(option.value)}
            >
              <span>{option.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.7rem] ${
                  active ? 'bg-primary/10 text-primary' : 'bg-background text-muted-foreground'
                }`}
              >
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetailItem({ label, value, className }: { label: string; value: string | string[]; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      {Array.isArray(value) ? (
        <div className="flex flex-wrap gap-1">
          {value.length > 0
            ? value.map((v) => (
                <span key={v} className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-xs font-medium leading-tight">
                  {v || '—'}
                </span>
              ))
            : <span className="text-sm font-medium">—</span>
          }
        </div>
      ) : (
        <p className="truncate text-sm font-medium">{value || '—'}</p>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function RemovingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
        <Skeleton className="h-4 w-4 rounded-full" />
        {label}
      </div>
    </div>
  );
}

function RecordCardGrid({
  items,
}: {
  items: {
    id: string;
    title: string;
    description?: string;
    badges?: string[];
    details: [string, string | string[], true?][];
    media?: React.ReactNode;
    removing?: boolean;
    onEdit: () => void;
    onRemove: () => void;
    removeDescription?: string;
  }[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.id} size="sm" className={cn('relative flex h-full flex-col', item.removing && 'opacity-70')}>
          {item.removing && <RemovingOverlay label="Removendo..." />}
          <CardHeader>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="truncate uppercase">{item.title}</CardTitle>
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
              {item.badges && item.badges.length > 0 && (
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {item.badges.map((badge) => (
                    <Badge key={badge} variant={badge.includes('inativ') ? 'outline' : 'secondary'}>
                      {badge}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <div className="flex-1 space-y-3">
              {item.details.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {item.details.map(([label, value, span]) => (
                    <DetailItem key={label} label={label} value={value || '—'} className={span ? 'col-span-2' : undefined} />
                  ))}
                </div>
              )}
              {item.media}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={item.onEdit} disabled={item.removing}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              <ConfirmDeleteButton
                ariaLabel={`Remover ${item.title}`}
                title={`Remover ${item.title}?`}
                description={item.removeDescription ?? 'Esse registro será removido do cadastro administrativo.'}
                confirmLabel="Remover"
                disabled={item.removing}
                onConfirm={item.onRemove}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
