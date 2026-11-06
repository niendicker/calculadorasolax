import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modularFixture } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import { loadCiModularCatalog, saveCiPcsSpec } from './ci-modular-catalog-repository';
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }));
beforeEach(() => vi.clearAllMocks());

describe('modular catalog persistence', () => {
  it('resolves electrical ratings and names from shared IDs rather than duplicating models', async () => {
    const fixture = modularFixture();
    const tables: Record<string, unknown[]> = {
      ci_pcs_specs: fixture.pcs, ci_battery_specs: fixture.batteries, ci_compatibility_rules: fixture.rules,
      inverters: [{ id: fixture.pcs[0].inverter_id, model: 'Modelo renomeado', battery_voltage_min_v: 600, battery_voltage_max_v: 1000, battery_charge_efficiency_percent: 96, battery_discharge_efficiency_percent: 95 }],
      batteries: [{ id: fixture.batteries[0].battery_id, model: 'Rack atualizado', capacity_kwh: 100, voltage_min_v: 400, voltage_max_v: 480, min_soc_percent: 10, round_trip_efficiency_percent: 98 }], accessories: [],
    };
    mocks.createClient.mockReturnValue({ from: (table: string) => { const result = { data: tables[table], error: null }; return { select: () => ({ ...result, order: () => result }) }; } });
    const result = await loadCiModularCatalog();
    expect(result.pcs[0].model).toBe('Modelo renomeado');
    expect(result.pcs[0].voltageMinV).toBe(600);
    expect(result.batteries[0].model).toBe('Rack atualizado');
    expect(result.batteries[0].roundTripEfficiencyPercent).toBe(98);
  });

  it('writes ratings against the physical catalog ID and propagates RLS failures', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'permission denied' } });
    const from = vi.fn().mockReturnValue({ upsert });
    mocks.createClient.mockReturnValue({ from });
    const entry = modularFixture().pcs[0];
    const spec = { inverter_id: entry.inverter_id, active: entry.active, charge_power_kw: entry.charge_power_kw, discharge_power_kw: entry.discharge_power_kw, charge_current_a: entry.charge_current_a, discharge_current_a: entry.discharge_current_a, max_parallel_units: entry.max_parallel_units, supports_backup: entry.supports_backup };
    await expect(saveCiPcsSpec(spec)).rejects.toThrow('permission denied');
    expect(from).toHaveBeenCalledWith('ci_pcs_specs');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ inverter_id: spec.inverter_id }));
  });
});
