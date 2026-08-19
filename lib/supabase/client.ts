import { createBrowserClient } from '@supabase/ssr';
import { AUTH_COOKIE_NAME } from './auth-cookie-name';
import { getPublicSupabaseUrl, getSupabaseAnonKey } from './config';

export function createClient() {
  return createBrowserClient(
    getPublicSupabaseUrl(),
    getSupabaseAnonKey(),
    { cookieOptions: { name: AUTH_COOKIE_NAME } }
  );
}
