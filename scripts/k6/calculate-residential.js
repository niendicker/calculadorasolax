// Load test for the calculate-residential Edge Function — the "Calcular"
// button in Dimensionamento, and the heaviest query path in the app (see
// supabase/functions/calculate-residential/index.ts): it searches
// approved_solutions with a strict→relaxed fallback, then layers on
// inverter-flags/ESS-rule/microgrid/PV/accessory-rule lookups on top.
//
// Side effects: each call inserts one row into app_simulations (analytics
// log) via the Next.js app, but this script hits the Edge Function directly,
// which does NOT write to app_simulations itself — only the Next.js
// calculateResidentialSolution() wrapper does that (see lib/calculate-residential.ts).
// So running this script has no write side effects at all — safe to repeat.
//
// Usage:
//   export SUPABASE_URL=https://supabase-calculadora.solaxpowerbrasil.cloud
//   export SUPABASE_ANON_KEY=...   # from .env.local
//   k6 run scripts/k6/calculate-residential.js
//
// Override load shape without editing the file:
//   k6 run -e VUS=20 -e DURATION=2m scripts/k6/calculate-residential.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const SUPABASE_URL = __ENV.SUPABASE_URL || __ENV.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || __ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_* equivalents) as env vars before running.');
}

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/calculate-residential`;

// Every request needs both headers: `apikey` for Kong's own gateway
// key-auth, `Authorization` for GoTrue/PostgREST — same pair the browser
// client sends automatically when there's no logged-in session.
const HEADERS = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

// A handful of real, currently-cataloged combinations (checked against
// production via the REST API before writing this) spanning both battery
// topologies and a couple of grid types — varying the input matters here
// since approved_solutions is queried fresh every time (no cache layer),
// so a single fixed payload would only ever exercise one query plan/index
// path instead of a representative mix.
const SCENARIOS = [
  {
    name: 'hv-tp-hs3.6-single-phase',
    topology: 'HighVoltage',
    batteryModel: 'TP-HS3.6',
    gridType: 'singlePhase_220',
    loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, qty: 1, ipInRatio: 1 }],
  },
  {
    name: 'lv-ld51c-three-phase-380',
    topology: 'LowVoltage',
    batteryModel: 'LD51C',
    gridType: 'threePhase_380',
    loads: [
      { id: 'l1', name: 'Ar-condicionado', powerW: 2200, qty: 2, ipInRatio: 1.4 },
      { id: 'l2', name: 'Chuveiro', powerW: 6000, qty: 1, ipInRatio: 1 },
    ],
  },
  {
    // No pinned battery/inverter model — exercises the widest candidate pool
    // and the strict->relaxed fallback path more often than a pinned model.
    name: 'hv-auto-split-phase',
    topology: 'HighVoltage',
    batteryModel: null,
    gridType: 'splitPhase_220',
    loads: [{ id: 'l1', name: 'Bomba de piscina', powerW: 1500, qty: 1, ipInRatio: 2 }],
  },
];

function buildPayload(scenario) {
  return {
    topology: scenario.topology,
    batteryModel: scenario.batteryModel,
    secondaryBatteryModel: null,
    inverterModel: null,
    minInverterQty: null,
    gridType: scenario.gridType,
    loads: scenario.loads,
    peakCalcMode: 'sum',
    operationHours: 4,
    desiredFeatures: [],
    whiteTariff: null,
    microgrid: null,
    generator: null,
    pv: null,
    atsPhotoUrl: null,
    atsBackupAcknowledged: false,
    maxPowerPerPhaseW: null,
  };
}

const solutionDuration = new Trend('calculate_residential_duration', true);

// One requests/failures/duration trio per SCENARIOS entry (by index, not by
// scenario.name) so the end-of-test summary prints a scenario-0/-1/-2
// breakdown — a plain metric always shows up there once it has data,
// unlike a tag, which only surfaces in the summary if referenced by a
// threshold. "Failure" mirrors the same 200/422-are-expected rule as
// responseCallback below, so these numbers agree with http_req_failed.
const scenarioMetrics = SCENARIOS.map((_, i) => ({
  // k6 metric names can't contain "-" (only letters/numbers/underscores),
  // so this reads as "scenario_0" etc. rather than "scenario-0".
  requests: new Counter(`scenario_${i}_requests`),
  failures: new Rate(`scenario_${i}_failures`),
  duration: new Trend(`scenario_${i}_duration`, true),
}));

export const options = {
  scenarios: {
    default: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP_UP || '30s', target: Number(__ENV.VUS) || 10 },
        { duration: __ENV.DURATION || '1m', target: Number(__ENV.VUS) || 10 },
        { duration: __ENV.RAMP_DOWN || '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    // Both success (200) and "no compatible solution" (422) are valid,
    // expected responses for this function — see the checks below — so
    // http_req_duration is the right SLO signal, not the error rate alone.
    http_req_duration: ['p(95)<3000'],
  },
};

function runLoadTest() {
  const scenarioIndex = Math.floor(Math.random() * SCENARIOS.length);
  const scenario = SCENARIOS[scenarioIndex];
  const payload = JSON.stringify(buildPayload(scenario));

  const res = http.post(FUNCTION_URL, payload, {
    headers: HEADERS,
    timeout: '10s',
    responseCallback: http.expectedStatuses(200, 422),
    tags: { name: 'calculate-residential', scenario: scenario.name },
  });
  solutionDuration.add(res.timings.duration);

  const metrics = scenarioMetrics[scenarioIndex];
  metrics.requests.add(1);
  metrics.failures.add(res.status !== 200 && res.status !== 422);
  metrics.duration.add(res.timings.duration);

  check(res, {
    // 200: a solution was found. 422 no_approved_solution / no_solution_matches_desired_features:
    // a legitimate "nothing fits" business response, not a server failure —
    // both mean the function ran its full query pipeline successfully.
    'status is 200 or a known 422': (r) => r.status === 200 || r.status === 422,
    'no 5xx': (r) => r.status < 500,
  });

  sleep(1);
}

export default runLoadTest;
