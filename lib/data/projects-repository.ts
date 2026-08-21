import { createClient } from '@/lib/supabase/client';
import type { ProjectStatus } from '@/lib/types';
import type { Json } from '@/lib/database.types';

export type ProjectRecord = {
  user_id: string;
  client_id: string | null;
  name: string;
  address: Json;
  notes: string | null;
  residential_options: Json;
  solution: Json;
  services: Json;
  updated_at: string;
};

export async function saveProjectRecord(id: string | null, payload: ProjectRecord) {
  const supabase = createClient();
  const request = id
    ? supabase.from('projects').update(payload).eq('id', id).select('id, name, client_id, address, notes, residential_options, solution, services, status, updated_at').single()
    : supabase.from('projects').insert(payload).select('id, name, client_id, address, notes, residential_options, solution, services, status, updated_at').single();
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

export async function deleteProjectRecord(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function updateProjectStatusRecord(id: string, status: ProjectStatus) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, client_id, address, notes, residential_options, solution, services, status, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function listProjectRecords() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, name, client_id, address, notes, residential_options, solution, services, status, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCurrentUserId() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('not_authenticated');
  return data.user.id;
}

export async function insertProjectEvent(event: {
  project_id: string;
  actor_id: string | null;
  event_type: string;
  from_status: ProjectStatus;
  to_status: ProjectStatus;
}) {
  const supabase = createClient();
  await supabase.from('project_events').insert(event);
}
