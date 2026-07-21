import { describe, expect, it } from 'vitest';
import { DESIRED_FEATURE_DEFINITIONS, desiredFeatureLabel } from './desired-features';

describe('desiredFeatureLabel', () => {
  it('returns the matching definition\'s label', () => {
    expect(desiredFeatureLabel('backup')).toBe('Backup');
    expect(desiredFeatureLabel('white_tariff')).toBe('Tarifa Branca');
  });

  it('falls back to the raw id when no definition matches', () => {
    // @ts-expect-error - deliberately passing an id outside the known union to exercise the fallback
    expect(desiredFeatureLabel('unknown_feature')).toBe('unknown_feature');
  });
});

describe('DESIRED_FEATURE_DEFINITIONS', () => {
  it('only flag-gated features declare a requiresInverterFlag', () => {
    const flagGated = DESIRED_FEATURE_DEFINITIONS.filter((f) => f.requiresInverterFlag);
    expect(flagGated.map((f) => f.id).sort()).toEqual(['external_ats', 'external_generator', 'microgrid']);
  });

  it('has a unique id per definition', () => {
    const ids = DESIRED_FEATURE_DEFINITIONS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
