import type { createClient } from '@/lib/supabase/client';

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export async function loadAdminSupplierWorkspace(supabase: BrowserSupabaseClient) {
  const [suppliers, integrations, mappings, orders, inverters, batteries, accessories, settings] = await Promise.all([
    supabase.from('suppliers').select('*').order('name'),
    supabase.from('supplier_integrations').select('*'),
    supabase.from('supplier_product_mappings').select('*').order('product_model'),
    supabase.from('purchase_orders').select('id, created_at, status, request_type, subtotal, currency, suppliers(name)').order('created_at', { ascending: false }).limit(100),
    supabase.from('inverters').select('model').order('model'),
    supabase.from('batteries').select('model').order('model'),
    supabase.from('accessories').select('model').order('model'),
    supabase.from('app_settings').select('max_user_suppliers').eq('id', true).single(),
  ]);
  const error = suppliers.error ?? integrations.error ?? mappings.error ?? orders.error ?? inverters.error ?? batteries.error ?? accessories.error ?? settings.error;
  return {
    error: error ? new Error(error.message) : null,
    suppliers: suppliers.data ?? [],
    integrations: integrations.data ?? [],
    mappings: mappings.data ?? [],
    orders: orders.data ?? [],
    platformModels: {
      inverter: ((inverters.data ?? []) as unknown as { model: string }[]).map((row) => row.model),
      battery: ((batteries.data ?? []) as unknown as { model: string }[]).map((row) => row.model),
      accessory: ((accessories.data ?? []) as unknown as { model: string }[]).map((row) => row.model),
    },
    maxUserSuppliers: ((settings.data as { max_user_suppliers?: number } | null)?.max_user_suppliers ?? 2),
  };
}

export async function transitionPurchaseOrder(supabase: BrowserSupabaseClient, orderId: string, status: string) {
  const { error } = await supabase.rpc('admin_transition_purchase_order', { p_order_id: orderId, p_status: status, p_message: null });
  if (error) throw new Error(error.message);
}

export async function saveSupplierRecord(supabase: BrowserSupabaseClient, id: string | null, payload: Record<string, unknown>) {
  const request = id
    ? supabase.from('suppliers').update(payload).eq('id', id).select('id').single()
    : supabase.from('suppliers').insert(payload).select('id').single();
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
}

export async function saveSupplierIntegration(supabase: BrowserSupabaseClient, payload: Record<string, unknown>) {
  const { error } = await supabase.from('supplier_integrations').upsert(payload, { onConflict: 'supplier_id' });
  if (error) throw new Error(error.message);
}

export async function addSupplierMapping(supabase: BrowserSupabaseClient, payload: Record<string, unknown>) {
  const { data, error } = await supabase.from('supplier_product_mappings').insert(payload).select('id').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function addSupplierOffer(supabase: BrowserSupabaseClient, payload: Record<string, unknown>) {
  const { error } = await supabase.from('supplier_offers').insert(payload);
  if (error) throw new Error(error.message);
}

export async function removeSupplierMapping(supabase: BrowserSupabaseClient, id: string) {
  const { error } = await supabase.from('supplier_product_mappings').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function saveSupplierLimit(supabase: BrowserSupabaseClient, value: number) {
  const { error } = await supabase.from('app_settings').update({ max_user_suppliers: value, updated_at: new Date().toISOString() }).eq('id', true);
  if (error) throw new Error(error.message);
}
