'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sanitizeDesiredFeatures } from './defaults';
import { type ClientsSlice, createClientsSlice } from './slices/clients-slice';
import { createLoadCatalogSlice, type LoadCatalogSlice } from './slices/load-catalog-slice';
import { createMarginSlice, type MarginSlice, zeroMargins } from './slices/margin-slice';
import { createProjectsSlice, type ProjectsSlice } from './slices/projects-slice';
import { createResidentialSlice, type ResidentialSlice } from './slices/residential-slice';
import { createServicesSlice, type ServicesSlice } from './slices/services-slice';
import { createStockSlice, type StockSlice } from './slices/stock-slice';

// wizard-store.ts is just the composition point: each domain's own state and
// actions live in lib/store/slices/*, split out because this file had grown
// into a ~1200-line single module covering projects, clients, catalogs,
// pricing and the live wizard config all at once. WizardStore (below) is the
// union every slice is typed against — a slice that needs another slice's
// state (e.g. removeClient touching savedProjects) still can via get()/set(),
// same as before the split.
export interface WizardStore
  extends ProjectsSlice,
    ClientsSlice,
    LoadCatalogSlice,
    StockSlice,
    ServicesSlice,
    MarginSlice,
    ResidentialSlice {
  clearUserData: () => void;
}

export const useWizardStore = create<WizardStore>()(
  persist(
    (set, get, api) => ({
      ...createProjectsSlice(set, get, api),
      ...createClientsSlice(set, get, api),
      ...createLoadCatalogSlice(set, get, api),
      ...createStockSlice(set, get, api),
      ...createServicesSlice(set, get, api),
      ...createMarginSlice(set, get, api),
      ...createResidentialSlice(set, get, api),

      clearUserData: () =>
        set({
          clients: [],
          savedProjects: [],
          userLoadCatalog: [],
          userStockItems: [],
          userLoadPresets: [],
          userServices: [],
          marginSettings: zeroMargins,
          currentProjectId: null,
          projectDetailsVisible: false,
        }),
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

// Pure calculation helpers used to live in this file; re-exported here so
// existing `import { totalPeakW } from '@/lib/store/wizard-store'` call
// sites across the app don't need to change.
export {
  gridTypePhaseCount,
  gridTypePhaseToPhaseVoltages,
  gridTypeVoltages,
  loadPhases,
  totalDailyKwh,
  totalNominalW,
  totalPeakW,
  totalPowerByPhase,
} from './wizard-calculations';
