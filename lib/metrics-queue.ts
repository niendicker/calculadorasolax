import type { SupabaseClient } from '@supabase/supabase-js';

// Local retry queue for app_simulations inserts. The insert after a
// dimensioning calculation is best-effort usage telemetry — it must never
// block or fail the calculation itself, but losing it silently on a bad
// connection means the admin metrics quietly drift from reality. Pending
// entries are kept in localStorage and retried on the next app load or
// when the browser comes back online.

const STORAGE_KEY = 'solax-pending-simulations';
const MAX_QUEUE_SIZE = 50;

export interface PendingSimulationPayload {
  user_id: string | null;
  project_name: string | null;
  topology: string | null;
  grid_type: string | null;
  peak_w: number;
  daily_kwh: number;
  loads: unknown;
  inverter_model: string | null;
  battery_model: string | null;
  accessories: unknown;
  solution_code: string | null;
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

async function runFlush(supabase: SupabaseClient): Promise<{ sent: number; remaining: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  const stillPending: PendingSimulation[] = [];
  let sent = 0;

  for (const entry of queue) {
    const { error } = await supabase.from('app_simulations').insert(entry.payload);
    if (error) {
      stillPending.push(entry);
    } else {
      sent += 1;
    }
  }

  writeQueue(stillPending);
  return { sent, remaining: stillPending.length };
}

/** Retries every queued simulation insert. Entries that fail again stay queued. */
export function flushPendingSimulations(
  supabase: SupabaseClient
): Promise<{ sent: number; remaining: number }> {
  if (flushInFlight) return flushInFlight;

  // `.finally()` on the returned promise (rather than a try/finally inside
  // runFlush) is essential here: its callback always runs as a microtask,
  // strictly after this function returns. A try/finally inside an async
  // function with no internal `await` (e.g. the empty-queue path) runs
  // fully synchronously, so `flushInFlight = null` would execute before
  // the `flushInFlight = ...` assignment below completes and get
  // immediately clobbered back — permanently "stuck" after the first
  // empty-queue check.
  flushInFlight = runFlush(supabase).finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}
