import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { modularFixture, modularOptions } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import { invokeCommercialIndustrialCalculation } from './commercial-industrial-calculation-repository';
const mocks = vi.hoisted(() => ({ catalog: vi.fn() }));
vi.mock('./ci-modular-catalog-repository', () => ({ loadCiModularCatalog: mocks.catalog }));
beforeEach(() => { vi.clearAllMocks(); mocks.catalog.mockResolvedValue(modularFixture()); });

function client(prices: Record<string, number | null>) {
  const lookups: Record<string, unknown>[] = [];
  const invoke = vi.fn();
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
  return { invoke, getUser, lookups, db: { auth: { getUser }, functions: { invoke }, from: (table: string) => {
    expect(table).toBe('user_stock_items');
    const where: Record<string, unknown> = {}; lookups.push(where);
    const query = { select: () => query, eq: (key: string, value: unknown) => { where[key] = value; return query; }, maybeSingle: async () => ({ data: prices[String(where.product_model)] === undefined ? null : { unit_value: prices[String(where.product_model)] }, error: null }) };
    return query;
  } } as unknown as SupabaseClient };
}

describe('modular calculation server path', () => {
  it('uses approved live catalog IDs and owner-specific component prices without sending modular options to the legacy Edge Function', async () => {
    const catalog = modularFixture(); catalog.rules[0].controller_accessory_id = 'controller'; catalog.accessories.push({ id: 'controller', model: 'Controle teste', active: true }); mocks.catalog.mockResolvedValue(catalog);
    const db = client({ 'PCS teste 100': 40000, 'Rack teste 100': 30000, 'Controle teste': 1500 });
    const result = await invokeCommercialIndustrialCalculation(db.db, { options: { ...modularOptions() }, unitPriceBrl: 0 });
    expect(result.error).toBeNull();
    expect(result.data?.engineVersion).toBe('ci-modular-v1');
    expect(result.data?.inputFingerprint).toHaveLength(64);
    expect(result.data?.scenarios[0].capex).toBe(101500);
    expect(result.data?.assumptions.equipment?.compatibility.revision).toBe('Teste 1');
    expect(result.data?.assumptions.equipment?.prices.controllerUnitBrl).toBe(1500);
    expect(db.lookups).toHaveLength(3);
    expect(db.lookups.every((where) => where.user_id === 'owner-1')).toBe(true);
    expect(db.invoke).not.toHaveBeenCalled();
    expect(db.getUser).toHaveBeenCalledTimes(1);
  });

  it('blocks missing component prices and never assumes that a missing price is zero', async () => {
    const db = client({ 'PCS teste 100': 40000 });
    const result = await invokeCommercialIndustrialCalculation(db.db, { options: { ...modularOptions() }, unitPriceBrl: 0 });
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: 'ci_modular', message: expect.stringContaining('Rack teste 100') });
    expect(db.invoke).not.toHaveBeenCalled();
  });
});
