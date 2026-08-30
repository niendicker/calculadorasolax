import { describe, expect, it } from 'vitest';
import { hasNoMarginalBenefit, rankScenarios, recommendScenario } from './ranking';
import type { ScenarioCandidate } from './types';

function makeCandidate(overrides: Partial<ScenarioCandidate> = {}): ScenarioCandidate {
  return {
    scenarioId: 'modules-1',
    moduleCount: 1,
    strategy: 'HYBRID',
    technicalValidity: true,
    technicalWarnings: [],
    totalPowerKw: 50,
    totalCapacityKwh: 100,
    usefulCapacityKwh: 100,
    capex: 10000,
    annualSavings: 3000,
    energySavings: 2000,
    demandSavings: 1000,
    paybackYearsSimple: 3.3,
    paybackYearsDiscounted: 4.2,
    roiPercent: 30,
    npv: 5000,
    marginalGain: null,
    ...overrides,
  };
}

describe('rankScenarios', () => {
  it('sorts by ascending payback, with never-pays-back scenarios last', () => {
    const a = makeCandidate({ scenarioId: 'a', paybackYearsSimple: 5 });
    const b = makeCandidate({ scenarioId: 'b', paybackYearsSimple: 2 });
    const c = makeCandidate({ scenarioId: 'c', paybackYearsSimple: null });

    const ranked = rankScenarios([a, c, b], 'PAYBACK');

    expect(ranked.map((s) => s.scenarioId)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by descending ROI', () => {
    const a = makeCandidate({ scenarioId: 'a', roiPercent: 10 });
    const b = makeCandidate({ scenarioId: 'b', roiPercent: 40 });
    const c = makeCandidate({ scenarioId: 'c', roiPercent: 25 });

    expect(rankScenarios([a, b, c], 'ROI').map((s) => s.scenarioId)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by descending NPV', () => {
    const a = makeCandidate({ scenarioId: 'a', npv: 1000 });
    const b = makeCandidate({ scenarioId: 'b', npv: 9000 });

    expect(rankScenarios([a, b], 'NPV').map((s) => s.scenarioId)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const scenarios = [makeCandidate({ scenarioId: 'a', roiPercent: 1 }), makeCandidate({ scenarioId: 'b', roiPercent: 99 })];
    rankScenarios(scenarios, 'ROI');
    expect(scenarios.map((s) => s.scenarioId)).toEqual(['a', 'b']);
  });
});

describe('recommendScenario', () => {
  it('recommends the top-ranked scenario with a reason quoting its own numbers', () => {
    const best = makeCandidate({ scenarioId: 'best', moduleCount: 2, roiPercent: 45, annualSavings: 12345, capex: 20000 });
    const worst = makeCandidate({ scenarioId: 'worst', roiPercent: 5 });

    const recommendation = recommendScenario([worst, best], 'ROI');

    expect(recommendation?.scenarioId).toBe('best');
    expect(recommendation?.reason).toContain('45.0%');
    expect(recommendation?.reason).toContain('2 módulos');
    expect(recommendation?.reason).toMatch(/R\$\s*12\.345,00/);
  });

  it('returns null for an empty scenario list', () => {
    expect(recommendScenario([], 'NPV')).toBeNull();
  });

  it('explains a PAYBACK recommendation that never pays back', () => {
    const only = makeCandidate({ paybackYearsSimple: null, paybackYearsDiscounted: null });
    const recommendation = recommendScenario([only], 'PAYBACK');
    expect(recommendation?.reason).toContain('não atinge payback');
  });
});

describe('hasNoMarginalBenefit', () => {
  it('is false for the first scenario (no predecessor to compare against)', () => {
    expect(hasNoMarginalBenefit(makeCandidate({ marginalGain: null }))).toBe(false);
  });

  it('is true when an extra module adds zero or negative savings', () => {
    expect(hasNoMarginalBenefit(makeCandidate({ marginalGain: 0 }))).toBe(true);
    expect(hasNoMarginalBenefit(makeCandidate({ marginalGain: -50 }))).toBe(true);
  });

  it('is false when an extra module adds real savings', () => {
    expect(hasNoMarginalBenefit(makeCandidate({ marginalGain: 200 }))).toBe(false);
  });
});
