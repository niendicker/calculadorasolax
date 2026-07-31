import type { DesiredFeatureId, InverterFlag } from './types';

export interface DesiredFeatureDefinition {
  id: DesiredFeatureId;
  label: string;
  description: string;
  /** When set, only inverters carrying this flag satisfy the requirement —
   * enforced as a hard filter when picking an approved solution. Features
   * without this (e.g. 'pv', 'white_tariff') use dedicated logic instead. */
  requiresInverterFlag?: InverterFlag;
}

/** Add a new flag-based requirement by adding one entry here (plus the
 * matching InverterFlag in lib/types.ts and an admin editor option) — no
 * other filtering code needs to change. Also has a manually-synced copy in
 * supabase/functions/calculate-residential/logic.ts (Deno can't import this
 * file); update both — mirrors.test.ts next to that copy asserts they agree. */
export const DESIRED_FEATURE_DEFINITIONS: DesiredFeatureDefinition[] = [
  {
    id: 'backup',
    label: 'Backup',
    description: 'Mantém as cargas selecionadas funcionando durante uma falta de energia.',
  },
  {
    id: 'external_ats',
    label: 'Backup Total',
    description: 'Mantém toda a instalação alimentada durante uma falta de energia.',
    requiresInverterFlag: 'external_ats',
  },
  {
    id: 'microgrid',
    label: 'Microrrede',
    description: 'Permite manter a geração fotovoltaica existente operando mesmo quando a rede elétrica está indisponível.',
    requiresInverterFlag: 'microgrid',
  },
  {
    id: 'external_generator',
    label: 'Gerador',
    description: 'Integra um gerador externo ao sistema para ampliar a autonomia durante interrupções.',
    requiresInverterFlag: 'external_generator',
  },
  {
    id: 'pv',
    label: 'Fotovoltaico',
    description: 'Inclui a recomendação de um arranjo fotovoltaico adequado ao consumo informado.',
  },
  {
    id: 'white_tariff',
    label: 'Tarifa Branca',
    description: 'Usa a bateria nos horários mais caros da Tarifa Branca e estima a economia no relatório.',
  },
];

export function desiredFeatureLabel(id: DesiredFeatureId): string {
  return DESIRED_FEATURE_DEFINITIONS.find((feature) => feature.id === id)?.label ?? id;
}
