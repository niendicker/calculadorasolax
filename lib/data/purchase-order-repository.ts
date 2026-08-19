import type { SupabaseClient } from '@supabase/supabase-js';

export async function findOrderForEmail(supabase: SupabaseClient, orderId: string) {
  const { data } = await supabase
    .from('purchase_orders')
    .select('id, supplier_id, currency, subtotal, status, delivery_address, purchase_order_items(product_model, supplier_sku, quantity, unit_price, line_total)')
    .eq('id', orderId)
    .single();
  return data;
}

export async function findLastSupplierEmailEvent(supabase: SupabaseClient, orderId: string) {
  const { data } = await supabase
    .from('purchase_order_events')
    .select('created_at')
    .eq('order_id', orderId)
    .eq('event_type', 'supplier_email_sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { created_at: string } | null;
}

export async function findPurchaseOrderProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('profiles').select('full_name, company_name, phone, email').eq('id', userId).single();
  return data;
}

export async function findSupplierContact(service: SupabaseClient, supplierId: string) {
  const { data } = await service.from('suppliers').select('name, email').eq('id', supplierId).single();
  return data as { name: string; email: string | null } | null;
}

export async function recordSupplierEmailEvent(service: SupabaseClient, event: Record<string, unknown>) {
  const { error } = await service.from('purchase_order_events').insert(event);
  if (error) throw new Error(error.message);
}

export async function findOrderForPartner(supabase: SupabaseClient, orderId: string) {
  const { data } = await supabase
    .from('purchase_orders')
    .select('id, supplier_id, currency, customer_notes, status, external_order_id, purchase_order_items(product_model, supplier_sku, quantity)')
    .eq('id', orderId)
    .single();
  return data;
}

export async function findPartnerSupplier(service: SupabaseClient, supplierId: string) {
  const { data } = await service.from('suppliers').select('supports_partner_orders').eq('id', supplierId).single();
  return data as { supports_partner_orders: boolean } | null;
}

export async function findSupplierIntegration(service: SupabaseClient, supplierId: string) {
  const { data } = await service
    .from('supplier_integrations')
    .select('base_url, auth_type, credential_env_key, api_key_header, enabled')
    .eq('supplier_id', supplierId)
    .single();
  return data;
}

export async function findSupplierProductMappings(service: SupabaseClient, supplierId: string, skus: string[]) {
  const { data } = await service
    .from('supplier_product_mappings')
    .select('supplier_sku, external_product_id')
    .eq('supplier_id', supplierId)
    .in('supplier_sku', skus);
  return data ?? [];
}

export async function submitOrderToPartner(supabase: SupabaseClient, orderId: string, externalOrderId: string, message: string) {
  const { error } = await supabase.rpc('submit_purchase_order_to_partner', {
    p_order_id: orderId,
    p_external_order_id: externalOrderId,
    p_message: message,
  });
  if (error) throw new Error(error.message);
}
