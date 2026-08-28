import { useEffect, useMemo } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { uploadPublicAsset } from '@/lib/data/storage-repository';
import { batteryTopologyToCatalog, type ResidentialOptions, type Solution } from '@/lib/types';
import { gridTypePhaseCount } from '@/lib/store/wizard-store';
import { expansionModelSet } from '../helpers';
import { gridTypeToApprovedTopology, type ApprovedInverterCombo, type BatteryCatalogOption, type InverterCatalogOption, type InlineProfile } from '../types';

export function useSizingController({
  supabase,
  profile,
  residentialOptions,
  batteryCatalog,
  inverterCatalog,
  approvedInverterCombos,
  calculate,
  solution,
  setSolution,
  setSummaryDrawerOpen,
  setBatteryModel,
  setSecondaryBatteryModel,
  setInverterModel,
  setMinInverterQty,
  setMaxPowerPerPhaseW,
  resetResidential,
}: {
  supabase: ReturnType<typeof createClient>;
  profile: InlineProfile | null;
  residentialOptions: ResidentialOptions;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  approvedInverterCombos: ApprovedInverterCombo[];
  calculate: () => void;
  solution: Solution | null;
  setSolution: (solution: Solution | null) => void;
  setSummaryDrawerOpen: (open: boolean) => void;
  setBatteryModel: (model: string | null) => void;
  setSecondaryBatteryModel: (model: string | null) => void;
  setInverterModel: (model: string | null) => void;
  setMinInverterQty: (quantity: number | null) => void;
  setMaxPowerPerPhaseW: (power: number | null) => void;
  resetResidential: () => void;
}) {
  const availableInverterModelsByTopology = useMemo(() => {
    if (!residentialOptions.gridType) return null;
    const approvedTopology = gridTypeToApprovedTopology[residentialOptions.gridType];
    const modelsFor = (batteryTopology: 'HV' | 'LV') =>
      new Set(
        approvedInverterCombos
          .filter((combo) => combo.gridTopology === approvedTopology && combo.batteryTopology === batteryTopology)
          .map((combo) => combo.inverterModel)
      );
    return { HV: modelsFor('HV'), LV: modelsFor('LV') };
  }, [approvedInverterCombos, residentialOptions.gridType]);

  const availableInverterModels = useMemo(() => {
    if (!availableInverterModelsByTopology) return null;
    const batteryTopology = residentialOptions.topology ? batteryTopologyToCatalog[residentialOptions.topology] : 'HV';
    return availableInverterModelsByTopology[batteryTopology];
  }, [availableInverterModelsByTopology, residentialOptions.topology]);

  useEffect(() => {
    const phaseCount = residentialOptions.gridType ? gridTypePhaseCount[residentialOptions.gridType] : 1;
    if (!residentialOptions.gridType || phaseCount <= 1) {
      if (residentialOptions.maxPowerPerPhaseW !== null) setMaxPowerPerPhaseW(null);
      return;
    }
    const inverter = inverterCatalog.find((item) => item.model === residentialOptions.inverterModel);
    const computed = inverter?.maxPowerPerPhaseW ?? (inverter?.standardPowerKva ? (inverter.standardPowerKva * 1000) / phaseCount : null);
    if (computed !== residentialOptions.maxPowerPerPhaseW) setMaxPowerPerPhaseW(computed);
  }, [residentialOptions.gridType, residentialOptions.inverterModel, residentialOptions.maxPowerPerPhaseW, inverterCatalog, setMaxPowerPerPhaseW]);

  function resetResidentialToDefaults() {
    resetResidential();
    const expansionModels = expansionModelSet(batteryCatalog);
    const defaultBattery = batteryCatalog.find((battery) => battery.topology === 'HV' && !expansionModels.has(battery.model));
    if (defaultBattery) setBatteryModel(defaultBattery.model);
  }

  function chooseMicrogridVariant(variant: 'economic' | 'microgrid') {
    if (!solution?.microgridAlternative) return;
    if (variant === 'economic') {
      setSolution({ ...solution, microgridAlternative: undefined });
    } else {
      setSolution({ ...solution.microgridAlternative, microgridAlternative: undefined });
    }
  }

  async function uploadFeaturePhoto(file: File, slot: 'ats' | 'microgrid' | 'generator') {
    if (!profile) throw new Error('Não foi possível identificar o usuário.');
    const extension = file.name.split('.').pop();
    const path = `${profile.id}/feature-photos/${slot}/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
    return uploadPublicAsset(supabase, 'profile-assets', path, file);
  }

  function calculateAndShowSummary() {
    calculate();
    setSummaryDrawerOpen(true);
  }

  return {
    availableInverterModels,
    availableInverterModelsByTopology,
    setBatteryModel,
    setSecondaryBatteryModel,
    setInverterModel,
    setMinInverterQty,
    resetResidentialToDefaults,
    chooseMicrogridVariant,
    uploadFeaturePhoto,
    calculateAndShowSummary,
  };
}
