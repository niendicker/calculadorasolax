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
//
// Covers, today: DESIRED_FEATURE_DEFINITIONS,
// totalPeakW/totalNominalW/totalDailyKwh, clampNumber, solutionTotalBatteryPorts,
// ruleMetricValue (~ solutionRuleMetricValue), accessoryRuleAppliedQuantity.
//
// Deliberately NOT covered:
// - ResidentialOptions.secondaryBatteryModel/maxPowerPerPhaseW and
//   SingleLoad.id/name/voltageV/phaseType/phase/phase2 exist only on the
//   Next-app side. That's intentional, not drift: secondaryBatteryModel never
//   reaches the Edge Function (it triggers a second full request with its own
//   batteryModel instead — see useCalculation.ts), and the SingleLoad fields
//   are UI/display-only, unused by totalPeakW/totalNominalW/totalDailyKwh.
// - accessoryRuleMatches (components/admin/helpers.ts) is NOT a mirror of
//   ruleMatches (logic.ts) despite the similar name/shape: it deliberately
//   always rejects desired-feature-gated rules, since the admin bulk
//   generator has no knowledge of a future customer's feature choices (see
//   that function's own comment). Do not add a drift test between them.

import { describe, expect, it } from 'vitest';
import { DESIRED_FEATURE_DEFINITIONS as NEXT_DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import { totalDailyKwh as nextTotalDailyKwh, totalNominalW as nextTotalNominalW, totalPeakW as nextTotalPeakW } from '@/lib/store/wizard-calculations';
import {
  accessoryRuleAppliedQuantity as nextAccessoryRuleAppliedQuantity,
  clampNumber as nextClampNumber,
  solutionRuleMetricValue as nextRuleMetricValue,
  solutionTotalBatteryPorts as nextSolutionTotalBatteryPorts,
} from '@/components/admin/helpers';
import type { SingleLoad } from '@/lib/types';
import {
  DESIRED_FEATURE_DEFINITIONS as DENO_DESIRED_FEATURE_DEFINITIONS,
  accessoryRuleAppliedQuantity as denoAccessoryRuleAppliedQuantity,
  clampNumber as denoClampNumber,
  ruleMetricValue as denoRuleMetricValue,
  solutionTotalBatteryPorts as denoSolutionTotalBatteryPorts,
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

  it.each(
    [
      [makeLoad({ powerW: 1000, qty: 1, usageMode: 'fixed', fixedHours: 3 })],
      [makeLoad({ powerW: 1000, qty: 1, usageMode: 'fixed' })],
      [
        makeLoad({ powerW: 1000, qty: 1 }),
        makeLoad({ powerW: 500, qty: 1, usageMode: 'fixed', fixedHours: 2 }),
      ],
    ].map((loads) => [loads] as const)
  )('totalDailyKwh (usageMode fixed) matches for %j', (loads) => {
    expect(denoTotalDailyKwh(loads, 4)).toBe(nextTotalDailyKwh(loads, 4));
  });
});

describe('drift check: clampNumber (logic.ts vs components/admin/helpers.ts)', () => {
  it.each([
    { value: 5, min: 1, max: 10 },
    { value: 5, min: 1, max: 10, fallback: 3 },
    { value: -5, min: 1, max: 10 },
    { value: 50, min: 1, max: 10 },
    { value: 'not a number', min: 1, max: 10, fallback: 7 },
    { value: undefined, min: 0, max: 15 },
  ])('matches for %j', ({ value, min, max, fallback }) => {
    expect(denoClampNumber(value, min, max, fallback)).toBe(nextClampNumber(value, min, max, fallback));
  });
});

// solutionTotalBatteryPorts/ruleMetricValue/accessoryRuleAppliedQuantity only
// read a handful of numeric fields off a solution row — this minimal shape
// (rather than a full ApprovedSolution/SolutionRow) is enough to exercise
// both sides identically.
function makeMetricSolution(partial: {
  inverter_quantity: number;
  battery_ports_used: number;
  battery_quantity: number;
}) {
  return partial;
}

describe('drift check: solutionTotalBatteryPorts (logic.ts vs components/admin/helpers.ts)', () => {
  it.each([
    { inverter_quantity: 1, battery_ports_used: 1, battery_quantity: 1 },
    { inverter_quantity: 2, battery_ports_used: 3, battery_quantity: 12 },
    { inverter_quantity: 1, battery_ports_used: 4, battery_quantity: 4 },
  ])('matches for %j', (solution) => {
    expect(denoSolutionTotalBatteryPorts(solution)).toBe(nextSolutionTotalBatteryPorts(solution));
  });
});

describe('drift check: ruleMetricValue/solutionRuleMetricValue (logic.ts vs components/admin/helpers.ts)', () => {
  const metrics = ['per_solution', 'inverter_quantity', 'battery_quantity', 'battery_ports_used', 'battery_quantity_per_port'] as const;
  const solutions = [
    makeMetricSolution({ inverter_quantity: 1, battery_ports_used: 1, battery_quantity: 1 }),
    makeMetricSolution({ inverter_quantity: 2, battery_ports_used: 3, battery_quantity: 12 }),
    makeMetricSolution({ inverter_quantity: 1, battery_ports_used: 2, battery_quantity: 5 }),
  ];

  it.each(solutions.flatMap((solution) => metrics.map((metric) => ({ solution, metric }))))(
    'matches for %j',
    ({ solution, metric }) => {
      expect(denoRuleMetricValue(solution as never, metric)).toBe(nextRuleMetricValue(solution, metric));
    }
  );
});

describe('drift check: accessoryRuleAppliedQuantity (logic.ts vs components/admin/helpers.ts)', () => {
  const solution = makeMetricSolution({ inverter_quantity: 2, battery_ports_used: 3, battery_quantity: 12 });

  it.each([
    { quantity_per_match: 1, scale_with_metric: false, trigger_metric: 'per_solution', metric_divisor: 1 },
    { quantity_per_match: 2, scale_with_metric: true, trigger_metric: 'inverter_quantity', metric_divisor: 1 },
    { quantity_per_match: 1, scale_with_metric: true, trigger_metric: 'battery_quantity', metric_divisor: 4 },
    { quantity_per_match: 1, scale_with_metric: true, trigger_metric: 'battery_ports_used', metric_divisor: 2 },
    { quantity_per_match: 1, scale_with_metric: true, trigger_metric: 'battery_quantity_per_port', metric_divisor: 1 },
  ] as const)('matches for %j', (rule) => {
    expect(denoAccessoryRuleAppliedQuantity(solution as never, rule)).toBe(nextAccessoryRuleAppliedQuantity(solution, rule));
  });
});
