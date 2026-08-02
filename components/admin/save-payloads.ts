// Pure payload builders for AdminPanel's save* handlers — each takes the
// relevant form state (plus, occasionally, one piece of external catalog
// data) and returns the exact row shape written to Supabase. Kept separate
// from AdminPanel.tsx (which owns the save handlers' actual I/O: id lookup,
// activity log, form reset) so this logic can be read/tested without any of
// that surrounding state.
import {
  accessoryRuleDesiredFeatures,
  accessoryRuleInverterModels,
  clampNumber,
  normalizeBatteryFlags,
  normalizeEssBatteryConfigs,
  normalizeInverterFlags,
  normalizeInverterGridType,
  normalizeInverterGridTypes,
  phasesFromInverterGridTypes,
  toNullableNumber,
  toNumber,
} from './helpers';
import type {
  AccessoryRow,
  AccessoryRuleRow,
  BatteryRow,
  EssCompatibilityRuleRow,
  InverterRow,
  LoadCatalogRow,
  PresetRow,
  SolutionRow,
} from './types';

export function buildInverterPayload(form: Partial<InverterRow>) {
  const gridTypes = normalizeInverterGridTypes(form.grid_types);
  return {
    model: form.model?.trim(),
    nickname: form.nickname?.trim() || null,
    power_kw: toNumber(form.power_kw),
    standard_power_kva: toNumber(form.standard_power_kva),
    peak_power_kva: toNumber(form.peak_power_kva),
    phases: phasesFromInverterGridTypes(gridTypes, form.phases),
    topology: form.topology,
    grid_types: gridTypes,
    max_battery_qty: toNumber(form.max_battery_qty, 1),
    battery_ports: clampNumber(form.battery_ports, 1, 2, 1),
    battery_voltage_min_v: toNullableNumber(form.battery_voltage_min_v),
    battery_voltage_max_v: toNullableNumber(form.battery_voltage_max_v),
    battery_current_max_a: toNullableNumber(form.battery_current_max_a),
    max_power_per_phase_w: toNullableNumber(form.max_power_per_phase_w),
    battery_charge_efficiency_percent: clampNumber(form.battery_charge_efficiency_percent, 1, 100, 97),
    battery_discharge_efficiency_percent: clampNumber(form.battery_discharge_efficiency_percent, 1, 100, 97),
    standby_consumption_w: Math.max(0, toNumber(form.standby_consumption_w)),
    max_battery_charge_power_w: toNullableNumber(form.max_battery_charge_power_w),
    max_battery_discharge_power_w: toNullableNumber(form.max_battery_discharge_power_w),
    flags: normalizeInverterFlags(form.flags),
    pv_oversizing_percent: form.pv_oversizing_percent === 50 ? 50 : 100,
    warranty_years: Math.max(1, toNumber(form.warranty_years, 10)),
    image_url: form.image_url?.trim() || null,
    documents: form.documents ?? [],
  };
}

export function buildBatteryPayload(form: Partial<BatteryRow>) {
  return {
    model: form.model?.trim(),
    nickname: form.nickname?.trim() || null,
    capacity_kwh: toNumber(form.capacity_kwh),
    topology: form.topology,
    standard_power_kw:
      form.nominal_voltage_v != null && form.recommended_current_a != null
        ? (form.nominal_voltage_v * form.recommended_current_a) / 1000
        : null,
    peak_power_kw:
      form.nominal_voltage_v != null && form.max_current_a != null
        ? (form.nominal_voltage_v * form.max_current_a) / 1000
        : null,
    min_soc_percent: form.min_soc_percent === 5 ? 5 : 10,
    round_trip_efficiency_percent: clampNumber(form.round_trip_efficiency_percent, 1, 100, 95),
    initial_soh_percent: clampNumber(form.initial_soh_percent, 1, 100, 100),
    annual_soh_loss_percent: clampNumber(form.annual_soh_loss_percent, 0, 99, 2),
    warranty_end_soh_percent: toNullableNumber(form.warranty_end_soh_percent),
    nominal_voltage_v: toNullableNumber(form.nominal_voltage_v),
    voltage_min_v: toNullableNumber(form.voltage_min_v),
    voltage_max_v: toNullableNumber(form.voltage_max_v),
    recommended_current_a: toNullableNumber(form.recommended_current_a),
    max_current_a: toNullableNumber(form.max_current_a),
    flags: normalizeBatteryFlags(form.flags),
    max_association_qty: clampNumber(form.max_association_qty, 1, 15, 15),
    expansion_model: form.expansion_model?.trim() || null,
    warranty_years: Math.max(1, toNumber(form.warranty_years, 10)),
    warranty_cycles: Math.max(1, toNumber(form.warranty_cycles, 6000)),
    image_url: form.image_url?.trim() || null,
    documents: form.documents ?? [],
  };
}

export function buildAccessoryPayload(form: Partial<AccessoryRow>) {
  return {
    model: form.model?.trim(),
    nickname: form.nickname?.trim() || null,
    description: form.description?.trim() || null,
    active: form.active ?? true,
    warranty_years: Math.max(1, toNumber(form.warranty_years, 2)),
    image_url: form.image_url?.trim() || null,
    documents: form.documents ?? [],
  };
}

export function buildLoadCatalogPayload(form: Partial<LoadCatalogRow>) {
  return {
    name_pt: form.name_pt?.trim(),
    name_en: form.name_en?.trim() || form.name_pt?.trim(),
    name_zh: form.name_zh?.trim() || form.name_pt?.trim(),
    power_w: toNumber(form.power_w),
    category: form.category?.trim() || 'Outros',
    ip_in_ratio: Math.max(1, toNumber(form.ip_in_ratio, 1)),
    active: form.active ?? true,
  };
}

export function buildPresetPayload(form: Partial<PresetRow>, currentPresetsCount: number) {
  return {
    name: form.name?.trim() || 'Predefinição sem nome',
    description: form.description?.trim() ?? '',
    loads: form.loads ?? [],
    display_order: form.display_order ?? currentPresetsCount,
  };
}

export function buildRulePayload(form: Partial<AccessoryRuleRow>) {
  const inverterModels = accessoryRuleInverterModels(form);
  return {
    accessory_id: form.accessory_id,
    name: form.name?.trim(),
    // The optional/required choice was removed from the rule form — every
    // accessory a rule applies is now always required (see migration 0056).
    inclusion: 'required' as const,
    trigger_metric: form.trigger_metric,
    min_quantity: toNumber(form.min_quantity, 1),
    inverter_model: inverterModels[0] ?? null,
    inverter_models: inverterModels,
    battery_model: form.battery_model || null,
    grid_topology: form.grid_topology ? normalizeInverterGridType(form.grid_topology) : null,
    battery_topology: form.battery_topology || null,
    quantity_per_match: toNumber(form.quantity_per_match, 1),
    scale_with_metric: form.scale_with_metric ?? false,
    metric_divisor: Math.max(1, toNumber(form.metric_divisor, 1)),
    comment: form.comment?.trim() || null,
    desired_features: accessoryRuleDesiredFeatures(form),
    excludes_accessory_models: form.excludes_accessory_models ?? [],
    bundled: form.bundled ?? false,
    active: form.active ?? true,
  };
}

export function buildEssRulePayload(form: Partial<EssCompatibilityRuleRow>, batteries: BatteryRow[]) {
  const batteryConfigs = normalizeEssBatteryConfigs(form, batteries);
  const primaryBatteryConfig = batteryConfigs[0];
  return {
    name: form.name?.trim() || null,
    inverter_model: form.inverter_model?.trim(),
    battery_model: primaryBatteryConfig?.battery_model ?? null,
    battery_topology: primaryBatteryConfig?.battery_topology ?? null,
    grid_topology: null,
    max_parallel_inverters: clampNumber(form.max_parallel_inverters, 1, 10, 1),
    min_battery_qty: primaryBatteryConfig?.min_battery_qty ?? 1,
    max_battery_qty: primaryBatteryConfig?.max_battery_qty ?? 2,
    battery_configs: batteryConfigs,
    comment: form.comment?.trim() || null,
    active: form.active ?? true,
  };
}

export function buildSolutionPayload(
  form: Partial<SolutionRow>,
  accessories: { model: string | null; quantity: number }[],
  comments: string[]
) {
  const accessoriesJson = accessories.filter((a) => a.model?.trim());
  const commentsJson = comments.filter((c) => c.trim());
  const rawSolution = {
    id: form.solution_code,
    inverter: {
      model: form.inverter_model,
      quantity: toNumber(form.inverter_quantity, 1),
      batteryPortsUsed: toNumber(form.battery_ports_used, 1),
      nominalVoltageV: toNumber(form.nominal_voltage_v, 220),
      ratedPowerW: toNumber(form.rated_power_w),
      peakPowerW: toNumber(form.peak_power_w),
      topology: form.grid_topology,
    },
    battery: {
      model: form.battery_model,
      quantity: toNumber(form.battery_quantity, 1),
      powerW: toNumber(form.battery_power_w),
      availableEnergyWh: toNumber(form.available_energy_wh),
    },
    accessories: accessoriesJson,
    comments: commentsJson,
  };

  return {
    source_file: form.source_file?.trim() || 'admin',
    solution_code: form.solution_code?.trim(),
    schema_version: form.schema_version || '1.0',
    inverter_model: form.inverter_model?.trim(),
    inverter_quantity: toNumber(form.inverter_quantity, 1),
    battery_ports_used: toNumber(form.battery_ports_used, 1),
    nominal_voltage_v: toNumber(form.nominal_voltage_v, 220),
    rated_power_w: toNumber(form.rated_power_w),
    peak_power_w: toNumber(form.peak_power_w),
    grid_topology: form.grid_topology,
    battery_model: form.battery_model?.trim(),
    battery_topology: form.battery_topology,
    battery_quantity: toNumber(form.battery_quantity, 1),
    battery_power_w: toNumber(form.battery_power_w),
    available_energy_wh: toNumber(form.available_energy_wh),
    accessories: accessoriesJson,
    comments: commentsJson,
    raw_solution: rawSolution,
    active: form.active ?? true,
  };
}
