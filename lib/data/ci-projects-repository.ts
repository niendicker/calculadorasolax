// Mirrors projects-repository.ts exactly, for C&I projects — its own file
// rather than branching the residential one, so nothing there needs to
// change for C&I to exist (docs/CI-MODULE-PLAN.md's "não ampliar
// indiscriminadamente" principle).

import { createClient } from '@/lib/supabase/client';
import type { ProjectStatus } from '@/lib/types';
import type { Json } from '@/lib/database.types';

export type CiProjectRecord = {
  user_id: string;
  client_id: string | null;
  name: string;
  address: Json;
  notes: string | null;
  installation_type: 'commercial_industrial';
  calculation_options: Json;
  updated_at: string;
};

const SELECT_COLUMNS = 'id, name, client_id, address, notes, installation_type, calculation_options, calculation_result, calculation_version, status, updated_at';

export async function saveCiProjectRecord(id: string | null, payload: CiProjectRecord) {
  const supabase = createClient();
  const request = id
    ? supabase.from('projects').update(payload).eq('id', id).select(SELECT_COLUMNS).single()
    : supabase.from('projects').insert(payload).select(SELECT_COLUMNS).single();
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

export async function deleteCiProjectRecord(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function updateCiProjectStatusRecord(id: string, status: ProjectStatus) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function listCiProjectRecords() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select(SELECT_COLUMNS)
    .eq('installation_type', 'commercial_industrial')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
