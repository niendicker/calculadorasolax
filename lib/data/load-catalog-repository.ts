import type { createClient } from '@/lib/supabase/client';
import type { LoadPresetLoad } from '@/lib/types';

type BrowserSupabaseClient = ReturnType<typeof createClient>;

async function currentUserId(supabase: BrowserSupabaseClient) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('not_authenticated');
  return data.user.id;
}

export async function listUserLoadCatalog(supabase: BrowserSupabaseClient) {
  const { data, error } = await supabase
    .from('user_load_catalog')
    .select('id, user_id, name, power_w, ip_in_ratio, created_at, updated_at')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function updateUserLoadCatalogRecord(
  supabase: BrowserSupabaseClient,
  id: string,
  payload: Record<string, unknown>
) {
  const { error } = await supabase.from('user_load_catalog').update(payload).eq('id', id);
  if (error) throw error;
}

export async function insertUserLoadCatalogRecord(
  supabase: BrowserSupabaseClient,
  input: { name: string; powerW: number; ipInRatio: number }
) {
  const { data, error } = await supabase
    .from('user_load_catalog')
    .insert({ user_id: await currentUserId(supabase), name: input.name, power_w: input.powerW, ip_in_ratio: input.ipInRatio })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteUserLoadCatalogRecord(supabase: BrowserSupabaseClient, id: string) {
  const { error } = await supabase.from('user_load_catalog').delete().eq('id', id);
  if (error) throw error;
}

export async function listUserLoadPresets(supabase: BrowserSupabaseClient) {
  const { data, error } = await supabase
    .from('user_load_presets')
    .select('id, name, description, loads')
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function insertUserLoadPreset(
  supabase: BrowserSupabaseClient,
  input: { name: string; description: string; loads: LoadPresetLoad[] }
) {
  const { data, error } = await supabase
    .from('user_load_presets')
    .insert({ user_id: await currentUserId(supabase), name: input.name, description: input.description, loads: input.loads })
    .select('id, name, description, loads')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteUserLoadPreset(supabase: BrowserSupabaseClient, id: string) {
  const { error } = await supabase.from('user_load_presets').delete().eq('id', id);
  if (error) throw error;
}
