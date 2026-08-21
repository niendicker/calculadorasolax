import { createBrowserClient } from '@supabase/ssr';
import { AUTH_COOKIE_NAME } from './auth-cookie-name';
import { getPublicSupabaseUrl, getSupabaseAnonKey } from './config';
import type { Database } from '@/lib/database.types';

export function createClient() {
  return createBrowserClient<Database>(
    getPublicSupabaseUrl(),
    getSupabaseAnonKey(),
    { cookieOptions: { name: AUTH_COOKIE_NAME } }
  );
}
