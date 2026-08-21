import type { PendingSimulationPayload } from '@/lib/api-contracts';

export type { PendingSimulationPayload } from '@/lib/api-contracts';

// Local retry queue for app_simulations inserts. The insert after a
// dimensioning calculation is best-effort usage telemetry — it must never
// block or fail the calculation itself, but losing it silently on a bad
// connection means the admin metrics quietly drift from reality. Pending
// entries are kept in localStorage and retried on the next app load or
// when the browser comes back online.

const STORAGE_KEY = 'solax-pending-simulations';
const MAX_QUEUE_SIZE = 50;

const MAX_TEXT_LENGTH = 500;
const MAX_LOADS = 50;
const MAX_ACCESSORIES = 30;
const MAX_JSON_DEPTH = 6;

function isBoundedJsonValue(value: unknown, depth = 0): boolean {
  if (depth > MAX_JSON_DEPTH || value === null) return value === null;
  if (typeof value === 'string') return value.length <= MAX_TEXT_LENGTH;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length <= MAX_LOADS && value.every((item) => isBoundedJsonValue(item, depth + 1));
  if (typeof value !== 'object') return false;

  const entries = Object.entries(value);
  return entries.length <= 50 && entries.every(([key, item]) => key.length <= 100 && isBoundedJsonValue(item, depth + 1));
}

function nullableText(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= MAX_TEXT_LENGTH);
}

function nonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
}

/** Runtime validation for metrics arriving from the browser or local retry queue.
 * Typescript interfaces disappear at runtime, so this boundary must reject
 * malformed or oversized JSON before it reaches Postgres. */
export function parsePendingSimulationPayload(value: unknown): PendingSimulationPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (!nullableText(payload.user_id) || !nullableText(payload.project_name) || !nullableText(payload.topology) || !nullableText(payload.grid_type)) return null;
  if (!nonNegativeFiniteNumber(payload.peak_w) || !nonNegativeFiniteNumber(payload.daily_kwh)) return null;
  if (!Array.isArray(payload.loads) || payload.loads.length > MAX_LOADS || !isBoundedJsonValue(payload.loads)) return null;
  if (!Array.isArray(payload.accessories) || payload.accessories.length > MAX_ACCESSORIES || !isBoundedJsonValue(payload.accessories)) return null;
  if (!nullableText(payload.inverter_model) || !nullableText(payload.battery_model) || !nullableText(payload.solution_code)) return null;

  return {
    user_id: payload.user_id,
    project_name: payload.project_name,
    topology: payload.topology,
    grid_type: payload.grid_type,
    peak_w: payload.peak_w,
    daily_kwh: payload.daily_kwh,
    loads: payload.loads,
    inverter_model: payload.inverter_model,
    battery_model: payload.battery_model,
    accessories: payload.accessories,
    solution_code: payload.solution_code,
  };
}

interface PendingSimulation {
  id: string;
  queuedAt: string;
  payload: PendingSimulationPayload;
}

function readQueue(): PendingSimulation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingSimulation[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable (private browsing, quota, etc.) — the
    // metric is dropped, but this must never throw into the calculation flow.
  }
}

/** Adds a simulation insert that failed to send to the local retry queue. */
export function enqueuePendingSimulation(payload: PendingSimulationPayload): void {
  const queue = readQueue();
  queue.push({ id: crypto.randomUUID(), queuedAt: new Date().toISOString(), payload });
  // Cap the queue so a long stretch offline can't grow localStorage without bound;
  // drop the oldest entries first, keeping the most recent metrics.
  writeQueue(queue.slice(-MAX_QUEUE_SIZE));
}

export function pendingSimulationCount(): number {
  return readQueue().length;
}

// Guards against overlapping flushes (e.g. the mount effect and the
// `online` event firing close together): without it, two concurrent calls
// would both read the same queue before either writes it back, sending
// every pending entry twice.
let flushInFlight: Promise<{ sent: number; remaining: number }> | null = null;

async function runFlush(): Promise<{ sent: number; remaining: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  const stillPending: PendingSimulation[] = [];
  let sent = 0;

  for (const entry of queue) {
    try {
      const response = await fetch('/api/metrics/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.payload),
      });
      if (!response.ok) throw new Error('metric request failed');
    } catch {
      stillPending.push(entry);
      continue;
    }
    sent += 1;
  }

  writeQueue(stillPending);
  return { sent, remaining: stillPending.length };
}

/** Retries every queued simulation insert. Entries that fail again stay queued. */
export function flushPendingSimulations(): Promise<{ sent: number; remaining: number }> {
  if (flushInFlight) return flushInFlight;

  // `.finally()` on the returned promise (rather than a try/finally inside
  // runFlush) is essential here: its callback always runs as a microtask,
  // strictly after this function returns. A try/finally inside an async
  // function with no internal `await` (e.g. the empty-queue path) runs
  // fully synchronously, so `flushInFlight = null` would execute before
  // the `flushInFlight = ...` assignment below completes and get
  // immediately clobbered back — permanently "stuck" after the first
  // empty-queue check.
  flushInFlight = runFlush().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}
