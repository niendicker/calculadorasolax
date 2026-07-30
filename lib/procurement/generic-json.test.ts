import { describe, expect, it } from 'vitest';
import { buildSupplierUrl, normalizeSupplierPayload } from './generic-json';

describe('generic supplier JSON connector', () => {
  it('normalizes configured nested fields and skips invalid products', () => {
    expect(normalizeSupplierPayload({ data: { rows: [
      { code: 'BAT-1', commercial: { value: '1234.50' }, available: 4, delivery: 2 },
      { code: '', commercial: { value: 10 } },
    ] } }, { items: 'data.rows', sku: 'code', price: 'commercial.value', stock: 'available', lead_days: 'delivery' })).toEqual([
      { sku: 'BAT-1', price: 1234.5, stock: 4, leadDays: 2 },
    ]);
  });

  it('requires the configured list', () => {
    expect(() => normalizeSupplierPayload({}, { items: 'products' })).toThrow(/lista configurada/);
  });

  it('accepts HTTPS public hosts and blocks local network targets', () => {
    expect(buildSupplierUrl('https://supplier.example/api/', 'v1/products').href).toBe('https://supplier.example/api/v1/products');
    expect(() => buildSupplierUrl('http://supplier.example', '')).toThrow(/HTTPS/);
    expect(() => buildSupplierUrl('https://127.0.0.1', '')).toThrow(/rede privada/);
  });
});
