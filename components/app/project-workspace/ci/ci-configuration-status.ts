import { validateStsSelection } from '@/supabase/functions/_shared/commercial-industrial/sts';
import { validateModularSelection } from '@/supabase/functions/_shared/commercial-industrial/modular';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { computeBackupRequirements } from '@/supabase/functions/_shared/commercial-industrial/backup';

/** Configuration presence for navigation and summaries; calculation validation remains server-side. */
export function getCiConfigurationStatus(options: CommercialIndustrialOptions) {
  const positiveInteger = (value: number | null): value is number => value !== null && Number.isInteger(value) && value > 0;
  const sizing = options.sizing;
  let backupConfigured=!options.backup?.enabled;
  if(options.backup?.enabled){
    try{const requirements=computeBackupRequirements(options.backup,options.loadCurve);backupConfigured=Boolean(requirements&&requirements.requiredContinuousPowerKw>0&&requirements.requiredEnergyKwh>0)&&(!options.backup.sts||validateStsSelection(options.backup.sts).length===0);}
    catch{backupConfigured=false;}
  }
  return {
    bess: options.bessSystem?.kind === 'solution' ? Boolean(options.bessSystem.solutionKey?.trim()) : options.bessSystem?.kind === 'automatic' ? [options.bessSystem.minPowerKw,options.bessSystem.minEnergyKwh].every(value=>Number.isFinite(value)&&value>=0) : options.bessSystem?.kind === 'modular' ? validateModularSelection(options.bessSystem).length === 0 : Boolean(options.bessProductId) && (sizing.mode === 'fixed'
      ? positiveInteger(sizing.moduleCount)
      : positiveInteger(sizing.minModules) && positiveInteger(sizing.maxModules) && sizing.minModules <= sizing.maxModules),
    solar: !options.solar?.enabled || Boolean(options.solar.generationCurve?.points.length) || options.solar.installedPowerKwp > 0,
    curve: Boolean(options.loadCurve?.points.length),
    tariff: options.tariff !== null,
    strategy: true,
    backup: backupConfigured,
  };
}
