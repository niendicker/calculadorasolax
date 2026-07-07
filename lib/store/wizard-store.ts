'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import { createClient } from '@/lib/supabase/client';
import type {
  BatteryTopology,
  CatalogItem,
  Client,
  DesiredFeatureId,
  GeneratorConfig,
  IndustrialOptions,
  LoadPhase,
  LoadPresetItem,
  MicrogridConfig,
  PeakCalcMode,
  ProjectInfo,
  ResidentialGridType,
  ResidentialOptions,
  SavedProject,
  SingleLoad,
  Solution,
  StockProductType,
  UserLoadCatalogItem,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';

interface WizardStore {
  projectInfo: ProjectInfo;
  currentProjectId: string | null;
  /** Whether the "Dados do projeto" card should be shown on the Projeto tab: only after
   *  starting a new draft or opening a saved project, not just from landing on the page. */
  projectDetailsVisible: boolean;
  savedProjects: SavedProject[];
  clients: Client[];
  userLoadCatalog: UserLoadCatalogItem[];
  userStockItems: UserStockItem[];
  residentialOptions: ResidentialOptions;
  industrialOptions: IndustrialOptions;
  solution: Solution | null;
  loadCatalog: CatalogItem[];
  loadPresets: LoadPresetItem[];

  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  newProjectDraft: () => void;
  saveCurrentProject: () => Promise<SavedProject>;
  loadProject: (id: string) => void;
  removeProject: (id: string) => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchClients: () => Promise<void>;
  addClient: (input: { name: string; email: string; phone: string; document: string; notes: string }) => Promise<Client>;
  updateClient: (id: string, partial: Partial<{ name: string; email: string; phone: string; document: string; notes: string }>) => Promise<void>;
  removeClient: (id: string) => Promise<void>;
  fetchUserLoadCatalog: () => Promise<void>;
  saveManualLoadToCatalog: (input: { name: string; powerW: number; ipInRatio: number }) => Promise<void>;
  updateUserLoadCatalogItem: (
    id: string,
    partial: Partial<{ name: string; powerW: number; ipInRatio: number }>
  ) => Promise<void>;
  removeUserLoadCatalogItem: (id: string) => Promise<void>;
  fetchUserStockItems: () => Promise<void>;
  addToStock: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
  updateStockItemValue: (id: string, unitValue: number) => Promise<void>;
  removeFromStock: (id: string) => Promise<void>;
  clearUserData: () => void;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setInverterModel: (inverterModel: string | null) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  setMaxPowerPerPhaseW: (maxPowerPerPhaseW: number | null) => void;
  setDesiredFeatures: (desiredFeatures: DesiredFeatureId[]) => void;
  setWhiteTariffConfig: (whiteTariff: WhiteTariffConfig | null) => void;
  setMicrogridConfig: (microgrid: MicrogridConfig | null) => void;
  setGeneratorConfig: (generator: GeneratorConfig | null) => void;
  setAtsPhotoUrl: (atsPhotoUrl: string | null) => void;
  setPeakCalcMode: (peakCalcMode: PeakCalcMode) => void;
  /** Returns false (no-op) instead of adding when the project is already at ACCOUNT_LIMITS.loadsPerProject. */
  addLoad: (load: SingleLoad) => boolean;
  removeLoad: (id: string) => void;
  updateLoad: (id: string, partial: Partial<SingleLoad>) => void;
  setIndustrialOption: <K extends keyof IndustrialOptions>(
    key: K,
    value: IndustrialOptions[K]
  ) => void;
  setSolution: (solution: Solution | null) => void;
  setLoadCatalog: (catalog: CatalogItem[]) => void;
  setLoadPresets: (presets: LoadPresetItem[]) => void;
  resetResidential: () => void;
  resetIndustrial: () => void;
}

const defaultProjectInfo: ProjectInfo = {
  name: '',
  clientId: null,
  address: '',
  notes: '',
};

const defaultResidential: ResidentialOptions = {
  topology: null,
  batteryModel: null,
  inverterModel: null,
  gridType: null,
  loads: [],
  peakCalcMode: 'sum',
  desiredFeatures: [],
  whiteTariff: null,
  microgrid: null,
  generator: null,
  atsPhotoUrl: null,
  maxPowerPerPhaseW: null,
};

const defaultIndustrial: IndustrialOptions = {
  gridPowerKw: null,
  pvPowerKwp: null,
  backupPowerKw: null,
  backupHours: null,
  demandCharge: false,
};

function clientFromRow(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    email: (row.email as string | null) ?? '',
    phone: (row.phone as string | null) ?? '',
    document: (row.document as string | null) ?? '',
    notes: (row.notes as string | null) ?? '',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function userLoadFromRow(row: Record<string, unknown>): UserLoadCatalogItem {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    powerW: Number(row.power_w) || 0,
    ipInRatio: Number(row.ip_in_ratio) || 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function userStockItemFromRow(row: Record<string, unknown>): UserStockItem {
  return {
    id: row.id as string,
    productType: row.product_type as StockProductType,
    productModel: (row.product_model as string) ?? '',
    unitValue: Number(row.unit_value) || 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function projectFromRow(row: Record<string, unknown>): SavedProject {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    clientId: (row.client_id as string | null) ?? null,
    address: (row.address as string | null) ?? '',
    notes: (row.notes as string | null) ?? '',
    updatedAt: row.updated_at as string,
    residentialOptions: row.residential_options as ResidentialOptions,
    solution: (row.solution as Solution | null) ?? null,
  };
}

export const useWizardStore = create<WizardStore>()(
  persist(
    (set, get) => ({
      projectInfo: defaultProjectInfo,
      currentProjectId: null,
      projectDetailsVisible: false,
      savedProjects: [],
      clients: [],
      userLoadCatalog: [],
      userStockItems: [],
      residentialOptions: defaultResidential,
      industrialOptions: defaultIndustrial,
      solution: null,
      loadCatalog: [],
      loadPresets: [],

      setProjectInfo: (partial) =>
        set((s) => ({
          projectInfo: { ...s.projectInfo, ...partial },
        })),

      newProjectDraft: () =>
        set({
          projectInfo: defaultProjectInfo,
          currentProjectId: null,
          projectDetailsVisible: true,
          residentialOptions: defaultResidential,
          solution: null,
        }),

      saveCurrentProject: async () => {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('not_authenticated');

        const s = get();
        if (!s.currentProjectId && s.savedProjects.length >= ACCOUNT_LIMITS.projects) {
          throw new Error(limitReachedMessage('projetos salvos', ACCOUNT_LIMITS.projects));
        }

        const name = s.projectInfo.name.trim() || `Projeto ${new Date().toLocaleDateString('pt-BR')}`;
        const payload = {
          user_id: userData.user.id,
          client_id: s.projectInfo.clientId,
          name,
          address: s.projectInfo.address.trim() || null,
          notes: s.projectInfo.notes.trim() || null,
          residential_options: s.residentialOptions,
          solution: s.solution,
          updated_at: new Date().toISOString(),
        };

        const request = s.currentProjectId
          ? supabase.from('projects').update(payload).eq('id', s.currentProjectId).select().single()
          : supabase.from('projects').insert(payload).select().single();

        const { data, error } = await request;
        if (error) throw error;

        const saved = projectFromRow(data);

        set((st) => ({
          currentProjectId: saved.id,
          projectInfo: { ...st.projectInfo, name: saved.name },
          savedProjects: [saved, ...st.savedProjects.filter((project) => project.id !== saved.id)],
        }));

        return saved;
      },

      loadProject: (id) =>
        set((s) => {
          const project = s.savedProjects.find((item) => item.id === id);
          if (!project) return {};

          return {
            currentProjectId: project.id,
            projectDetailsVisible: true,
            projectInfo: {
              name: project.name,
              clientId: project.clientId,
              address: project.address,
              notes: project.notes,
            },
            residentialOptions: {
              ...defaultResidential,
              ...project.residentialOptions,
              loads: project.residentialOptions.loads.map((load) => ({ ...load })),
            },
            solution: project.solution,
          };
        }),

      removeProject: async (id) => {
        const supabase = createClient();
        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (error) throw error;

        set((s) => {
          const wasCurrent = s.currentProjectId === id;
          return {
            savedProjects: s.savedProjects.filter((project) => project.id !== id),
            // Deleting the project currently loaded on screen must clear it the
            // same way starting a new project draft does — otherwise its name
            // (e.g. the badge on the Dimensionamento page) and configuration
            // keep showing after the project itself no longer exists.
            ...(wasCurrent
              ? {
                  currentProjectId: null,
                  projectDetailsVisible: false,
                  projectInfo: defaultProjectInfo,
                  residentialOptions: defaultResidential,
                  solution: null,
                }
              : {}),
          };
        });
      },

      fetchProjects: async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('updated_at', { ascending: false });
        if (error) throw error;
        set({ savedProjects: (data ?? []).map(projectFromRow) });
      },

      fetchClients: async () => {
        const supabase = createClient();
        const { data, error } = await supabase.from('clients').select('*').order('name');
        if (error) throw error;
        set({ clients: (data ?? []).map(clientFromRow) });
      },

      addClient: async (input) => {
        if (get().clients.length >= ACCOUNT_LIMITS.clients) {
          throw new Error(limitReachedMessage('clientes cadastrados', ACCOUNT_LIMITS.clients));
        }

        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('not_authenticated');

        const { data, error } = await supabase
          .from('clients')
          .insert({
            user_id: userData.user.id,
            name: input.name.trim(),
            email: input.email.trim() || null,
            phone: input.phone.trim() || null,
            document: input.document.trim() || null,
            notes: input.notes.trim() || null,
          })
          .select()
          .single();
        if (error) throw error;

        const client = clientFromRow(data);
        set((s) => ({
          clients: [...s.clients, client].sort((a, b) => a.name.localeCompare(b.name)),
        }));
        return client;
      },

      updateClient: async (id, partial) => {
        const supabase = createClient();
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (partial.name !== undefined) payload.name = partial.name.trim();
        if (partial.email !== undefined) payload.email = partial.email.trim() || null;
        if (partial.phone !== undefined) payload.phone = partial.phone.trim() || null;
        if (partial.document !== undefined) payload.document = partial.document.trim() || null;
        if (partial.notes !== undefined) payload.notes = partial.notes.trim() || null;

        const { error } = await supabase.from('clients').update(payload).eq('id', id);
        if (error) throw error;

        set((s) => ({
          clients: s.clients
            .map((client) => (client.id === id ? { ...client, ...partial } : client))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }));
      },

      removeClient: async (id) => {
        const supabase = createClient();
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) throw error;

        set((s) => ({
          clients: s.clients.filter((client) => client.id !== id),
          savedProjects: s.savedProjects.map((project) =>
            project.clientId === id ? { ...project, clientId: null } : project
          ),
        }));
      },

      fetchUserLoadCatalog: async () => {
        const supabase = createClient();
        const { data, error } = await supabase.from('user_load_catalog').select('*').order('name');
        if (error) throw error;
        set({ userLoadCatalog: (data ?? []).map(userLoadFromRow) });
      },

      saveManualLoadToCatalog: async (input) => {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('not_authenticated');

        const existing = get().userLoadCatalog.find(
          (item) => item.name.trim().toLowerCase() === input.name.trim().toLowerCase()
        );

        if (existing) {
          const { error } = await supabase
            .from('user_load_catalog')
            .update({
              power_w: input.powerW,
              ip_in_ratio: input.ipInRatio,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (error) throw error;

          set((s) => ({
            userLoadCatalog: s.userLoadCatalog.map((item) =>
              item.id === existing.id ? { ...item, powerW: input.powerW, ipInRatio: input.ipInRatio } : item
            ),
          }));
          return;
        }

        if (get().userLoadCatalog.length >= ACCOUNT_LIMITS.userLoadCatalog) {
          throw new Error(limitReachedMessage('cargas personalizadas', ACCOUNT_LIMITS.userLoadCatalog));
        }

        const { data, error } = await supabase
          .from('user_load_catalog')
          .insert({
            user_id: userData.user.id,
            name: input.name.trim(),
            power_w: input.powerW,
            ip_in_ratio: input.ipInRatio,
          })
          .select()
          .single();
        if (error) throw error;

        const item = userLoadFromRow(data);
        set((s) => ({
          userLoadCatalog: [...s.userLoadCatalog, item].sort((a, b) => a.name.localeCompare(b.name)),
        }));
      },

      updateUserLoadCatalogItem: async (id, partial) => {
        const supabase = createClient();
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (partial.name !== undefined) payload.name = partial.name.trim();
        if (partial.powerW !== undefined) payload.power_w = partial.powerW;
        if (partial.ipInRatio !== undefined) payload.ip_in_ratio = partial.ipInRatio;

        const { error } = await supabase.from('user_load_catalog').update(payload).eq('id', id);
        if (error) throw error;

        set((s) => ({
          userLoadCatalog: s.userLoadCatalog
            .map((item) => (item.id === id ? { ...item, ...partial } : item))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }));
      },

      removeUserLoadCatalogItem: async (id) => {
        const supabase = createClient();
        const { error } = await supabase.from('user_load_catalog').delete().eq('id', id);
        if (error) throw error;

        set((s) => ({
          userLoadCatalog: s.userLoadCatalog.filter((item) => item.id !== id),
        }));
      },

      fetchUserStockItems: async () => {
        const supabase = createClient();
        const { data, error } = await supabase.from('user_stock_items').select('*').order('product_model');
        if (error) throw error;
        set({ userStockItems: (data ?? []).map(userStockItemFromRow) });
      },

      addToStock: async (input) => {
        const alreadyInStock = get().userStockItems.some(
          (item) => item.productType === input.productType && item.productModel === input.productModel
        );
        if (!alreadyInStock && get().userStockItems.length >= ACCOUNT_LIMITS.userStockItems) {
          throw new Error(limitReachedMessage('itens no catálogo', ACCOUNT_LIMITS.userStockItems));
        }

        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('not_authenticated');

        const { data, error } = await supabase
          .from('user_stock_items')
          .upsert(
            {
              user_id: userData.user.id,
              product_type: input.productType,
              product_model: input.productModel,
              unit_value: input.unitValue,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,product_type,product_model' }
          )
          .select()
          .single();
        if (error) throw error;

        const item = userStockItemFromRow(data);
        set((s) => ({
          userStockItems: [...s.userStockItems.filter((i) => i.id !== item.id), item].sort((a, b) =>
            a.productModel.localeCompare(b.productModel)
          ),
        }));
      },

      updateStockItemValue: async (id, unitValue) => {
        const supabase = createClient();
        const { error } = await supabase
          .from('user_stock_items')
          .update({ unit_value: unitValue, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;

        set((s) => ({
          userStockItems: s.userStockItems.map((item) => (item.id === id ? { ...item, unitValue } : item)),
        }));
      },

      removeFromStock: async (id) => {
        const supabase = createClient();
        const { error } = await supabase.from('user_stock_items').delete().eq('id', id);
        if (error) throw error;

        set((s) => ({
          userStockItems: s.userStockItems.filter((item) => item.id !== id),
        }));
      },

      clearUserData: () =>
        set({
          clients: [],
          savedProjects: [],
          userLoadCatalog: [],
          userStockItems: [],
          currentProjectId: null,
          projectDetailsVisible: false,
        }),

      setTopology: (topology) =>
        set((s) => ({
          residentialOptions: {
            ...s.residentialOptions,
            topology,
            batteryModel: null,
            inverterModel: null,
          },
        })),

      setBatteryModel: (batteryModel) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, batteryModel },
        })),

      setInverterModel: (inverterModel) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, inverterModel },
        })),

      setGridType: (gridType) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, gridType, inverterModel: null },
        })),

      setMaxPowerPerPhaseW: (maxPowerPerPhaseW) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, maxPowerPerPhaseW },
        })),

      setDesiredFeatures: (desiredFeatures) =>
        set((s) => ({
          residentialOptions: {
            ...s.residentialOptions,
            desiredFeatures,
            whiteTariff: desiredFeatures.includes('white_tariff') ? s.residentialOptions.whiteTariff : null,
            microgrid: desiredFeatures.includes('microgrid') ? s.residentialOptions.microgrid : null,
            generator: desiredFeatures.includes('external_generator') ? s.residentialOptions.generator : null,
            atsPhotoUrl: desiredFeatures.includes('external_ats') ? s.residentialOptions.atsPhotoUrl : null,
          },
        })),

      setWhiteTariffConfig: (whiteTariff) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, whiteTariff },
        })),

      setMicrogridConfig: (microgrid) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, microgrid },
        })),

      setGeneratorConfig: (generator) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, generator },
        })),

      setAtsPhotoUrl: (atsPhotoUrl) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, atsPhotoUrl },
        })),

      setPeakCalcMode: (peakCalcMode) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, peakCalcMode },
        })),

      addLoad: (load) => {
        if (get().residentialOptions.loads.length >= ACCOUNT_LIMITS.loadsPerProject) return false;
        set((s) => ({
          residentialOptions: {
            ...s.residentialOptions,
            loads: [...s.residentialOptions.loads, load],
          },
        }));
        return true;
      },

      removeLoad: (id) =>
        set((s) => ({
          residentialOptions: {
            ...s.residentialOptions,
            loads: s.residentialOptions.loads.filter((l) => l.id !== id),
          },
        })),

      updateLoad: (id, partial) =>
        set((s) => ({
          residentialOptions: {
            ...s.residentialOptions,
            loads: s.residentialOptions.loads.map((l) =>
              l.id === id ? { ...l, ...partial } : l
            ),
          },
        })),

      setIndustrialOption: (key, value) =>
        set((s) => ({
          industrialOptions: { ...s.industrialOptions, [key]: value },
        })),

      setSolution: (solution) => set({ solution }),

      setLoadCatalog: (loadCatalog) => set({ loadCatalog }),

      setLoadPresets: (loadPresets) => set({ loadPresets }),

      resetResidential: () =>
        set({ residentialOptions: defaultResidential, solution: null }),

      resetIndustrial: () =>
        set({ industrialOptions: defaultIndustrial, solution: null }),
    }),
    {
      name: 'solax-wizard',
      partialize: (state) => ({
        projectInfo: state.projectInfo,
        currentProjectId: state.currentProjectId,
        projectDetailsVisible: state.projectDetailsVisible,
        residentialOptions: state.residentialOptions,
        industrialOptions: state.industrialOptions,
        solution: state.solution,
        loadCatalog: state.loadCatalog,
        loadPresets: state.loadPresets,
      }),
      // Zustand's default merge only shallow-merges top-level keys, so a
      // browser with residentialOptions/industrialOptions persisted before a
      // field was added (e.g. desiredFeatures/whiteTariff) would end up with
      // that field missing entirely instead of falling back to its default.
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<WizardStore>;
        return {
          ...currentState,
          ...persisted,
          residentialOptions: { ...currentState.residentialOptions, ...persisted.residentialOptions },
          industrialOptions: { ...currentState.industrialOptions, ...persisted.industrialOptions },
        };
      },
    }
  )
);

export function totalDailyKwh(loads: SingleLoad[]): number {
  return loads.reduce(
    (acc, l) => acc + (l.powerW * l.hoursPerDay * l.qty) / 1000,
    0
  );
}

export function totalPeakW(loads: SingleLoad[], mode: PeakCalcMode = 'sum'): number {
  if (loads.length === 0) return 0;

  if (mode === 'sum') {
    return loads.reduce((acc, l) => acc + l.powerW * (l.ipInRatio ?? 1) * l.qty, 0);
  }

  // 'largest-surge': assume only one unit of the highest-surge load starts at a
  // time; every other load (and the remaining units of that same load) runs at
  // nominal power. Peak = nominal sum + the single largest surge "extra".
  const nominalSum = loads.reduce((acc, l) => acc + l.powerW * l.qty, 0);
  const largestExtra = loads.reduce((max, l) => {
    const extra = l.powerW * ((l.ipInRatio ?? 1) - 1);
    return extra > max ? extra : max;
  }, 0);
  return nominalSum + largestExtra;
}

/** Number of live phases the network topology provides. */
export const gridTypePhaseCount: Record<ResidentialGridType, number> = {
  singlePhase_220: 1,
  splitPhase_220: 2,
  threePhase_220: 3,
  threePhase_380: 3,
};

/** Voltages a load can be wired at for each network topology. */
export const gridTypeVoltages: Record<ResidentialGridType, number[]> = {
  singlePhase_220: [220],
  splitPhase_220: [110, 220],
  threePhase_220: [110, 220],
  threePhase_380: [220, 380],
};

/** Voltages that require a phase-to-phase (two-phase) connection instead of
 * phase-to-neutral, for each network topology — e.g. a 220V mono load on a
 * three-phase 220V network is wired between two phases, not phase-neutral. */
export const gridTypePhaseToPhaseVoltages: Record<ResidentialGridType, number[]> = {
  singlePhase_220: [],
  splitPhase_220: [220],
  threePhase_220: [220],
  threePhase_380: [380],
};

export const loadPhases: LoadPhase[] = ['L1', 'L2', 'L3'];

/** Nominal power (W) per phase. Three-phase loads split evenly across L1/L2/L3;
 * mono loads wired phase-to-phase count their full power on both phases they
 * connect to (they're not divided, since each conductor carries the full
 * load current); other mono loads count on their single assigned phase. */
export function totalPowerByPhase(loads: SingleLoad[]): Record<LoadPhase, number> {
  const totals: Record<LoadPhase, number> = { L1: 0, L2: 0, L3: 0 };
  for (const load of loads) {
    const powerW = load.powerW * load.qty;
    if (load.phaseType === 'trifasica') {
      totals.L1 += powerW / 3;
      totals.L2 += powerW / 3;
      totals.L3 += powerW / 3;
    } else {
      const phase = load.phase ?? 'L1';
      totals[phase] += powerW;
      if (load.phase2) totals[load.phase2] += powerW;
    }
  }
  return totals;
}
