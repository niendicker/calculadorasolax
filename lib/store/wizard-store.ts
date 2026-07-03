'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/lib/supabase/client';
import type {
  BatteryTopology,
  CatalogItem,
  Client,
  IndustrialOptions,
  MicroGridOptions,
  PeakCalcMode,
  ProjectInfo,
  ResidentialGridType,
  ResidentialOptions,
  SavedProject,
  SingleLoad,
  Solution,
} from '@/lib/types';

interface WizardStore {
  projectInfo: ProjectInfo;
  currentProjectId: string | null;
  savedProjects: SavedProject[];
  clients: Client[];
  residentialOptions: ResidentialOptions;
  industrialOptions: IndustrialOptions;
  solution: Solution | null;
  loadCatalog: CatalogItem[];

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
  clearUserData: () => void;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setInverterModel: (inverterModel: string | null) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  setMicroGrid: (microGrid: MicroGridOptions) => void;
  setPeakCalcMode: (peakCalcMode: PeakCalcMode) => void;
  addLoad: (load: SingleLoad) => void;
  removeLoad: (id: string) => void;
  updateLoad: (id: string, partial: Partial<SingleLoad>) => void;
  setIndustrialOption: <K extends keyof IndustrialOptions>(
    key: K,
    value: IndustrialOptions[K]
  ) => void;
  setSolution: (solution: Solution | null) => void;
  setLoadCatalog: (catalog: CatalogItem[]) => void;
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
  microGrid: null,
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
      savedProjects: [],
      clients: [],
      residentialOptions: defaultResidential,
      industrialOptions: defaultIndustrial,
      solution: null,
      loadCatalog: [],

      setProjectInfo: (partial) =>
        set((s) => ({
          projectInfo: { ...s.projectInfo, ...partial },
        })),

      newProjectDraft: () =>
        set({
          projectInfo: defaultProjectInfo,
          currentProjectId: null,
          residentialOptions: defaultResidential,
          solution: null,
        }),

      saveCurrentProject: async () => {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('not_authenticated');

        const s = get();
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
            projectInfo: {
              name: project.name,
              clientId: project.clientId,
              address: project.address,
              notes: project.notes,
            },
            residentialOptions: {
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

        set((s) => ({
          savedProjects: s.savedProjects.filter((project) => project.id !== id),
          currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
        }));
      },

      fetchProjects: async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('updated_at', { ascending: false });
        if (error) return;
        set({ savedProjects: (data ?? []).map(projectFromRow) });
      },

      fetchClients: async () => {
        const supabase = createClient();
        const { data, error } = await supabase.from('clients').select('*').order('name');
        if (error) return;
        set({ clients: (data ?? []).map(clientFromRow) });
      },

      addClient: async (input) => {
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

      clearUserData: () =>
        set({
          clients: [],
          savedProjects: [],
          currentProjectId: null,
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

      setMicroGrid: (microGrid) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, microGrid },
        })),

      setPeakCalcMode: (peakCalcMode) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, peakCalcMode },
        })),

      addLoad: (load) =>
        set((s) => ({
          residentialOptions: {
            ...s.residentialOptions,
            loads: [...s.residentialOptions.loads, load],
          },
        })),

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
        residentialOptions: state.residentialOptions,
        industrialOptions: state.industrialOptions,
        solution: state.solution,
        loadCatalog: state.loadCatalog,
      }),
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
