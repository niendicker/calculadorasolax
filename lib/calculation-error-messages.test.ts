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
