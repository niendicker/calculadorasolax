// Deno test suite for the calculate-residential request handler
// (handleCalculateResidential in index.ts) — the orchestration around the
// pure functions already covered by logic.test.ts: the strict→relaxed query
// cascade, the required-flags filter, the ESS-rule RPC filter, and the
// microgrid fundamental/optional branching. None of this had test coverage
// before (see vitest.config.ts's note excluding index.ts — it needs a Deno
// test runner, not Vitest), which is exactly the class of bug the original
// Tarifa Branca "no solution found" investigation traced back to: a filter
// stage the relaxed fallback didn't cover.
//
// Run with: deno test --allow-env calculate-residential/index.test.ts
// (requires Deno; see https://deno.land/manual/getting_started/installation)

import { assertEquals, assertExists } from 'jsr:@std/assert@1';
import { handleCalculateResidential } from './index.ts';
import type { ApprovedSolution } from './logic.ts';

type TableResult = { data: unknown; error: unknown };

/** A minimal fake Supabase query builder: every chain method (select/eq/gte/
 * order/limit/in) is a no-op returning itself, `maybeSingle()` resolves the
 * configured result, and the builder itself is thenable so a plain `await
 * query` works too — matching how index.ts actually calls it. */
function makeQueryBuilder(result: TableResult) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    in: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: TableResult) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

/** Builds a fake Supabase client. `tableResults` maps a table name to the
 * `{ data, error }` its query should resolve with — pass an array to return
 * a different result on each successive `.from(table)` call for that table
 * (e.g. approved_solutions: [strictResult, relaxedResult]), repeating the
 * last entry once exhausted. */
function makeFakeSupabase({
  tableResults = {},
  rpcResult = { data: [], error: null },
}: {
  tableResults?: Record<string, TableResult | TableResult[]>;
  rpcResult?: TableResult;
}) {
  const callCounts: Record<string, number> = {};
  return {
    from(table: string) {
      const entry = tableResults[table];
      let result: TableResult;
      if (Array.isArray(entry)) {
        const count = callCounts[table] ?? 0;
        result = entry[Math.min(count, entry.length - 1)] ?? { data: [], error: null };
        callCounts[table] = count + 1;
      } else {
        result = entry ?? { data: [], error: null };
      }
      return makeQueryBuilder(result);
    },
    rpc() {
      return Promise.resolve(rpcResult);
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

function makeSolutionRow(partial: Partial<ApprovedSolution> = {}): ApprovedSolution {
  return {
    id: 'sol-1',
    source_file: 'test',
    solution_code: 'code-1',
    inverter_model: 'X1-Hybrid-5.0-D',
    inverter_quantity: 1,
    battery_ports_used: 1,
    rated_power_w: 5000,
    peak_power_w: 6000,
    grid_topology: '1p_220V',
    battery_model: 'T-BAT-SYS HV 5.8 V2',
    battery_topology: 'HV',
    battery_quantity: 1,
    battery_power_w: 2800,
    available_energy_wh: 5220,
    accessories: [],
    comments: [],
    ...partial,
  };
}

function makeOptions(overrides: Record<string, unknown> = {}) {
  return {
    topology: 'HighVoltage',
    gridType: 'singlePhase_220',
    batteryModel: null,
    inverterModel: null,
    loads: [{ powerW: 1000, qty: 1 }],
    operationHours: 4,
    desiredFeatures: [],
    whiteTariff: null,
    microgrid: null,
    generator: null,
    pv: null,
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new Request('http://localhost/calculate-residential', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const inverterCapabilities = [{ model: 'X1-Hybrid-5.0-D', flags: [], max_power_per_phase_w: null }];

Deno.test('OPTIONS request gets a CORS preflight response', async () => {
  const req = new Request('http://localhost/calculate-residential', { method: 'OPTIONS' });
  const res = await handleCalculateResidential(req, makeFakeSupabase({}));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
});

Deno.test('invalid JSON body returns 400 invalid_payload', async () => {
  const req = new Request('http://localhost/calculate-residential', { method: 'POST', body: 'not json' });
  const res = await handleCalculateResidential(req, makeFakeSupabase({}));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'invalid_payload');
});

Deno.test('a payload failing validation returns 400 invalid_payload with details', async () => {
  const req = postRequest(makeOptions({ loads: [] }));
  const res = await handleCalculateResidential(req, makeFakeSupabase({}));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'invalid_payload');
  assertExists(body.details);
});

Deno.test('strict query match returns 200 with the solution payload', async () => {
  const supabase = makeFakeSupabase({
    tableResults: {
      approved_solutions: { data: [makeSolutionRow()], error: null },
      accessory_rules: { data: [], error: null },
    },
  });
  const req = postRequest(makeOptions());
  const res = await handleCalculateResidential(req, supabase);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.inverterModel, 'X1-Hybrid-5.0-D');
  assertEquals(body.batteryModel, 'T-BAT-SYS HV 5.8 V2');
});

Deno.test('falls back to the relaxed query (least-shortfall ranking) when the strict query is empty', async () => {
  const supabase = makeFakeSupabase({
    tableResults: {
      // First call is the strict query (empty), second is the relaxed one.
      approved_solutions: [
        { data: [], error: null },
        { data: [makeSolutionRow({ id: 'sol-relaxed' })], error: null },
      ],
      accessory_rules: { data: [], error: null },
    },
  });
  const req = postRequest(makeOptions());
  const res = await handleCalculateResidential(req, supabase);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.solutionId, 'sol-relaxed');
});

Deno.test('no solution in either the strict or relaxed query returns 422 no_approved_solution', async () => {
  const supabase = makeFakeSupabase({
    tableResults: {
      approved_solutions: { data: [], error: null },
    },
  });
  const req = postRequest(makeOptions());
  const res = await handleCalculateResidential(req, supabase);
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error, 'no_approved_solution');
});

Deno.test('a desired feature with no supporting inverter returns 422 no_solution_matches_desired_features', async () => {
  const supabase = makeFakeSupabase({
    tableResults: {
      approved_solutions: { data: [makeSolutionRow()], error: null },
      // No inverter in the catalog supports the 'external_ats' flag required
      // by the 'external_ats' desired feature.
      inverters: { data: inverterCapabilities, error: null },
    },
  });
  const req = postRequest(
    makeOptions({ desiredFeatures: ['external_ats'], atsPhotoUrl: null, atsBackupAcknowledged: true })
  );
  const res = await handleCalculateResidential(req, supabase);
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error, 'no_solution_matches_desired_features');
  assertEquals(body.blockingFeatures, ['external_ats']);
});

Deno.test('a battery model with no compatible ESS rule returns 422 no_compatible_ess_rule', async () => {
  const supabase = makeFakeSupabase({
    tableResults: {
      batteries: { data: { capacity_kwh: 5.8, min_soc_percent: 10 }, error: null },
      approved_solutions: { data: [makeSolutionRow()], error: null },
    },
    // The RPC finding no compatible solution ids for this battery model is
    // exactly the "strict query non-empty but ESS rule rejects everything"
    // dead end the relaxed fallback (wired only to the strict query) doesn't
    // cover — see the earlier Tarifa Branca investigation this test guards.
    rpcResult: { data: [], error: null },
  });
  const req = postRequest(makeOptions({ batteryModel: 'T-BAT-SYS HV 5.8 V2' }));
  const res = await handleCalculateResidential(req, supabase);
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error, 'no_compatible_ess_rule');
});

Deno.test('microgrid as a fundamental requirement with no compatible solution returns 422 blocking microgrid', async () => {
  const supabase = makeFakeSupabase({
    tableResults: {
      approved_solutions: { data: [makeSolutionRow({ rated_power_w: 3000, battery_power_w: 3000 })], error: null },
      // No inverter has the 'microgrid' flag, so nothing can satisfy it.
      inverters: { data: [{ model: 'X1-Hybrid-5.0-D', flags: [], max_power_per_phase_w: null }], error: null },
      accessory_rules: { data: [], error: null },
    },
  });
  const req = postRequest(
    makeOptions({
      desiredFeatures: ['microgrid'],
      microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 1000, isFundamentalRequirement: true },
    })
  );
  const res = await handleCalculateResidential(req, supabase);
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error, 'no_solution_matches_desired_features');
  assertEquals(body.blockingFeatures, ['microgrid']);
});

Deno.test('microgrid as an optional extra surfaces a microgridAlternative instead of blocking', async () => {
  const economic = makeSolutionRow({ id: 'economic', inverter_model: 'no-microgrid', rated_power_w: 3000, battery_power_w: 3000 });
  const withMicrogrid = makeSolutionRow({
    id: 'microgrid-capable',
    inverter_model: 'has-microgrid',
    rated_power_w: 8000,
    battery_power_w: 8000,
  });
  const supabase = makeFakeSupabase({
    tableResults: {
      approved_solutions: { data: [economic, withMicrogrid], error: null },
      inverters: {
        data: [
          { model: 'no-microgrid', flags: [], max_power_per_phase_w: null },
          { model: 'has-microgrid', flags: ['microgrid'], max_power_per_phase_w: null },
        ],
        error: null,
      },
      accessory_rules: { data: [], error: null },
    },
  });
  const req = postRequest(
    makeOptions({
      desiredFeatures: ['microgrid'],
      microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 1000, isFundamentalRequirement: false },
    })
  );
  const res = await handleCalculateResidential(req, supabase);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.solutionId, 'economic');
  assertExists(body.microgridAlternative);
  assertEquals(body.microgridAlternative.solutionId, 'microgrid-capable');
});
