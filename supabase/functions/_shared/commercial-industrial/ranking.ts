// Ranking and recommendation — Fase 5 of docs/CI-MODULE-PLAN.md section 8/9.
// Orders an already-built scenario grid (scenarios.ts) by the user's chosen
// criterion and explains the pick with real numbers from the candidate
// itself (plan section 8's "a justificativa aponta métricas e premissas
// reais") — never a canned string.

import type { RankingCriterion, ScenarioCandidate } from './types.ts';

/** Scenarios that never pay back (`paybackYearsSimple === null`) always sort
 * last under the PAYBACK criterion, regardless of how good their other
 * numbers look — a criterion the scenario doesn't satisfy at all shouldn't
 * outrank one that does, just because of tie-breaking arithmetic on null. */
export function rankScenarios(scenarios: ScenarioCandidate[], criterion: RankingCriterion): ScenarioCandidate[] {
  const sorted = [...scenarios];
  sorted.sort((a, b) => {
    switch (criterion) {
      case 'PAYBACK': {
        if (a.paybackYearsSimple === null && b.paybackYearsSimple === null) return 0;
        if (a.paybackYearsSimple === null) return 1;
        if (b.paybackYearsSimple === null) return -1;
        return a.paybackYearsSimple - b.paybackYearsSimple;
      }
      case 'ROI':
        return b.roiPercent - a.roiPercent;
      case 'NPV':
        return b.npv - a.npv;
    }
  });
  return sorted;
}

export interface Recommendation {
  scenarioId: string;
  reason: string;
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function describeCriterion(candidate: ScenarioCandidate, criterion: RankingCriterion): string {
  switch (criterion) {
    case 'PAYBACK':
      return candidate.paybackYearsSimple === null
        ? 'não atinge payback dentro do horizonte analisado'
        : `menor payback (${candidate.paybackYearsSimple.toFixed(1)} anos simples, ${candidate.paybackYearsDiscounted?.toFixed(1) ?? '—'} anos descontado)`;
    case 'ROI':
      return `maior ROI anual (${candidate.roiPercent.toFixed(1)}%)`;
    case 'NPV':
      return `maior VPL (${formatBrl(candidate.npv)})`;
  }
}

/** Builds a plain-language justification from the winning candidate's own
 * numbers — CAPEX, annual savings, module count — so the memorial (Fase 9)
 * can quote it directly instead of re-deriving the same sentence. */
export function recommendScenario(scenarios: ScenarioCandidate[], criterion: RankingCriterion): Recommendation | null {
  const ranked = rankScenarios(scenarios, criterion);
  const best = ranked[0];
  if (!best) return null;

  const reason = `Selecionado por ter ${describeCriterion(best, criterion)} entre os ${scenarios.length} cenários avaliados (${best.moduleCount} módulo${best.moduleCount === 1 ? '' : 's'}), com economia anual de ${formatBrl(best.annualSavings)} sobre um CAPEX de ${formatBrl(best.capex)}.`;

  return { scenarioId: best.scenarioId, reason };
}

/** Plan section 5's "cenário sem benefício marginal é identificado" — true
 * for any candidate (other than the first, smallest one, which has no
 * predecessor to compare against) whose extra module(s) didn't increase
 * annual savings at all. */
export function hasNoMarginalBenefit(candidate: ScenarioCandidate): boolean {
  return candidate.marginalGain !== null && candidate.marginalGain <= 0;
}
