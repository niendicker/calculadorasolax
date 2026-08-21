import type { createClient } from '@/lib/supabase/client';

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export async function listProjectEvents(supabase: BrowserSupabaseClient, projectId: string) {
  const { data, error } = await supabase
    .from('project_events')
    .select('id, project_id, actor_id, event_type, from_status, to_status, message, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  return { data: (data ?? []) as unknown as Record<string, unknown>[], error };
}

export async function recordProjectEvent(supabase: BrowserSupabaseClient, event: Record<string, unknown>) {
  const { error } = await supabase.from('project_events').insert(event);
  if (error) throw new Error(error.message);
}
