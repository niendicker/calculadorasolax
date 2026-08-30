// Public surface of the C&I domain module (docs/CI-MODULE-PLAN.md). The
// full calculation engine (Fases 1-5: types/validation, load curve parsing,
// dispatch, tariff/financial costing, scenario grid + ranking) lives here.
// UI, persistence, and the Edge Function wiring (Fases 6-7) are next.

export * from './types.ts';
export * from './validation.ts';
export * from './load-curve.ts';
export * from './dispatch.ts';
export * from './tariff.ts';
export * from './financial.ts';
export * from './scenarios.ts';
export * from './ranking.ts';
