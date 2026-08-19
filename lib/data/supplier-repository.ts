import type { createClient } from '@/lib/supabase/client';

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export async function listOrderingSuppliers(supabase: BrowserSupabaseClient, columns: string) {
  const { data, error } = await supabase
    .from('suppliers')
    .select(columns)
    .eq('active', true)
    .eq('ordering_enabled', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function listUserSupplierPreferences(supabase: BrowserSupabaseClient, userId: string) {
  const { data, error } = await supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

export async function setUserSupplierPreference(supabase: BrowserSupabaseClient, userId: string, supplierId: string, selected: boolean) {
  const result = selected
    ? await supabase.from('user_supplier_preferences').delete().eq('user_id', userId).eq('supplier_id', supplierId)
    : await supabase.from('user_supplier_preferences').insert({ user_id: userId, supplier_id: supplierId });
  if (result.error) throw new Error(result.error.message);
}

export async function listSupplierOffers(supabase: BrowserSupabaseClient, supplierIds: string[], columns: string) {
  if (supplierIds.length === 0) return [];
  const { data, error } = await supabase.from('supplier_offers').select(columns).eq('active', true).in('supplier_id', supplierIds);
  if (error) throw error;
  return data ?? [];
}
