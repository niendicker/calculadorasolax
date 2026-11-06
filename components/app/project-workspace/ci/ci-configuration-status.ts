import { validateStsSelection } from '@/supabase/functions/_shared/commercial-industrial/sts';
import { validateModularSelection } from '@/supabase/functions/_shared/commercial-industrial/modular';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';

/** Configuration presence for navigation and summaries; calculation validation remains server-side. */
export function getCiConfigurationStatus(options: CommercialIndustrialOptions) {
  const positiveInteger = (value: number | null): value is number => value !== null && Number.isInteger(value) && value > 0;
  const sizing = options.sizing;
  return {
    bess: options.bessSystem?.kind === 'modular' ? validateModularSelection(options.bessSystem).length === 0 : Boolean(options.bessProductId) && (sizing.mode === 'fixed'
      ? positiveInteger(sizing.moduleCount)
      : positiveInteger(sizing.minModules) && positiveInteger(sizing.maxModules) && sizing.minModules <= sizing.maxModules),
    solar: !options.solar?.enabled || Boolean(options.solar.generationCurve?.points.length) || options.solar.installedPowerKwp > 0,
    curve: Boolean(options.loadCurve?.points.length),
    tariff: options.tariff !== null,
    strategy: true,
    backup: !options.backup?.enabled || (options.backup.inputMode === 'detailed'
      ? options.backup.loads.length > 0
      : options.backup.targetPowerKw > 0) && (!options.backup.sts || validateStsSelection(options.backup.sts).length === 0),
  };
}
