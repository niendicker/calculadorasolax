import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  enqueuePendingSimulation,
  flushPendingSimulations,
  pendingSimulationCount,
  type PendingSimulationPayload,
} from './metrics-queue';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

function makePayload(partial: Partial<PendingSimulationPayload> = {}): PendingSimulationPayload {
  return {
    user_id: 'user-1',
    project_name: 'Projeto teste',
    topology: 'HighVoltage',
    grid_type: 'singlePhase_220',
    peak_w: 1000,
    daily_kwh: 5,
    loads: [],
    inverter_model: 'X1-Hybrid-5.0-D',
    battery_model: 'T-BAT-SYS HV 5.8 V2',
    accessories: [],
    solution_code: 'code-1',
    ...partial,
  };
}

function makeSupabaseMock(insertImpl: (payload: unknown) => { error: unknown }) {
  return {
    from: () => ({
      insert: (payload: unknown) => Promise.resolve(insertImpl(payload)),
    }),
  } as unknown as SupabaseClient;
}

let memoryStorage: MemoryStorage;

beforeEach(() => {
  memoryStorage = new MemoryStorage();
  vi.stubGlobal('window', { localStorage: memoryStorage });
});

describe('enqueuePendingSimulation / pendingSimulationCount', () => {
  it('starts empty', () => {
    expect(pendingSimulationCount()).toBe(0);
  });

  it('adds an entry to the queue', () => {
    enqueuePendingSimulation(makePayload());
    expect(pendingSimulationCount()).toBe(1);
  });

  it('accumulates multiple entries', () => {
    enqueuePendingSimulation(makePayload({ project_name: 'A' }));
    enqueuePendingSimulation(makePayload({ project_name: 'B' }));
    expect(pendingSimulationCount()).toBe(2);
  });

  it('caps the queue at 50 entries, dropping the oldest first', () => {
    for (let i = 0; i < 55; i++) {
      enqueuePendingSimulation(makePayload({ project_name: `Projeto ${i}` }));
    }
    expect(pendingSimulationCount()).toBe(50);
  });

  it('treats corrupted localStorage content as an empty queue instead of throwing', () => {
    memoryStorage.setItem('solax-pending-simulations', '{not valid json');
    expect(pendingSimulationCount()).toBe(0);

    // Recovers cleanly — the next enqueue overwrites the corrupted value.
    enqueuePendingSimulation(makePayload());
    expect(pendingSimulationCount()).toBe(1);
  });

  it('treats a non-array parsed value as an empty queue', () => {
    memoryStorage.setItem('solax-pending-simulations', JSON.stringify({ not: 'an array' }));
    expect(pendingSimulationCount()).toBe(0);
  });
});

describe('flushPendingSimulations', () => {
  it('does nothing and reports zero when the queue is empty', async () => {
    const supabase = makeSupabaseMock(() => ({ error: null }));
    const result = await flushPendingSimulations(supabase);
    expect(result).toEqual({ sent: 0, remaining: 0 });
  });

  it('sends every queued entry and clears the queue on success', async () => {
    enqueuePendingSimulation(makePayload({ project_name: 'A' }));
    enqueuePendingSimulation(makePayload({ project_name: 'B' }));

    const supabase = makeSupabaseMock(() => ({ error: null }));
    const result = await flushPendingSimulations(supabase);

    expect(result).toEqual({ sent: 2, remaining: 0 });
    expect(pendingSimulationCount()).toBe(0);
  });

  it('keeps entries that fail again in the queue', async () => {
    enqueuePendingSimulation(makePayload({ project_name: 'A' }));
    enqueuePendingSimulation(makePayload({ project_name: 'B' }));

    const supabase = makeSupabaseMock(() => ({ error: new Error('still offline') }));
    const result = await flushPendingSimulations(supabase);

    expect(result).toEqual({ sent: 0, remaining: 2 });
    expect(pendingSimulationCount()).toBe(2);
  });

  it('only keeps the entries that failed when some succeed and some do not', async () => {
    enqueuePendingSimulation(makePayload({ project_name: 'ok-1' }));
    enqueuePendingSimulation(makePayload({ project_name: 'fails' }));
    enqueuePendingSimulation(makePayload({ project_name: 'ok-2' }));

    const supabase = makeSupabaseMock((payload) => {
      const p = payload as PendingSimulationPayload;
      return { error: p.project_name === 'fails' ? new Error('nope') : null };
    });

    const result = await flushPendingSimulations(supabase);
    expect(result).toEqual({ sent: 2, remaining: 1 });
    expect(pendingSimulationCount()).toBe(1);
  });

  it('does not send the same entry twice when flushes overlap (e.g. mount effect + online event)', async () => {
    enqueuePendingSimulation(makePayload({ project_name: 'only-once' }));

    let insertCalls = 0;
    // Slow the insert down so two concurrent flushes genuinely overlap.
    const supabase = {
      from: () => ({
        insert: async () => {
          insertCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    const [resultA, resultB] = await Promise.all([
      flushPendingSimulations(supabase),
      flushPendingSimulations(supabase),
    ]);

    expect(insertCalls).toBe(1);
    expect(resultA).toBe(resultB);
    expect(resultA).toEqual({ sent: 1, remaining: 0 });
    expect(pendingSimulationCount()).toBe(0);
  });
});
