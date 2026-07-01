'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  Battery,
  Cable,
  CircleHelp,
  BarChart3,
  Database,
  FileClock,
  FileText,
  ImageIcon,
  LogOut,
  Menu,
  Pencil,
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

type TabKey = 'metrics' | 'users' | 'solutions' | 'inverters' | 'batteries' | 'accessories' | 'rules' | 'logs';

type InverterGridType = '1P_220V' | '2P_220V' | '3P_220V' | '3P_380V';
type GridTopology = '1p_220V' | '3p_220V' | '3p_380V' | InverterGridType;
type InverterFlag = 'microgrid' | 'super_backup' | 'dual_voltage' | 'external_ats';
type BatteryTopology = 'HV' | 'LV';
type Inclusion = 'required' | 'optional';
type TriggerMetric = 'per_solution' | 'inverter_quantity' | 'battery_quantity' | 'battery_ports_used';

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
  flags: InverterFlag[];
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

interface EssCompatibilityRuleRow {
  id: string;
  inverter_model: string;
  battery_model: string;
  battery_topology: BatteryTopology | null;
  grid_topology: GridTopology | null;
  max_parallel_inverters: number;
  min_battery_qty: number;
  max_battery_qty: number;
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

type AdminLogEntity = 'inverter' | 'battery' | 'accessory' | 'solution' | 'rule';
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
  flags: [],
  image_url: '',
  documents: [],
};

const emptyBattery: Partial<BatteryRow> = {
  model: '',
  capacity_kwh: 0,
  topology: 'HV',
  standard_power_kw: 0,
  peak_power_kw: 0,
  min_soc_percent: 10,
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

function accessoryRuleMatches(solution: GeneratedSolutionPayload, rule: AccessoryRuleRow) {
  if (!rule.active) return false;
  const inverterModels = accessoryRuleInverterModels(rule);
  if (inverterModels.length > 0 && !inverterModels.includes(solution.inverter_model)) return false;
  if (rule.battery_model && rule.battery_model !== solution.battery_model) return false;
  if (rule.grid_topology) {
    const ruleGrid = normalizeInverterGridType(rule.grid_topology);
    const solutionGrid = normalizeInverterGridType(solution.grid_topology);
    if (ruleGrid && solutionGrid && ruleGrid !== solutionGrid) return false;
    if (!ruleGrid && rule.grid_topology !== solution.grid_topology) return false;
  }
  if (rule.battery_topology && rule.battery_topology !== solution.battery_topology) return false;
  return solutionRuleMetricValue(solution, rule.trigger_metric) >= rule.min_quantity;
}

function applyAccessoryRules(solution: GeneratedSolutionPayload, rules: AccessoryRuleRow[]) {
  const accessories = new Map<string, number>();
  const comments: string[] = [];

  for (const rule of rules) {
    if (!rule.accessories?.model || !accessoryRuleMatches(solution, rule)) continue;
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
}: {
  inverters: InverterRow[];
  batteries: BatteryRow[];
  accessoryRules: AccessoryRuleRow[];
  essRules: EssCompatibilityRuleRow[];
}) {
  const inverterByModel = new Map(inverters.map((inverter) => [inverter.model, inverter]));
  const batteryByModel = new Map(batteries.map((battery) => [battery.model, battery]));
  const generated: GeneratedSolutionPayload[] = [];
  const seen = new Set<string>();

  for (const rule of essRules) {
    if (!rule.active || !rule.inverter_model || !rule.battery_model) continue;
    const inverter = inverterByModel.get(rule.inverter_model);
    const battery = batteryByModel.get(rule.battery_model);
    if (!inverter || !battery) continue;
    if (rule.battery_topology && rule.battery_topology !== battery.topology) continue;

    const inverterGridTypes = normalizeInverterGridTypes(inverter.grid_types);
    const ruleGridType = rule.grid_topology ? normalizeInverterGridType(rule.grid_topology) : null;
    const gridTypes = ruleGridType ? [ruleGridType] : inverterGridTypes;
    const validGridTypes = gridTypes.filter((gridType) => inverterGridTypes.includes(gridType));
    const minBatteryQty = clampNumber(rule.min_battery_qty, 1, 7, 1);
    const maxBatteryQty = Math.max(minBatteryQty, clampNumber(rule.max_battery_qty, 2, 15, 2));
    const inverterQtyMax = Math.max(1, toNumber(rule.max_parallel_inverters, 1));

    for (const gridType of validGridTypes) {
      for (let inverterQty = 1; inverterQty <= inverterQtyMax; inverterQty += 1) {
        for (let batteryQty = minBatteryQty; batteryQty <= maxBatteryQty; batteryQty += 1) {
          const approvedGridTopology = generatedGridToApprovedTopology(gridType);
          const solutionCode = [
            'rules',
            slugPart(inverter.model),
            slugPart(battery.model),
            gridType,
            `${inverterQty}I`,
            `${batteryQty}B`,
          ].join('_');
          if (seen.has(solutionCode)) continue;
          seen.add(solutionCode);

          const ratedPowerW = Math.max(1, Math.round(toNumber(inverter.standard_power_kva, inverter.power_kw) * 1000 * inverterQty));
          const peakPowerW = Math.max(ratedPowerW, Math.round(toNumber(inverter.peak_power_kva, inverter.power_kw) * 1000 * inverterQty));
          const batteryPowerW = Math.max(1, Math.round(toNumber(battery.standard_power_kw, battery.capacity_kwh) * 1000 * batteryQty));
          const availableEnergyWh = Math.max(
            1,
            Math.round(toNumber(battery.capacity_kwh) * (1 - toNumber(battery.min_soc_percent, 10) / 100) * 1000 * batteryQty)
          );
          const portsUsed = Math.max(1, Math.min(toNumber(inverter.battery_ports, 1), batteryQty));
          const baseSolution: GeneratedSolutionPayload = {
            source_file: 'generated-rules',
            solution_code: solutionCode,
            schema_version: '1.0',
            inverter_model: inverter.model,
            inverter_quantity: inverterQty,
            battery_ports_used: portsUsed,
            nominal_voltage_v: nominalVoltageForGrid(gridType),
            rated_power_w: ratedPowerW,
            peak_power_w: peakPowerW,
            grid_topology: approvedGridTopology,
            battery_model: battery.model,
            battery_topology: battery.topology,
            battery_quantity: batteryQty,
            battery_power_w: batteryPowerW,
            available_energy_wh: availableEnergyWh,
            accessories: [],
            comments: [`Gerada por regra ESS para ${formatInverterGridType(gridType)}.`],
            raw_solution: {},
            active: true,
          };
          const ruleExtras = applyAccessoryRules(baseSolution, accessoryRules);
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

  return generated.sort((a, b) =>
    a.inverter_model.localeCompare(b.inverter_model) ||
    a.battery_model.localeCompare(b.battery_model) ||
    a.battery_quantity - b.battery_quantity
  );
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
  const [rules, setRules] = useState<AccessoryRuleRow[]>([]);
  const [essRules, setEssRules] = useState<EssCompatibilityRuleRow[]>([]);
  const [solutions, setSolutions] = useState<SolutionRow[]>([]);
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [simulations, setSimulations] = useState<SimulationRow[]>([]);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLogRow[]>([]);

  const [inverterForm, setInverterForm] = useState<Partial<InverterRow>>(emptyInverter);
  const [batteryForm, setBatteryForm] = useState<Partial<BatteryRow>>(emptyBattery);
  const [accessoryForm, setAccessoryForm] = useState<Partial<AccessoryRow>>(emptyAccessory);
  const [ruleForm, setRuleForm] = useState<Partial<AccessoryRuleRow>>(emptyRule);
  const [essRuleForm, setEssRuleForm] = useState<Partial<EssCompatibilityRuleRow>>(emptyEssRule);
  const [solutionForm, setSolutionForm] = useState<Partial<SolutionRow>>(emptySolution);
  const [solutionAccessoriesText, setSolutionAccessoriesText] = useState('[]');
  const [solutionCommentsText, setSolutionCommentsText] = useState('[]');
  const [solutionQuery, setSolutionQuery] = useState('');

  async function loadData(showSkeleton = true) {
    if (showSkeleton) setLoading(true);
    setError(null);

    const [
      inverterResult,
      batteryResult,
      accessoryResult,
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
      supabase
        .from('accessory_rules')
        .select('*, accessories (model)')
        .order('created_at', { ascending: false }),
      supabase
        .from('ess_compatibility_rules')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('approved_solutions')
        .select('*')
        .order('rated_power_w', { ascending: true })
        .limit(300),
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
        .limit(200),
    ]);

    const firstError =
      inverterResult.error ??
      batteryResult.error ??
      accessoryResult.error ??
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
    const text = `${solution.solution_code} ${solution.inverter_model} ${solution.battery_model}`.toLowerCase();
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
    setSolutionAccessoriesText(JSON.stringify(solution.accessories ?? [], null, 2));
    setSolutionCommentsText(JSON.stringify(solution.comments ?? [], null, 2));
  }

  function resetSolution() {
    setSolutionForm(emptySolution);
    setSolutionAccessoriesText('[]');
    setSolutionCommentsText('[]');
  }

  async function saveInverter() {
    setSaving(true);
    setStatus(inverterForm.id ? 'Atualizando inversor...' : 'Salvando inversor...');
    setError(null);
    const action: AdminLogAction = inverterForm.id ? 'update' : 'create';
    const beforeData = inverterForm.id ? inverters.find((row) => row.id === inverterForm.id) : null;
    const payload = {
      model: inverterForm.model?.trim(),
      power_kw: toNumber(inverterForm.power_kw),
      standard_power_kva: toNumber(inverterForm.standard_power_kva),
      peak_power_kva: toNumber(inverterForm.peak_power_kva),
      phases: toNumber(inverterForm.phases, 1),
      topology: inverterForm.topology,
      grid_types: normalizeInverterGridTypes(inverterForm.grid_types),
      max_battery_qty: toNumber(inverterForm.max_battery_qty, 1),
      battery_ports: clampNumber(inverterForm.battery_ports, 1, 2, 1),
      flags: normalizeInverterFlags(inverterForm.flags),
      image_url: inverterForm.image_url?.trim() || null,
      documents: inverterForm.documents ?? [],
    };

    const request = inverterForm.id
      ? supabase.from('inverters').update(payload).eq('id', inverterForm.id)
      : supabase.from('inverters').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
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
      standard_power_kw: toNumber(batteryForm.standard_power_kw),
      peak_power_kw: toNumber(batteryForm.peak_power_kw),
      min_soc_percent: toNumber(batteryForm.min_soc_percent, 10),
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

  async function saveAccessory() {
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

  async function saveRule() {
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

  async function saveEssRule() {
    setSaving(true);
    setStatus(essRuleForm.id ? 'Atualizando regra ESS...' : 'Salvando regra ESS...');
    setError(null);
    const action: AdminLogAction = essRuleForm.id ? 'update' : 'create';
    const beforeData = essRuleForm.id ? essRules.find((row) => row.id === essRuleForm.id) : null;
    const payload = {
      inverter_model: essRuleForm.inverter_model?.trim(),
      battery_model: essRuleForm.battery_model?.trim(),
      battery_topology: essRuleForm.battery_topology || null,
      grid_topology: null,
      max_parallel_inverters: clampNumber(essRuleForm.max_parallel_inverters, 1, 10, 1),
      min_battery_qty: clampNumber(essRuleForm.min_battery_qty, 1, 7, 1),
      max_battery_qty: clampNumber(essRuleForm.max_battery_qty, 2, 15, 2),
      comment: essRuleForm.comment?.trim() || null,
      active: essRuleForm.active ?? true,
    };

    const request = essRuleForm.id
      ? supabase.from('ess_compatibility_rules').update(payload).eq('id', essRuleForm.id)
      : supabase.from('ess_compatibility_rules').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
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

  async function saveSolution() {
    setSaving(true);
    setStatus(solutionForm.id ? 'Atualizando combinação...' : 'Salvando combinação...');
    setError(null);
    const action: AdminLogAction = solutionForm.id ? 'update' : 'create';
    const beforeData = solutionForm.id ? solutions.find((row) => row.id === solutionForm.id) : null;

    try {
      const accessoriesJson = parseJson<{ model: string | null; quantity: number }[]>(
        solutionAccessoriesText,
        []
      );
      const commentsJson = parseJson<string[]>(solutionCommentsText, []);
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

  async function applyGeneratedSolutions(generatedSolutions: GeneratedSolutionPayload[]) {
    if (generatedSolutions.length === 0) {
      setFailure('Nenhuma combinação para gerar.');
      return;
    }

    setSaving(true);
    setStatus(`Gerando ${generatedSolutions.length} combinações...`);
    setError(null);

    const { error: upsertError } = await supabase
      .from('approved_solutions')
      .upsert(generatedSolutions, { onConflict: 'source_file,solution_code' });

    setSaving(false);
    if (upsertError) return setFailure(upsertError.message);

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

    setSuccess(`${generatedSolutions.length} combinações geradas/atualizadas.`);
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
            <Button variant="outline" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="hidden min-h-0 gap-2 overflow-y-auto rounded-lg border bg-card p-2 lg:flex lg:flex-col">
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
                    accessoriesText={solutionAccessoriesText}
                    setAccessoriesText={setSolutionAccessoriesText}
                    commentsText={solutionCommentsText}
                    setCommentsText={setSolutionCommentsText}
                    inverters={inverters}
                    batteries={batteries}
                    accessoryRules={rules}
                    essRules={essRules}
                    onEdit={editSolution}
                    onNew={resetSolution}
                    onSave={saveSolution}
                    onApplyGenerated={applyGeneratedSolutions}
                    onRemove={(id) => removeRow('approved_solutions', id, true)}
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
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
  return <Input type="number" inputMode="decimal" {...props} />;
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
    <div className="flex flex-wrap gap-2">
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
            <div key={`${document.url}-${index}`} className="grid gap-2 rounded-lg border bg-background p-2">
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
  return (
    <section className="space-y-3">
      <SectionHeader title="Usuários cadastrados" count={users.length} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => (
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
  return (
    <section className="space-y-3">
      <SectionHeader title="Logs de alterações" count={logs.length} />
      {logs.length === 0 ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Ainda não há alterações registradas em produtos, combinações ou regras.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {logs.map((log) => (
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
  accessoriesText: string;
  setAccessoriesText: (value: string) => void;
  commentsText: string;
  setCommentsText: (value: string) => void;
  inverters: InverterRow[];
  batteries: BatteryRow[];
  accessoryRules: AccessoryRuleRow[];
  essRules: EssCompatibilityRuleRow[];
  onEdit: (row: SolutionRow) => void;
  onNew: () => void;
  onSave: () => void;
  onApplyGenerated: (generatedSolutions: GeneratedSolutionPayload[]) => void;
  onRemove: (id: string) => void;
  removingIds: Set<string>;
  saving: boolean;
}) {
  const { form, setForm } = props;
  const [formOpen, setFormOpen] = useState(false);
  const [selectedInverter, setSelectedInverter] = useState<string>('all');
  const [selectedBattery, setSelectedBattery] = useState<string>('all');
  const [generatorOpen, setGeneratorOpen] = useState(false);

  const generatedSolutions = useMemo(
    () =>
      buildRuleGeneratedSolutions({
        inverters: props.inverters,
        batteries: props.batteries,
        accessoryRules: props.accessoryRules,
        essRules: props.essRules,
      }),
    [props.inverters, props.batteries, props.accessoryRules, props.essRules]
  );
  const existingGeneratedCodes = useMemo(
    () =>
      new Set(
        props.solutions
          .filter((solution) => solution.source_file === 'generated-rules')
          .map((solution) => solution.solution_code)
      ),
    [props.solutions]
  );
  const newGeneratedCount = generatedSolutions.filter(
    (solution) => !existingGeneratedCodes.has(solution.solution_code)
  ).length;
  const updatedGeneratedCount = generatedSolutions.length - newGeneratedCount;
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

  const visibleSolutions =
    selectedBattery === 'all'
      ? solutionsByInverter
      : solutionsByInverter.filter((solution) => solution.battery_model === selectedBattery);

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

  function openNew() {
    props.onNew();
    setFormOpen(true);
  }

  function openEdit(solution: SolutionRow) {
    props.onEdit(solution);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeader title="Combinações aprovadas" count={visibleSolutions.length} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-80">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar combinações"
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
            <Button variant="outline" onClick={() => setGeneratorOpen(true)}>
              <Zap className="h-4 w-4" />
              Gerar por regras
            </Button>
          </div>
        </div>

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
        </div>

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visibleSolutions.map((solution) => {
            const removing = props.removingIds.has(solution.id);
            return (
            <Card key={solution.id} size="sm" className={removing ? 'relative opacity-70' : 'relative'}>
              {removing && <RemovingOverlay label="Inativando..." />}
              <CardHeader>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{solution.solution_code}</CardTitle>
                    <p className="truncate text-xs text-muted-foreground">{solution.source_file}</p>
                  </div>
                  <Badge variant={solution.active ? 'secondary' : 'outline'}>
                    {solution.active ? 'ativa' : 'inativa'}
                  </Badge>
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
                    description="A combinação deixará de ser usada nas recomendações."
                    confirmLabel="Inativar"
                    disabled={removing}
                    onConfirm={() => props.onRemove(solution.id)}
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
      </section>

      {generatorOpen && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Gerador por regras</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preview das combinações criadas a partir das regras ESS ativas e das regras de acessórios.
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar gerador" onClick={() => setGeneratorOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Total no preview" value={String(generatedSolutions.length)} />
              <MetricCard label="Novas" value={String(newGeneratedCount)} />
              <MetricCard label="Atualizações" value={String(updatedGeneratedCount)} />
            </div>
            {generatedSolutions.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
                Nenhuma combinação foi gerada. Verifique se há regras ESS ativas com inversor, bateria e redes compatíveis.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="max-h-80 overflow-auto rounded-lg border">
                  <div className="grid gap-0 divide-y">
                    {generatedSolutions.slice(0, 20).map((solution) => (
                      <div key={solution.solution_code} className="grid gap-2 p-3 text-sm md:grid-cols-[1.2fr_1fr_0.7fr_0.7fr]">
                        <span className="min-w-0 truncate font-medium">{solution.solution_code}</span>
                        <span className="text-muted-foreground">{solution.inverter_model}</span>
                        <span className="text-muted-foreground">{solution.battery_model} x{solution.battery_quantity}</span>
                        <span className="text-muted-foreground">{solution.available_energy_wh} Wh</span>
                      </div>
                    ))}
                  </div>
                </div>
                {generatedSolutions.length > 20 && (
                  <p className="text-xs text-muted-foreground">
                    Mostrando 20 de {generatedSolutions.length} combinações.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => props.onApplyGenerated(generatedSolutions)} disabled={props.saving}>
                    <Save className="h-4 w-4" />
                    Aplicar combinações
                  </Button>
                  <Button variant="ghost" onClick={() => setGeneratorOpen(false)} disabled={props.saving}>
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
            <Field label="Qtd. inversores">
              <NumberInput
                value={form.inverter_quantity ?? 1}
                onChange={(event) => setForm({ ...form, inverter_quantity: toNumber(event.target.value, 1) })}
              />
            </Field>
            <Field label="Portas bateria">
              <NumberInput
                value={form.battery_ports_used ?? 1}
                onChange={(event) => setForm({ ...form, battery_ports_used: toNumber(event.target.value, 1) })}
              />
            </Field>
            <Field label="Potência nominal W">
              <NumberInput
                value={form.rated_power_w ?? 0}
                onChange={(event) => setForm({ ...form, rated_power_w: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Potência pico W">
              <NumberInput
                value={form.peak_power_w ?? 0}
                onChange={(event) => setForm({ ...form, peak_power_w: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Tensão V">
              <NumberInput
                value={form.nominal_voltage_v ?? 220}
                onChange={(event) => setForm({ ...form, nominal_voltage_v: toNumber(event.target.value, 220) })}
              />
            </Field>
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
            <Field label="Qtd. baterias">
              <NumberInput
                value={form.battery_quantity ?? 1}
                onChange={(event) => setForm({ ...form, battery_quantity: toNumber(event.target.value, 1) })}
              />
            </Field>
            <Field label="Potência bateria W">
              <NumberInput
                value={form.battery_power_w ?? 0}
                onChange={(event) => setForm({ ...form, battery_power_w: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Energia disponível Wh">
              <NumberInput
                value={form.available_energy_wh ?? 0}
                onChange={(event) => setForm({ ...form, available_energy_wh: toNumber(event.target.value) })}
              />
            </Field>
          </div>

          <Field label="Acessórios JSON">
            <textarea
              className={textareaClasses('font-mono')}
              value={props.accessoriesText}
              onChange={(event) => props.setAccessoriesText(event.target.value)}
            />
          </Field>
          <Field label="Comentários JSON">
            <textarea
              className={textareaClasses('font-mono')}
              value={props.commentsText}
              onChange={(event) => props.setCommentsText(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            Ativa para recomendação
          </label>
          <Actions
            onSave={props.onSave}
            onNew={openNew}
            onCancel={() => setFormOpen(false)}
            saving={props.saving}
          />
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
    </div>
  );
}

function InverterGridTypesInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (gridTypes: InverterGridType[]) => void;
}) {
  const selected = normalizeInverterGridTypes(value);

  function toggleGridType(gridType: InverterGridType) {
    if (selected.includes(gridType)) {
      onChange(selected.filter((item) => item !== gridType));
      return;
    }
    onChange([...selected, gridType]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {inverterGridTypeOptions.map((option) => {
        const active = selected.includes(option.value);
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
            onClick={() => toggleGridType(option.value)}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function InverterFlagsInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (flags: InverterFlag[]) => void;
}) {
  const selected = normalizeInverterFlags(value);

  function toggleFlag(flag: InverterFlag) {
    if (selected.includes(flag)) {
      onChange(selected.filter((item) => item !== flag));
      return;
    }
    onChange([...selected, flag]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {inverterFlagOptions.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/60 hover:text-foreground'
            )}
            onClick={() => toggleFlag(option.value)}
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
  onSave: () => void;
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

  function openNew() {
    setForm(emptyInverter);
    setFormOpen(true);
  }

  function openEdit(row: InverterRow) {
    setForm(row);
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Inversores"
      count={props.rows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar inversor' : 'Novo inversor'}
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      form={
        <>
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Potência padrão kVA">
              <NumberInput
                value={form.standard_power_kva ?? form.power_kw ?? 0}
                onChange={(event) => setForm({ ...form, standard_power_kva: toNumber(event.target.value), power_kw: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Potência pico kVA">
              <NumberInput
                value={form.peak_power_kva ?? 0}
                onChange={(event) => setForm({ ...form, peak_power_kva: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Fases">
              <InlineOptionTabs
                options={[
                  { value: 1, label: '1' },
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                ]}
                value={form.phases ?? 1}
                onChange={(phases) => setForm({ ...form, phases })}
              />
            </Field>
            <Field label="Topologia">
              <InlineOptionTabs
                options={[
                  { value: 'HV' as const, label: 'HV' },
                  { value: 'LV' as const, label: 'LV' },
                ]}
                value={form.topology === 'LV' ? 'LV' : 'HV'}
                onChange={(topology) => setForm({ ...form, topology })}
              />
            </Field>
            <Field label="Portas bateria">
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
          <Field label="Tipos de rede">
            <InverterGridTypesInput
              value={form.grid_types}
              onChange={(grid_types) => setForm({ ...form, grid_types })}
            />
          </Field>
          <Field label="Flags">
            <InverterFlagsInput
              value={form.flags}
              onChange={(flags) => setForm({ ...form, flags })}
            />
          </Field>
          <ProductMediaFields
            table="inverters"
            model={form.model}
            imageUrl={form.image_url}
            documents={form.documents}
            setImageUrl={(image_url) => setForm({ ...form, image_url })}
            setDocuments={(documents) => setForm({ ...form, documents })}
            uploadAsset={props.uploadAsset}
          />
          <Actions onSave={props.onSave} saving={props.saving} />
        </>
      }
      items={props.rows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.topology, `${row.phases} fase${row.phases === 1 ? '' : 's'}`],
        details: [
          ['Potência padrão', `${row.standard_power_kva ?? row.power_kw} kVA`],
          ['Potência pico', `${row.peak_power_kva ?? '-'} kVA`],
          ['Portas bateria', String(row.battery_ports ?? 1)],
          ['Redes', normalizeInverterGridTypes(row.grid_types).map(formatInverterGridType).join(', ') || '-'],
          ['Flags', formatInverterFlags(row.flags) || '-'],
        ],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
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

  function openNew() {
    setForm(emptyBattery);
    setFormOpen(true);
  }

  function openEdit(row: BatteryRow) {
    setForm(row);
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Baterias"
      count={props.rows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar bateria' : 'Nova bateria'}
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      form={
        <>
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <Field label="Capacidade kWh">
            <NumberInput
              value={form.capacity_kwh ?? 0}
              onChange={(event) => setForm({ ...form, capacity_kwh: toNumber(event.target.value) })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Potência padrão kW">
              <NumberInput
                value={form.standard_power_kw ?? 0}
                onChange={(event) => setForm({ ...form, standard_power_kw: toNumber(event.target.value) })}
              />
            </Field>
            <Field label="Potência pico kW">
              <NumberInput
                value={form.peak_power_kw ?? 0}
                onChange={(event) => setForm({ ...form, peak_power_kw: toNumber(event.target.value) })}
              />
            </Field>
          </div>
          <Field label="Topologia">
            <select
              className={selectClasses()}
              value={form.topology ?? 'HV'}
              onChange={(event) => setForm({ ...form, topology: event.target.value as BatteryTopology })}
            >
              <option value="HV">HV</option>
              <option value="LV">LV</option>
            </select>
          </Field>
          <Field label="SOC mínimo (%)">
            <NumberInput
              min={0}
              max={99}
              value={form.min_soc_percent ?? 10}
              onChange={(event) => setForm({ ...form, min_soc_percent: toNumber(event.target.value, 10) })}
            />
          </Field>
          <ProductMediaFields
            table="batteries"
            model={form.model}
            imageUrl={form.image_url}
            documents={form.documents}
            setImageUrl={(image_url) => setForm({ ...form, image_url })}
            setDocuments={(documents) => setForm({ ...form, documents })}
            uploadAsset={props.uploadAsset}
          />
          <Actions
            onSave={() => props.onSave(() => setFormOpen(false))}
            onNew={openNew}
            onCancel={() => setFormOpen(false)}
            saving={props.saving}
          />
        </>
      }
      items={props.rows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.topology],
        details: [
          ['Capacidade', `${row.capacity_kwh} kWh`],
          ['Potência padrão', `${row.standard_power_kw ?? '-'} kW`],
          ['Potência pico', `${row.peak_power_kw ?? '-'} kW`],
          ['SOC mínimo', `${row.min_soc_percent ?? 10}%`],
          ['Energia útil', `${(Number(row.capacity_kwh || 0) * (1 - Number(row.min_soc_percent ?? 10) / 100)).toFixed(2)} kWh`],
        ],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
      }))}
    />
  );
}

function AccessoriesEditor(props: {
  rows: AccessoryRow[];
  form: Partial<AccessoryRow>;
  setForm: (value: Partial<AccessoryRow>) => void;
  onSave: () => void;
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

  function openNew() {
    setForm(emptyAccessory);
    setFormOpen(true);
  }

  function openEdit(row: AccessoryRow) {
    setForm(row);
    setFormOpen(true);
  }

  return (
    <CatalogLayout
      title="Acessórios"
      count={props.rows.length}
      formOpen={formOpen}
      formTitle={form.id ? 'Editar acessório' : 'Novo acessório'}
      onNew={openNew}
      onClose={() => setFormOpen(false)}
      form={
        <>
          <Field label="Modelo">
            <Input value={form.model ?? ''} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
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
          <ProductMediaFields
            table="accessories"
            model={form.model}
            imageUrl={form.image_url}
            documents={form.documents}
            setImageUrl={(image_url) => setForm({ ...form, image_url })}
            setDocuments={(documents) => setForm({ ...form, documents })}
            uploadAsset={props.uploadAsset}
          />
          <Actions onSave={props.onSave} onNew={openNew} onCancel={() => setFormOpen(false)} saving={props.saving} />
        </>
      }
      items={props.rows.map((row) => ({
        id: row.id,
        title: row.model,
        badges: [row.active ? 'ativo' : 'inativo'],
        description: row.description ?? undefined,
        details: [],
        media: <MediaSummary imageUrl={row.image_url} documents={row.documents} />,
        removing: props.removingIds.has(row.id),
        onEdit: () => openEdit(row),
        onRemove: () => props.onRemove(row.id),
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
  onSave: () => void;
  onSaveEss: () => void;
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
          count={props.rows.length}
          formOpen={formOpen}
          formTitle={form.id ? 'Editar regra' : 'Nova regra'}
          onNew={openNew}
          onClose={() => setFormOpen(false)}
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
            <Field label="Quantidade do acessório">
              <NumberInput
                value={form.quantity_per_match ?? 1}
                onChange={(event) => setForm({ ...form, quantity_per_match: toNumber(event.target.value, 1) })}
              />
            </Field>
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
            <Field label="Quantidade mínima">
              <NumberInput
                value={form.min_quantity ?? 1}
                disabled={form.trigger_metric === 'per_solution'}
                onChange={(event) => setForm({ ...form, min_quantity: toNumber(event.target.value, 1) })}
              />
            </Field>
          </div>

          <Separator />
          <p className="text-sm text-muted-foreground">
            Filtros vazios valem para qualquer combinação.
          </p>
          <Field label="Inversor">
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rede">
              <select
                className={selectClasses()}
                value={form.grid_topology ? normalizeInverterGridType(form.grid_topology) ?? '' : ''}
                onChange={(event) => setForm({ ...form, grid_topology: (event.target.value || null) as GridTopology | null })}
              >
                <option value="">Qualquer</option>
                {registeredGridTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Topologia bateria">
              <select
                className={selectClasses()}
                value={form.battery_topology ?? ''}
                onChange={(event) => setForm({ ...form, battery_topology: (event.target.value || null) as BatteryTopology | null })}
              >
                <option value="">Qualquer</option>
                <option value="HV">HV</option>
                <option value="LV">LV</option>
              </select>
            </Field>
          </div>
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
          <Actions onSave={props.onSave} onNew={openNew} onCancel={() => setFormOpen(false)} saving={props.saving} />
        </>
          }
          items={props.rows.map((row) => ({
            id: row.id,
            title: row.name,
            badges: [row.inclusion === 'required' ? 'obrigatório' : 'opcional', row.active ? 'ativa' : 'inativa'],
            details: [
              ['Acessório', row.accessories?.model ?? '-'],
              ['Condição', row.trigger_metric === 'per_solution' ? 'Por solução' : `${formatTriggerMetric(row.trigger_metric)} >= ${row.min_quantity}`],
              ['Inversores', accessoryRuleInverterModels(row).join(', ') || 'Qualquer'],
              ['Quantidade', String(row.quantity_per_match)],
            ],
            description: row.comment ?? undefined,
            removing: props.removingIds.has(row.id),
            onEdit: () => openEdit(row),
            onRemove: () => props.onRemove(row.id),
          }))}
        />
      )}

      {rulesTab === 'ess' && (
        <CatalogLayout
          title="Regras ESS"
          count={props.essRows.length}
          formOpen={essFormOpen}
          formTitle={essForm.id ? 'Editar compatibilidade ESS' : 'Nova compatibilidade ESS'}
          onNew={openNewEss}
          onClose={() => setEssFormOpen(false)}
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
                <Field label="Modelo">
                  <select
                    className={selectClasses()}
                    value={essForm.battery_model ?? ''}
                    onChange={(event) => {
                      const battery = props.batteries.find((item) => item.model === event.target.value);
                      setEssForm({
                        ...essForm,
                        battery_model: event.target.value,
                        battery_topology: battery?.topology ?? essForm.battery_topology ?? null,
                      });
                    }}
                  >
                    <option value="">Selecione</option>
                    {props.batteries.map((battery) => (
                      <option key={battery.id} value={battery.model}>
                        {battery.model}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Topologia">
                    <select
                      className={selectClasses()}
                      value={essForm.battery_topology ?? ''}
                      onChange={(event) => setEssForm({ ...essForm, battery_topology: (event.target.value || null) as BatteryTopology | null })}
                    >
                      <option value="">Qualquer</option>
                      <option value="HV">HV</option>
                      <option value="LV">LV</option>
                    </select>
                  </Field>
                  <Field label="Min bateria">
                    <select
                      className={selectClasses()}
                      value={essForm.min_battery_qty ?? 1}
                      onChange={(event) => setEssForm({ ...essForm, min_battery_qty: toNumber(event.target.value, 1) })}
                    >
                      {Array.from({ length: 7 }, (_, index) => index + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Max bateria">
                    <select
                      className={selectClasses()}
                      value={essForm.max_battery_qty ?? 2}
                      onChange={(event) => setEssForm({ ...essForm, max_battery_qty: toNumber(event.target.value, 2) })}
                    >
                      {Array.from({ length: 14 }, (_, index) => index + 2).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
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
              <Actions onSave={props.onSaveEss} saving={props.saving} />
            </>
          }
          items={props.essRows.map((row) => {
            const inverter = props.inverters.find((item) => item.model === row.inverter_model);
            const gridTypes = normalizeInverterGridTypes(inverter?.grid_types);
            return {
              id: row.id,
              title: `${row.inverter_model} + ${row.battery_model}`,
              badges: [row.active ? 'ativa' : 'inativa', row.battery_topology ?? 'qualquer'],
              details: [
                ['Inversor', row.inverter_model],
                ['Bateria', row.battery_model],
                ['Redes do inversor', gridTypes.map(formatInverterGridType).join(', ') || '-'],
                ['Máx. paralelo', String(row.max_parallel_inverters ?? 1)],
                ['Min bateria', String(row.min_battery_qty ?? 1)],
                ['Máx. bateria', String(row.max_battery_qty ?? 1)],
              ],
              description: row.comment ?? undefined,
              removing: props.removingIds.has(row.id),
              onEdit: () => openEditEss(row),
              onRemove: () => props.onRemoveEss(row.id),
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
  onClose,
  size = 'md',
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: 'md' | 'lg';
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 px-3 py-4 sm:px-6 sm:py-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${size === 'lg' ? 'max-w-4xl' : 'max-w-2xl'} rounded-lg bg-card text-card-foreground shadow-xl ring-1 ring-border`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-lg border-b bg-card px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <Button variant="ghost" size="icon-sm" aria-label={`Fechar ${title}`} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-4 py-4">
          <div className="space-y-4">{children}</div>
        </div>
      </section>
    </div>
  );
}

function CatalogLayout({
  title,
  count,
  formOpen,
  formTitle,
  onNew,
  onClose,
  form,
  items,
}: {
  title: string;
  count: number;
  formOpen: boolean;
  formTitle: string;
  onNew: () => void;
  onClose: () => void;
  form: React.ReactNode;
  items: {
    id: string;
    title: string;
    description?: string;
    badges?: string[];
    details: [string, string][];
    media?: React.ReactNode;
    removing?: boolean;
    onEdit: () => void;
    onRemove: () => void;
  }[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader title={title} count={count} />
        <Button onClick={onNew}>
          <Plus className="h-4 w-4" />
          Novo
        </Button>
      </div>

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
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
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

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium">{value}</span>
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
    details: [string, string][];
    media?: React.ReactNode;
    removing?: boolean;
    onEdit: () => void;
    onRemove: () => void;
  }[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.id} size="sm" className={item.removing ? 'relative opacity-70' : 'relative'}>
          {item.removing && <RemovingOverlay label="Removendo..." />}
          <CardHeader>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="truncate">{item.title}</CardTitle>
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
          <CardContent className="space-y-3">
            {item.details.length > 0 && (
              <div className="grid gap-2 text-sm">
                {item.details.map(([label, value]) => (
                  <DetailItem key={label} label={label} value={value || '-'} />
                ))}
              </div>
            )}
            {item.media}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={item.onEdit} disabled={item.removing}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              <ConfirmDeleteButton
                ariaLabel={`Remover ${item.title}`}
                title={`Remover ${item.title}?`}
                description="Esse registro será removido do cadastro administrativo."
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
