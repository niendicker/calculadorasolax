// Public surface of the C&I domain module (docs/CI-MODULE-PLAN.md). The
// full calculation engine (Fases 1-5: types/validation, load curve parsing,
// dispatch, tariff/financial costing, scenario grid + ranking) lives here.
// UI, persistence, and the Edge Function wiring (Fases 6-7) are next.

export * from './types';
export * from './validation';
export * from './load-curve';
export * from './dispatch';
export * from './tariff';
export * from './financial';
export * from './scenarios';
export * from './ranking';
