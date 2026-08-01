import { describe, expect, it } from 'vitest';
import { sanitizeDesiredFeatures } from './defaults';

describe('sanitizeDesiredFeatures', () => {
  it('returns [] for undefined', () => {
    expect(sanitizeDesiredFeatures(undefined)).toEqual([]);
  });

  it('returns [] for a non-array value', () => {
    expect(sanitizeDesiredFeatures('backup' as never)).toEqual([]);
  });

  it('keeps every recognized feature id', () => {
    expect(sanitizeDesiredFeatures(['backup', 'pv', 'white_tariff'])).toEqual(['backup', 'pv', 'white_tariff']);
  });

  it('drops unrecognized/legacy feature ids', () => {
    expect(sanitizeDesiredFeatures(['backup', 'no_pv' as never, 'pv'])).toEqual(['backup', 'pv']);
  });

  it('returns [] when every id is unrecognized', () => {
    expect(sanitizeDesiredFeatures(['legacy_a' as never, 'legacy_b' as never])).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(sanitizeDesiredFeatures([])).toEqual([]);
  });
});
