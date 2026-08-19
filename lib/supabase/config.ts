/** Public Supabase configuration is safe to expose to the browser. Keep it
 * separate from the server-only transport and service-role configuration so
 * changing the deployment topology does not change public asset/auth URLs. */
export function getPublicSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured.');
  return url;
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.');
  return key;
}

/** Server-to-server URL. Falls back to the public URL for local development
 * and environments where the app is not attached to the Supabase network. */
export function getSupabaseServerUrl(): string {
  return process.env.SUPABASE_INTERNAL_URL ?? getPublicSupabaseUrl();
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return key;
}
