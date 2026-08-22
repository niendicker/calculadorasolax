// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { useAdminData } from './useAdminData';

function makeSupabase(tableResults: Record<string, { data: unknown; error: null } | { data: null; error: { message: string } }> = {}) {
  return createSupabaseMock({ tableResults }) as unknown as Parameters<typeof useAdminData>[0]['supabase'];
}

describe('useAdminData: initial load', () => {
    it('fetches only the metrics tab resources on mount', async () => {
    const simulation = { id: 'sim-1' };
    const user = { id: 'user-1', email: 'a@x.com' };
    const supabase = makeSupabase({
      app_simulations: { data: [simulation], error: null },
      profiles: { data: [user], error: null },
    });
    const setError = vi.fn();

    const { result } = renderHook(() => useAdminData({ supabase, setError }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.simulations).toEqual([simulation]);
    expect(result.current.users).toEqual([user]);
    expect(result.current.inverters).toEqual([]);
    expect(setError).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('reports a fetch failure through setError and leaves loading false afterward', async () => {
    const supabase = makeSupabase({
      app_simulations: { data: null, error: { message: 'boom' } },
      profiles: { data: [], error: null },
    });
    const setError = vi.fn();

    const { result } = renderHook(() => useAdminData({ supabase, setError }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(setError).toHaveBeenCalledWith('boom');
  });
});

describe('useAdminData: ensureTabData lazy loading', () => {
  it('only fetches a tab´s resources once, skipping already-loaded ones on a later call', async () => {
    const fromSpy = vi.fn<(table: string) => unknown>(() => ({
      select: () => ({
        eq: () => Promise.resolve({ count: 0, data: null, error: null }),
        order: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          range: () => Promise.resolve({ data: [], error: null }),
          then: (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
        }),
      }),
    }));
    const supabase = { from: fromSpy, auth: { getUser: vi.fn() } } as unknown as Parameters<typeof useAdminData>[0]['supabase'];
    const setError = vi.fn();

    const { result } = renderHook(() => useAdminData({ supabase, setError }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsAfterMount = fromSpy.mock.calls.map((call) => call[0]);
    expect(new Set(callsAfterMount)).toEqual(new Set(['app_simulations', 'profiles', 'project_events']));

    fromSpy.mockClear();
    await act(async () => {
      // 'batteries' tab only needs the 'batteries' resource, and it hasn't
      // been loaded yet by the metrics tab — should fetch exactly that.
      await result.current.ensureTabData('batteries');
    });

    expect(fromSpy.mock.calls.map((call) => call[0])).toEqual(['batteries']);

    fromSpy.mockClear();
    await act(async () => {
      // Already loaded — a non-forced call should be a no-op.
      await result.current.ensureTabData('batteries');
    });
    expect(fromSpy).not.toHaveBeenCalled();

    fromSpy.mockClear();
    await act(async () => {
      await result.current.ensureTabData('batteries', true);
    });
    expect(fromSpy.mock.calls.map((call) => call[0])).toEqual(['batteries']);
  });
});

describe('useAdminData: loadResource', () => {
  it('refreshes a single resource in place, for write handlers to call after a save', async () => {
    const supabase = makeSupabase({
      app_simulations: { data: [], error: null },
      profiles: { data: [], error: null },
      inverters: { data: [{ id: 'inv-1', model: 'X1-Hybrid-5.0-D' }], error: null },
    });
    const setError = vi.fn();

    const { result } = renderHook(() => useAdminData({ supabase, setError }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadResource('inverters');
    });

    expect(result.current.inverters).toEqual([{ id: 'inv-1', model: 'X1-Hybrid-5.0-D' }]);
  });
});

describe('useAdminData: pagination', () => {
  it('loadMoreSimulations appends the next page and tracks hasMore off the page size', async () => {
    const firstPage = Array.from({ length: 200 }, (_, i) => ({ id: `sim-${i}` }));
    const secondPage = [{ id: 'sim-200' }];
    let call = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'project_events') {
          return { select: () => ({ eq: () => Promise.resolve({ count: 0, data: null, error: null }) }) };
        }
        if (table !== 'app_simulations') {
          return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
        }
        return {
          select: () => ({
            order: () => ({
              range: () => {
                call += 1;
                return Promise.resolve({ data: call === 1 ? firstPage : secondPage, error: null });
              },
            }),
          }),
        };
      }),
      auth: { getUser: vi.fn() },
    } as unknown as Parameters<typeof useAdminData>[0]['supabase'];
    const setError = vi.fn();

    const { result } = renderHook(() => useAdminData({ supabase, setError }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.simulations).toHaveLength(200);
    expect(result.current.simulationsHasMore).toBe(true);

    await act(async () => {
      await result.current.loadMoreSimulations();
    });

    expect(result.current.simulations).toHaveLength(201);
    expect(result.current.simulationsHasMore).toBe(false);
  });
});
