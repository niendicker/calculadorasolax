import { describe, expect, it } from 'vitest';
import { getCalculationErrorMessage, getNetworkErrorMessage } from './calculation-error-messages';

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
    expect(message).toContain('ATS Externo');
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
