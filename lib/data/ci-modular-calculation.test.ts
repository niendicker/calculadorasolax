import { stsFixture, stsBackup } from '@/supabase/functions/_shared/commercial-industrial/sts.test-fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { modularFixture, modularOptions } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import { invokeCommercialIndustrialCalculation } from './commercial-industrial-calculation-repository';
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), sts: vi.fn() }));
vi.mock('./ci-sts-repository', () => ({ loadCiStsContext: mocks.sts }));
vi.mock('./ci-modular-catalog-repository', () => ({ loadCiModularCatalog: mocks.catalog }));
beforeEach(() => { vi.clearAllMocks(); mocks.catalog.mockResolvedValue(modularFixture()); mocks.sts.mockResolvedValue(stsFixture()); });

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
    expect(result.data?.engineVersion).toBe('ci-modular-v2');
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

it('resolves STS on the server and snapshots its approval and price for modular scenarios', async () => {
  const options=modularOptions();options.backup={...stsBackup(),targetPowerKw:20,targetPeakPowerKw:20,autonomyHours:0.1};
  const db=client({'PCS teste 100':40000,'Rack teste 100':30000});
  const res=await invokeCommercialIndustrialCalculation(db.db,{options:{...options},unitPriceBrl:0});
  expect(res.error).toBeNull();
  expect(mocks.sts).toHaveBeenCalledWith(db.db,expect.objectContaining({pcsId:modularFixture().pcs[0].inverter_id}),null);
  expect(res.data?.stsContext?.catalog.rules[0].revision).toBe('1');
  expect(res.data?.scenarios[0].sts?.selected?.totalBrl).toBe(9000);
  expect(res.data?.scenarios[0].capex).toBe(109000);
  expect(db.invoke).not.toHaveBeenCalled();
});

it('calculates integrated BESS with STS locally and includes the accessory once', async () => {
  const context=stsFixture();context.target={bessProductId:'bess',unitsPerModule:1};context.catalog.rules.forEach(r=>{r.pcs_id=null;r.bess_product_id='bess';});mocks.sts.mockResolvedValue(context);
  const options={...modularOptions(),bessSystem:{kind:'integrated'},bessProductId:'bess',backup:{...stsBackup(),targetPowerKw:20,targetPeakPowerKw:20,autonomyHours:0.1}};
  const invoke=vi.fn();const product={id:'bess',model:'Integrado',module_power_kw:100,module_capacity_kwh:200,efficiency_percent:95,soc_min_percent:10,soc_max_percent:95};
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:product,error:null})};
  const db={from:()=>q,functions:{invoke}} as unknown as SupabaseClient;
  const res=await invokeCommercialIndustrialCalculation(db,{options,unitPriceBrl:100000});
  expect(res.error).toBeNull();expect(res.data?.engineVersion).toBe('ci-v3');
  const selected=res.data!.selected!;
  expect(selected.capex).toBe(100000+selected.sts!.selected!.totalBrl);
  expect(selected.sts?.selected?.quantity).toBe(1);
  expect(res.data?.stsContext?.target.bessProductId).toBe('bess');expect(invoke).not.toHaveBeenCalled();
});
