import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { buildSupplierUrl, normalizeSupplierPayload } from '@/lib/procurement/generic-json';

export async function POST(_request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: integration, error } = await service.from('supplier_integrations').select('*').eq('supplier_id', supplierId).single();
  if (error || !integration) return NextResponse.json({ error: 'Integração não configurada.' }, { status: 404 });
  if (!integration.enabled || integration.connector_type === 'manual') return NextResponse.json({ error: 'A sincronização automática não está habilitada.' }, { status: 409 });

  const { data: run } = await service.from('supplier_sync_runs').insert({ supplier_id: supplierId, status: 'running' }).select('id').single();
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
    const { data: mappings } = await service.from('supplier_product_mappings').select('id, supplier_sku').eq('supplier_id', supplierId).eq('active', true);
    const mappingBySku = new Map((mappings ?? []).map((item) => [item.supplier_sku, item.id]));
    const rows = items.flatMap((item) => {
      const mappingId = mappingBySku.get(item.sku);
      return mappingId ? [{ mapping_id: mappingId, supplier_id: supplierId, unit_price: item.price, stock_quantity: item.stock, lead_time_days: item.leadDays, fetched_at: new Date().toISOString(), active: true }] : [];
    });
    if (rows.length) {
      const { error: upsertError } = await service.from('supplier_offers').upsert(rows, { onConflict: 'mapping_id' });
      if (upsertError) throw upsertError;
    }

    // Captures the supplier's own catalog id per product, needed later to
    // place an order through a supplier whose Partner API identifies
    // products by id rather than by sku (see supports_partner_orders).
    const externalIdUpdates = items.flatMap((item) => {
      const mappingId = mappingBySku.get(item.sku);
      return mappingId && item.externalId ? [{ mappingId, externalId: item.externalId }] : [];
    });
    if (externalIdUpdates.length) {
      const results = await Promise.all(externalIdUpdates.map(({ mappingId, externalId }) =>
        service.from('supplier_product_mappings').update({ external_product_id: externalId }).eq('id', mappingId)
      ));
      const updateError = results.find((result) => result.error)?.error;
      if (updateError) throw updateError;
    }

    const status = rows.length === items.length ? 'success' : 'partial';
    const message = `${rows.length} de ${items.length} itens vinculados foram atualizados.`;
    await Promise.all([
      service.from('supplier_integrations').update({ last_sync_at: new Date().toISOString(), last_sync_status: status, last_sync_message: message }).eq('supplier_id', supplierId),
      run?.id ? service.from('supplier_sync_runs').update({ status, items_received: items.length, items_updated: rows.length, message, finished_at: new Date().toISOString() }).eq('id', run.id) : Promise.resolve(),
    ]);
    return NextResponse.json({
      received: items.length,
      updated: rows.length,
      status,
      items: items.map((item) => ({ sku: item.sku, price: item.price, stock: item.stock })),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Falha inesperada na sincronização.';
    await Promise.all([
      service.from('supplier_integrations').update({ last_sync_at: new Date().toISOString(), last_sync_status: 'error', last_sync_message: message }).eq('supplier_id', supplierId),
      run?.id ? service.from('supplier_sync_runs').update({ status: 'error', message, finished_at: new Date().toISOString() }).eq('id', run.id) : Promise.resolve(),
    ]);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
