import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import type { DesiredFeatureId, GeneratorConfig, MicrogridConfig, PvConfig, ResidentialGridType, WhiteTariffConfig } from '@/lib/types';
import {
  isGeneratorAtsUnacknowledged,
  isGeneratorPhaseVoltageIncompatible,
  isGeneratorPowerInsufficient,
  isMicrogridPhaseVoltageIncompatible,
  isPvConfigIncomplete,
  isWhiteTariffConfigIncomplete,
} from '../../helpers';
import type { InverterCatalogOption } from '../../types';

/** True when an enabled desired feature still has something pending review —
 * a blocking inconsistency (generator power/phase-voltage, microgrid
 * phase-voltage), no available inverter supporting the feature's required
 * flag among whatever's chosen in Configurações (see InverterSupportSummary),
 * or just an unacknowledged confirmation (ATS/generator/microgrid checkboxes).
 * Shared between each feature's own tab (see DesiredFeaturesPicker) and the
 * "Funcionalidades" main tab (see SizingTab), which shows the same warning
 * whenever any of its feature tabs would. */
export function desiredFeatureHasPendingIssue(
  id: DesiredFeatureId,
  value: DesiredFeatureId[],
  {
    microgrid,
    generator,
    pv,
    whiteTariff,
    atsBackupAcknowledged,
    gridType,
    peakW,
    loadsCount,
    inverterCatalog,
    availableInverterModels,
    selectedInverterModel,
  }: {
    microgrid: MicrogridConfig | null;
    generator: GeneratorConfig | null;
    pv: PvConfig | null;
    whiteTariff: WhiteTariffConfig | null;
    atsBackupAcknowledged: boolean;
    gridType: ResidentialGridType | null;
    peakW: number;
    loadsCount: number;
    inverterCatalog: InverterCatalogOption[];
    availableInverterModels: Set<string> | null;
    selectedInverterModel: string | null;
  }
): boolean {
  if (!value.includes(id)) return false;

  const requiredFlag = DESIRED_FEATURE_DEFINITIONS.find((feature) => feature.id === id)?.requiresInverterFlag;
  if (requiredFlag) {
    const narrowedCatalog = selectedInverterModel
      ? inverterCatalog.filter((inverter) => inverter.model === selectedInverterModel)
      : availableInverterModels
        ? inverterCatalog.filter((inverter) => availableInverterModels.has(inverter.model))
        : null;
    if (narrowedCatalog !== null && !narrowedCatalog.some((inverter) => inverter.flags.includes(requiredFlag))) {
      return true;
    }
  }

  switch (id) {
    case 'backup':
      return loadsCount === 0;
    case 'external_ats':
      return !atsBackupAcknowledged;
    case 'microgrid':
      return !microgrid?.onGridApparentPowerVA || isMicrogridPhaseVoltageIncompatible(value, microgrid, gridType);
    case 'external_generator':
      return (
        isGeneratorPowerInsufficient(value, generator, peakW) ||
        isGeneratorAtsUnacknowledged(value, generator) ||
        isGeneratorPhaseVoltageIncompatible(value, generator, gridType)
      );
    case 'pv':
      return isPvConfigIncomplete(value, pv);
    case 'white_tariff':
      return isWhiteTariffConfigIncomplete(value, whiteTariff);
    default:
      return false;
  }
}
