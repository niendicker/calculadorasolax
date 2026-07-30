/** Per-user resource limits, enforced both here (frontend, for a fast/clear
 * error before ever calling Supabase) and in supabase/migrations/0045_account_limits.sql
 * and 0047_user_load_presets.sql (the source of truth, regardless of client).
 * Keep both in sync if these change. */
export const ACCOUNT_LIMITS = {
  projects: 15,
  userLoadCatalog: 20,
  userStockItems: 14,
  loadsPerProject: 20,
  clients: 50,
  userPresets: 3,
  userServices: 10,
} as const;

export function limitReachedMessage(resource: string, limit: number): string {
  return `Limite de ${limit} ${resource} atingido.`;
}

/** Whether `error` is a limitReachedMessage error — callers use this to show
 * the limit message as-is instead of falling back to a generic failure
 * message. Matched by prefix (not equality) since the message also carries
 * the resource name/count, which varies per call site. */
export function isLimitError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith('Limite de');
}
