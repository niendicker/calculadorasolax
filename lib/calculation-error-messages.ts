// Maps the calculate-residential Edge Function's stable error codes to
// specific, actionable messages, instead of showing the same generic
// "couldn't find a solution" text for every failure — sizing issues, ESS
// incompatibility, invalid input, and network/server errors all need
// different guidance for the user.

import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { desiredFeatureLabel } from './desired-features';
import type { DesiredFeatureId } from './types';

const MESSAGES: Record<string, string> = {
  invalid_payload:
    'Os dados do dimensionamento estão incompletos ou inválidos. Revise as cargas e configurações e tente novamente.',
  no_approved_solution:
    'Nenhuma combinação aprovada atende a essa carga, bateria e tipo de rede. Tente reduzir as cargas, aumentar a capacidade da bateria ou escolher outro modelo.',
  no_compatible_ess_rule:
    'Nenhuma solução compatível foi encontrada para essa combinação de inversor e bateria. Tente outro modelo de bateria ou inversor.',
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

const INVALID_FIELD_LABELS: Record<string, string> = {
  topology: 'topologia da bateria',
  batteryModel: 'modelo da bateria',
  inverterModel: 'modelo do inversor',
  gridType: 'tipo de rede',
  loads: 'cargas',
  operationHours: 'tempo de operação',
  peakCalcMode: 'modo de cálculo da potência máxima',
  desiredFeatures: 'funcionalidades desejadas',
  whiteTariff: 'configuração da Tarifa Branca',
  'whiteTariff.requiredPowerW': 'Tarifa Branca: potência',
  'whiteTariff.pontaEnergyWh': 'Tarifa Branca: energia na ponta',
  'whiteTariff.intermediateEnergyWh': 'Tarifa Branca: energia intermediária',
  'whiteTariff.totalMonthlyConsumptionKwh': 'Tarifa Branca: consumo total mensal',
  'whiteTariff.businessDaysPerMonth': 'Tarifa Branca: dias úteis',
  'whiteTariff.pontaWindowHours': 'Tarifa Branca: duração da ponta',
  'whiteTariff.intermediateWindowHours': 'Tarifa Branca: duração intermediária',
  'generator.powerFactor': 'Gerador: fator de potência',
  'generator.safetyMarginW': 'Gerador: margem operacional',
  'microgrid.onGridApparentPowerVA': 'Microrrede: potência nominal AC',
  'whiteTariff.pontaTariffPerKwh': 'Tarifa Branca: tarifa de ponta',
  'whiteTariff.intermediateTariffPerKwh': 'Tarifa Branca: tarifa intermediária',
  'whiteTariff.foraPontaTariffPerKwh': 'Tarifa Branca: tarifa fora de ponta',
  microgrid: 'configuração da microrrede',
  generator: 'configuração do gerador',
  pv: 'configuração fotovoltaica',
};

/** Converts the Edge Function's validator details into field names a user can
 * act on. Raw validator strings stay internal: they are useful to developers,
 * but expose implementation names and English diagnostics in the UI. */
function invalidPayloadMessage(details: unknown): string | null {
  if (!Array.isArray(details)) return null;

  const labels = details
    .filter((detail): detail is string => typeof detail === 'string')
    .map((detail) => {
      const field = Object.keys(INVALID_FIELD_LABELS)
        .sort((a, b) => b.length - a.length)
        .find((candidate) => detail === candidate || detail.startsWith(`${candidate} `));
      return field ? INVALID_FIELD_LABELS[field] : null;
    })
    .filter((label): label is string => Boolean(label));

  const uniqueLabels = [...new Set(labels)];
  if (!uniqueLabels.length) return null;

  return `Revise os seguintes campos antes de calcular: ${uniqueLabels.join(', ')}.`;
}

/** Message for a known Edge Function error code (the `error` field of its JSON body).
 * `blockingFeatures` — present only on `no_solution_matches_desired_features` — names which
 * desired feature(s) have no available inverter, so the message can be specific instead of generic. */
export function getCalculationErrorMessage(
  code: string | null | undefined,
  blockingFeatures?: DesiredFeatureId[] | null,
  details?: unknown
): string {
  if (code === 'invalid_payload') {
    return invalidPayloadMessage(details) ?? MESSAGES.invalid_payload;
  }
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

/** Turns a supabase.functions.invoke() error into a specific, actionable
 * message using the Edge Function's stable error code, falling back to a
 * network-specific message when the request never reached the function. */
export async function resolveCalculationErrorMessage(functionError: unknown): Promise<string> {
  if (functionError instanceof FunctionsHttpError) {
    try {
      const body = await functionError.context.json();
      return getCalculationErrorMessage(body?.error, body?.blockingFeatures, body?.details);
    } catch {
      return getCalculationErrorMessage(undefined);
    }
  }

  if (functionError instanceof FunctionsFetchError) {
    return getNetworkErrorMessage();
  }

  return getCalculationErrorMessage(undefined);
}
