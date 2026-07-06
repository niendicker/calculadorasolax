/** Per-user resource limits, enforced both here (frontend, for a fast/clear
 * error before ever calling Supabase) and in supabase/migrations/0045_account_limits.sql
 * (the source of truth, regardless of client). Keep both in sync if these change. */
export const ACCOUNT_LIMITS = {
  projects: 15,
  userLoadCatalog: 20,
  userStockItems: 10,
  loadsPerProject: 20,
  clients: 50,
} as const;

export function limitReachedMessage(resource: string, limit: number): string {
  return `Limite de ${limit} ${resource} atingido.`;
}
