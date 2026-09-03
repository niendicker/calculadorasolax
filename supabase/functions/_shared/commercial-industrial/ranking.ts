// Ranking and recommendation — Fase 5 of docs/CI-MODULE-PLAN.md section 8/9,
// substantially revised by the Fase 7 audit (section 1): economic viability
// and ranking are now two deliberately separate concepts. Orders an
// already-built scenario grid (scenarios.ts) by the user's chosen criterion
// and explains the pick with real numbers from the candidate itself (plan
// section 8's "a justificativa aponta métricas e premissas reais") — never a
// canned string.

import type { RankingCriterion, ScenarioCandidate } from './types.ts';

/** Descending-by-`pick(candidate)` comparator that treats non-finite values
 * (NaN/±Infinity — never produced by the current engine, but defended
 * against per the Fase 6 audit's explicit "null/undefined/Infinity não podem
 * ser classificados silenciosamente como o melhor cenário") as always worse
 * than any finite value, regardless of sort direction. Two non-finite values
 * are left tied (stable sort preserves their relative order). */
function compareDescendingFinite(a: number, b: number): number {
  const aFinite = Number.isFinite(a);
  const bFinite = Number.isFinite(b);
  if (!aFinite && !bFinite) return 0;
  if (!aFinite) return 1;
  if (!bFinite) return -1;
  return b - a;
}

/** Orders `scenarios` by `criterion` alone — a pure display/comparison
 * ordering that never decides viability (see `isScenarioViable` below).
 * Scenarios with an invalid metric for the chosen criterion (null payback,
 * NaN, ±Infinity) always sort last, regardless of how good their other
 * numbers look — a criterion the scenario doesn't satisfy at all shouldn't
 * outrank one that does, just because of tie-breaking arithmetic. */
export function rankScenarios(scenarios: ScenarioCandidate[], criterion: RankingCriterion): ScenarioCandidate[] {
  const sorted = [...scenarios];
  sorted.sort((a, b) => {
    switch (criterion) {
      case 'PAYBACK': {
        // Fase 7 audit, section 1.1: PAYBACK ranks by DISCOUNTED payback,
        // not simple payback — simple payback remains a display-only
        // indicator (ScenarioCandidate.paybackYearsSimple), never a ranking
        // or viability input.
        const aInvalid = a.paybackYearsDiscounted === null || !Number.isFinite(a.paybackYearsDiscounted);
        const bInvalid = b.paybackYearsDiscounted === null || !Number.isFinite(b.paybackYearsDiscounted);
        if (aInvalid && bInvalid) return 0;
        if (aInvalid) return 1;
        if (bInvalid) return -1;
        return (a.paybackYearsDiscounted as number) - (b.paybackYearsDiscounted as number);
      }
      case 'ROI':
        return compareDescendingFinite(a.roiPercent, b.roiPercent);
      case 'NPV':
        return compareDescendingFinite(a.npv, b.npv);
    }
  });
  return sorted;
}

/** Whether `scenario` is economically viable — Fase 7 audit, section 1's
 * explicit, criterion-INDEPENDENT definition:
 *
 *   isScenarioViable(scenario, horizonYears) =
 *       scenario.npv > 0
 *       AND scenario.discountedPaybackYears != null
 *       AND scenario.discountedPaybackYears <= horizonYears
 *
 * Deliberately does NOT depend on `rankingCriterion` — the ranking criterion
 * only decides the ORDER among already-viable scenarios (see
 * `rankViableScenarios`), never whether a scenario counts as viable at all.
 * Simple payback and ROI are NOT part of this test (per the audit's
 * explicit instruction) — they remain display-only indicators. Every
 * numeric input is guarded with `Number.isFinite` (section 1.2: NaN/
 * ±Infinity must never accidentally read as viable). */
export function isScenarioViable(scenario: ScenarioCandidate, horizonYears: number): boolean {
  return (
    Number.isFinite(scenario.npv) &&
    scenario.npv > 0 &&
    scenario.paybackYearsDiscounted !== null &&
    Number.isFinite(scenario.paybackYearsDiscounted) &&
    scenario.paybackYearsDiscounted <= horizonYears
  );
}

/** Filters to economically viable scenarios (`isScenarioViable`) THEN
 * orders the survivors by `criterion` — the exact two-step pipeline the
 * audit's section 1.1 diagram specifies ("todos os cenários -> filtrar
 * viáveis -> aplicar o critério de ranking"). Ranking never widens or
 * substitutes for viability: an empty result here means no scenario should
 * ever be recommended, regardless of criterion. */
export function rankViableScenarios(scenarios: ScenarioCandidate[], criterion: RankingCriterion, horizonYears: number): ScenarioCandidate[] {
  return rankScenarios(
    scenarios.filter((scenario) => isScenarioViable(scenario, horizonYears)),
    criterion
  );
}

export interface Recommendation {
  /** null when no candidate is economically viable — never coerced into
   * "recommending" the least-bad nonviable option. */
  scenarioId: string | null;
  reason: string;
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** pt-BR decimal formatting (comma, not dot) for plain numbers embedded in
 * this module's own reason strings. Deliberately local, not imported from
 * `components/app/helpers.ts`: this file runs in both the Next.js app and
 * the Deno edge function (see the module header), and the frontend helpers
 * module isn't Deno-portable. */
function formatNumberBrl(value: number, fractionDigits: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

function describeCriterion(candidate: ScenarioCandidate, criterion: RankingCriterion): string {
  switch (criterion) {
    case 'PAYBACK':
      // paybackYearsDiscounted is guaranteed non-null/finite here — only
      // viable candidates (isScenarioViable) ever reach describeCriterion.
      return `menor payback descontado (${formatNumberBrl(candidate.paybackYearsDiscounted as number, 1)} anos)`;
    case 'ROI':
      return `maior ROI anual (${formatNumberBrl(candidate.roiPercent, 1)}%)`;
    case 'NPV':
      return `maior VPL (${formatBrl(candidate.npv)})`;
  }
}

/** Builds a plain-language justification from the winning candidate's own
 * numbers — CAPEX, annual savings, module count, payback and NPV — so the
 * memorial (Fase 9) can quote it directly instead of re-deriving the same
 * sentence.
 *
 * Fase 7 audit (section 1): viability and ranking are applied as two
 * strictly separate steps — `rankViableScenarios` filters to
 * `isScenarioViable` scenarios first, and only THEN orders by `criterion`.
 * When the viable set is empty, returns `scenarioId: null` with the
 * canonical "Nenhum cenário economicamente viável..." message (never a
 * criterion-specific "não atinge X" — viability no longer depends on which
 * criterion was configured). The caller (the edge function) is responsible
 * for showing a separate, clearly-not-"recommended" reference to the
 * smallest evaluated configuration in that case (see index.ts). Returns
 * `null` itself only when there is nothing to rank at all (empty
 * `scenarios`), preserving the existing "no_scenarios_evaluated" guard
 * upstream. */
export function recommendScenario(scenarios: ScenarioCandidate[], criterion: RankingCriterion, horizonYears: number): Recommendation | null {
  if (scenarios.length === 0) return null;

  const viableRanked = rankViableScenarios(scenarios, criterion, horizonYears);
  const best = viableRanked[0];

  if (!best) {
    const reason = `Nenhum cenário economicamente viável dentro do horizonte analisado (${scenarios.length} cenário${
      scenarios.length === 1 ? '' : 's'
    } avaliado${scenarios.length === 1 ? '' : 's'}).`;
    return { scenarioId: null, reason };
  }

  const reason = `Selecionado por ter ${describeCriterion(best, criterion)} entre ${
    scenarios.length === 1 ? 'o 1 cenário avaliado' : `os ${scenarios.length} cenários avaliados`
  } (${best.moduleCount} módulo${best.moduleCount === 1 ? '' : 's'}), com economia anual de ${formatBrl(best.annualSavings)} sobre um CAPEX de ${formatBrl(best.capex)}. Payback descontado: ${formatNumberBrl(best.paybackYearsDiscounted as number, 1)} anos; VPL: ${formatBrl(best.npv)}.`;

  return { scenarioId: best.scenarioId, reason };
}

/** Plan section 5's "cenário sem benefício marginal é identificado" — true
 * for any candidate (other than the first, smallest one, which has no
 * predecessor to compare against) whose extra module(s) didn't increase
 * annual savings at all. */
export function hasNoMarginalBenefit(candidate: ScenarioCandidate): boolean {
  return candidate.marginalGain !== null && candidate.marginalGain <= 0;
}
