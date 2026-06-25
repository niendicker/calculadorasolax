'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BatteryTopology,
  CatalogItem,
  IndustrialOptions,
  MicroGridOptions,
  ResidentialGridType,
  ResidentialOptions,
  SingleLoad,
  Solution,
} from '@/lib/types';

interface WizardStore {
  residentialOptions: ResidentialOptions;
  industrialOptions: IndustrialOptions;
  solution: Solution | null;
  loadCatalog: CatalogItem[];

  setTopology: (topology: BatteryTopology) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  setMicroGrid: (microGrid: MicroGridOptions) => void;
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

const defaultResidential: ResidentialOptions = {
  topology: null,
  gridType: null,
  loads: [],
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
      residentialOptions: defaultResidential,
      industrialOptions: defaultIndustrial,
      solution: null,
      loadCatalog: [],

      setTopology: (topology) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, topology },
        })),

      setGridType: (gridType) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, gridType },
        })),

      setMicroGrid: (microGrid) =>
        set((s) => ({
          residentialOptions: { ...s.residentialOptions, microGrid },
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

export function totalPeakW(loads: SingleLoad[]): number {
  return loads.reduce((acc, l) => acc + l.powerW * l.qty, 0);
}
