'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BatteryTopology,
  CatalogItem,
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
  savedProjects: SavedProject[];
  residentialOptions: ResidentialOptions;
  industrialOptions: IndustrialOptions;
  solution: Solution | null;
  loadCatalog: CatalogItem[];

  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  saveCurrentProject: () => SavedProject;
  loadProject: (id: string) => void;
  removeProject: (id: string) => void;
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
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientDocument: '',
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

export const useWizardStore = create<WizardStore>()(
  persist(
    (set) => ({
      projectInfo: defaultProjectInfo,
      savedProjects: [],
      residentialOptions: defaultResidential,
      industrialOptions: defaultIndustrial,
      solution: null,
      loadCatalog: [],

      setProjectInfo: (partial) =>
        set((s) => ({
          projectInfo: { ...s.projectInfo, ...partial },
        })),

      saveCurrentProject: () => {
        const now = new Date().toISOString();
        let savedProject: SavedProject;

        set((s) => {
          const existingId =
            s.savedProjects.find((project) => project.id === s.projectInfo.name)?.id ??
            s.savedProjects.find(
              (project) =>
                project.name === s.projectInfo.name &&
                project.clientName === s.projectInfo.clientName
            )?.id;
          const id = existingId ?? crypto.randomUUID();
          const name =
            s.projectInfo.name.trim() ||
            s.projectInfo.clientName.trim() ||
            `Projeto ${new Date().toLocaleDateString('pt-BR')}`;

          savedProject = {
            id,
            name,
            clientName: s.projectInfo.clientName.trim(),
            updatedAt: now,
            projectInfo: { ...s.projectInfo, name },
            residentialOptions: {
              ...s.residentialOptions,
              loads: s.residentialOptions.loads.map((load) => ({ ...load })),
            },
            solution: s.solution ? { ...s.solution, accessories: [...s.solution.accessories] } : null,
          };

          return {
            projectInfo: savedProject.projectInfo,
            savedProjects: [
              savedProject,
              ...s.savedProjects.filter((project) => project.id !== id),
            ],
          };
        });

        return savedProject!;
      },

      loadProject: (id) =>
        set((s) => {
          const project = s.savedProjects.find((item) => item.id === id);
          if (!project) return {};

          return {
            projectInfo: project.projectInfo,
            residentialOptions: {
              ...project.residentialOptions,
              loads: project.residentialOptions.loads.map((load) => ({ ...load })),
            },
            solution: project.solution,
          };
        }),

      removeProject: (id) =>
        set((s) => ({
          savedProjects: s.savedProjects.filter((project) => project.id !== id),
        })),

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
    { name: 'solax-wizard' }
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
