// @supabase/ssr defaults the session cookie name to `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
// when no explicit name is given — so the browser client (public hostname)
// and the server client (SUPABASE_INTERNAL_URL, a bare Docker service name
// with no dots) would otherwise derive two different cookie names and never
// see each other's session. Both clients pass this fixed name explicitly so
// they always agree, regardless of which URL either one connects through.
export const AUTH_COOKIE_NAME = 'sb-supabase-calculadora-auth-token';
