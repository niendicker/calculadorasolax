import type { StateCreator } from 'zustand';
import { zeroMargins } from './margin-slice';
import type { WizardStore } from '../wizard-store';

export interface SessionSlice {
  clearUserData: () => void;
}

export const createSessionSlice: StateCreator<WizardStore, [], [], SessionSlice> = (set) => ({
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
});
