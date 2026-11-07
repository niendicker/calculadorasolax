import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { modularFixture, modularOptions } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import { calculateAutomaticCi } from './ci-automatic-calculation-repository';
import { validateCommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/validation';
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), accessories: vi.fn(), sts: vi.fn() }));
vi.mock('./ci-modular-catalog-repository', () => ({ loadCiModularCatalog: mocks.catalog }));
vi.mock('./ci-accessories-repository', () => ({ loadCiAccessoryContext: mocks.accessories }));
vi.mock('./ci-sts-repository', () => ({ loadCiStsCatalog: mocks.sts }));
function options(minPowerKw = 150, minEnergyKwh = 0) {
  const config=modularOptions();
  config.loadCurve={...config.loadCurve!,points:config.loadCurve!.points.slice(0,96),periodEnd:'2026-01-01'};
  return { ...config, bessSystem: { kind: 'automatic' as const, minPowerKw, minEnergyKwh } };
}
const stock = [
  { product_type: 'ci_pcs', product_model: 'PCS teste 100', unit_value: 1e8 },
  { product_type: 'ci_battery', product_model: 'Rack teste 100', unit_value: 1e8 },
];
function client(products: unknown[] = [], prices: unknown[] = stock) {
  const eq = vi.fn();
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) }, from: (table: string) => {
      const result = { data: table === 'ci_bess_products' ? products : prices, error: null };
      const query = { select: () => query, eq: (...args: unknown[]) => { eq(...args); return query; }, order: () => query, then: (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve) };
      return query;
    } } as unknown as SupabaseClient;
  return { db, eq };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalog.mockResolvedValue(modularFixture());
  mocks.accessories.mockResolvedValue({ products: [], rules: [], prices: {}, selectedIds: [], stsIds: [] });
  mocks.sts.mockResolvedValue({ specs: [], rules: [] });
});
describe('automatic C&I technical search', () => {
  it('finds parallel PCS despite negative NPV and keeps financial viability separate', async () => {
    const { db, eq } = client();
    const result = await calculateAutomaticCi(db, options());
    expect(result.scenarios).toHaveLength(4);
    expect(result.selected?.composition?.pcsCount).toBe(2);
    expect(result.selected?.technicalValidity).toBe(true);
    expect(result.technicalSelection?.scenarioId).toBe(result.selected?.scenarioId);
    expect(result.recommendation.scenarioId).toBeNull();
    expect(result.selected?.npv).toBeLessThan(0);
    expect(eq).toHaveBeenCalledWith('user_id', 'owner');
  });
  it('finds enough parallel battery strings to meet useful energy independently of PCS power', async () => {
    const result = await calculateAutomaticCi(client().db, options(100, 300));
    expect(result.selected?.composition).toMatchObject({ pcsCount: 1, parallelStringsPerPcs: 2, batteryCount: 4 });
    expect(result.selected?.usefulCapacityKwh).toBe(340);
  });
  it('searches another approved model and keeps repeated composition counts uniquely identified', async () => {
    const catalog = modularFixture();
    const other = { ...catalog.pcs[0], inverter_id: 'pcs-other', model: 'PCS maior', discharge_power_kw: 300, charge_power_kw: 300, discharge_current_a: 600, charge_current_a: 600 };
    catalog.pcs.push(other);
    catalog.rules.push({ ...catalog.rules[0], id: 'rule-other', pcs_id: other.inverter_id, name: 'Outra combinação' });
    mocks.catalog.mockResolvedValue(catalog);
    const result = await calculateAutomaticCi(client().db, options(250));
    expect(result.selected?.composition?.pcsId).toBe('pcs-other');
    expect(result.selected?.technicalValidity).toBe(true);
    expect(new Set(result.scenarios.map(s => s.scenarioId)).size).toBe(result.scenarios.length);
  });
  it('returns a technical solution with pending prices and never declares its finances viable', async () => {
    const result = await calculateAutomaticCi(client([], []).db, options());
    expect(result.selected?.technicalValidity).toBe(true);
    expect(result.selected?.pricingComplete).toBe(false);
    expect(result.selected?.missingPrices).toEqual(['PCS teste 100', 'Rack teste 100']);
    expect(result.recommendation.scenarioId).toBeNull();
  });
  it('treats explicitly registered zero prices as complete', async () => {
    const result = await calculateAutomaticCi(client([], stock.map(row => ({ ...row, unit_value: 0 }))).db, options());
    expect(result.selected?.pricingComplete).toBe(true);
    expect(result.selected?.missingPrices).toEqual([]);
  });
  it('includes integrated products only up to their documented parallel limit', async () => {
    const products = [{ id: 'integrated', model: 'Integrado', max_parallel_units: 2, module_power_kw: 120, module_capacity_kwh: 400, efficiency_percent: 95, soc_min_percent: 10, soc_max_percent: 95 }];
    const result = await calculateAutomaticCi(client(products).db, options(220));
    expect(result.scenarios.filter(s => s.equipmentLabel === 'Integrado')).toHaveLength(2);
    expect(result.selected).toMatchObject({ equipmentLabel: 'Integrado', moduleCount: 2, technicalValidity: true, pricingComplete: false });
  });
  it('excludes revoked rules and inconsistent product limits with explicit diagnostics', async () => {
    const catalog = modularFixture();
    catalog.batteries[0].maxAssociationQty = 2;
    mocks.catalog.mockResolvedValue(catalog);
    await expect(calculateAutomaticCi(client().db, options())).rejects.toThrow('associação');
  });
  it('does not call an undersized reference a technical solution', async () => {
    const result = await calculateAutomaticCi(client().db, options(1000));
    expect(result.technicalSelection?.scenarioId).toBeNull();
    expect(result.selected?.technicalValidity).toBe(false);
    expect(result.recommendation.scenarioId).toBeNull();
  });
  it('increases PCS count to meet backup starting power even when no scenario pays back', async () => {
    const config = options(0);
    const result = await calculateAutomaticCi(client().db, { ...config, backup: { enabled: true, inputMode: 'simple', targetPowerKw: 50, targetPeakPowerKw: 140, autonomyHours: 0.5, safetyMarginPercent: 0, loads: [] } });
    expect(result.selected?.composition?.pcsCount).toBe(2);
    expect(result.selected?.backupResult?.status).toBe('fully_covered');
    expect(result.scenarios.filter(s => s.composition?.pcsCount === 1).every(s => !s.technicalValidity)).toBe(true);
  });
  it('rejects an oversized search before running a partial recommendation', async () => {
    const catalog = modularFixture();
    catalog.pcs[0].max_parallel_units = 5000;
    catalog.rules[0].max_pcs = 5000;
    mocks.catalog.mockResolvedValue(catalog);
    await expect(calculateAutomaticCi(client().db, options())).rejects.toThrow('nenhum resultado parcial');
  });
  it('requires the simulated demand target to be met before calling a scenario technically valid', async () => {
    const config = options(0);
    config.loadCurve!.points = [{ timestamp: '2026-01-01T21:00:00Z', powerKw: 300 }];
    config.tariff!.contractedDemandKw = 100;
    const result = await calculateAutomaticCi(client().db, { ...config, strategy: 'PEAK_SHAVING' });
    expect(result.selected?.composition?.pcsCount).toBe(2);
    expect(result.selected?.technicalValidity).toBe(true);
    expect(result.scenarios.filter(s => s.composition?.pcsCount === 1).every(s => !s.technicalValidity)).toBe(true);
  });
  it('validates automatic minimums without requiring a manually pinned product', () => {
    expect(validateCommercialIndustrialOptions(options())).toEqual([]);
    expect(validateCommercialIndustrialOptions(options(-1))).toContain('Informe potência mínima válida para a busca C&I.');
  });
});
