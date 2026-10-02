import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findLastSupplierEmailEvent,
  findOrderForEmail,
  findOrderForPartner,
  findPartnerSupplier,
  findPurchaseOrderProfile,
  findSupplierContact,
  findSupplierIntegration,
  findSupplierProductMappings,
  recordSupplierEmailEvent,
  submitOrderToPartner,
} from './purchase-order-repository';

type QueryResult = { data: unknown; error: Error | null };
type QueryBuilder = Record<string, ReturnType<typeof vi.fn>> & {
  then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
};

function makeQuery(result: QueryResult): QueryBuilder {
  const builder = {} as QueryBuilder;
  for (const method of ['select', 'eq', 'order', 'limit', 'in', 'insert']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function makeClient(result: QueryResult = { data: null, error: null }) {
  const query = makeQuery(result);
  const from = vi.fn(() => query);
  const rpc = vi.fn();
  const client = { from, rpc } as unknown as SupabaseClient;
  return { client, from, query, rpc };
}

describe('purchase-order-repository', () => {
  it('busca um pedido para envio por email e o último evento de email', async () => {
    const order = { id: 'order-1', supplier_id: 'supplier-1', status: 'pending' };
    const { client, from, query } = makeClient({ data: order, error: null });

    await expect(findOrderForEmail(client, 'order-1')).resolves.toEqual(order);
    expect(from).toHaveBeenCalledWith('purchase_orders');
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('purchase_order_items'));
    expect(query.eq).toHaveBeenCalledWith('id', 'order-1');
    expect(query.single).toHaveBeenCalledTimes(1);

    const event = { created_at: '2026-01-01T00:00:00.000Z' };
    const eventClient = makeClient({ data: event, error: null });
    await expect(findLastSupplierEmailEvent(eventClient.client, 'order-1')).resolves.toEqual(event);
    expect(eventClient.from).toHaveBeenCalledWith('purchase_order_events');
    expect(eventClient.query.eq).toHaveBeenNthCalledWith(1, 'order_id', 'order-1');
    expect(eventClient.query.eq).toHaveBeenNthCalledWith(2, 'event_type', 'supplier_email_sent');
    expect(eventClient.query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(eventClient.query.limit).toHaveBeenCalledWith(1);

    const empty = makeClient({ data: null, error: null });
    await expect(findLastSupplierEmailEvent(empty.client, 'order-1')).resolves.toBeNull();
  });

  it('busca o perfil do comprador e o contato do fornecedor', async () => {
    const profile = { full_name: 'Marcelo', company_name: 'SolaX', phone: '5511999999999', email: 'user@example.com' };
    const profileClient = makeClient({ data: profile, error: null });
    await expect(findPurchaseOrderProfile(profileClient.client, 'user-1')).resolves.toEqual(profile);
    expect(profileClient.from).toHaveBeenCalledWith('profiles');
    expect(profileClient.query.select).toHaveBeenCalledWith('full_name, company_name, phone, email');

    const contact = { name: 'Fornecedor', email: null };
    const contactClient = makeClient({ data: contact, error: null });
    await expect(findSupplierContact(contactClient.client, 'supplier-1')).resolves.toEqual(contact);
    expect(contactClient.from).toHaveBeenCalledWith('suppliers');
    expect(contactClient.query.select).toHaveBeenCalledWith('name, email');
    expect(contactClient.query.eq).toHaveBeenCalledWith('id', 'supplier-1');
  });

  it('busca pedido, capacidade de integração e configuração do parceiro', async () => {
    const order = { id: 'order-1', external_order_id: null, purchase_order_items: [] };
    const orderClient = makeClient({ data: order, error: null });
    await expect(findOrderForPartner(orderClient.client, 'order-1')).resolves.toEqual(order);
    expect(orderClient.query.select).toHaveBeenCalledWith(expect.stringContaining('customer_notes'));

    const supplierClient = makeClient({ data: { supports_partner_orders: true }, error: null });
    await expect(findPartnerSupplier(supplierClient.client, 'supplier-1')).resolves.toEqual({ supports_partner_orders: true });
    expect(supplierClient.query.select).toHaveBeenCalledWith('supports_partner_orders');

    const integration = { base_url: 'https://supplier.example', auth_type: 'api_key', enabled: true };
    const integrationClient = makeClient({ data: integration, error: null });
    await expect(findSupplierIntegration(integrationClient.client, 'supplier-1')).resolves.toEqual(integration);
    expect(integrationClient.query.select).toHaveBeenCalledWith('base_url, auth_type, credential_env_key, api_key_header, enabled');
    expect(integrationClient.query.eq).toHaveBeenCalledWith('supplier_id', 'supplier-1');
  });

  it('lista mapeamentos pelos SKUs e normaliza resposta sem dados', async () => {
    const mappings = [{ supplier_sku: 'SKU-1', external_product_id: 'external-1' }];
    const { client, query } = makeClient({ data: mappings, error: null });

    await expect(findSupplierProductMappings(client, 'supplier-1', ['SKU-1'])).resolves.toEqual(mappings);
    expect(query.select).toHaveBeenCalledWith('supplier_sku, external_product_id');
    expect(query.eq).toHaveBeenCalledWith('supplier_id', 'supplier-1');
    expect(query.in).toHaveBeenCalledWith('supplier_sku', ['SKU-1']);

    const empty = makeClient({ data: null, error: new Error('consulta falhou') });
    await expect(findSupplierProductMappings(empty.client, 'supplier-1', [])).resolves.toEqual([]);
  });

  it('registra o evento de email e converte erro em Error de domínio', async () => {
    const event = { order_id: 'order-1', event_type: 'supplier_email_sent' };
    const success = makeClient({ data: null, error: null });
    await expect(recordSupplierEmailEvent(success.client, event)).resolves.toBeUndefined();
    expect(success.from).toHaveBeenCalledWith('purchase_order_events');
    expect(success.query.insert).toHaveBeenCalledWith(event);

    const failure = makeClient({ data: null, error: new Error('insert failed') });
    await expect(recordSupplierEmailEvent(failure.client, event)).rejects.toThrow('insert failed');
  });

  it('submete o pedido ao parceiro com os parâmetros da RPC', async () => {
    const { client, rpc } = makeClient();
    const result = { error: null };
    rpc.mockResolvedValue(result);

    await expect(submitOrderToPartner(client, 'order-1', 'external-1', 'Pedido enviado')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('submit_purchase_order_to_partner', {
      p_order_id: 'order-1',
      p_external_order_id: 'external-1',
      p_message: 'Pedido enviado',
    });
  });

  it('converte erro da RPC de submissão em Error', async () => {
    const { client, rpc } = makeClient();
    rpc.mockResolvedValue({ error: new Error('parceiro indisponível') });

    await expect(submitOrderToPartner(client, 'order-1', 'external-1', 'retry')).rejects.toThrow('parceiro indisponível');
  });
});
