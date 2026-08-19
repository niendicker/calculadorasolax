import type { createClient } from '@/lib/supabase/client';

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export async function listOrderingSuppliers(supabase: BrowserSupabaseClient, columns: string) {
  const { data, error } = await supabase
    .from('suppliers')
    .select(columns)
    .eq('active', true)
    .eq('ordering_enabled', true)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listUserSupplierPreferences(supabase: BrowserSupabaseClient, userId: string) {
  const { data, error } = await supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setUserSupplierPreference(supabase: BrowserSupabaseClient, userId: string, supplierId: string, selected: boolean) {
  const result = selected
    ? await supabase.from('user_supplier_preferences').delete().eq('user_id', userId).eq('supplier_id', supplierId)
    : await supabase.from('user_supplier_preferences').insert({ user_id: userId, supplier_id: supplierId });
  if (result.error) throw new Error(result.error.message);
}

export async function listSupplierOffers(
  supabase: BrowserSupabaseClient,
  supplierIds: string[],
  columns: string,
  options: { queryWhenEmpty?: boolean } = {}
) {
  if (supplierIds.length === 0 && !options.queryWhenEmpty) return [];
  const { data, error } = await supabase
    .from('supplier_offers')
    .select(columns)
    .eq('active', true)
    .in('supplier_id', supplierIds)
    .limit(300)
    .order('unit_price');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadSupplierWorkspace(supabase: BrowserSupabaseClient) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const [supplierResult, settingsResult, preferencesResult, orderResult] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, description, order_mode, is_default_for_all, supports_partner_orders, email, logo_url, website_url')
      .eq('active', true)
      .eq('ordering_enabled', true)
      .order('name'),
    userId
      ? supabase.from('app_settings').select('max_user_suppliers').eq('id', true).single()
      : Promise.resolve({ data: null, error: null }),
    userId
      ? supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('purchase_orders')
      .select(
        'id, supplier_id, created_at, request_type, status, currency, subtotal, total_amount, external_order_id, delivery_address, project_id, projects(name), suppliers(name), purchase_order_items(id, product_model, supplier_sku, quantity, unit_price, line_total)'
      )
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  const loadError = supplierResult.error ?? settingsResult.error ?? preferencesResult.error ?? orderResult.error;
  if (loadError) throw new Error(loadError.message);

  const suppliers = (supplierResult.data ?? []) as unknown as { id: string; is_default_for_all: boolean }[];
  const defaultSupplierIds = new Set(suppliers.filter((supplier) => supplier.is_default_for_all).map((supplier) => supplier.id));
  const preferredIds = ((preferencesResult.data ?? []) as unknown as { supplier_id: string }[])
    .map((row) => row.supplier_id)
    .filter((id) => !defaultSupplierIds.has(id));
  const allowedSupplierIds = [...new Set([...defaultSupplierIds, ...preferredIds])];
  const offers = await listSupplierOffers(
    supabase,
    allowedSupplierIds,
    'id, supplier_id, unit_price, stock_quantity, lead_time_days, minimum_quantity, valid_until, supplier_product_mappings!inner(product_type, product_model, supplier_sku, pack_quantity), suppliers!inner(name, currency, order_mode, minimum_order_value)',
    { queryWhenEmpty: true }
  );

  return {
    suppliers: supplierResult.data ?? [],
    maxUserSuppliers: ((settingsResult.data as { max_user_suppliers?: number } | null)?.max_user_suppliers ?? 2),
    preferredIds,
    offers,
    orders: orderResult.data ?? [],
  };
}
