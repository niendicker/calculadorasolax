import type { SupabaseClient } from '@supabase/supabase-js';

export async function findSupplierIntegrationForSync(supabase: SupabaseClient, supplierId: string) {
  const { data } = await supabase.from('supplier_integrations').select('supplier_id, connector_type, base_url, products_path, auth_type, credential_env_key, api_key_header, enabled, mapping').eq('supplier_id', supplierId).single();
  return data;
}

export async function startSupplierSync(supabase: SupabaseClient, supplierId: string) {
  const { data } = await supabase.from('supplier_sync_runs').insert({ supplier_id: supplierId, status: 'running' }).select('id').single();
  return data as { id: string } | null;
}

export async function listActiveSupplierMappings(supabase: SupabaseClient, supplierId: string) {
  const { data } = await supabase.from('supplier_product_mappings').select('id, supplier_sku').eq('supplier_id', supplierId).eq('active', true);
  return (data ?? []) as unknown as { id: string; supplier_sku: string }[];
}

export async function saveSupplierOffers(supabase: SupabaseClient, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await supabase.from('supplier_offers').upsert(rows, { onConflict: 'mapping_id' });
  if (error) throw new Error(error.message);
}

export async function saveExternalProductIds(supabase: SupabaseClient, updates: { mappingId: string; externalId: string }[]) {
  const results = await Promise.all(
    updates.map(({ mappingId, externalId }) =>
      supabase.from('supplier_product_mappings').update({ external_product_id: externalId }).eq('id', mappingId)
    )
  );
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(error.message);
}

export async function finishSupplierSync(
  supabase: SupabaseClient,
  supplierId: string,
  runId: string | undefined,
  result: { status: string; itemsReceived: number; itemsUpdated: number; message: string }
) {
  await Promise.all([
    supabase.from('supplier_integrations').update({ last_sync_at: new Date().toISOString(), last_sync_status: result.status, last_sync_message: result.message }).eq('supplier_id', supplierId),
    runId ? supabase.from('supplier_sync_runs').update({ status: result.status, items_received: result.itemsReceived, items_updated: result.itemsUpdated, message: result.message, finished_at: new Date().toISOString() }).eq('id', runId) : Promise.resolve(),
  ]);
}

export async function failSupplierSync(supabase: SupabaseClient, supplierId: string, runId: string | undefined, message: string) {
  await Promise.all([
    supabase.from('supplier_integrations').update({ last_sync_at: new Date().toISOString(), last_sync_status: 'error', last_sync_message: message }).eq('supplier_id', supplierId),
    runId ? supabase.from('supplier_sync_runs').update({ status: 'error', message, finished_at: new Date().toISOString() }).eq('id', runId) : Promise.resolve(),
  ]);
}
