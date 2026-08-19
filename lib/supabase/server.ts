import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from './auth-cookie-name';
import { getSupabaseAnonKey, getSupabaseServerUrl } from './config';

export async function createClient() {
  const cookieStore = await cookies();

  // Server-side requests go over the Docker network directly to Kong
  // instead of round-tripping through the public hostname; falls back to
  // the public URL when SUPABASE_INTERNAL_URL isn't set (e.g. local dev).
  const supabaseUrl = getSupabaseServerUrl();

  return createServerClient(
    supabaseUrl,
    getSupabaseAnonKey(),
    {
      cookieOptions: { name: AUTH_COOKIE_NAME },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}
