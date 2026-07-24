import {
  BarChart3,
  Battery,
  Boxes,
  Cable,
  Database,
  FileClock,
  Layers,
  ListChecks,
  Plug,
  Users,
  Zap,
} from 'lucide-react';
import type { BatteryFlag, InverterFlag, ProductDocument } from '@/lib/types';

export type { BatteryFlag, InverterFlag };

export type TabKey =
  | 'metrics'
  | 'users'
  | 'solutions'
  | 'inverters'
  | 'batteries'
  | 'accessories'
  | 'rules'
  | 'loads'
  | 'presets'
  | 'logs';

export type InverterGridType = '1P_220V' | '2P_220V' | '3P_220V' | '3P_380V';
export type GridTopology = '1p_220V' | '2p_220V' | '3p_220V' | '3p_380V' | InverterGridType;
export type BatteryTopology = 'HV' | 'LV';
export type Inclusion = 'required' | 'optional';
export type TriggerMetric = 'per_solution' | 'inverter_quantity' | 'battery_quantity' | 'battery_ports_used';
export type ProductEditorTab = 'general' | 'media';

export const inverterGridTypeOptions: { value: InverterGridType; label: string }[] = [
  { value: '1P_220V', label: 'Monofásica 220V' },
  { value: '2P_220V', label: 'Bifásica 220V' },
  { value: '3P_220V', label: 'Trifásica 220V' },
  { value: '3P_380V', label: 'Trifásica 380V' },
];

export const inverterGridTypeLabels = new Map(
  inverterGridTypeOptions.map((option) => [option.value, option.label])
);

export const legacyInverterGridTypeMap: Record<string, InverterGridType> = {
  singlePhase_220: '1P_220V',
  splitPhase_220: '2P_220V',
  threePhase_220: '3P_220V',
  threePhase_380: '3P_380V',
  '1p_220V': '1P_220V',
  '2p_220V': '2P_220V',
  '3p_220V': '3P_220V',
  '3p_380V': '3P_380V',
};

export const inverterFlagOptions: { value: InverterFlag; label: string }[] = [
  { value: 'microgrid', label: 'Microrrede' },
  { value: 'super_backup', label: 'Super-Backup' },
  { value: 'dual_voltage', label: 'Dual Voltage' },
  { value: 'external_ats', label: 'ATS Externo' },
  { value: 'external_generator', label: 'Gerador Externo' },
];

export const inverterFlagLabels = new Map(
  inverterFlagOptions.map((option) => [option.value, option.label])
);

export const batteryFlagOptions: { value: BatteryFlag; label: string }[] = [
  { value: 'ip65', label: 'IP65' },
  { value: 'ip66', label: 'IP66' },
];

export const batteryFlagLabels = new Map(
  batteryFlagOptions.map((option) => [option.value, option.label])
);

export const productEditorTabOptions: { value: ProductEditorTab; label: string }[] = [
  { value: 'general', label: 'Informações' },
  { value: 'media', label: 'Mídias' },
];

export interface InverterRow {
  id: string;
  model: string;
  /** Optional friendly name, shown to end users more prominently than `model` when set. */
  nickname?: string | null;
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
  max_power_per_phase_w: number | null;
  flags: InverterFlag[];
  pv_oversizing_percent: number;
  image_url: string | null;
  documents: ProductDocument[];
}

export interface BatteryRow {
  id: string;
  model: string;
  /** Optional friendly name, shown to end users more prominently than `model` when set. */
  nickname?: string | null;
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
  /** Model shown for units 2..N when this is a "Master" battery that scales via
   * electrically-identical expansion/"Slave" units instead of more of itself. */
  expansion_model?: string | null;
  image_url: string | null;
  documents: ProductDocument[];
}

export interface AccessoryRow {
  id: string;
  model: string;
  /** Optional friendly name, shown to end users more prominently than `model` when set. */
  nickname?: string | null;
  description: string | null;
  active: boolean;
  image_url: string | null;
  documents: ProductDocument[];
}

export interface LoadCatalogRow {
  id: string;
  name_pt: string;
  name_en: string;
  name_zh: string;
  power_w: number;
  category: string;
  ip_in_ratio: number;
  active: boolean;
}

export interface PresetLoad {
  name: string;
  powerW: number;
  hoursPerDay: number;
  qty: number;
  ipInRatio: number;
}

export interface PresetRow {
  id: string;
  name: string;
  description: string;
  loads: PresetLoad[];
  display_order: number;
}

export interface AccessoryRuleRow {
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
  /** When true, the applied quantity is quantity_per_match multiplied by the
   * trigger_metric's live value (e.g. "1 per battery port in use") instead
   * of a flat quantity_per_match regardless of how far past min_quantity the
   * metric is. No effect when trigger_metric is 'per_solution' (always 1). */
  scale_with_metric: boolean;
  comment: string | null;
  /** Empty/null = no feature condition. Non-empty = the customer must have
   * enabled at least one of these (OR). Values are DesiredFeatureId strings
   * (see lib/desired-features.ts). Only ever evaluated live per-request by
   * the calculate-residential Edge Function — the bulk solution generator
   * below has no customer context, so it skips rules that set this. */
  desired_features: string[] | null;
  active: boolean;
  accessories?: { model: string } | null;
}

export interface EssBatteryConfig {
  battery_model: string;
  battery_topology: BatteryTopology;
  min_battery_qty: number;
  max_battery_qty: number;
}

export interface EssCompatibilityRuleRow {
  id: string;
  name: string | null;
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

export interface SolutionRow {
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

export type GeneratedSolutionPayload = Omit<SolutionRow, 'id'>;

export interface UserProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: 'user' | 'admin';
  company_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SimulationRow {
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

export type AdminLogEntity =
  | 'inverter'
  | 'battery'
  | 'accessory'
  | 'solution'
  | 'rule'
  | 'load_catalog_item'
  | 'load_preset';
export type AdminLogAction = 'create' | 'update' | 'delete' | 'deactivate';

export interface AdminActivityLogRow {
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

export const tabs: { key: TabKey; label: string; icon: typeof Database }[] = [
  { key: 'metrics', label: 'Indicadores', icon: BarChart3 },
  { key: 'batteries', label: 'Baterias', icon: Battery },
  { key: 'inverters', label: 'Inversores', icon: Zap },
  { key: 'accessories', label: 'Acessórios', icon: Cable },
  { key: 'rules', label: 'Regras', icon: ListChecks },
  { key: 'loads', label: 'Cargas', icon: Plug },
  { key: 'presets', label: 'Presets', icon: Layers },
  { key: 'solutions', label: 'Combinações', icon: Boxes },
  { key: 'users', label: 'Usuários', icon: Users },
  { key: 'logs', label: 'Logs', icon: FileClock },
];

export const emptyInverter: Partial<InverterRow> = {
  model: '',
  nickname: '',
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
  max_power_per_phase_w: null,
  flags: [],
  pv_oversizing_percent: 100,
  image_url: '',
  documents: [],
};

export const emptyBattery: Partial<BatteryRow> = {
  model: '',
  nickname: '',
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
  expansion_model: '',
  image_url: '',
  documents: [],
};

export const emptyAccessory: Partial<AccessoryRow> = {
  model: '',
  nickname: '',
  description: '',
  active: true,
  image_url: '',
  documents: [],
};

export const emptyLoadCatalogItem: Partial<LoadCatalogRow> = {
  name_pt: '',
  name_en: '',
  name_zh: '',
  power_w: 0,
  category: '',
  ip_in_ratio: 1,
  active: true,
};

export const emptyPreset: Partial<PresetRow> = {
  name: '',
  description: '',
  loads: [],
  display_order: 0,
};

export const emptyRule: Partial<AccessoryRuleRow> = {
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
  scale_with_metric: false,
  comment: '',
  desired_features: [],
  active: true,
};

export const emptyEssRule: Partial<EssCompatibilityRuleRow> = {
  name: '',
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

export const emptySolution: Partial<SolutionRow> = {
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
