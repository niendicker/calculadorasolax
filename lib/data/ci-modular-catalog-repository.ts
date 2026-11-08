import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import type { CiBatteryCatalogEntry, CiBatterySpec, CiCompatibilityRule, CiModularCatalog, CiPcsCatalogEntry, CiPcsSpec } from '@/supabase/functions/_shared/commercial-industrial/modular-types';

export type CiInverterBase = Pick<Database['public']['Tables']['inverters']['Row'], 'id' | 'model' | 'power_kw' | 'max_battery_qty' | 'battery_ports' | 'battery_current_max_a' | 'battery_voltage_min_v' | 'battery_voltage_max_v' | 'battery_charge_efficiency_percent' | 'battery_discharge_efficiency_percent'>;
export type CiBatteryBase = Pick<Database['public']['Tables']['batteries']['Row'], 'id' | 'model' | 'max_current_a' | 'max_association_qty' | 'capacity_kwh' | 'voltage_min_v' | 'voltage_max_v' | 'min_soc_percent' | 'round_trip_efficiency_percent'>;
export interface CiEquipmentCatalog extends CiModularCatalog { inverterOptions: CiInverterBase[]; batteryOptions: CiBatteryBase[] }

/** Every table has admin-write RLS; regular users can only resolve active/approved records. */
export async function loadCiModularCatalog(client?: SupabaseClient): Promise<CiEquipmentCatalog> {
  const db = client ?? createClient();
  const [pcs, batteries, rules, inverters, batteryModels, accessories] = await Promise.all([
    db.from('ci_pcs_specs').select('*'), db.from('ci_battery_specs').select('*'), db.from('ci_compatibility_rules').select('*').order('name'),
    db.from('ci_inverters').select('id,model,power_kw,max_battery_qty,battery_ports,battery_current_max_a,battery_voltage_min_v,battery_voltage_max_v,battery_charge_efficiency_percent,battery_discharge_efficiency_percent').order('model'),
    db.from('ci_batteries').select('id,model,max_current_a,max_association_qty,capacity_kwh,voltage_min_v,voltage_max_v,min_soc_percent,round_trip_efficiency_percent').order('model'),
    db.from('ci_accessories').select('id,model,active').order('model'),
  ]);
  for (const result of [pcs, batteries, rules, inverters, batteryModels, accessories]) if (result.error) throw new Error(result.error.message);
  return assembleCiEquipmentCatalog({inverters:(inverters.data??[]) as CiInverterBase[],batteries:(batteryModels.data??[]) as CiBatteryBase[],pcs:(pcs.data??[]) as CiPcsSpec[],batterySpecs:(batteries.data??[]) as CiBatterySpec[],rules:(rules.data??[]) as CiCompatibilityRule[],accessories:accessories.data??[]});
}

export interface CiCatalogRows {
  inverters:CiInverterBase[];batteries:CiBatteryBase[];pcs:CiPcsSpec[];batterySpecs:CiBatterySpec[];rules:CiCompatibilityRule[];
  accessories:CiModularCatalog['accessories'];
}
export function assembleCiEquipmentCatalog(rows:CiCatalogRows):CiEquipmentCatalog {
  const inverterOptions = rows.inverters;
  const batteryOptions = rows.batteries;
  const baseInverters = new Map(inverterOptions.map((item) => [item.id, item]));
  const baseBatteries = new Map(batteryOptions.map((item) => [item.id, item]));
  return {
    inverterOptions, batteryOptions,
    pcs: rows.pcs.map((item): CiPcsCatalogEntry => {
      const base = baseInverters.get(item.inverter_id);
      return { ...item, active:item.active && Boolean(base), ratedPowerKw: base?.power_kw ?? null, maxBatteryQty: base?.max_battery_qty ?? null, batteryPorts: base?.battery_ports ?? null, maxCurrentPerPortA: base?.battery_current_max_a ?? null, model: base?.model ?? 'Inversor indisponível', voltageMinV: base?.battery_voltage_min_v ?? null, voltageMaxV: base?.battery_voltage_max_v ?? null, chargeEfficiencyPercent: base?.battery_charge_efficiency_percent ?? null, dischargeEfficiencyPercent: base?.battery_discharge_efficiency_percent ?? null };
    }),
    batteries: rows.batterySpecs.map((item): CiBatteryCatalogEntry => {
      const base = baseBatteries.get(item.battery_id);
      return { ...item, active:item.active && Boolean(base), maxCurrentA: base?.max_current_a ?? null, maxAssociationQty: base?.max_association_qty ?? null, model: base?.model ?? 'Bateria indisponível', capacityKwh: base?.capacity_kwh ?? 0, voltageMinV: base?.voltage_min_v ?? null, voltageMaxV: base?.voltage_max_v ?? null, socMinPercent: base?.min_soc_percent ?? NaN, roundTripEfficiencyPercent: base?.round_trip_efficiency_percent ?? null };
    }),
    rules: rows.rules, accessories: rows.accessories,
  };
}

export async function saveCiPcsSpec(input: CiPcsSpec) {
  const { error } = await createClient().from('ci_pcs_specs').upsert({ ...input, charge_current_a:input.port_charge_current_a??input.charge_current_a,discharge_current_a:input.port_discharge_current_a??input.discharge_current_a, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
export async function saveCiBatterySpec(input: CiBatterySpec) {
  const { error } = await createClient().from('ci_battery_specs').upsert({ ...input, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
export async function saveCiCompatibilityRule(input: Omit<CiCompatibilityRule, 'id'> & { id?: string }) {
  const { data, error } = await createClient().from('ci_compatibility_rules').upsert({ ...input, updated_at: new Date().toISOString() }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}
