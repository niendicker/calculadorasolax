import { describe, expect, it } from 'vitest';
import { buildSupplierUrl, normalizeSupplierPayload, readJsonResponse } from './generic-json';

describe('generic supplier JSON connector', () => {
  it('normalizes configured nested fields and skips invalid products', () => {
    expect(normalizeSupplierPayload({ data: { rows: [
      { code: 'BAT-1', commercial: { value: '1234.50' }, available: 4, delivery: 2 },
      { code: '', commercial: { value: 10 } },
    ] } }, { items: 'data.rows', sku: 'code', price: 'commercial.value', stock: 'available', lead_days: 'delivery' })).toEqual([
      { sku: 'BAT-1', price: 1234.5, stock: 4, leadDays: 2, externalId: null },
    ]);
  });

  it('captures the supplier catalog id from the configured field, defaulting to "id"', () => {
    expect(normalizeSupplierPayload({ items: [
      { id: 'ext-1', sku: 'BAT-1', price: 100 },
    ] }, {})).toEqual([
      { sku: 'BAT-1', price: 100, stock: null, leadDays: null, externalId: 'ext-1' },
    ]);
    expect(normalizeSupplierPayload({ items: [
      { catalogId: 'ext-2', sku: 'BAT-2', price: 200 },
    ] }, { catalog_id: 'catalogId' })).toEqual([
      { sku: 'BAT-2', price: 200, stock: null, leadDays: null, externalId: 'ext-2' },
    ]);
  });

  it('requires the configured list', () => {
    expect(() => normalizeSupplierPayload({}, { items: 'products' })).toThrow(/lista configurada/);
  });

  it('accepts HTTPS public hosts and blocks local network targets', () => {
    expect(buildSupplierUrl('https://supplier.example/api/', 'v1/products').href).toBe('https://supplier.example/api/v1/products');
    expect(() => buildSupplierUrl('http://supplier.example', '')).toThrow(/HTTPS/);
    expect(() => buildSupplierUrl('https://127.0.0.1', '')).toThrow(/rede privada/);
    expect(() => buildSupplierUrl('https://172.16.0.1', '')).toThrow(/rede privada/);
    expect(() => buildSupplierUrl('https://[::1]', '')).toThrow(/rede privada/);
    expect(() => buildSupplierUrl('https://[::ffff:c0a8:101]', '')).toThrow(/rede privada/);
    expect(() => buildSupplierUrl('https://user:secret@supplier.example', '')).toThrow(/credenciais/);
  });

  it('enforces a byte limit even when content-length is absent', async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"items":"'));
        controller.enqueue(new Uint8Array(20));
        controller.close();
      },
    }));

    await expect(readJsonResponse(response, 10)).rejects.toThrow(/limite/);
  });
});
