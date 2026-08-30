// Public surface of the C&I domain module (docs/CI-MODULE-PLAN.md). Types +
// validation (Fase 1), load curve parsing (Fase 2), the dispatch engine
// (Fase 3), and tariff/financial costing (Fase 4) exist so far —
// scenarios/ranking are added in their own later phase, not stubbed out
// ahead of need.

export * from './types';
export * from './validation';
export * from './load-curve';
export * from './dispatch';
export * from './tariff';
export * from './financial';
