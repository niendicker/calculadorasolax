// Public surface of the C&I domain module (docs/CI-MODULE-PLAN.md). Only
// types + validation (Fase 1) and load curve parsing (Fase 2) exist so far —
// dispatch/tariff/financial/scenarios/ranking are added in their own later
// phases, not stubbed out ahead of need.

export * from './types';
export * from './validation';
export * from './load-curve';
