import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  failSupplierSync,
  finishSupplierSync,
  findSupplierIntegrationForSync,
  listActiveSupplierMappings,
  saveExternalProductIds,
  saveSupplierOffers,
  startSupplierSync,
} from './supplier-sync-repository';

type QueryResult = { data: unknown; error: Error | null };
type QueryBuilder = Record<string, ReturnType<typeof vi.fn>> & {
  then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
};

function makeQuery(result: QueryResult): QueryBuilder {
  const builder = {} as QueryBuilder;
  for (const method of ['select', 'insert', 'update', 'upsert', 'eq']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function makeClient(result: QueryResult = { data: null, error: null }) {
  const query = makeQuery(result);
  const from = vi.fn(() => query);
  const client = { from } as unknown as SupabaseClient;
  return { client, from, query };
}

describe('supplier-sync-repository', () => {
  it('busca a configuração de integração do fornecedor', async () => {
    const integration = { supplier_id: 'supplier-1', connector_type: 'generic_json', enabled: true };
    const { client, from, query } = makeClient({ data: integration, error: null });

    await expect(findSupplierIntegrationForSync(client, 'supplier-1')).resolves.toEqual(integration);
    expect(from).toHaveBeenCalledWith('supplier_integrations');
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('supplier_id, connector_type'));
    expect(query.eq).toHaveBeenCalledWith('supplier_id', 'supplier-1');
    expect(query.single).toHaveBeenCalledTimes(1);
  });

  it('inicia uma execução e aceita quando o banco não retorna o id', async () => {
    const { client, query } = makeClient({ data: { id: 'run-1' }, error: null });

    await expect(startSupplierSync(client, 'supplier-1')).resolves.toEqual({ id: 'run-1' });
    expect(query.insert).toHaveBeenCalledWith({ supplier_id: 'supplier-1', status: 'running' });
    expect(query.select).toHaveBeenCalledWith('id');

    const empty = makeClient({ data: null, error: new Error('não iniciou') });
    await expect(startSupplierSync(empty.client, 'supplier-1')).resolves.toBeNull();
  });

  it('lista apenas os mapeamentos ativos e normaliza ausência de dados', async () => {
    const mappings = [{ id: 'mapping-1', supplier_sku: 'SKU-1' }];
    const { client, query } = makeClient({ data: mappings, error: null });

    await expect(listActiveSupplierMappings(client, 'supplier-1')).resolves.toEqual(mappings);
    expect(query.select).toHaveBeenCalledWith('id, supplier_sku');
    expect(query.eq).toHaveBeenNthCalledWith(1, 'supplier_id', 'supplier-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'active', true);

    const empty = makeClient({ data: null, error: new Error('consulta falhou') });
    await expect(listActiveSupplierMappings(empty.client, 'supplier-1')).resolves.toEqual([]);
  });

  it('não consulta ofertas quando não há linhas e faz upsert quando há dados', async () => {
    const empty = makeClient();
    await expect(saveSupplierOffers(empty.client, [])).resolves.toBeUndefined();
    expect(empty.from).not.toHaveBeenCalled();

    const rows = [{ mapping_id: 'mapping-1', unit_price: 1200 }];
    const { client, from, query } = makeClient({ data: null, error: null });
    await expect(saveSupplierOffers(client, rows)).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledWith('supplier_offers');
    expect(query.upsert).toHaveBeenCalledWith(rows, { onConflict: 'mapping_id' });
  });

  it('propaga erro ao salvar ofertas', async () => {
    const error = new Error('upsert rejeitado');
    const { client } = makeClient({ data: null, error });

    await expect(saveSupplierOffers(client, [{ mapping_id: 'mapping-1' }])).rejects.toThrow('upsert rejeitado');
  });

  it('atualiza os IDs externos em paralelo e identifica erro em qualquer atualização', async () => {
    const first = makeQuery({ data: null, error: null });
    const second = makeQuery({ data: null, error: null });
    const from = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const client = { from } as unknown as SupabaseClient;
    const updates = [
      { mappingId: 'mapping-1', externalId: 'external-1' },
      { mappingId: 'mapping-2', externalId: 'external-2' },
    ];

    await expect(saveExternalProductIds(client, updates)).resolves.toBeUndefined();
    expect(first.update).toHaveBeenCalledWith({ external_product_id: 'external-1' });
    expect(first.eq).toHaveBeenCalledWith('id', 'mapping-1');
    expect(second.update).toHaveBeenCalledWith({ external_product_id: 'external-2' });
    expect(second.eq).toHaveBeenCalledWith('id', 'mapping-2');

    const failed = makeQuery({ data: null, error: new Error('mapping update failed') });
    const failedClient = { from: vi.fn(() => failed) } as unknown as SupabaseClient;
    await expect(saveExternalProductIds(failedClient, [{ mappingId: 'mapping-1', externalId: 'external-1' }])).rejects.toThrow('mapping update failed');
  });

  it('finaliza uma sincronização com e sem runId', async () => {
    const result = { status: 'completed', itemsReceived: 12, itemsUpdated: 8, message: 'ok' };
    const withRun = makeClient();
    await expect(finishSupplierSync(withRun.client, 'supplier-1', 'run-1', result)).resolves.toBeUndefined();
    expect(withRun.from).toHaveBeenNthCalledWith(1, 'supplier_integrations');
    expect(withRun.from).toHaveBeenNthCalledWith(2, 'supplier_sync_runs');
    expect(withRun.query.update).toHaveBeenCalledWith(expect.objectContaining({ last_sync_status: 'completed', last_sync_message: 'ok', last_sync_at: expect.any(String) }));
    expect(withRun.query.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', items_received: 12, items_updated: 8, message: 'ok', finished_at: expect.any(String) }));

    const withoutRun = makeClient();
    await expect(finishSupplierSync(withoutRun.client, 'supplier-1', undefined, result)).resolves.toBeUndefined();
    expect(withoutRun.from).toHaveBeenCalledTimes(1);
    expect(withoutRun.from).toHaveBeenCalledWith('supplier_integrations');
  });

  it('registra o estado de erro com e sem runId', async () => {
    const withRun = makeClient();
    await expect(failSupplierSync(withRun.client, 'supplier-1', 'run-1', 'timeout')).resolves.toBeUndefined();
    expect(withRun.from).toHaveBeenNthCalledWith(1, 'supplier_integrations');
    expect(withRun.from).toHaveBeenNthCalledWith(2, 'supplier_sync_runs');
    expect(withRun.query.update).toHaveBeenCalledWith(expect.objectContaining({ last_sync_status: 'error', last_sync_message: 'timeout', last_sync_at: expect.any(String) }));
    expect(withRun.query.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', message: 'timeout', finished_at: expect.any(String) }));

    const withoutRun = makeClient();
    await expect(failSupplierSync(withoutRun.client, 'supplier-1', undefined, 'sem execução')).resolves.toBeUndefined();
    expect(withoutRun.from).toHaveBeenCalledTimes(1);
  });
});
