import { describe, expect, it } from 'vitest';
import { hasNoMarginalBenefit, isScenarioViable, rankScenarios, rankViableScenarios, recommendScenario } from './ranking';
import type { RankingCriterion, ScenarioCandidate } from './types';

const HORIZON_YEARS = 10;

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
  it('sorts PAYBACK by ascending DISCOUNTED payback (not simple), with invalid ones last', () => {
    const a = makeCandidate({ scenarioId: 'a', paybackYearsSimple: 1, paybackYearsDiscounted: 5 });
    const b = makeCandidate({ scenarioId: 'b', paybackYearsSimple: 9, paybackYearsDiscounted: 2 });
    const c = makeCandidate({ scenarioId: 'c', paybackYearsDiscounted: null });

    const ranked = rankScenarios([a, c, b], 'PAYBACK');

    // b wins despite a worse SIMPLE payback, because its DISCOUNTED payback
    // is better — confirms ranking uses the discounted figure exclusively.
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

  it('[test 10] treats non-finite ROI/NPV as worse than any finite value, regardless of sign', () => {
    const finite = makeCandidate({ scenarioId: 'finite', roiPercent: -50 });
    const nan = makeCandidate({ scenarioId: 'nan', roiPercent: NaN });
    const infinite = makeCandidate({ scenarioId: 'infinite', roiPercent: Infinity });

    // Even a negative-but-finite ROI outranks NaN/Infinity — a broken number
    // must never look like "the best scenario" just because it's not
    // handled by ordinary comparison.
    expect(rankScenarios([nan, infinite, finite], 'ROI').map((s) => s.scenarioId)).toEqual(['finite', 'nan', 'infinite']);
  });

  it('[test 10] treats a non-finite discounted payback the same as null (sorts last)', () => {
    const valid = makeCandidate({ scenarioId: 'valid', paybackYearsDiscounted: 3 });
    const broken = makeCandidate({ scenarioId: 'broken', paybackYearsDiscounted: Infinity });
    expect(rankScenarios([broken, valid], 'PAYBACK').map((s) => s.scenarioId)).toEqual(['valid', 'broken']);
  });

  it('preserves original order for tied scenarios (stable sort)', () => {
    const a = makeCandidate({ scenarioId: 'a', moduleCount: 2, roiPercent: 0 });
    const b = makeCandidate({ scenarioId: 'b', moduleCount: 3, roiPercent: 0 });
    const c = makeCandidate({ scenarioId: 'c', moduleCount: 4, roiPercent: 0 });
    expect(rankScenarios([a, b, c], 'ROI').map((s) => s.scenarioId)).toEqual(['a', 'b', 'c']);
  });
});

describe('isScenarioViable (Fase 7 audit, section 1 — criterion-independent)', () => {
  it('[test 1] NPV > 0 and discounted payback within the horizon -> viable', () => {
    const scenario = makeCandidate({ npv: 1, paybackYearsDiscounted: HORIZON_YEARS - 1 });
    expect(isScenarioViable(scenario, HORIZON_YEARS)).toBe(true);
  });

  it('[test 2] negative NPV -> not viable', () => {
    const scenario = makeCandidate({ npv: -1, paybackYearsDiscounted: 3 });
    expect(isScenarioViable(scenario, HORIZON_YEARS)).toBe(false);
  });

  it('[test 3] null discounted payback -> not viable, even with positive NPV', () => {
    const scenario = makeCandidate({ npv: 5000, paybackYearsDiscounted: null });
    expect(isScenarioViable(scenario, HORIZON_YEARS)).toBe(false);
  });

  it('[test 4] discounted payback greater than the horizon -> not viable', () => {
    const scenario = makeCandidate({ npv: 5000, paybackYearsDiscounted: HORIZON_YEARS + 0.01 });
    expect(isScenarioViable(scenario, HORIZON_YEARS)).toBe(false);
  });

  it('discounted payback exactly equal to the horizon -> viable (inclusive boundary)', () => {
    const scenario = makeCandidate({ npv: 5000, paybackYearsDiscounted: HORIZON_YEARS });
    expect(isScenarioViable(scenario, HORIZON_YEARS)).toBe(true);
  });

  it('[test 5] positive ROI + negative NPV -> not viable (ROI is not part of the viability test)', () => {
    const scenario = makeCandidate({ roiPercent: 50, npv: -1, paybackYearsDiscounted: 2 });
    expect(isScenarioViable(scenario, HORIZON_YEARS)).toBe(false);
  });

  it('simple payback within horizon does not make a scenario viable on its own', () => {
    const scenario = makeCandidate({ paybackYearsSimple: 2, paybackYearsDiscounted: null, npv: 5000 });
    expect(isScenarioViable(scenario, HORIZON_YEARS)).toBe(false);
  });

  it('guards against NaN/Infinity in npv and discountedPayback', () => {
    expect(isScenarioViable(makeCandidate({ npv: NaN, paybackYearsDiscounted: 2 }), HORIZON_YEARS)).toBe(false);
    expect(isScenarioViable(makeCandidate({ npv: Infinity, paybackYearsDiscounted: 2 }), HORIZON_YEARS)).toBe(false);
    expect(isScenarioViable(makeCandidate({ npv: 5000, paybackYearsDiscounted: NaN }), HORIZON_YEARS)).toBe(false);
    expect(isScenarioViable(makeCandidate({ npv: 5000, paybackYearsDiscounted: Infinity }), HORIZON_YEARS)).toBe(false);
  });
});

describe('rankViableScenarios', () => {
  it('[test 7] ranking by PAYBACK only considers viable scenarios', () => {
    const viable = makeCandidate({ scenarioId: 'viable', npv: 100, paybackYearsDiscounted: 3 });
    const nonViableButBetterPayback = makeCandidate({ scenarioId: 'trap', npv: -1, paybackYearsDiscounted: 1 });
    const ranked = rankViableScenarios([nonViableButBetterPayback, viable], 'PAYBACK', HORIZON_YEARS);
    expect(ranked.map((s) => s.scenarioId)).toEqual(['viable']);
  });

  it('[test 8] ranking by NPV only considers viable scenarios', () => {
    const viable = makeCandidate({ scenarioId: 'viable', npv: 100, paybackYearsDiscounted: 3 });
    const nonViableButHigherNpv = makeCandidate({ scenarioId: 'trap', npv: 99999, paybackYearsDiscounted: null });
    const ranked = rankViableScenarios([nonViableButHigherNpv, viable], 'NPV', HORIZON_YEARS);
    expect(ranked.map((s) => s.scenarioId)).toEqual(['viable']);
  });

  it('[test 9] ranking by ROI only considers viable scenarios', () => {
    const viable = makeCandidate({ scenarioId: 'viable', npv: 100, paybackYearsDiscounted: 3, roiPercent: 5 });
    const nonViableButHigherRoi = makeCandidate({ scenarioId: 'trap', npv: -1, paybackYearsDiscounted: 3, roiPercent: 999 });
    const ranked = rankViableScenarios([nonViableButHigherRoi, viable], 'ROI', HORIZON_YEARS);
    expect(ranked.map((s) => s.scenarioId)).toEqual(['viable']);
  });

  it('returns an empty array when nothing is viable, regardless of criterion', () => {
    const scenarios = [makeCandidate({ npv: -1 }), makeCandidate({ npv: 0 }), makeCandidate({ paybackYearsDiscounted: null })];
    for (const criterion of ['PAYBACK', 'ROI', 'NPV'] as RankingCriterion[]) {
      expect(rankViableScenarios(scenarios, criterion, HORIZON_YEARS)).toEqual([]);
    }
  });
});

describe('recommendScenario', () => {
  it('recommends the top-ranked VIABLE scenario with a reason quoting its own numbers', () => {
    const best = makeCandidate({
      scenarioId: 'best',
      moduleCount: 2,
      roiPercent: 45,
      annualSavings: 12345,
      capex: 20000,
      npv: 5000,
      paybackYearsDiscounted: 4,
    });
    const worst = makeCandidate({ scenarioId: 'worst', roiPercent: 5, npv: 1000, paybackYearsDiscounted: 8 });

    const recommendation = recommendScenario([worst, best], 'ROI', HORIZON_YEARS);

    expect(recommendation?.scenarioId).toBe('best');
    expect(recommendation?.reason).toContain('45,0%'); // pt-BR: comma decimal
    expect(recommendation?.reason).toContain('2 módulos');
    expect(recommendation?.reason).toMatch(/R\$\s*12\.345,00/);
  });

  it('returns null for an empty scenario list', () => {
    expect(recommendScenario([], 'NPV', HORIZON_YEARS)).toBeNull();
  });

  it('[test 6] returns scenarioId: null and the canonical message when no scenario is economically viable', () => {
    const scenarios = [
      makeCandidate({ scenarioId: 'a', npv: -100, paybackYearsDiscounted: null }),
      makeCandidate({ scenarioId: 'b', npv: 0, paybackYearsDiscounted: null }),
      makeCandidate({ scenarioId: 'c', npv: 500, paybackYearsDiscounted: HORIZON_YEARS + 5 }),
    ];
    const recommendation = recommendScenario(scenarios, 'PAYBACK', HORIZON_YEARS);
    expect(recommendation?.scenarioId).toBeNull();
    expect(recommendation?.reason).toBe('Nenhum cenário economicamente viável dentro do horizonte analisado (3 cenários avaliados).');
  });

  it('uses correct singular phrasing for exactly one non-viable scenario', () => {
    const recommendation = recommendScenario([makeCandidate({ npv: -1 })], 'NPV', HORIZON_YEARS);
    expect(recommendation?.reason).toBe('Nenhum cenário economicamente viável dentro do horizonte analisado (1 cenário avaliado).');
  });

  it('never hardcodes the scenario count in the non-viable message', () => {
    const scenarios = Array.from({ length: 7 }, (_, i) => makeCandidate({ scenarioId: `s${i}`, npv: -1 }));
    const recommendation = recommendScenario(scenarios, 'ROI', HORIZON_YEARS);
    expect(recommendation?.reason).toContain('7 cenários avaliados');
  });

  it('the ranking criterion never changes what counts as viable — same viable set, different order', () => {
    const scenarios = [
      makeCandidate({ scenarioId: 'a', npv: 500, paybackYearsDiscounted: 6, roiPercent: 10 }),
      makeCandidate({ scenarioId: 'b', npv: 2000, paybackYearsDiscounted: 3, roiPercent: 5 }),
      makeCandidate({ scenarioId: 'c', npv: -1, paybackYearsDiscounted: 1, roiPercent: 999 }), // non-viable despite great payback/ROI
    ];
    const byPayback = recommendScenario(scenarios, 'PAYBACK', HORIZON_YEARS);
    const byNpv = recommendScenario(scenarios, 'NPV', HORIZON_YEARS);
    const byRoi = recommendScenario(scenarios, 'ROI', HORIZON_YEARS);
    // 'c' must never win under any criterion — it isn't viable.
    expect(byPayback?.scenarioId).toBe('b'); // lower discounted payback
    expect(byNpv?.scenarioId).toBe('b'); // higher NPV
    expect(byRoi?.scenarioId).toBe('a'); // higher ROI, among viable scenarios only
  });

  it.each<RankingCriterion>(['PAYBACK', 'ROI', 'NPV'])('recommends a genuinely viable scenario under %s', (criterion) => {
    const viable = makeCandidate({ scenarioId: 'viable', paybackYearsDiscounted: 5, roiPercent: 10, npv: 100 });
    const recommendation = recommendScenario([viable], criterion, HORIZON_YEARS);
    expect(recommendation?.scenarioId).toBe('viable');
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
