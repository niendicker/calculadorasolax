import type { ScenarioCandidate } from '@/supabase/functions/_shared/commercial-industrial/types';
export function ciScenarioLabel(scenario: Pick<ScenarioCandidate, 'moduleCount' | 'composition' | 'equipmentLabel' | 'group'>) {
  if (scenario.group) return scenario.group.label;
  const composition = scenario.composition;
  if (!composition) return `${scenario.equipmentLabel ? `${scenario.equipmentLabel} · ` : ''}${scenario.moduleCount} módulo${scenario.moduleCount === 1 ? '' : 's'}`;
  if(composition.portBanks)return `${composition.pcsCount} PCS + ${composition.batteryCount} baterias (${composition.portBanks.map((bank,i)=>`porta ${i+1}: ${bank.series}S × ${bank.parallelStrings}P`).join(' / ')})`;
  const one = composition.batteryCount === 1;
  const unit = composition.unitKind === 'rack' ? (one ? 'rack' : 'racks') : composition.unitKind === 'cabinet' ? (one ? 'gabinete' : 'gabinetes') : (one ? 'módulo de bateria' : 'módulos de bateria');
  return `${composition.pcsCount} PCS + ${composition.batteryCount} ${unit} (${composition.seriesCount}S × ${composition.parallelStringsPerPcs}P por PCS)`;
}
