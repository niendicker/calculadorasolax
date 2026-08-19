import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerUrl, getSupabaseServiceRoleKey } from './config';

/** Creates the privileged client used only by server routes and server pages.
 * Never import this module from a Client Component. */
export function createServiceClient() {
  return createClient(getSupabaseServerUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
