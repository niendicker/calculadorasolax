import { vi } from 'vitest';

type QueryResult<T = unknown> = { data: T; error: null } | { data: null; error: { message: string } };

/** A fake Supabase query builder: every chain method (`select`, `order`, `insert`,
 *  `update`, `delete`, `upsert`, `eq`) returns itself, `single()` resolves the
 *  configured result, and the builder is itself thenable so `await` works even
 *  without a trailing `.single()` — matching how the real supabase-js client behaves. */
function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    upsert: () => builder,
    eq: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve: (value: QueryResult) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

/** Builds a fake Supabase client for store tests. `tableResults` maps table name
 *  to the `{ data, error }` its query builder should resolve with — set only the
 *  tables the action under test actually touches. */
export function createSupabaseMock({
  user = { id: 'user-1' },
  tableResults = {},
}: {
  user?: { id: string } | null;
  tableResults?: Record<string, QueryResult>;
} = {}) {
  const from = vi.fn((table: string) => makeQueryBuilder(tableResults[table] ?? { data: null, error: null }));
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
