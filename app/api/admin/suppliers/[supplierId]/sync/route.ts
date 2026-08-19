import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildSupplierUrl, normalizeSupplierPayload } from '@/lib/procurement/generic-json';
import { failSupplierSync, findSupplierIntegrationForSync, finishSupplierSync, listActiveSupplierMappings, saveExternalProductIds, saveSupplierOffers, startSupplierSync } from '@/lib/data/supplier-sync-repository';

/** Every table this route writes to (supplier_integrations, supplier_offers,
 *  supplier_product_mappings, supplier_sync_runs) has an "admins manage ...
 *  for all using (is_admin())" RLS policy, so — unlike routes serving
 *  anonymous customers or needing the auth admin API — this one has no
 *  actual need for a service-role client. Using the RLS-scoped `supabase`
 *  client instead means Postgres independently re-checks is_admin() on every
 *  write, instead of the admin gate below being the only thing standing
 *  between a non-admin caller and these tables. */
export async function POST(_request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

  const integration = await findSupplierIntegrationForSync(supabase, supplierId);
  if (!integration) return NextResponse.json({ error: 'Integração não configurada.' }, { status: 404 });
  if (!integration.enabled || integration.connector_type === 'manual') return NextResponse.json({ error: 'A sincronização automática não está habilitada.' }, { status: 409 });

  const run = await startSupplierSync(supabase, supplierId);
  try {
    const url = buildSupplierUrl(integration.base_url, integration.products_path);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (integration.auth_type !== 'none') {
      const secret = integration.credential_env_key ? process.env[integration.credential_env_key] : undefined;
      if (!secret) throw new Error('Credencial não disponível no ambiente do servidor.');
      if (integration.auth_type === 'bearer') headers.authorization = `Bearer ${secret}`;
      else headers[integration.api_key_header || 'x-api-key'] = secret;
    }
    const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Fornecedor respondeu HTTP ${response.status}.`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 5_000_000) throw new Error('Resposta maior que o limite de 5 MB.');
    const items = normalizeSupplierPayload(await response.json(), integration.mapping ?? {});
    const mappings = await listActiveSupplierMappings(supabase, supplierId);
    const mappingBySku = new Map(mappings.map((item) => [item.supplier_sku, item.id]));
    const rows = items.flatMap((item) => {
      const mappingId = mappingBySku.get(item.sku);
      return mappingId ? [{ mapping_id: mappingId, supplier_id: supplierId, unit_price: item.price, stock_quantity: item.stock, lead_time_days: item.leadDays, fetched_at: new Date().toISOString(), active: true }] : [];
    });
    if (rows.length) {
      await saveSupplierOffers(supabase, rows);
    }

    // Captures the supplier's own catalog id per product, needed later to
    // place an order through a supplier whose Partner API identifies
    // products by id rather than by sku (see supports_partner_orders).
    const externalIdUpdates = items.flatMap((item) => {
      const mappingId = mappingBySku.get(item.sku);
      return mappingId && item.externalId ? [{ mappingId, externalId: item.externalId }] : [];
    });
    if (externalIdUpdates.length) {
      await saveExternalProductIds(supabase, externalIdUpdates);
    }

    const status = rows.length === items.length ? 'success' : 'partial';
    const message = `${rows.length} de ${items.length} itens vinculados foram atualizados.`;
    await finishSupplierSync(supabase, supplierId, run?.id, { status, itemsReceived: items.length, itemsUpdated: rows.length, message });
    return NextResponse.json({
      received: items.length,
      updated: rows.length,
      status,
      items: items.map((item) => ({ sku: item.sku, price: item.price, stock: item.stock })),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Falha inesperada na sincronização.';
    await failSupplierSync(supabase, supplierId, run?.id, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
