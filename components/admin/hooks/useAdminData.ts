import { useCallback, useEffect, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
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
  fetchApprovedSolutions,
} from '../helpers';
import { listAdminCatalogRows } from '@/lib/data/admin-repository';
import {
  type AccessoryRow,
  type AccessoryRuleRow,
  type AdminActivityLogRow,
  type BatteryRow,
  type EssCompatibilityRuleRow,
  type InverterRow,
  type LoadCatalogRow,
  type PresetRow,
  type SimulationRow,
  type SupplierQuoteRequestAdminRow,
  type SolutionRow,
  type TabKey,
  type UserProfileRow,
} from '../types';

export type ResourceKey =
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
  | 'supplierQuoteRequests'
  | 'activityLogs';

export const TAB_RESOURCES: Record<TabKey, ResourceKey[]> = {
  metrics: ['simulations', 'users', 'supplierQuoteRequests'],
  users: ['users'],
  solutions: ['solutions', 'inverters', 'batteries', 'rules', 'essRules'],
  inverters: ['inverters', 'batteries', 'essRules'],
  batteries: ['batteries'],
  accessories: ['accessories', 'rules', 'inverters', 'batteries'],
  rules: ['accessories', 'rules', 'inverters', 'batteries', 'essRules'],
  loads: ['loadCatalog'],
  presets: ['presets', 'loadCatalog'],
  suppliers: [],
  logs: ['activityLogs'],
};

export const TABLE_TO_RESOURCE: Record<string, ResourceKey> = {
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

/** Owns every read-only catalog/list AdminPanel's tabs render, and the lazy
 * per-tab loading that fetches each one only once (see TAB_RESOURCES) — the
 * read-side counterpart to the app's useInitialData. Write operations (save/
 * delete handlers) stay in AdminPanel itself, since they're each entangled
 * with a specific editor's form state; they call `loadResource`/`ensureTabData`
 * (force: true) from here to refresh after a mutation. `setError` is the
 * caller's shared error-display state — a fetch failure here is reported the
 * same way a save failure is, so this hook doesn't own its own error state. */
export function useAdminData({
  supabase,
  setError,
}: {
  supabase: ReturnType<typeof createClient>;
  setError: (message: string | null) => void;
}) {
  const [loading, setLoading] = useState(true);

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
  const [supplierQuoteRequests, setSupplierQuoteRequests] = useState<SupplierQuoteRequestAdminRow[]>([]);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLogRow[]>([]);

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
          const { data, error: fetchError } = await listAdminCatalogRows(supabase, 'inverters', INVERTER_COLUMNS);
          if (!fetchError) setInverters((data ?? []) as unknown as InverterRow[]);
          return { error: fetchError };
        }
        case 'batteries': {
          const { data, error: fetchError } = await listAdminCatalogRows(supabase, 'batteries', BATTERY_COLUMNS);
          if (!fetchError) setBatteries((data ?? []) as unknown as BatteryRow[]);
          return { error: fetchError };
        }
        case 'accessories': {
          const { data, error: fetchError } = await listAdminCatalogRows(supabase, 'accessories', ACCESSORY_COLUMNS);
          if (!fetchError) setAccessories((data ?? []) as unknown as AccessoryRow[]);
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
          if (!fetchError) setPresets((data ?? []) as unknown as PresetRow[]);
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
          if (!fetchError) setEssRules((data ?? []) as unknown as EssCompatibilityRuleRow[]);
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
        case 'supplierQuoteRequests': {
          const { data, error: fetchError } = await supabase
            .from('supplier_quote_requests')
            .select('id, project_id, supplier_id, user_id, status, created_at, sent_at, last_attempt_at, send_count, error_message, suppliers(name), projects(name)')
            .order('created_at', { ascending: false });
          if (!fetchError) {
            const rows = (data ?? []) as unknown as {
              id: string;
              project_id: string;
              supplier_id: string;
              user_id: string;
              status: SupplierQuoteRequestAdminRow['status'];
              created_at: string;
              sent_at: string | null;
              last_attempt_at: string;
              send_count: number;
              error_message: string | null;
              suppliers?: { name?: string | null } | null;
              projects?: { name?: string | null } | null;
            }[];
            const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
            const { data: profileData, error: profileError } = userIds.length
              ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
              : { data: [], error: null };
            if (profileError) return { error: profileError };
            const profileById = new Map(
              ((profileData ?? []) as { id: string; full_name?: string | null; email?: string | null }[]).map((profile) => [profile.id, profile])
            );
            setSupplierQuoteRequests(rows.map((row) => ({
              id: row.id,
              project_id: row.project_id,
              supplier_id: row.supplier_id,
              user_id: row.user_id,
              status: row.status,
              created_at: row.created_at,
              sent_at: row.sent_at,
              last_attempt_at: row.last_attempt_at,
              send_count: row.send_count,
              error_message: row.error_message,
              supplier_name: row.suppliers?.name || 'Fornecedor não identificado',
              project_name: row.projects?.name || 'Projeto não identificado',
              requester_name: profileById.get(row.user_id)?.full_name ?? null,
              requester_email: profileById.get(row.user_id)?.email ?? null,
            })));
          }
          return { error: fetchError };
        }
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
    [loadResource, setError]
  );

  useEffect(() => {
    ensureTabData('metrics');
    // Only ever runs once, on mount — ensureTabData/loadResource are stable
    // (both memoized on `supabase`, which itself is memoized by the caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return {
    loading,
    inverters,
    batteries,
    accessories,
    loadCatalogItems,
    presets,
    rules,
    essRules,
    solutions,
    users,
    simulations,
    supplierQuoteRequests,
    activityLogs,
    simulationsHasMore,
    loadingMoreSimulations,
    activityLogsHasMore,
    loadingMoreActivityLogs,
    ensureTabData,
    loadResource,
    loadMoreSimulations,
    loadMoreActivityLogs,
  };
}
