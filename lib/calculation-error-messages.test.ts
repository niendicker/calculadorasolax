import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { getCalculationErrorMessage, getNetworkErrorMessage, resolveCalculationErrorMessage } from './calculation-error-messages';

describe('getCalculationErrorMessage', () => {
  it('returns a distinct message per known error code', () => {
    const codes = [
      'invalid_payload',
      'no_approved_solution',
      'no_compatible_ess_rule',
      'no_solution_matches_desired_features',
      'battery_lookup_failed',
      'inverter_lookup_failed',
      'solution_lookup_failed',
      'ess_rules_lookup_failed',
      'accessory_rules_lookup_failed',
      'internal',
    ];
    const messages = codes.map((code) => getCalculationErrorMessage(code));
    expect(new Set(messages).size).toBe(codes.length);
  });

  it('the two user-actionable sizing codes read differently from each other', () => {
    const noSolution = getCalculationErrorMessage('no_approved_solution');
    const noEss = getCalculationErrorMessage('no_compatible_ess_rule');
    expect(noSolution).not.toBe(noEss);
    expect(noSolution.toLowerCase()).toContain('bateria');
    expect(noEss.toLowerCase()).toContain('compat');
  });

  it('falls back to a generic message for an unknown or missing code', () => {
    const fallback = getCalculationErrorMessage('some_future_code_not_mapped_yet');
    expect(fallback).toBe(getCalculationErrorMessage(undefined));
    expect(fallback).toBe(getCalculationErrorMessage(null));
  });

  it('names the specific blocking feature when the code is no_solution_matches_desired_features', () => {
    const message = getCalculationErrorMessage('no_solution_matches_desired_features', ['microgrid']);
    expect(message).toContain('Microrrede');
    expect(message).not.toBe(getCalculationErrorMessage('no_solution_matches_desired_features'));
  });

  it('lists multiple blocking features joined with "e"', () => {
    const message = getCalculationErrorMessage('no_solution_matches_desired_features', ['external_ats', 'microgrid']);
    expect(message).toContain('Backup Total');
    expect(message).toContain('Microrrede');
    expect(message).toContain(' e ');
  });

  it('falls back to the generic desired-features message when blockingFeatures is missing or empty', () => {
    const genericMessage = getCalculationErrorMessage('no_solution_matches_desired_features');
    expect(getCalculationErrorMessage('no_solution_matches_desired_features', [])).toBe(genericMessage);
    expect(getCalculationErrorMessage('no_solution_matches_desired_features', null)).toBe(genericMessage);
  });

  it('ignores blockingFeatures for any other error code', () => {
    expect(getCalculationErrorMessage('no_approved_solution', ['microgrid'])).toBe(
      getCalculationErrorMessage('no_approved_solution')
    );
  });

  it('turns invalid Tarifa Branca validator details into actionable field names', () => {
    const message = getCalculationErrorMessage('invalid_payload', undefined, [
      'whiteTariff.pontaEnergyWh must be a number >= 0',
      'whiteTariff.intermediateTariffPerKwh must be a number >= 0',
    ]);

    expect(message).toBe(
      'Revise os seguintes campos antes de calcular: Tarifa Branca: energia na ponta, Tarifa Branca: tarifa intermediária.'
    );
  });

  it('deduplicates invalid fields and falls back safely for unknown validator details', () => {
    expect(
      getCalculationErrorMessage('invalid_payload', undefined, [
        'operationHours must be a number between 0 and 24',
        'operationHours must be finite',
      ])
    ).toBe('Revise os seguintes campos antes de calcular: tempo de operação.');

    expect(getCalculationErrorMessage('invalid_payload', undefined, ['internalSecret must be present'])).toBe(
      getCalculationErrorMessage('invalid_payload')
    );
  });
});

describe('getNetworkErrorMessage', () => {
  it('is distinct from every known calculation error message', () => {
    const networkMessage = getNetworkErrorMessage();
    const knownCodes = ['invalid_payload', 'no_approved_solution', 'no_compatible_ess_rule', 'internal'];
    for (const code of knownCodes) {
      expect(getCalculationErrorMessage(code)).not.toBe(networkMessage);
    }
  });
});

describe('resolveCalculationErrorMessage', () => {
  it('resolves a FunctionsHttpError to the message for its JSON body\'s error code', async () => {
    const functionError = new FunctionsHttpError({ json: () => Promise.resolve({ error: 'no_approved_solution' }) });
    expect(await resolveCalculationErrorMessage(functionError)).toBe(getCalculationErrorMessage('no_approved_solution'));
  });

  it('passes blockingFeatures from the JSON body through for no_solution_matches_desired_features', async () => {
    const functionError = new FunctionsHttpError({
      json: () => Promise.resolve({ error: 'no_solution_matches_desired_features', blockingFeatures: ['microgrid'] }),
    });
    expect(await resolveCalculationErrorMessage(functionError)).toBe(
      getCalculationErrorMessage('no_solution_matches_desired_features', ['microgrid'])
    );
  });

  it('passes invalid payload details through to the field-aware message', async () => {
    const details = ['whiteTariff.requiredPowerW must be a number >= 0'];
    const functionError = new FunctionsHttpError({
      json: () => Promise.resolve({ error: 'invalid_payload', details }),
    });

    expect(await resolveCalculationErrorMessage(functionError)).toBe(
      getCalculationErrorMessage('invalid_payload', undefined, details)
    );
  });

  it('falls back to the generic code message when the JSON body fails to parse', async () => {
    const functionError = new FunctionsHttpError({ json: () => Promise.reject(new Error('bad json')) });
    expect(await resolveCalculationErrorMessage(functionError)).toBe(getCalculationErrorMessage(undefined));
  });

  it('resolves a FunctionsFetchError to the network message', async () => {
    const functionError = new FunctionsFetchError({});
    expect(await resolveCalculationErrorMessage(functionError)).toBe(getNetworkErrorMessage());
  });

  it('falls back to the generic code message for anything else (e.g. no error at all)', async () => {
    expect(await resolveCalculationErrorMessage(undefined)).toBe(getCalculationErrorMessage(undefined));
    expect(await resolveCalculationErrorMessage(new Error('unrelated'))).toBe(getCalculationErrorMessage(undefined));
  });
});
