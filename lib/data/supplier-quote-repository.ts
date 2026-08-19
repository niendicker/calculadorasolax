import type { SupabaseClient } from '@supabase/supabase-js';

type Project = { id: string; name: string };
type Profile = { full_name: string | null; company_name: string | null; email: string | null };
type SupplierContact = { id: string; name: string; email: string | null; is_default_for_all: boolean };

export async function findProjectForQuote(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase.from('projects').select('id, name').eq('id', projectId).single();
  return data as Project | null;
}

export async function findLastSupplierQuoteRequest(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase
    .from('project_events')
    .select('created_at')
    .eq('project_id', projectId)
    .eq('event_type', 'supplier_quote_requested')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { created_at: string } | null;
}

export async function findRequesterProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('profiles').select('full_name, company_name, email').eq('id', userId).single();
  return data as Profile | null;
}

export async function listPreferredSupplierIds(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', userId);
  return ((data ?? []) as unknown as { supplier_id: string }[]).map((row) => row.supplier_id);
}

export async function listAllowedSupplierContacts(
  service: SupabaseClient,
  supplierIds: string[],
  preferredIds: string[]
) {
  const { data } = await service
    .from('suppliers')
    .select('id, name, email, is_default_for_all')
    .eq('active', true)
    .eq('ordering_enabled', true)
    .in('id', supplierIds);
  const preferred = new Set(preferredIds);
  return ((data ?? []) as unknown as SupplierContact[]).filter(
    (supplier) => supplier.is_default_for_all || preferred.has(supplier.id)
  );
}

export async function recordSupplierQuoteRequest(supabase: SupabaseClient, event: Record<string, unknown>) {
  await supabase.from('project_events').insert(event);
}
