import type { StateCreator } from 'zustand';
import { ACCOUNT_LIMITS } from '@/lib/limits';
import type {
  BatteryTopology,
  CatalogItem,
  DesiredFeatureId,
  GeneratorConfig,
  IndustrialOptions,
  LoadPresetItem,
  MicrogridConfig,
  PeakCalcMode,
  PvConfig,
  ResidentialGridType,
  ResidentialOptions,
  SingleLoad,
  Solution,
  WhiteTariffConfig,
} from '@/lib/types';
import { defaultIndustrial, defaultResidential } from '../defaults';
import type { WizardStore } from '../wizard-store';

export interface ResidentialSlice {
  residentialOptions: ResidentialOptions;
  industrialOptions: IndustrialOptions;
  solution: Solution | null;
  /** Result for residentialOptions.secondaryBatteryModel, when set — a live
   * comparison aid, not part of what gets saved with the project (see
   * saveCurrentProject/loadProject in the projects slice, which only persist
   * `solution`). */
  secondarySolution: Solution | null;
  loadCatalog: CatalogItem[];
  loadPresets: LoadPresetItem[];

  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setSecondaryBatteryModel: (secondaryBatteryModel: string | null) => void;
  setInverterModel: (inverterModel: string | null) => void;
  setMinInverterQty: (minInverterQty: number | null) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  setMaxPowerPerPhaseW: (maxPowerPerPhaseW: number | null) => void;
  setDesiredFeatures: (desiredFeatures: DesiredFeatureId[]) => void;
  setWhiteTariffConfig: (whiteTariff: WhiteTariffConfig | null) => void;
  setMicrogridConfig: (microgrid: MicrogridConfig | null) => void;
  setGeneratorConfig: (generator: GeneratorConfig | null) => void;
  setPvConfig: (pv: PvConfig | null) => void;
  setAtsPhotoUrl: (atsPhotoUrl: string | null) => void;
  setAtsBackupAcknowledged: (atsBackupAcknowledged: boolean) => void;
  setPeakCalcMode: (peakCalcMode: PeakCalcMode) => void;
  setOperationHours: (operationHours: number) => void;
  /** Returns false (no-op) instead of adding when the project is already at ACCOUNT_LIMITS.loadsPerProject. */
  addLoad: (load: SingleLoad) => boolean;
  removeLoad: (id: string) => void;
  updateLoad: (id: string, partial: Partial<SingleLoad>) => void;
  setIndustrialOption: <K extends keyof IndustrialOptions>(key: K, value: IndustrialOptions[K]) => void;
  setSolution: (solution: Solution | null) => void;
  setSecondarySolution: (solution: Solution | null) => void;
  setLoadCatalog: (catalog: CatalogItem[]) => void;
  setLoadPresets: (presets: LoadPresetItem[]) => void;
  resetResidential: () => void;
  resetIndustrial: () => void;
}

export const createResidentialSlice: StateCreator<WizardStore, [], [], ResidentialSlice> = (set, get) => ({
  residentialOptions: defaultResidential,
  industrialOptions: defaultIndustrial,
  solution: null,
  secondarySolution: null,
  loadCatalog: [],
  loadPresets: [],

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

  setSecondaryBatteryModel: (secondaryBatteryModel) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, secondaryBatteryModel },
    })),

  setInverterModel: (inverterModel) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, inverterModel },
    })),

  setMinInverterQty: (minInverterQty) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, minInverterQty },
    })),

  setGridType: (gridType) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, gridType, inverterModel: null },
    })),

  setMaxPowerPerPhaseW: (maxPowerPerPhaseW) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, maxPowerPerPhaseW },
    })),

  setDesiredFeatures: (desiredFeatures) =>
    set((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        desiredFeatures,
        whiteTariff: desiredFeatures.includes('white_tariff') ? s.residentialOptions.whiteTariff : null,
        microgrid: desiredFeatures.includes('microgrid') ? s.residentialOptions.microgrid : null,
        generator: desiredFeatures.includes('external_generator') ? s.residentialOptions.generator : null,
        pv: desiredFeatures.includes('pv') ? s.residentialOptions.pv : null,
        atsPhotoUrl: desiredFeatures.includes('external_ats') ? s.residentialOptions.atsPhotoUrl : null,
        atsBackupAcknowledged: desiredFeatures.includes('external_ats')
          ? s.residentialOptions.atsBackupAcknowledged
          : false,
      },
    })),

  setWhiteTariffConfig: (whiteTariff) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, whiteTariff },
    })),

  setMicrogridConfig: (microgrid) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, microgrid },
    })),

  setGeneratorConfig: (generator) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, generator },
    })),

  setPvConfig: (pv) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, pv },
    })),

  setAtsPhotoUrl: (atsPhotoUrl) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, atsPhotoUrl },
    })),

  setAtsBackupAcknowledged: (atsBackupAcknowledged) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, atsBackupAcknowledged },
    })),

  setPeakCalcMode: (peakCalcMode) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, peakCalcMode },
    })),

  setOperationHours: (operationHours) =>
    set((s) => ({
      residentialOptions: { ...s.residentialOptions, operationHours },
    })),

  addLoad: (load) => {
    if (get().residentialOptions.loads.length >= ACCOUNT_LIMITS.loadsPerProject) return false;
    set((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        loads: [load, ...s.residentialOptions.loads],
      },
    }));
    return true;
  },

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
        loads: s.residentialOptions.loads.map((l) => (l.id === id ? { ...l, ...partial } : l)),
      },
    })),

  setIndustrialOption: (key, value) =>
    set((s) => ({
      industrialOptions: { ...s.industrialOptions, [key]: value },
    })),

  setSolution: (solution) => set({ solution }),

  setSecondarySolution: (secondarySolution) => set({ secondarySolution }),

  setLoadCatalog: (loadCatalog) => set({ loadCatalog }),

  setLoadPresets: (loadPresets) => set({ loadPresets }),

  resetResidential: () => set({ residentialOptions: defaultResidential, solution: null, secondarySolution: null }),

  resetIndustrial: () => set({ industrialOptions: defaultIndustrial, solution: null }),
});
