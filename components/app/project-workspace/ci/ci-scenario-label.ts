import type { ScenarioCandidate } from '@/supabase/functions/_shared/commercial-industrial/types';
export function ciScenarioLabel(scenario: Pick<ScenarioCandidate, 'moduleCount' | 'composition' | 'equipmentLabel'>) {
  const composition = scenario.composition;
  if (!composition) return `${scenario.equipmentLabel ? `${scenario.equipmentLabel} · ` : ''}${scenario.moduleCount} módulo${scenario.moduleCount === 1 ? '' : 's'}`;
  const one = composition.batteryCount === 1;
  const unit = composition.unitKind === 'rack' ? (one ? 'rack' : 'racks') : composition.unitKind === 'cabinet' ? (one ? 'gabinete' : 'gabinetes') : (one ? 'módulo de bateria' : 'módulos de bateria');
  return `${composition.pcsCount} PCS + ${composition.batteryCount} ${unit} (${composition.seriesCount}S × ${composition.parallelStringsPerPcs}P por PCS)`;
}
