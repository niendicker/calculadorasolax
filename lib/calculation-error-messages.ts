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
  minInverterQty: 'quantidade mínima de inversores',
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
  'generator.voltageV': 'Gerador: tensão',
  'generator.phases': 'Gerador: número de fases',
  'generator.apparentPowerVA': 'Gerador: potência aparente',
  'generator.safetyMarginW': 'Gerador: margem operacional',
  'microgrid.onGridApparentPowerVA': 'Microrrede: potência nominal AC',
  'microgrid.voltageV': 'Microrrede: tensão',
  'microgrid.onGridPhases': 'Microrrede: número de fases',
  'pv.monthlyConsumptionKwh': 'Fotovoltaico: consumo mensal',
  'pv.hsp': 'Fotovoltaico: horas de sol pleno (HSP)',
  'whiteTariff.inputMode': 'Tarifa Branca: modo de preenchimento',
  'whiteTariff.pontaTariffPerKwh': 'Tarifa Branca: tarifa de ponta',
  'whiteTariff.intermediateTariffPerKwh': 'Tarifa Branca: tarifa intermediária',
  'whiteTariff.foraPontaTariffPerKwh': 'Tarifa Branca: tarifa fora de ponta',
  microgrid: 'configuração da microrrede',
  generator: 'configuração do gerador',
  pv: 'configuração fotovoltaica',
};

const VALIDATION_MESSAGES: Record<string, string> = {
  'loads must be a non-empty array': 'Nenhuma carga cadastrada. Adicione ao menos uma carga em Cargas do projeto.',
  'whiteTariff is required when desiredFeatures includes white_tariff': 'Preencha a configuração do recurso Tarifa Branca.',
  'microgrid is required when desiredFeatures includes microgrid': 'Preencha a configuração do recurso Microrrede.',
  'generator is required when desiredFeatures includes external_generator': 'Preencha a configuração do recurso Gerador.',
  'pv is required when desiredFeatures includes pv': 'Preencha o consumo mensal e as horas de sol pleno (HSP) no recurso Fotovoltaico.',
  'microgrid and external_generator cannot be enabled together': 'Microrrede e Gerador não podem ser ativados juntos. Desative um desses recursos.',
  'whiteTariff must include energy in ponta or intermediate period': 'Tarifa Branca: informe o consumo de energia na ponta ou no período intermediário.',
  'whiteTariff tariffs must be greater than 0': 'Tarifa Branca: informe tarifas maiores que zero para ponta, período intermediário e fora de ponta.',
  'whiteTariff expensive tariffs must be >= off-peak tariff': 'Tarifa Branca: as tarifas de ponta e intermediária devem ser maiores ou iguais à tarifa fora de ponta.',
  'generator.apparentPowerVA is insufficient for loads and charging margin': 'Gerador: aumente a potência para atender às cargas e à margem de recarga.',
};

const LOAD_FIELD_MESSAGES: Record<string, string> = {
  powerW: 'informe uma potência maior que zero (VA)',
  qty: 'informe uma quantidade inteira maior que zero',
  ipInRatio: 'informe uma relação IP/IN maior ou igual a 1',
  usageMode: 'selecione o modo de uso: percentual ou horas fixas',
  usageFactor: 'informe um fator de uso entre 0% e 100%',
  fixedHours: 'informe as horas fixas entre 0 e 24 horas',
};

function invalidDetailMessage(detail: string): string | null {
  if (VALIDATION_MESSAGES[detail]) return VALIDATION_MESSAGES[detail];
  const loadField = /^loads\[(\d+)\](?:\.(\w+))? /.exec(detail);
  if (loadField) {
    const instruction = loadField[2] ? LOAD_FIELD_MESSAGES[loadField[2]] : 'remova a carga inválida e cadastre-a novamente';
    return instruction ? `Carga ${Number(loadField[1]) + 1}: ${instruction}.` : null;
  }
  const field = Object.keys(INVALID_FIELD_LABELS)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => detail === candidate || detail.startsWith(`${candidate} `));
  if (!field) return null;
  const label = INVALID_FIELD_LABELS[field];
  if (field === 'gridType') return 'Selecione um tipo de rede válido em Configurações técnicas.';
  if (field === 'topology') return 'Selecione uma topologia de bateria válida em Configurações técnicas.';
  if (field === 'operationHours') return 'Informe um tempo de operação entre 0 e 24 horas.';
  if (/must be (?:a number )?(?:>= 0)/.test(detail)) return `Informe um valor maior ou igual a zero para ${label}.`;
  if (/must be (?:a number )?(?:>|greater than) 0/.test(detail)) return `Informe um valor maior que zero para ${label}.`;
  if (detail.includes('positive integer')) return `Informe um número inteiro maior que zero para ${label}.`;
  if (detail.includes('between 0.1 and 1')) return `Informe um valor entre 0,1 e 1 para ${label}.`;
  if (detail.includes('must be 1, 2, or 3')) return `Selecione 1, 2 ou 3 para ${label}.`;
  return `Revise o campo ${label}.`;
}

/** Converts the Edge Function's validator details into field names a user can
 * act on. Raw validator strings stay internal: they are useful to developers,
 * but expose implementation names and English diagnostics in the UI. */
function invalidPayloadMessage(details: unknown): string | null {
  if (!Array.isArray(details)) return null;

  const messages = details
    .filter((detail): detail is string => typeof detail === 'string')
    .map((detail) => ({
      message: invalidDetailMessage(detail),
      stage: detail.startsWith('loads') ? 1
        : detail.startsWith('operationHours') ? 2
        : detail.startsWith('microgrid') ? 3
        : detail.startsWith('generator') ? 4
        : detail.startsWith('pv') ? 5
        : detail.startsWith('whiteTariff') ? 6
        : 0,
    }))
    .filter((entry): entry is { message: string; stage: number } => Boolean(entry.message));

  // Resolve general settings before loads and individual resources, even if
  // the backend reports its validation errors in a different order.
  const firstStage = Math.min(...messages.map((entry) => entry.stage));
  const uniqueMessages = [...new Set(messages.filter((entry) => entry.stage === firstStage).map((entry) => entry.message))];
  if (!uniqueMessages.length) return null;

  return uniqueMessages.join(' ');
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
    return `Nenhum inversor da seleção atual suporta ${plural ? 'as funcionalidades' : 'a funcionalidade'} "${featureList}". Escolha outro inversor ou remova ${plural ? 'essas funcionalidades' : 'essa funcionalidade'}.`;
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

// ─── calculate-commercial-industrial ────────────────────────────────────
// Its own small map, not merged into MESSAGES/INVALID_FIELD_LABELS above:
// the C&I Edge Function has no field-name/blockingFeatures concept to
// translate, just a handful of stable error codes (see
// supabase/functions/calculate-commercial-industrial/index.ts).

const CI_MESSAGES: Record<string, string> = {
  invalid_payload: 'Os dados da simulação estão incompletos ou inválidos. Revise a configuração e tente novamente.',
  incomplete_configuration:
    'Configure a curva de carga, a tarifa e o produto BESS antes de calcular.',
  bess_product_not_found: 'O produto BESS selecionado não foi encontrado ou não está mais ativo no catálogo.',
  bess_product_lookup_failed: 'Erro interno ao consultar o produto BESS selecionado. Tente novamente em instantes.',
  no_scenarios_evaluated: 'Nenhum cenário pôde ser avaliado com a configuração atual. Revise a quantidade de módulos.',
  internal: 'Erro interno ao calcular o estudo. Tente novamente em instantes.',
};

const CI_FALLBACK_MESSAGE = 'Não foi possível calcular o estudo C&I.';

export function getCommercialIndustrialCalculationErrorMessage(code: string | null | undefined): string {
  if (code && CI_MESSAGES[code]) return CI_MESSAGES[code];
  return CI_FALLBACK_MESSAGE;
}

export async function resolveCommercialIndustrialCalculationErrorMessage(functionError: unknown): Promise<string> {
  if (functionError instanceof FunctionsHttpError) {
    try {
      const body = await functionError.context.json();
      return getCommercialIndustrialCalculationErrorMessage(body?.error);
    } catch {
      return getCommercialIndustrialCalculationErrorMessage(undefined);
    }
  }
  if (functionError instanceof FunctionsFetchError) {
    return getNetworkErrorMessage();
  }
  return getCommercialIndustrialCalculationErrorMessage(undefined);
}
