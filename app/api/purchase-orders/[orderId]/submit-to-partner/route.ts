import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { buildSupplierUrl, readJsonResponse } from '@/lib/procurement/generic-json';
import { findOrderForPartner, findPartnerSupplier, findPurchaseOrderProfile, findSupplierIntegration, findSupplierProductMappings, submitOrderToPartner } from '@/lib/data/purchase-order-repository';

interface DeliveryInput {
  name?: string;
  postal_code?: string;
  address?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
}

/** Pushes an already-created purchase order to a supplier's own Partner API
 *  (see supports_partner_orders). Only one supplier implements this exact
 *  contract today (SolaX Nexo) — POST {base_url}/api/partner/orders with a
 *  fixed customer/delivery/freight/items shape — so this route hardcodes
 *  that contract rather than trying to generalize it. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let delivery: DeliveryInput;
  try {
    delivery = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }
  const requiredDeliveryFields: (keyof DeliveryInput)[] = ['postal_code', 'address', 'number', 'city', 'state'];
  const missingField = requiredDeliveryFields.find((field) => !delivery[field]?.trim());
  if (missingField) return NextResponse.json({ error: 'Preencha o endereço de entrega completo.' }, { status: 400 });

  const order = await findOrderForPartner(supabase, orderId);
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
  if (order.status !== 'requested' || order.external_order_id) {
    return NextResponse.json({ error: 'Este pedido já foi enviado ao fornecedor ou não está mais disponível para envio.' }, { status: 409 });
  }

  const profile = await findPurchaseOrderProfile(supabase, user.id);

  const service = createServiceClient();
  const supplier = await findPartnerSupplier(service, order.supplier_id);
  if (!supplier?.supports_partner_orders) return NextResponse.json({ error: 'Este fornecedor não aceita envio automático de pedidos.' }, { status: 409 });

  const integration = await findSupplierIntegration(service, order.supplier_id);
  if (!integration || !integration.enabled || !integration.base_url) return NextResponse.json({ error: 'Integração do fornecedor não configurada.' }, { status: 409 });

  const items = (order.purchase_order_items ?? []) as { product_model: string; supplier_sku: string; quantity: number }[];
  const mappings = await findSupplierProductMappings(service, order.supplier_id, items.map((item) => item.supplier_sku));
  const externalIdBySku = new Map(mappings.map((row) => [row.supplier_sku, row.external_product_id]));
  const missingProduct = items.find((item) => !externalIdBySku.get(item.supplier_sku));
  if (missingProduct) {
    return NextResponse.json({ error: `Produto ${missingProduct.product_model} ainda não foi sincronizado com o catálogo do fornecedor.` }, { status: 422 });
  }

  try {
    const url = buildSupplierUrl(integration.base_url, '/api/partner/orders');
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    if (integration.auth_type !== 'none') {
      const secret = integration.credential_env_key ? process.env[integration.credential_env_key] : undefined;
      if (!secret) throw new Error('Credencial não disponível no ambiente do servidor.');
      if (integration.auth_type === 'bearer') headers.authorization = `Bearer ${secret}`;
      else headers[integration.api_key_header || 'x-api-key'] = secret;
    }
    const customerName = profile?.company_name?.trim() || profile?.full_name?.trim() || 'Cliente';
    const body = {
      customer: {
        name: customerName,
        email: profile?.email || undefined,
        phone: profile?.phone || undefined,
        currency: order.currency,
      },
      delivery: {
        name: delivery.name?.trim() || customerName,
        postal_code: delivery.postal_code,
        address: delivery.address,
        number: delivery.number,
        complement: delivery.complement || undefined,
        district: delivery.district || undefined,
        city: delivery.city,
        state: delivery.state,
      },
      freight: { mode: 'quote' },
      items: items.map((item) => ({ catalog_id: externalIdBySku.get(item.supplier_sku), quantity: item.quantity })),
      notes: order.customer_notes || undefined,
    };
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    const payload = (await readJsonResponse(response, 1_000_000).catch(() => null)) as
      | { error?: string; sale?: { sale_number?: string; id?: string } }
      | null;
    if (!response.ok) throw new Error(payload?.error || `Fornecedor respondeu HTTP ${response.status}.`);

    const saleNumber = payload?.sale?.sale_number ?? payload?.sale?.id ?? null;
    if (!saleNumber) throw new Error('Resposta do fornecedor não trouxe um identificador do pedido.');

    await submitOrderToPartner(supabase, orderId, saleNumber, `Pedido enviado ao fornecedor. Nº ${saleNumber}.`);

    return NextResponse.json({ saleNumber, status: 'submitted' });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Falha inesperada ao enviar o pedido ao fornecedor.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
