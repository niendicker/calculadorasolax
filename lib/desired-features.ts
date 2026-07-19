import type { DesiredFeatureId, InverterFlag } from './types';

export interface DesiredFeatureDefinition {
  id: DesiredFeatureId;
  label: string;
  description: string;
  /** When set, only inverters carrying this flag satisfy the requirement —
   * enforced as a hard filter when picking an approved solution. Features
   * without this (e.g. 'no_pv', 'white_tariff') use dedicated logic instead. */
  requiresInverterFlag?: InverterFlag;
}

/** Add a new flag-based requirement by adding one entry here (plus the
 * matching InverterFlag in lib/types.ts and an admin editor option) — no
 * other filtering code needs to change. */
export const DESIRED_FEATURE_DEFINITIONS: DesiredFeatureDefinition[] = [
  {
    id: 'backup',
    label: 'Backup',
    description: 'Todos os inversores híbridos suportam a funcionalidade de backup.',
  },
  {
    id: 'external_ats',
    label: 'ATS Externo',
    description: 'Exige um inversor compatível com chave de transferência automática externa.',
    requiresInverterFlag: 'external_ats',
  },
  {
    id: 'microgrid',
    label: 'Microrrede',
    description: '',
    requiresInverterFlag: 'microgrid',
  },
  {
    id: 'external_generator',
    label: 'Gerador Externo',
    description: 'Exige um inversor compatível com integração de gerador externo.',
    requiresInverterFlag: 'external_generator',
  },
  {
    id: 'no_pv',
    label: 'Sem FV',
    description: 'Dimensiona sem recomendar um arranjo fotovoltaico.',
  },
  {
    id: 'white_tariff',
    label: 'Tarifa Branca',
    description: 'Reserva potência e energia para o período de tarifa branca, com economia estimada no relatório.',
  },
];

export function desiredFeatureLabel(id: DesiredFeatureId): string {
  return DESIRED_FEATURE_DEFINITIONS.find((feature) => feature.id === id)?.label ?? id;
}
