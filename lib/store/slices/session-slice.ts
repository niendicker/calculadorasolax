import type { StateCreator } from 'zustand';
import { defaultProjectInfo } from '../defaults';
import { zeroMargins } from './margin-slice';
import type { DemoSimulationData, DemoSnapshot, DemoTab } from '@/lib/demo/types';
import type { WizardStore } from '../wizard-store';

export interface SessionSlice {
  clearUserData: () => void;
  isDemo: boolean;
  demoId: string | null;
  demoSnapshot: DemoSnapshot | null;
  loadDemoSimulation: (id: string, data: DemoSimulationData, activeTab: DemoTab) => void;
  exitDemoMode: () => DemoTab | null;
  convertDemoToSimulation: () => void;
}

export const createSessionSlice: StateCreator<WizardStore, [], [], SessionSlice> = (set, get) => ({
  isDemo: false,
  demoId: null,
  demoSnapshot: null,

  loadDemoSimulation: (id, data, activeTab) =>
    set((s) => ({
      isDemo: true,
      demoId: id,
      demoSnapshot: s.demoSnapshot ?? {
        projectInfo: s.projectInfo,
        currentProjectId: s.currentProjectId,
        projectDetailsVisible: s.projectDetailsVisible,
        residentialOptions: s.residentialOptions,
        solution: s.solution,
        secondarySolution: s.secondarySolution,
        services: s.services,
        activeTab,
      },
      residentialOptions: data.residentialOptions,
      solution: null,
      secondarySolution: null,
    })),

  exitDemoMode: () => {
    const snapshot = get().demoSnapshot;
    if (!snapshot) {
      set({ isDemo: false, demoId: null });
      return null;
    }
    set({
      isDemo: false,
      demoId: null,
      demoSnapshot: null,
      projectInfo: snapshot.projectInfo,
      currentProjectId: snapshot.currentProjectId,
      projectDetailsVisible: snapshot.projectDetailsVisible,
      residentialOptions: snapshot.residentialOptions,
      solution: snapshot.solution,
      secondarySolution: snapshot.secondarySolution,
      services: snapshot.services,
    });
    return snapshot.activeTab;
  },

  convertDemoToSimulation: () =>
    set({
      isDemo: false,
      demoId: null,
      demoSnapshot: null,
      projectInfo: defaultProjectInfo,
      currentProjectId: null,
      projectDetailsVisible: true,
      services: [],
    }),

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
      isDemo: false,
      demoId: null,
      demoSnapshot: null,
    }),
});
