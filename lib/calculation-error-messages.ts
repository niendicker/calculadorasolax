// Maps the calculate-residential Edge Function's stable error codes to
// specific, actionable messages, instead of showing the same generic
// "couldn't find a solution" text for every failure — sizing issues, ESS
// incompatibility, invalid input, and network/server errors all need
// different guidance for the user.

import { desiredFeatureLabel } from './desired-features';
import type { DesiredFeatureId } from './types';

const MESSAGES: Record<string, string> = {
  invalid_payload:
    'Os dados do dimensionamento estão incompletos ou inválidos. Revise as cargas e configurações e tente novamente.',
  no_approved_solution:
    'Nenhuma combinação aprovada atende a essa carga, bateria e tipo de rede. Tente reduzir as cargas, aumentar a capacidade da bateria ou escolher outro modelo.',
  no_compatible_ess_rule:
    'O inversor e a bateria selecionados não são compatíveis entre si para essa configuração. Tente outro modelo de bateria ou inversor.',
  no_solution_matches_desired_features:
    'Nenhuma combinação aprovada atende às funcionalidades desejadas selecionadas. Tente escolher outro inversor ou remover alguma funcionalidade.',
  battery_lookup_failed: 'Erro interno ao consultar a bateria selecionada. Tente novamente em instantes.',
  inverter_lookup_failed: 'Erro interno ao consultar o inversor selecionado. Tente novamente em instantes.',
  solution_lookup_failed: 'Erro interno ao buscar combinações aprovadas. Tente novamente em instantes.',
  ess_rules_lookup_failed: 'Erro interno ao consultar regras de compatibilidade. Tente novamente em instantes.',
  accessory_rules_lookup_failed: 'Erro interno ao consultar acessórios recomendados. Tente novamente em instantes.',
  internal: 'Erro interno ao calcular a solução. Tente novamente em instantes.',
};

const NETWORK_ERROR_MESSAGE = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
const FALLBACK_MESSAGE = 'Não foi possível encontrar uma solução compatível.';

/** Message for a known Edge Function error code (the `error` field of its JSON body).
 * `blockingFeatures` — present only on `no_solution_matches_desired_features` — names which
 * desired feature(s) have no available inverter, so the message can be specific instead of generic. */
export function getCalculationErrorMessage(
  code: string | null | undefined,
  blockingFeatures?: DesiredFeatureId[] | null
): string {
  if (code === 'no_solution_matches_desired_features' && blockingFeatures && blockingFeatures.length > 0) {
    const labels = blockingFeatures.map((feature) => desiredFeatureLabel(feature));
    const featureList = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
    const plural = labels.length > 1;
    return `Nenhum inversor disponível suporta ${plural ? 'as funcionalidades' : 'a funcionalidade'} "${featureList}" com a configuração atual. Tente escolher outro inversor ou remover ${plural ? 'essas funcionalidades' : 'essa funcionalidade'}.`;
  }
  if (code && MESSAGES[code]) return MESSAGES[code];
  return FALLBACK_MESSAGE;
}

export function getNetworkErrorMessage(): string {
  return NETWORK_ERROR_MESSAGE;
}
