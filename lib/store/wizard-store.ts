'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type ClientsSlice, createClientsSlice } from './slices/clients-slice';
import { createLoadCatalogSlice, type LoadCatalogSlice } from './slices/load-catalog-slice';
import { createMarginSlice, type MarginSlice } from './slices/margin-slice';
import { createProjectsSlice, type ProjectsSlice } from './slices/projects-slice';
import { createResidentialSlice, type ResidentialSlice } from './slices/residential-slice';
import { createServicesSlice, type ServicesSlice } from './slices/services-slice';
import { createStockSlice, type StockSlice } from './slices/stock-slice';
import { createSessionSlice, type SessionSlice } from './slices/session-slice';
import { wizardPersistenceOptions } from './wizard-persistence';

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
    ResidentialSlice,
    SessionSlice {}

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
      ...createSessionSlice(set, get, api),
    }),
    wizardPersistenceOptions
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
