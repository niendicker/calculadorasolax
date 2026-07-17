import { vi } from 'vitest';

type QueryResult<T = unknown> = { data: T; error: null } | { data: null; error: { message: string } };

/** A fake Supabase query builder: every chain method (`select`, `order`, `insert`,
 *  `update`, `delete`, `upsert`, `eq`, `in`) returns itself, `single()`/`maybeSingle()`
 *  resolve the configured result, and the builder is itself thenable so `await` works
 *  even without a trailing `.single()` — matching how the real supabase-js client behaves. */
function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    upsert: () => builder,
    eq: () => builder,
    in: () => builder,
    range: () => builder,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: QueryResult) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

/** Builds a fake Supabase client for store/component tests. `tableResults` maps
 *  table name to the `{ data, error }` its query builder should resolve with —
 *  set only the tables the action under test actually touches. `auth` lets
 *  callers override/add auth methods beyond the default `getUser` (e.g.
 *  `signInWithPassword`, `signUp`, `resetPasswordForEmail`, `signOut`), each
 *  defaulting to a `vi.fn()` that resolves `{ error: null }` if not given. */
export function createSupabaseMock({
  user = { id: 'user-1' },
  tableResults = {},
  auth = {},
}: {
  user?: { id: string } | null;
  tableResults?: Record<string, QueryResult>;
  auth?: Record<string, ReturnType<typeof vi.fn>>;
} = {}) {
  const from = vi.fn((table: string) => makeQueryBuilder(tableResults[table] ?? { data: null, error: null }));
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      ...auth,
    },
    from,
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
