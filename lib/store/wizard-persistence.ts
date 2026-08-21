import type { PersistOptions } from 'zustand/middleware';
import { defaultProjectInfo, defaultResidential, sanitizeDesiredFeatures } from './defaults';
import type { WizardStore } from './wizard-store';

type PersistedWizardState = Partial<WizardStore>;

/** Persistence policy for the local wizard cache, kept outside the store
 * composition so changes to hydration rules can be reviewed independently. */
export const wizardPersistenceOptions: PersistOptions<WizardStore, PersistedWizardState> = {
  name: 'solax-wizard',
  skipHydration: true,
  partialize: (state) => ({
    projectInfo: state.isDemo ? defaultProjectInfo : state.projectInfo,
    currentProjectId: state.isDemo ? null : state.currentProjectId,
    residentialOptions: state.isDemo ? defaultResidential : state.residentialOptions,
    industrialOptions: state.industrialOptions,
    solution: state.isDemo ? null : state.solution,
    secondarySolution: state.isDemo ? null : state.secondarySolution,
    services: state.isDemo ? [] : state.services,
    loadCatalog: state.loadCatalog,
    loadPresets: state.loadPresets,
  }),
  merge: (persistedState, currentState) => {
    const persisted = (persistedState ?? {}) as PersistedWizardState;
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
};
