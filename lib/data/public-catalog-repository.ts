import type { createClient } from '@/lib/supabase/client';

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export async function listPublicLoadPresets(supabase: BrowserSupabaseClient) {
  const { data, error } = await supabase.from('load_presets').select('id, name, description, loads').order('display_order');
  return { data: data ?? [], error };
}
