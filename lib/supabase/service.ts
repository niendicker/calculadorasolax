import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerUrl, getSupabaseServiceRoleKey } from './config';
import type { Database } from '@/lib/database.types';

/** Creates the privileged client used only by server routes and server pages.
 * Never import this module from a Client Component. */
export function createServiceClient() {
  return createClient<Database>(getSupabaseServerUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
