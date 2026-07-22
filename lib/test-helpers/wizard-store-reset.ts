import { useWizardStore } from '@/lib/store/wizard-store';

/** Resets the wizard store to its factory-default state — for tests that
 *  render against the real store (not a mock) and need a clean slate between
 *  cases, since Zustand state otherwise persists across tests in the same file. */
export function resetWizardStore() {
  useWizardStore.setState({
    projectInfo: { name: '', clientId: null, address: '', notes: '' },
    currentProjectId: null,
    projectDetailsVisible: false,
    savedProjects: [],
    clients: [],
    userLoadCatalog: [],
    userStockItems: [],
    userLoadPresets: [],
    residentialOptions: {
      topology: null,
      batteryModel: null,
      inverterModel: null,
      gridType: null,
      loads: [],
      peakCalcMode: 'sum',
      desiredFeatures: [],
      whiteTariff: null,
      microgrid: null,
      generator: null,
      atsPhotoUrl: null,
      atsBackupAcknowledged: false,
      maxPowerPerPhaseW: null,
    },
    industrialOptions: {
      gridPowerKw: null,
      pvPowerKwp: null,
      backupPowerKw: null,
      backupHours: null,
      demandCharge: false,
    },
    solution: null,
    loadCatalog: [],
    loadPresets: [],
  });
}
