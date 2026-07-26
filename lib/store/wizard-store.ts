'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ACCOUNT_LIMITS, limitReachedMessage } from '@/lib/limits';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import { createClient } from '@/lib/supabase/client';
import { calculateResidentialSolution } from '@/lib/calculate-residential';
import type {
  BatteryTopology,
  CatalogItem,
  Client,
  DesiredFeatureId,
  GeneratorConfig,
  IndustrialOptions,
  LoadPhase,
  LoadPresetItem,
  LoadPresetLoad,
  MarginSettings,
  MicrogridConfig,
  PeakCalcMode,
  ProjectInfo,
  ProjectServiceLine,
  PvConfig,
  ResidentialGridType,
  ResidentialOptions,
  SavedProject,
  SingleLoad,
  Solution,
  StockProductType,
  UserLoadCatalogItem,
  UserLoadPresetItem,
  UserServiceItem,
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
  userLoadPresets: UserLoadPresetItem[];
  userServices: UserServiceItem[];
  marginSettings: MarginSettings;
  residentialOptions: ResidentialOptions;
  industrialOptions: IndustrialOptions;
  solution: Solution | null;
  /** Service lines (from userServices) added to the project currently being
   * edited — saved/loaded alongside residentialOptions/solution as part of
   * the project, see saveCurrentProject/loadProject. */
  services: ProjectServiceLine[];
  /** Result for residentialOptions.secondaryBatteryModel, when set — a live
   * comparison aid, not part of what gets saved with the project (see
   * saveCurrentProject/loadProject, which only persist `solution`). */
  secondarySolution: Solution | null;
  loadCatalog: CatalogItem[];
  loadPresets: LoadPresetItem[];

  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  newProjectDraft: () => void;
  cancelProjectDraft: () => void;
  saveCurrentProject: () => Promise<SavedProject>;
  /** `showDetails` (default true) controls whether this also opens the
   * project-editing draft card — pass false for a "quiet" load that just
   * brings the project's data into the live wizard state (e.g. to generate
   * its PDF report) without switching the Projeto tab into edit mode. */
  loadProject: (id: string, options?: { showDetails?: boolean }) => void;
  removeProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<SavedProject>;
  /** Recalculates a saved project's solution from its own stored
   * residentialOptions (same calculate-residential call the Dimensionamento
   * tab's "Calcular" makes), then persists the refreshed solution — so a
   * project's card can catch up a solution that's gone stale after the loads
   * changed, without the user having to reopen it in Dimensionamento. */
  refreshProjectSolution: (id: string) => Promise<SavedProject>;
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
  fetchUserLoadPresets: () => Promise<void>;
  saveLoadsAsPreset: (input: { name: string; description: string; loads: LoadPresetLoad[] }) => Promise<void>;
  removeUserLoadPreset: (id: string) => Promise<void>;
  fetchUserStockItems: () => Promise<void>;
  addToStock: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
  updateStockItemValue: (id: string, unitValue: number) => Promise<void>;
  removeFromStock: (id: string) => Promise<void>;
  fetchUserServices: () => Promise<void>;
  addService: (input: { name: string; unitValue: number }) => Promise<void>;
  updateServiceName: (id: string, name: string) => Promise<void>;
  updateServiceValue: (id: string, unitValue: number) => Promise<void>;
  removeService: (id: string) => Promise<void>;
  fetchMarginSettings: () => Promise<void>;
  updateMarginPercent: (category: StockProductType, percent: number) => Promise<void>;
  /** Adds a line for this service to the project currently being edited, at
   * qty 1 — a no-op if it's already on the list. */
  addServiceToProject: (serviceId: string) => void;
  removeServiceFromProject: (serviceId: string) => void;
  updateProjectServiceQty: (serviceId: string, qty: number) => void;
  clearUserData: () => void;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setSecondaryBatteryModel: (secondaryBatteryModel: string | null) => void;
  setInverterModel: (inverterModel: string | null) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  setMaxPowerPerPhaseW: (maxPowerPerPhaseW: number | null) => void;
  setDesiredFeatures: (desiredFeatures: DesiredFeatureId[]) => void;
  setWhiteTariffConfig: (whiteTariff: WhiteTariffConfig | null) => void;
  setMicrogridConfig: (microgrid: MicrogridConfig | null) => void;
  setGeneratorConfig: (generator: GeneratorConfig | null) => void;
  setPvConfig: (pv: PvConfig | null) => void;
  setAtsPhotoUrl: (atsPhotoUrl: string | null) => void;
  setAtsBackupAcknowledged: (atsBackupAcknowledged: boolean) => void;
  setPeakCalcMode: (peakCalcMode: PeakCalcMode) => void;
  setOperationHours: (operationHours: number) => void;
  /** Returns false (no-op) instead of adding when the project is already at ACCOUNT_LIMITS.loadsPerProject. */
  addLoad: (load: SingleLoad) => boolean;
  removeLoad: (id: string) => void;
  updateLoad: (id: string, partial: Partial<SingleLoad>) => void;
  setIndustrialOption: <K extends keyof IndustrialOptions>(
    key: K,
    value: IndustrialOptions[K]
  ) => void;
  setSolution: (solution: Solution | null) => void;
  setSecondarySolution: (solution: Solution | null) => void;
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

const VALID_DESIRED_FEATURE_IDS = new Set(DESIRED_FEATURE_DEFINITIONS.map((feature) => feature.id));

/** Drops any feature id no longer recognized (e.g. 'no_pv', renamed to 'pv')
 * from data that predates the rename — either persisted in localStorage or
 * saved as a project in the database. Without this, a stale id would fail
 * the Edge Function's desiredFeatures validation outright, surfacing as a
 * generic "invalid payload" error with no obvious cause. */
function sanitizeDesiredFeatures(desiredFeatures: DesiredFeatureId[] | undefined): DesiredFeatureId[] {
  if (!Array.isArray(desiredFeatures)) return [];
  return desiredFeatures.filter((id) => VALID_DESIRED_FEATURE_IDS.has(id));
}

const defaultResidential: ResidentialOptions = {
  topology: 'HighVoltage',
  batteryModel: null,
  secondaryBatteryModel: null,
  inverterModel: null,
  gridType: 'singlePhase_220',
  loads: [],
  peakCalcMode: 'sum',
  operationHours: 0,
  desiredFeatures: ['backup'],
  whiteTariff: null,
  microgrid: null,
  generator: null,
  pv: null,
  atsPhotoUrl: null,
  atsBackupAcknowledged: false,
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

function userLoadPresetFromRow(row: Record<string, unknown>): UserLoadPresetItem {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    description: (row.description as string) ?? '',
    loads: (row.loads as LoadPresetLoad[] | null) ?? [],
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
    services: Array.isArray(row.services) ? (row.services as ProjectServiceLine[]) : [],
  };
}

function userServiceFromRow(row: Record<string, unknown>): UserServiceItem {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    unitValue: Number(row.unit_value) || 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
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
      userLoadPresets: [],
      userServices: [],
      marginSettings: { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 },
      residentialOptions: defaultResidential,
      industrialOptions: defaultIndustrial,
      solution: null,
      secondarySolution: null,
      services: [],
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
          secondarySolution: null,
          services: [],
        }),

      // Discards an in-progress "Dados do projeto" card without saving. For a
      // brand-new draft this just clears it back to blank; for a project that
      // was opened for editing, it reverts any unsaved edits back to the last
      // saved values so the card behind it doesn't show stale changes.
      cancelProjectDraft: () =>
        set((s) => {
          const project = s.currentProjectId
            ? s.savedProjects.find((item) => item.id === s.currentProjectId)
            : undefined;

          if (!project) {
            return {
              projectInfo: defaultProjectInfo,
              currentProjectId: null,
              projectDetailsVisible: false,
              residentialOptions: defaultResidential,
              solution: null,
              secondarySolution: null,
              services: [],
            };
          }

          return {
            projectDetailsVisible: false,
            services: project.services ?? [],
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
              desiredFeatures: sanitizeDesiredFeatures(project.residentialOptions.desiredFeatures),
            },
            solution: project.solution,
            secondarySolution: null,
          };
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
          services: s.services,
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

      loadProject: (id, options) =>
        set((s) => {
          const project = s.savedProjects.find((item) => item.id === id);
          if (!project) return {};

          return {
            currentProjectId: project.id,
            projectDetailsVisible: options?.showDetails ?? true,
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
              desiredFeatures: sanitizeDesiredFeatures(project.residentialOptions.desiredFeatures),
            },
            solution: project.solution,
            secondarySolution: null,
            services: project.services ?? [],
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
                  secondarySolution: null,
                  services: [],
                }
              : {}),
          };
        });
      },

      duplicateProject: async (id) => {
        const s = get();
        const source = s.savedProjects.find((project) => project.id === id);
        if (!source) throw new Error('project_not_found');

        if (s.savedProjects.length >= ACCOUNT_LIMITS.projects) {
          throw new Error(limitReachedMessage('projetos salvos', ACCOUNT_LIMITS.projects));
        }

        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('not_authenticated');

        const payload = {
          user_id: userData.user.id,
          client_id: source.clientId,
          name: `${source.name} (cópia)`,
          address: source.address || null,
          notes: source.notes || null,
          residential_options: source.residentialOptions,
          solution: source.solution,
          services: source.services,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase.from('projects').insert(payload).select().single();
        if (error) throw error;

        const duplicated = projectFromRow(data);

        set((st) => ({
          savedProjects: [duplicated, ...st.savedProjects],
        }));

        return duplicated;
      },

      refreshProjectSolution: async (id) => {
        const project = get().savedProjects.find((item) => item.id === id);
        if (!project) throw new Error('project_not_found');
        const batteryModel = project.residentialOptions.batteryModel;
        if (!batteryModel) throw new Error('missing_battery_model');

        const supabase = createClient();
        const result = await calculateResidentialSolution({
          supabase,
          residentialOptions: project.residentialOptions,
          batteryModel,
          projectName: project.name,
          peakW: totalPeakW(project.residentialOptions.loads, project.residentialOptions.peakCalcMode ?? 'sum'),
          dailyKwh: totalDailyKwh(project.residentialOptions.loads, project.residentialOptions.operationHours),
        });
        if ('error' in result) throw new Error(result.error);

        const { data: row, error } = await supabase
          .from('projects')
          .update({ solution: result.solution, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;

        const updated = projectFromRow(row);
        set((s) => ({
          savedProjects: s.savedProjects.map((item) => (item.id === id ? updated : item)),
        }));

        return updated;
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

        // FIFO instead of blocking: once at the limit, saving a new custom load
        // silently evicts the oldest one to make room, rather than erroring out.
        if (get().userLoadCatalog.length >= ACCOUNT_LIMITS.userLoadCatalog) {
          const oldest = [...get().userLoadCatalog].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )[0];
          if (oldest) {
            const { error: deleteError } = await supabase.from('user_load_catalog').delete().eq('id', oldest.id);
            if (deleteError) throw deleteError;
            set((s) => ({ userLoadCatalog: s.userLoadCatalog.filter((item) => item.id !== oldest.id) }));
          }
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

      fetchUserLoadPresets: async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('user_load_presets')
          .select('id, name, description, loads')
          .order('created_at');
        if (error) throw error;
        set({ userLoadPresets: (data ?? []).map(userLoadPresetFromRow) });
      },

      saveLoadsAsPreset: async (input) => {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('not_authenticated');

        if (get().userLoadPresets.length >= ACCOUNT_LIMITS.userPresets) {
          throw new Error(limitReachedMessage('predefinições pessoais', ACCOUNT_LIMITS.userPresets));
        }

        const { data, error } = await supabase
          .from('user_load_presets')
          .insert({
            user_id: userData.user.id,
            name: input.name.trim(),
            description: input.description.trim(),
            loads: input.loads,
          })
          .select('id, name, description, loads')
          .single();
        if (error) throw error;

        const item = userLoadPresetFromRow(data);
        set((s) => ({ userLoadPresets: [...s.userLoadPresets, item] }));
      },

      removeUserLoadPreset: async (id) => {
        const supabase = createClient();
        const { error } = await supabase.from('user_load_presets').delete().eq('id', id);
        if (error) throw error;

        set((s) => ({
          userLoadPresets: s.userLoadPresets.filter((item) => item.id !== id),
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

      fetchUserServices: async () => {
        const supabase = createClient();
        const { data, error } = await supabase.from('user_services').select('*').order('name');
        if (error) throw error;
        set({ userServices: (data ?? []).map(userServiceFromRow) });
      },

      addService: async (input) => {
        if (get().userServices.length >= ACCOUNT_LIMITS.userServices) {
          throw new Error(limitReachedMessage('serviços no catálogo', ACCOUNT_LIMITS.userServices));
        }

        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('not_authenticated');

        const { data, error } = await supabase
          .from('user_services')
          .insert({ user_id: userData.user.id, name: input.name.trim(), unit_value: input.unitValue })
          .select()
          .single();
        if (error) throw error;

        const item = userServiceFromRow(data);
        set((s) => ({ userServices: [...s.userServices, item].sort((a, b) => a.name.localeCompare(b.name)) }));
      },

      updateServiceName: async (id, name) => {
        const trimmed = name.trim();
        const supabase = createClient();
        const { error } = await supabase
          .from('user_services')
          .update({ name: trimmed, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;

        set((s) => ({
          userServices: s.userServices.map((item) => (item.id === id ? { ...item, name: trimmed } : item)),
        }));
      },

      updateServiceValue: async (id, unitValue) => {
        const supabase = createClient();
        const { error } = await supabase
          .from('user_services')
          .update({ unit_value: unitValue, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;

        set((s) => ({
          userServices: s.userServices.map((item) => (item.id === id ? { ...item, unitValue } : item)),
        }));
      },

      removeService: async (id) => {
        const supabase = createClient();
        const { error } = await supabase.from('user_services').delete().eq('id', id);
        if (error) throw error;

        set((s) => ({
          userServices: s.userServices.filter((item) => item.id !== id),
          services: s.services.filter((line) => line.serviceId !== id),
        }));
      },

      fetchMarginSettings: async () => {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('margin_inverter_percent, margin_battery_percent, margin_accessory_percent')
          .eq('id', userData.user.id)
          .maybeSingle();
        if (error) throw error;

        set({
          marginSettings: {
            inverterPercent: data?.margin_inverter_percent ?? 0,
            batteryPercent: data?.margin_battery_percent ?? 0,
            accessoryPercent: data?.margin_accessory_percent ?? 0,
          },
        });
      },

      updateMarginPercent: async (category, percent) => {
        const column = {
          inverter: 'margin_inverter_percent',
          battery: 'margin_battery_percent',
          accessory: 'margin_accessory_percent',
        }[category];
        const field = {
          inverter: 'inverterPercent',
          battery: 'batteryPercent',
          accessory: 'accessoryPercent',
        }[category] as keyof MarginSettings;

        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('not_authenticated');

        const { error } = await supabase
          .from('profiles')
          .update({ [column]: percent, updated_at: new Date().toISOString() })
          .eq('id', userData.user.id);
        if (error) throw error;

        set((s) => ({ marginSettings: { ...s.marginSettings, [field]: percent } }));
      },

      addServiceToProject: (serviceId) =>
        set((s) => {
          if (s.services.some((line) => line.serviceId === serviceId)) return {};
          const service = s.userServices.find((item) => item.id === serviceId);
          if (!service) return {};
          return { services: [...s.services, { serviceId, name: service.name, qty: 1 }] };
        }),

      removeServiceFromProject: (serviceId) =>
        set((s) => ({ services: s.services.filter((line) => line.serviceId !== serviceId) })),

      updateProjectServiceQty: (serviceId, qty) =>
        set((s) => ({
          services: s.services.map((line) => (line.serviceId === serviceId ? { ...line, qty: Math.max(1, qty) } : line)),
        })),

      clearUserData: () =>
        set({
          clients: [],
          savedProjects: [],
          userLoadCatalog: [],
          userStockItems: [],
          userLoadPresets: [],
          userServices: [],
          marginSettings: { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 },
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

      setSecondaryBatteryModel: (secondaryBatteryModel) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, secondaryBatteryModel },
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
            pv: desiredFeatures.includes('pv') ? s.residentialOptions.pv : null,
            atsPhotoUrl: desiredFeatures.includes('external_ats') ? s.residentialOptions.atsPhotoUrl : null,
            atsBackupAcknowledged: desiredFeatures.includes('external_ats')
              ? s.residentialOptions.atsBackupAcknowledged
              : false,
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

      setPvConfig: (pv) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, pv },
        })),

      setAtsPhotoUrl: (atsPhotoUrl) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, atsPhotoUrl },
        })),

      setAtsBackupAcknowledged: (atsBackupAcknowledged) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, atsBackupAcknowledged },
        })),

      setPeakCalcMode: (peakCalcMode) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, peakCalcMode },
        })),

      setOperationHours: (operationHours) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, operationHours },
        })),

      addLoad: (load) => {
        if (get().residentialOptions.loads.length >= ACCOUNT_LIMITS.loadsPerProject) return false;
        set((s) => ({
          residentialOptions: {
            ...s.residentialOptions,
            loads: [load, ...s.residentialOptions.loads],
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

      setSecondarySolution: (secondarySolution) => set({ secondarySolution }),

      setLoadCatalog: (loadCatalog) => set({ loadCatalog }),

      setLoadPresets: (loadPresets) => set({ loadPresets }),

      resetResidential: () =>
        set({ residentialOptions: defaultResidential, solution: null, secondarySolution: null }),

      resetIndustrial: () =>
        set({ industrialOptions: defaultIndustrial, solution: null }),
    }),
    {
      name: 'solax-wizard',
      partialize: (state) => ({
        projectInfo: state.projectInfo,
        currentProjectId: state.currentProjectId,
        // Deliberately not persisted: a project left open in edit mode
        // (e.g. via "Editar" or mid-draft) shouldn't still be in edit mode
        // after a page reload — reloading the Projeto tab should always
        // start from the read-only list.
        residentialOptions: state.residentialOptions,
        industrialOptions: state.industrialOptions,
        solution: state.solution,
        secondarySolution: state.secondarySolution,
        services: state.services,
        loadCatalog: state.loadCatalog,
        loadPresets: state.loadPresets,
      }),
      // Zustand's default merge only shallow-merges top-level keys, so a
      // browser with residentialOptions/industrialOptions persisted before a
      // field was added (e.g. desiredFeatures/whiteTariff) would end up with
      // that field missing entirely instead of falling back to its default.
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<WizardStore>;
        const residentialOptions = { ...currentState.residentialOptions, ...persisted.residentialOptions };
        return {
          ...currentState,
          ...persisted,
          residentialOptions: {
            ...residentialOptions,
            desiredFeatures: sanitizeDesiredFeatures(residentialOptions.desiredFeatures),
          },
          industrialOptions: { ...currentState.industrialOptions, ...persisted.industrialOptions },
        };
      },
    }
  )
);

/** Sum of nominal (steady-state) power, ignoring each load's IP/IN surge
 * factor — as opposed to totalPeakW, which accounts for startup surges. */
export function totalNominalW(loads: SingleLoad[]): number {
  return loads.reduce((acc, l) => acc + l.powerW * l.qty, 0);
}

/** operationHours is shared across every load — each load's usageFactor
 * still scales its own share of that shared time. */
export function totalDailyKwh(loads: SingleLoad[], operationHours: number): number {
  return (operationHours * loads.reduce((acc, l) => acc + l.powerW * l.qty * (l.usageFactor ?? 1), 0)) / 1000;
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
