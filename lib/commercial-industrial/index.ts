// Public surface of the C&I domain module (docs/CI-MODULE-PLAN.md). Types +
// validation (Fase 1), load curve parsing (Fase 2), and the dispatch engine
// (Fase 3) exist so far — tariff/financial/scenarios/ranking are added in
// their own later phases, not stubbed out ahead of need.

export * from './types';
export * from './validation';
export * from './load-curve';
export * from './dispatch';
