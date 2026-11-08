import type { CiBatterySpec, CiPcsSpec } from '@/supabase/functions/_shared/commercial-industrial/modular-types';
import type { BatteryRow, InverterRow } from '../types';

export type CiEquipmentLimits = Partial<CiPcsSpec & CiBatterySpec>;

/** Empty limits keep a product as a draft; partially entered ratings must be completed. */
export function buildCiEquipmentLimits(
  kind: 'pcs' | 'batteries',
  product: Partial<Pick<InverterRow, 'power_kw' | 'battery_current_max_a'> & Pick<BatteryRow, 'min_soc_percent' | 'max_current_a'>>,
  limits: CiEquipmentLimits = {},
): CiEquipmentLimits | null {
  const currentKeys = kind === 'pcs'
    ? ['port_charge_current_a', 'port_discharge_current_a'] as const
    : ['charge_current_a', 'discharge_current_a'] as const;
  const required = ['charge_power_kw', 'discharge_power_kw', ...currentKeys] as const;
  const customized = limits.active === false || (kind === 'pcs'
    ? limits.supports_backup === true || limits.port_charge_power_kw != null || limits.port_discharge_power_kw != null
      || (limits.max_parallel_units != null && limits.max_parallel_units !== 1)
      || (limits.max_strings_per_port != null && limits.max_strings_per_port !== 1)
    : (limits.unit_kind != null && limits.unit_kind !== 'rack') || (limits.soc_max_percent != null && limits.soc_max_percent !== 100));
  if (!limits.inverter_id && !limits.battery_id && !customized && required.every(key => limits[key] == null)) return null;
  if (required.some(key => !Number.isFinite(limits[key]) || Number(limits[key]) <= 0)) {
    throw new Error('Preencha as potências e correntes contínuas de carga e descarga com valores maiores que zero.');
  }
  const common = {
    active: limits.active ?? true,
    charge_power_kw: limits.charge_power_kw!,
    discharge_power_kw: limits.discharge_power_kw!,
    charge_current_a: limits[currentKeys[0]]!,
    discharge_current_a: limits[currentKeys[1]]!,
  };
  if (kind === 'pcs') {
    if (Number(product.power_kw) > 0 && common.discharge_power_kw > Number(product.power_kw)) {
      throw new Error('A potência contínua C&I excede a potência nominal da ficha do inversor.');
    }
    if (Number(product.battery_current_max_a) > 0 && Math.max(common.charge_current_a, common.discharge_current_a) > Number(product.battery_current_max_a)) {
      throw new Error('A corrente por porta excede o limite por porta da ficha do PCS.');
    }
    const parallel = limits.max_parallel_units ?? 1;
    const strings = limits.max_strings_per_port ?? 1;
    if (!Number.isInteger(parallel) || parallel < 1 || !Number.isInteger(strings) || strings < 1 || strings > 32) {
      throw new Error('Informe quantidades inteiras válidas para PCS em paralelo e strings por porta (1 a 32).');
    }
    for (const key of ['port_charge_power_kw', 'port_discharge_power_kw'] as const) {
      if (limits[key] != null && (!Number.isFinite(limits[key]) || limits[key]! <= 0)) {
        throw new Error('Os limites adicionais de potência por porta devem ser maiores que zero ou ficar vazios.');
      }
    }
    return { ...common, port_charge_current_a: common.charge_current_a, port_discharge_current_a: common.discharge_current_a,
      port_charge_power_kw: limits.port_charge_power_kw ?? null, port_discharge_power_kw: limits.port_discharge_power_kw ?? null,
      max_parallel_units: parallel, max_strings_per_port: strings, supports_backup: limits.supports_backup ?? false };
  }
  const soc = limits.soc_max_percent ?? 100;
  if (!Number.isFinite(soc) || soc > 100 || soc <= Number(product.min_soc_percent ?? 10)) {
    throw new Error('SOC máximo deve ser até 100% e maior que o SOC mínimo da ficha da bateria.');
  }
  if (Number(product.max_current_a) > 0 && Math.max(common.charge_current_a, common.discharge_current_a) > Number(product.max_current_a)) {
    throw new Error('A corrente contínua C&I excede a corrente máxima da ficha da bateria.');
  }
  return { ...common, unit_kind: limits.unit_kind ?? 'rack', soc_max_percent: soc };
}
