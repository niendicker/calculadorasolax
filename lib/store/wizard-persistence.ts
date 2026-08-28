import type { PersistOptions } from 'zustand/middleware';
import { sanitizeDesiredFeatures } from './defaults';
import type { WizardStore } from './wizard-store';

type PersistedWizardState = Partial<WizardStore>;

/** Persistence policy for the local wizard cache, kept outside the store
 * composition so changes to hydration rules can be reviewed independently. */
export const wizardPersistenceOptions: PersistOptions<WizardStore, PersistedWizardState> = {
  name: 'solax-wizard',
  skipHydration: true,
  partialize: (state) => ({
    projectInfo: state.projectInfo,
    currentProjectId: state.currentProjectId,
    residentialOptions: state.residentialOptions,
    industrialOptions: state.industrialOptions,
    solution: state.solution,
    secondarySolution: state.secondarySolution,
    services: state.services,
    loadCatalog: state.loadCatalog,
    loadPresets: state.loadPresets,
  }),
  merge: (persistedState, currentState) => {
    const persisted = (persistedState ?? {}) as PersistedWizardState;
    const { isDemo: legacyIsDemo, demoId: legacyDemoId, demoSnapshot: legacyDemoSnapshot, ...persistedWithoutDemo } = persisted as PersistedWizardState & Record<string, unknown>;
    void legacyIsDemo;
    void legacyDemoId;
    void legacyDemoSnapshot;
    const residentialOptions = { ...currentState.residentialOptions, ...persistedWithoutDemo.residentialOptions };
    return {
      ...currentState,
      ...persistedWithoutDemo,
      residentialOptions: {
        ...residentialOptions,
        desiredFeatures: sanitizeDesiredFeatures(residentialOptions.desiredFeatures),
      },
      industrialOptions: { ...currentState.industrialOptions, ...persisted.industrialOptions },
    };
  },
};
