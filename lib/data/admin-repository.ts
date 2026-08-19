import type { createClient } from '@/lib/supabase/client';

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export async function recordAdminActivity(supabase: BrowserSupabaseClient, input: {
  entityType: string; action: string; targetId?: string | null; targetLabel: string; summary: string; beforeData?: unknown; afterData?: unknown;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('admin_activity_logs').insert({
    actor_id: user?.id ?? null, actor_email: user?.email ?? null, entity_type: input.entityType,
    action: input.action, target_id: input.targetId ?? null, target_label: input.targetLabel || 'Registro sem nome',
    summary: input.summary, before_data: input.beforeData ?? null, after_data: input.afterData ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function persistAdminEntity(supabase: BrowserSupabaseClient, table: string, id: string | null | undefined, payload: Record<string, unknown>) {
  const request = id ? supabase.from(table).update(payload).eq('id', id) : supabase.from(table).insert(payload);
  const { error } = await request;
  if (error) throw new Error(error.message);
}

export async function removeAdminEntity(supabase: BrowserSupabaseClient, table: string, id: string, soft: boolean) {
  const request = soft ? supabase.from(table).update({ active: false }).eq('id', id) : supabase.from(table).delete().eq('id', id);
  const { error } = await request;
  if (error) throw new Error(error.message);
}

export async function removeAdminEntities(supabase: BrowserSupabaseClient, table: string, ids: string[]) {
  const { error } = await supabase.from(table).delete().in('id', ids);
  if (error) throw new Error(error.message);
}

export async function listGeneratedSolutions(supabase: BrowserSupabaseClient) {
  const { data, error } = await supabase.from('approved_solutions').select('id, solution_code, inverter_model, battery_model').eq('source_file', 'generated-rules');
  if (error) throw new Error(error.message);
  return data ?? [];
}
