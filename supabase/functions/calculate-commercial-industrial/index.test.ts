// Deno test suite for the calculate-commercial-industrial request handler
// (handleCalculateCommercialIndustrial in index.ts) — the orchestration
// around the pure engine already covered by
// supabase/functions/_shared/commercial-industrial/*.test.ts (run under
// Vitest): payload validation, the ci_bess_products lookup, and error
// mapping. Mirrors calculate-residential/index.test.ts's fake-Supabase-
// client approach.
//
// Run with: deno test --allow-env --config ../deno.json index.test.ts
// (from this directory; requires Deno — see
// https://deno.land/manual/getting_started/installation)

import { assertEquals } from 'jsr:@std/assert@1';
import { handleCalculateCommercialIndustrial } from './index.ts';

type TableResult = { data: unknown; error: unknown };

function makeQueryBuilder(result: TableResult) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
  };
  return builder;
}

function makeFakeSupabase(productResult: TableResult) {
  return {
    from(_table: string) {
      return makeQueryBuilder(productResult);
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

const VALID_PRODUCT_ROW = {
  id: 'product-1',
  model: 'T-BESS-100',
  module_power_kw: 50,
  module_capacity_kwh: 100,
  efficiency_percent: 92,
  soc_min_percent: 5,
  soc_max_percent: 100,
};

function makeOptions(overrides: Record<string, unknown> = {}) {
  return {
    loadCurve: {
      points: [
        { timestamp: '2026-08-24T00:00:00.000Z', powerKw: 60 },
        { timestamp: '2026-08-24T21:00:00.000Z', powerKw: 180 },
      ],
      resolutionMinutes: 60,
      timezone: 'America/Sao_Paulo',
      profileBasis: 'representative_period',
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      source: 'manual',
    },
    tariff: {
      energyRatePeakBrlPerMwh: 1200,
      energyRateOffPeakBrlPerMwh: 450,
      demandRateBrlPerKwMonth: 35,
      contractedDemandKw: 120,
      peakStart: '18:00',
      peakEnd: '21:00',
      tariffModality: 'verde',
      market: 'cativo',
      icmsPercent: 0,
      pisCofinsPercent: 0,
    },
    bessProductId: 'product-1',
    strategy: 'HYBRID',
    sizing: { mode: 'fixed', moduleCount: 1, minModules: null, maxModules: null },
    financialAssumptions: { discountRatePercent: 12, analysisHorizonYears: 10, annualEnergyInflationPercent: 0, monthsPerYear: 12 },
    rankingCriterion: 'PAYBACK',
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/calculate-commercial-industrial', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

Deno.test('OPTIONS returns a CORS preflight response', async () => {
  const req = new Request('http://localhost', { method: 'OPTIONS' });
  const res = await handleCalculateCommercialIndustrial(req, makeFakeSupabase({ data: null, error: null }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
});

Deno.test('rejects invalid JSON with 400', async () => {
  const req = new Request('http://localhost', { method: 'POST', body: '{not json' });
  const res = await handleCalculateCommercialIndustrial(req, makeFakeSupabase({ data: null, error: null }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'invalid_payload');
});

Deno.test('rejects a contract-invalid options payload with 400', async () => {
  const req = makeRequest({ options: makeOptions({ strategy: 'MAGIC' }), unitPriceBrl: 1000 });
  const res = await handleCalculateCommercialIndustrial(req, makeFakeSupabase({ data: null, error: null }));
  assertEquals(res.status, 400);
});

Deno.test('rejects a missing/invalid unitPriceBrl with 400', async () => {
  const req = makeRequest({ options: makeOptions() });
  const res = await handleCalculateCommercialIndustrial(req, makeFakeSupabase({ data: null, error: null }));
  assertEquals(res.status, 400);
});

Deno.test('rejects an incomplete configuration (null loadCurve) with 422', async () => {
  const req = makeRequest({ options: makeOptions({ loadCurve: null }), unitPriceBrl: 1000 });
  const res = await handleCalculateCommercialIndustrial(req, makeFakeSupabase({ data: null, error: null }));
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error, 'incomplete_configuration');
});

Deno.test('returns 422 when the BESS product is not found or inactive', async () => {
  const req = makeRequest({ options: makeOptions(), unitPriceBrl: 1000 });
  const res = await handleCalculateCommercialIndustrial(req, makeFakeSupabase({ data: null, error: null }));
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error, 'bess_product_not_found');
});

Deno.test('returns 500 when the product lookup itself fails', async () => {
  const req = makeRequest({ options: makeOptions(), unitPriceBrl: 1000 });
  const res = await handleCalculateCommercialIndustrial(req, makeFakeSupabase({ data: null, error: { message: 'db down' } }));
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'bess_product_lookup_failed');
});

Deno.test('happy path: returns a full result with a recommendation and a materialized selection', async () => {
  const req = makeRequest({ options: makeOptions(), unitPriceBrl: 45000, additionalCostsBrl: 5000 });
  const res = await handleCalculateCommercialIndustrial(req, makeFakeSupabase({ data: VALID_PRODUCT_ROW, error: null }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.engineVersion, 'ci-v2');
  assertEquals(body.scenarios.length, 1);
  // Whether the single scenario is viable under PAYBACK depends on the
  // dispatch numbers, but `selected` must always be materialized from it
  // either way when there's only one candidate.
  assertEquals(body.selected.scenarioId, 'modules-1');
  assertEquals(body.selected.dispatch.length, 2);
  assertEquals(typeof body.inputFingerprint, 'string');
});

Deno.test('recommendation.scenarioId is null (not the least-bad option) when no scenario is viable', async () => {
  // Equal peak/off-peak tariff + zero demand headroom below contracted
  // demand => zero achievable savings regardless of strategy => no scenario
  // should ever be "recommended" under PAYBACK.
  const req = makeRequest({
    options: makeOptions({
      tariff: {
        energyRatePeakBrlPerMwh: 500,
        energyRateOffPeakBrlPerMwh: 500,
        demandRateBrlPerKwMonth: 0,
        contractedDemandKw: 1000,
        peakStart: '00:00',
        peakEnd: '00:00',
        tariffModality: 'verde',
        market: 'cativo',
        icmsPercent: 0,
        pisCofinsPercent: 0,
      },
    }),
    unitPriceBrl: 45000,
  });
  const res = await handleCalculateCommercialIndustrial(req, makeFakeSupabase({ data: VALID_PRODUCT_ROW, error: null }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.recommendation.scenarioId, null);
  assertEquals(typeof body.recommendation.reason, 'string');
  // Still materializes the smallest evaluated configuration for reference.
  assertEquals(body.selected.scenarioId, 'modules-1');
});
