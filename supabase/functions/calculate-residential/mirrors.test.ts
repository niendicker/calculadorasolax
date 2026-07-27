// This Edge Function runs on Deno and can't import from the Next.js app, so
// logic.ts keeps its own copies of a handful of types/constants/functions
// that the Next app also defines — each annotated "Mirrors ..." at its
// definition. Manual duplication drifts silently: the Tarifa Branca 3-tier
// migration (2026) shipped the app-side WhiteTariffConfig/validation change
// first and initially missed updating this Edge Function's own copy, only
// caught by re-running this suite by hand.
//
// This file is the automated version of that check: it imports both the
// Deno-side (logic.ts) and Next-app-side definitions of anything with an
// exact behavioral or structural mirror, and asserts they agree. It can't
// cover pure type mirrors (interfaces vanish at runtime), but every
// duplicated *value* or *function* below is fair game — if one side changes
// without the other, one of these tests should fail.
//
// When you add a new "Mirrors ..." duplicate to logic.ts, add a case here
// too if the counterpart is a runtime value/function (not just a type).

import { describe, expect, it } from 'vitest';
import { DESIRED_FEATURE_DEFINITIONS as NEXT_DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import { effectiveTargetEnergyWh as nextEffectiveTargetEnergyWh, effectiveTargetPowerW as nextEffectiveTargetPowerW } from '@/components/app/helpers';
import { totalDailyKwh as nextTotalDailyKwh, totalNominalW as nextTotalNominalW, totalPeakW as nextTotalPeakW } from '@/lib/store/wizard-calculations';
import type { SingleLoad, WhiteTariffConfig } from '@/lib/types';
import {
  DESIRED_FEATURE_DEFINITIONS as DENO_DESIRED_FEATURE_DEFINITIONS,
  effectiveTargetEnergyWh as denoEffectiveTargetEnergyWh,
  effectiveTargetPowerW as denoEffectiveTargetPowerW,
  totalDailyKwh as denoTotalDailyKwh,
  totalNominalW as denoTotalNominalW,
  totalPeakW as denoTotalPeakW,
} from './logic';

describe('drift check: DESIRED_FEATURE_DEFINITIONS (logic.ts vs lib/desired-features.ts)', () => {
  it('has the same ids, in the same order, with the same requiresInverterFlag', () => {
    const nextShape = NEXT_DESIRED_FEATURE_DEFINITIONS.map((f) => ({ id: f.id, requiresInverterFlag: f.requiresInverterFlag }));
    const denoShape = DENO_DESIRED_FEATURE_DEFINITIONS.map((f) => ({ id: f.id, requiresInverterFlag: f.requiresInverterFlag }));
    expect(denoShape).toEqual(nextShape);
  });
});

const whiteTariff: WhiteTariffConfig = {
  requiredPowerW: 3000,
  pontaEnergyWh: 6000,
  intermediateEnergyWh: 2000,
  includeBackupReserve: true,
  pontaTariffPerKwh: 1.6,
  intermediateTariffPerKwh: 1.0,
  foraPontaTariffPerKwh: 0.8,
};

describe('drift check: effectiveTargetPowerW (logic.ts vs components/app/helpers.ts)', () => {
  it.each([
    { desiredFeatures: [] as const, whiteTariff: null, baseW: 5000 },
    { desiredFeatures: [] as const, whiteTariff, baseW: 5000 },
    { desiredFeatures: ['white_tariff'] as const, whiteTariff: null, baseW: 5000 },
    { desiredFeatures: ['white_tariff'] as const, whiteTariff, baseW: 5000 },
    { desiredFeatures: ['white_tariff'] as const, whiteTariff, baseW: 1000 },
  ])('matches for %j', ({ desiredFeatures, whiteTariff: wt, baseW }) => {
    expect(denoEffectiveTargetPowerW([...desiredFeatures], wt, baseW)).toBe(
      nextEffectiveTargetPowerW([...desiredFeatures], wt, baseW)
    );
  });
});

describe('drift check: effectiveTargetEnergyWh (logic.ts vs components/app/helpers.ts)', () => {
  it.each([
    { desiredFeatures: [] as const, whiteTariff: null, baseTargetEnergyWh: 10000 },
    { desiredFeatures: ['white_tariff'] as const, whiteTariff: null, baseTargetEnergyWh: 10000 },
    { desiredFeatures: ['white_tariff'] as const, whiteTariff, baseTargetEnergyWh: 10000 },
    {
      desiredFeatures: ['white_tariff'] as const,
      whiteTariff: { ...whiteTariff, includeBackupReserve: false },
      baseTargetEnergyWh: 10000,
    },
  ])('matches for %j', ({ desiredFeatures, whiteTariff: wt, baseTargetEnergyWh }) => {
    expect(denoEffectiveTargetEnergyWh([...desiredFeatures], wt, baseTargetEnergyWh)).toBe(
      nextEffectiveTargetEnergyWh([...desiredFeatures], wt, baseTargetEnergyWh)
    );
  });
});

function makeLoad(partial: Partial<SingleLoad> & Pick<SingleLoad, 'powerW' | 'qty'>): SingleLoad {
  return { id: 'l1', name: 'Carga teste', ipInRatio: 1, ...partial };
}

describe('drift check: totalPeakW/totalNominalW/totalDailyKwh (logic.ts vs lib/store/wizard-calculations.ts)', () => {
  const loadSets: SingleLoad[][] = [
    [],
    [makeLoad({ powerW: 1000, qty: 1, ipInRatio: 3 })],
    [
      makeLoad({ powerW: 1000, qty: 1, ipInRatio: 3 }),
      makeLoad({ powerW: 200, qty: 2, ipInRatio: 1 }),
      makeLoad({ powerW: 100, qty: 4, ipInRatio: 1, includedInPeak: false }),
    ],
  ];

  it.each(loadSets.map((loads) => [loads] as const))('totalPeakW (sum) matches for %j', (loads) => {
    expect(denoTotalPeakW(loads, 'sum')).toBe(nextTotalPeakW(loads, 'sum'));
  });

  it.each(loadSets.map((loads) => [loads] as const))('totalPeakW (largest-surge) matches for %j', (loads) => {
    expect(denoTotalPeakW(loads, 'largest-surge')).toBe(nextTotalPeakW(loads, 'largest-surge'));
  });

  it.each(loadSets.map((loads) => [loads] as const))('totalPeakW (select) matches for %j', (loads) => {
    expect(denoTotalPeakW(loads, 'select')).toBe(nextTotalPeakW(loads, 'select'));
  });

  it.each(loadSets.map((loads) => [loads] as const))('totalNominalW matches for %j', (loads) => {
    expect(denoTotalNominalW(loads)).toBe(nextTotalNominalW(loads));
  });

  it.each(loadSets.map((loads) => [loads] as const))('totalDailyKwh matches for %j', (loads) => {
    expect(denoTotalDailyKwh(loads, 4)).toBe(nextTotalDailyKwh(loads, 4));
  });
});
