import type { createClient } from '@/lib/supabase/client';
import { CURRENT_LEGAL_DOCUMENT_VERSION } from '@/lib/legal-documents';

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export async function saveProfileRecord(supabase: BrowserSupabaseClient, profile: Record<string, unknown>) {
  const { error } = await supabase.from('profiles').upsert(profile);
  if (error) throw new Error(error.message);
}

export async function acceptTermsRecord(supabase: BrowserSupabaseClient, userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_accepted_version: CURRENT_LEGAL_DOCUMENT_VERSION,
    })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
