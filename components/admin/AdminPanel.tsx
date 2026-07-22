'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';
import { ActivityLogsPanel, MetricsPanel, UsersPanel } from './DashboardPanels';
import { AccessoriesEditor } from './editors/AccessoriesEditor';
import { BatteriesEditor } from './editors/BatteriesEditor';
import { InvertersEditor } from './editors/InvertersEditor';
import { LoadCatalogEditor } from './editors/LoadCatalogEditor';
import { PresetsEditor } from './editors/PresetsEditor';
import { SolutionsEditor } from './editors/SolutionsEditor';
import {
  ACCESSORY_COLUMNS,
  ACCESSORY_RULE_COLUMNS,
  ACTIVITY_LOG_COLUMNS,
  BATTERY_COLUMNS,
  ESS_RULE_COLUMNS,
  INVERTER_COLUMNS,
  LOAD_CATALOG_COLUMNS,
  PRESET_COLUMNS,
  SIMULATION_COLUMNS,
  accessoryRuleDesiredFeatures,
  accessoryRuleInverterModels,
  clampNumber,
  fetchApprovedSolutions,
  normalizeBatteryFlags,
  normalizeEssBatteryConfigs,
  normalizeInverterFlags,
  normalizeInverterGridType,
  normalizeInverterGridTypes,
  phasesFromInverterGridTypes,
  sanitizePathPart,
  toNullableNumber,
  toNumber,
} from './helpers';
import { AdminLoadingSkeleton } from './shared-ui';
import {
  emptyAccessory,
  emptyBattery,
  emptyEssRule,
  emptyInverter,
  emptyLoadCatalogItem,
  emptyPreset,
  emptyRule,
  emptySolution,
  tabs,
  type AccessoryRow,
  type AccessoryRuleRow,
  type AdminActivityLogRow,
  type AdminLogAction,
  type AdminLogEntity,
  type BatteryRow,
  type EssCompatibilityRuleRow,
  type GeneratedSolutionPayload,
  type InverterRow,
  type LoadCatalogRow,
  type PresetRow,
  type SimulationRow,
  type SolutionRow,
  type TabKey,
  type UserProfileRow,
} from './types';

type ResourceKey =
  | 'inverters'
  | 'batteries'
  | 'accessories'
  | 'loadCatalog'
  | 'presets'
  | 'rules'
  | 'essRules'
  | 'solutions'
  | 'users'
  | 'simulations'
  | 'activityLogs';

const TAB_RESOURCES: Record<TabKey, ResourceKey[]> = {
  metrics: ['simulations', 'users'],
  users: ['users'],
  solutions: ['solutions', 'inverters', 'batteries', 'rules', 'essRules'],
  inverters: ['inverters', 'batteries', 'essRules'],
  batteries: ['batteries'],
  accessories: ['accessories', 'rules', 'inverters', 'batteries'],
  loads: ['loadCatalog'],
  presets: ['presets', 'loadCatalog'],
  logs: ['activityLogs'],
};

const TABLE_TO_RESOURCE: Record<string, ResourceKey> = {
  inverters: 'inverters',
  batteries: 'batteries',
  accessories: 'accessories',
  load_catalog: 'loadCatalog',
  load_presets: 'presets',
  approved_solutions: 'solutions',
  ess_compatibility_rules: 'essRules',
  accessory_rules: 'rules',
};

const SIMULATIONS_PAGE_SIZE = 200;
const ACTIVITY_LOGS_PAGE_SIZE = 50;

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
  const [presets, setPresets] = useState<PresetRow[]>([]);
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
  const [presetForm, setPresetForm] = useState<Partial<PresetRow>>(emptyPreset);
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

  const loadedResourcesRef = useRef<Set<ResourceKey>>(new Set());
  const [simulationsHasMore, setSimulationsHasMore] = useState(false);
  const [loadingMoreSimulations, setLoadingMoreSimulations] = useState(false);
  const [activityLogsHasMore, setActivityLogsHasMore] = useState(false);
  const [loadingMoreActivityLogs, setLoadingMoreActivityLogs] = useState(false);

  const loadSimulationsPage = useCallback(
    async (offset: number, replace: boolean) => {
      const { data, error: fetchError } = await supabase
        .from('app_simulations')
        .select(SIMULATION_COLUMNS)
        .order('created_at', { ascending: false })
        .range(offset, offset + SIMULATIONS_PAGE_SIZE - 1);

      if (fetchError) return { error: fetchError };
      const page = (data ?? []) as SimulationRow[];
      setSimulations((prev) => (replace ? page : [...prev, ...page]));
      setSimulationsHasMore(page.length === SIMULATIONS_PAGE_SIZE);
      return { error: null };
    },
    [supabase]
  );

  const loadActivityLogsPage = useCallback(
    async (offset: number, replace: boolean) => {
      const { data, error: fetchError } = await supabase
        .from('admin_activity_logs')
        .select(ACTIVITY_LOG_COLUMNS)
        .order('created_at', { ascending: false })
        .range(offset, offset + ACTIVITY_LOGS_PAGE_SIZE - 1);

      if (fetchError) return { error: fetchError };
      const page = (data ?? []) as AdminActivityLogRow[];
      setActivityLogs((prev) => (replace ? page : [...prev, ...page]));
      setActivityLogsHasMore(page.length === ACTIVITY_LOGS_PAGE_SIZE);
      return { error: null };
    },
    [supabase]
  );

  const loadResource = useCallback(
    async (key: ResourceKey) => {
      switch (key) {
        case 'inverters': {
          const { data, error: fetchError } = await supabase.from('inverters').select(INVERTER_COLUMNS).order('model');
          if (!fetchError) setInverters((data ?? []) as InverterRow[]);
          return { error: fetchError };
        }
        case 'batteries': {
          const { data, error: fetchError } = await supabase.from('batteries').select(BATTERY_COLUMNS).order('model');
          if (!fetchError) setBatteries((data ?? []) as BatteryRow[]);
          return { error: fetchError };
        }
        case 'accessories': {
          const { data, error: fetchError } = await supabase.from('accessories').select(ACCESSORY_COLUMNS).order('model');
          if (!fetchError) setAccessories((data ?? []) as AccessoryRow[]);
          return { error: fetchError };
        }
        case 'loadCatalog': {
          const { data, error: fetchError } = await supabase
            .from('load_catalog')
            .select(LOAD_CATALOG_COLUMNS)
            .order('category')
            .order('name_pt');
          if (!fetchError) setLoadCatalogItems((data ?? []) as LoadCatalogRow[]);
          return { error: fetchError };
        }
        case 'presets': {
          const { data, error: fetchError } = await supabase
            .from('load_presets')
            .select(PRESET_COLUMNS)
            .order('display_order');
          if (!fetchError) setPresets((data ?? []) as PresetRow[]);
          return { error: fetchError };
        }
        case 'rules': {
          const { data, error: fetchError } = await supabase
            .from('accessory_rules')
            .select(ACCESSORY_RULE_COLUMNS)
            .order('created_at', { ascending: false });
          if (!fetchError) setRules((data ?? []) as unknown as AccessoryRuleRow[]);
          return { error: fetchError };
        }
        case 'essRules': {
          const { data, error: fetchError } = await supabase
            .from('ess_compatibility_rules')
            .select(ESS_RULE_COLUMNS)
            .order('created_at', { ascending: false });
          if (!fetchError) setEssRules((data ?? []) as EssCompatibilityRuleRow[]);
          return { error: fetchError };
        }
        case 'solutions': {
          const { data, error: fetchError } = await fetchApprovedSolutions(supabase);
          if (!fetchError) setSolutions((data ?? []) as SolutionRow[]);
          return { error: fetchError };
        }
        case 'users': {
          const { data, error: fetchError } = await supabase
            .from('profiles')
            .select('id, email, full_name, phone, role, company_name, created_at, updated_at')
            .order('created_at', { ascending: false });
          if (!fetchError) setUsers((data ?? []) as UserProfileRow[]);
          return { error: fetchError };
        }
        case 'simulations':
          return loadSimulationsPage(0, true);
        case 'activityLogs':
          return loadActivityLogsPage(0, true);
      }
    },
    [supabase, loadSimulationsPage, loadActivityLogsPage]
  );

  const ensureTabData = useCallback(
    async (tab: TabKey, force = false) => {
      const keys = TAB_RESOURCES[tab];
      const pending = force ? keys : keys.filter((key) => !loadedResourcesRef.current.has(key));
      if (pending.length === 0) return;

      setLoading(true);
      setError(null);

      const results = await Promise.all(pending.map((key) => loadResource(key)));
      const firstError = results.find((result) => result.error)?.error;

      if (firstError) {
        setError(firstError.message);
      } else {
        for (const key of pending) loadedResourcesRef.current.add(key);
      }

      setLoading(false);
    },
    [loadResource]
  );

  useEffect(() => {
    ensureTabData('metrics');
  }, [ensureTabData]);

  async function loadMoreSimulations() {
    setLoadingMoreSimulations(true);
    await loadSimulationsPage(simulations.length, false);
    setLoadingMoreSimulations(false);
  }

  async function loadMoreActivityLogs() {
    setLoadingMoreActivityLogs(true);
    await loadActivityLogsPage(activityLogs.length, false);
    setLoadingMoreActivityLogs(false);
  }

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
      nickname: inverterForm.nickname?.trim() || null,
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
      max_power_per_phase_w: toNullableNumber(inverterForm.max_power_per_phase_w),
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
    await loadResource('inverters');
  }

  async function saveBattery(afterPersist?: () => void) {
    setSaving(true);
    setStatus(batteryForm.id ? 'Atualizando bateria...' : 'Salvando bateria...');
    setError(null);
    const action: AdminLogAction = batteryForm.id ? 'update' : 'create';
    const beforeData = batteryForm.id ? batteries.find((row) => row.id === batteryForm.id) : null;
    const payload = {
      model: batteryForm.model?.trim(),
      nickname: batteryForm.nickname?.trim() || null,
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
      expansion_model: batteryForm.expansion_model?.trim() || null,
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
    await loadResource('batteries');
  }

  async function saveAccessory(afterPersist?: () => void) {
    setSaving(true);
    setStatus(accessoryForm.id ? 'Atualizando acessório...' : 'Salvando acessório...');
    setError(null);
    const action: AdminLogAction = accessoryForm.id ? 'update' : 'create';
    const beforeData = accessoryForm.id ? accessories.find((row) => row.id === accessoryForm.id) : null;
    const payload = {
      model: accessoryForm.model?.trim(),
      nickname: accessoryForm.nickname?.trim() || null,
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
    await loadResource('accessories');
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
      active: loadCatalogForm.active ?? true,
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
    await loadResource('loadCatalog');
  }

  async function savePreset(afterPersist?: () => void) {
    setSaving(true);
    setStatus(presetForm.id ? 'Atualizando preset...' : 'Salvando preset...');
    setError(null);
    const action: AdminLogAction = presetForm.id ? 'update' : 'create';
    const beforeData = presetForm.id ? presets.find((row) => row.id === presetForm.id) : null;
    const payload = {
      name: presetForm.name?.trim() || 'Preset sem nome',
      description: presetForm.description?.trim() ?? '',
      loads: presetForm.loads ?? [],
      display_order: presetForm.display_order ?? presets.length,
    };

    const request = presetForm.id
      ? supabase.from('load_presets').update(payload).eq('id', presetForm.id)
      : supabase.from('load_presets').insert(payload);
    const { error: saveError } = await request;

    setSaving(false);
    if (saveError) return setFailure(saveError.message);
    afterPersist?.();
    await recordActivityLog({
      entityType: 'load_preset',
      action,
      targetId: presetForm.id ?? null,
      targetLabel: payload.name,
      summary: `${action === 'create' ? 'Criou' : 'Atualizou'} o preset ${payload.name}.`,
      beforeData,
      afterData: payload,
    });
    setPresetForm(emptyPreset);
    setSuccess('Preset salvo.');
    await loadResource('presets');
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
      desired_features: accessoryRuleDesiredFeatures(ruleForm),
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
    await loadResource('rules');
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
      name: essRuleForm.name?.trim() || null,
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
    await loadResource('essRules');
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
      await loadResource('solutions');
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
    await loadResource('solutions');
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
    if (table === 'load_presets') {
      const row = presets.find((item) => item.id === id);
      return { entityType: 'load_preset' as const, label: row?.name ?? 'Preset removido', beforeData: row };
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
    const resourceKey = TABLE_TO_RESOURCE[table];
    if (resourceKey) await loadResource(resourceKey);
    setRemovingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  async function removeManySolutions(ids: string[]) {
    if (ids.length === 0) return;
    setSaving(true);
    setRemovingIds((current) => new Set([...current, ...ids]));
    setStatus(`Removendo ${ids.length} combinações...`);
    setError(null);
    const { error: removeError } = await supabase.from('approved_solutions').delete().in('id', ids);
    setSaving(false);

    if (removeError) {
      setRemovingIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
      return setFailure(removeError.message);
    }
    await recordActivityLog({
      entityType: 'solution',
      action: 'delete',
      targetId: null,
      targetLabel: `${ids.length} combinações`,
      summary: `Removeu ${ids.length} combinações filtradas em massa.`,
      beforeData: { ids },
      afterData: null,
    });
    setSuccess(`${ids.length} combinações removidas com sucesso.`);
    await loadResource('solutions');
    setRemovingIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
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
    void ensureTabData(tab);
  }

  function refreshActiveTab() {
    void ensureTabData(activeTab, true);
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
            <Button variant="outline" onClick={refreshActiveTab} disabled={loading}>
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
                {activeTab === 'metrics' && (
                  <MetricsPanel
                    simulations={simulations}
                    users={users}
                    hasMoreSimulations={simulationsHasMore}
                    loadingMoreSimulations={loadingMoreSimulations}
                    onLoadMoreSimulations={loadMoreSimulations}
                  />
                )}

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
                    onDeleteMany={removeManySolutions}
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
                    essRows={essRules}
                    essForm={essRuleForm}
                    setEssForm={setEssRuleForm}
                    batteries={batteries}
                    onSaveEss={saveEssRule}
                    onRemoveEss={(id) => removeRow('ess_compatibility_rules', id)}
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
                    ruleForm={ruleForm}
                    setRuleForm={setRuleForm}
                    onSaveRule={saveRule}
                    onRemoveRule={(id) => removeRow('accessory_rules', id)}
                    inverters={inverters}
                    batteries={batteries}
                  />
                )}

                {activeTab === 'loads' && (
                  <LoadCatalogEditor
                    rows={loadCatalogItems}
                    form={loadCatalogForm}
                    setForm={setLoadCatalogForm}
                    onSave={saveLoadCatalogItem}
                    onRemove={(id) => removeRow('load_catalog', id)}
                    onDeactivate={(id) => removeRow('load_catalog', id, true)}
                    removingIds={removingIds}
                    saving={saving}
                  />
                )}

                {activeTab === 'presets' && (
                  <PresetsEditor
                    rows={presets}
                    loadCatalogItems={loadCatalogItems}
                    form={presetForm}
                    setForm={setPresetForm}
                    onSave={savePreset}
                    onRemove={(id) => removeRow('load_presets', id)}
                    removingIds={removingIds}
                    saving={saving}
                  />
                )}

                {activeTab === 'logs' && (
                  <ActivityLogsPanel
                    logs={activityLogs}
                    hasMore={activityLogsHasMore}
                    loadingMore={loadingMoreActivityLogs}
                    onLoadMore={loadMoreActivityLogs}
                  />
                )}
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
              <Button variant="outline" onClick={refreshActiveTab} disabled={loading}>
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
