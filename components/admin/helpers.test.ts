import { describe, expect, it } from 'vitest';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import type { AccessoryRuleRow, BatteryRow, EssCompatibilityRuleRow, GeneratedSolutionPayload, InverterRow } from './types';
import {
  accessoryRuleInverterModels,
  accessoryRuleMatches,
  applyAccessoryRules,
  batteryAssociationMax,
  buildRuleGeneratedSolutions,
  clampNumber,
  expansionModelSet,
  fetchApprovedSolutions,
  formatInverterGridType,
  formatTriggerMetric,
  generatedGridToApprovedTopology,
  inverterSupportedBatteryTopologies,
  nominalVoltageForGrid,
  normalizeBatteryFlags,
  normalizeEssBatteryConfigs,
  normalizeInverterFlags,
  normalizeInverterGridType,
  normalizeInverterGridTypes,
  phasesFromInverterGridTypes,
  sanitizePathPart,
  slugPart,
  solutionRuleMetricValue,
  toNullableNumber,
  toNumber,
} from './helpers';

describe('toNumber / toNullableNumber / clampNumber', () => {
  it('toNumber parses finite numbers, falling back otherwise', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber('not a number')).toBe(0);
    expect(toNumber(undefined, 7)).toBe(7);
  });

  it('toNullableNumber returns null for empty/nullish input', () => {
    expect(toNullableNumber('')).toBeNull();
    expect(toNullableNumber(null)).toBeNull();
    expect(toNullableNumber(undefined)).toBeNull();
    expect(toNullableNumber('3.5')).toBe(3.5);
    expect(toNullableNumber('nope')).toBeNull();
  });

  it('clampNumber bounds the parsed value to [min, max]', () => {
    expect(clampNumber(5, 1, 10)).toBe(5);
    expect(clampNumber(-3, 1, 10)).toBe(1);
    expect(clampNumber(99, 1, 10)).toBe(10);
    expect(clampNumber('bad', 1, 10, 4)).toBe(4);
  });
});

describe('grid type normalization', () => {
  it('normalizeInverterGridType accepts current values and maps legacy ones', () => {
    expect(normalizeInverterGridType('3P_380V')).toBe('3P_380V');
    expect(normalizeInverterGridType('threePhase_380')).toBe('3P_380V');
    expect(normalizeInverterGridType('unknown')).toBeNull();
    expect(normalizeInverterGridType('')).toBeNull();
  });

  it('normalizeInverterGridTypes dedupes and drops unrecognized values', () => {
    expect(normalizeInverterGridTypes(['1P_220V', 'singlePhase_220', 'garbage'])).toEqual(['1P_220V']);
    expect(normalizeInverterGridTypes('1P_220V,2P_220V')).toEqual(['1P_220V', '2P_220V']);
  });

  it('formatInverterGridType returns the Portuguese label, or the raw value if unrecognized', () => {
    expect(formatInverterGridType('3P_380V')).toBe('Trifásica 380V');
    expect(formatInverterGridType('nonsense')).toBe('nonsense');
  });

  it('phasesFromInverterGridTypes picks the highest phase count present, else falls back', () => {
    expect(phasesFromInverterGridTypes(['1P_220V', '3P_380V'])).toBe(3);
    expect(phasesFromInverterGridTypes(['2P_220V'])).toBe(2);
    expect(phasesFromInverterGridTypes([], 2)).toBe(2);
    expect(phasesFromInverterGridTypes([], 99)).toBe(3);
  });

  it('generatedGridToApprovedTopology maps every grid type, defaulting to 1p_220V', () => {
    expect(generatedGridToApprovedTopology('2P_220V')).toBe('2p_220V');
    expect(generatedGridToApprovedTopology('3P_220V')).toBe('3p_220V');
    expect(generatedGridToApprovedTopology('3P_380V')).toBe('3p_380V');
    expect(generatedGridToApprovedTopology('1P_220V')).toBe('1p_220V');
  });

  it('nominalVoltageForGrid is 380 only for 3P_380V, else 220', () => {
    expect(nominalVoltageForGrid('3P_380V')).toBe(380);
    expect(nominalVoltageForGrid('1P_220V')).toBe(220);
    expect(nominalVoltageForGrid('3P_220V')).toBe(220);
  });
});

describe('flag normalization', () => {
  it('normalizeInverterFlags keeps only recognized flags', () => {
    expect(normalizeInverterFlags(['microgrid', 'bogus', 'external_ats'])).toEqual(['microgrid', 'external_ats']);
  });

  it('normalizeBatteryFlags keeps only recognized flags', () => {
    expect(normalizeBatteryFlags(['ip65', 'ip99'])).toEqual(['ip65']);
    expect(normalizeBatteryFlags('ip65,ip66')).toEqual(['ip65', 'ip66']);
  });
});

describe('formatTriggerMetric', () => {
  it('maps every metric to its Portuguese label', () => {
    expect(formatTriggerMetric('per_solution')).toBe('Por solução');
    expect(formatTriggerMetric('inverter_quantity')).toBe('Qtd. inversores');
    expect(formatTriggerMetric('battery_quantity')).toBe('Qtd. baterias');
    expect(formatTriggerMetric('battery_ports_used')).toBe('Portas de bateria');
  });
});

describe('accessoryRuleInverterModels', () => {
  it('prefers the inverter_models array when present', () => {
    expect(accessoryRuleInverterModels({ inverter_models: ['A', 'B'], inverter_model: 'C' })).toEqual(['A', 'B']);
  });

  it('falls back to the single inverter_model, or an empty array', () => {
    expect(accessoryRuleInverterModels({ inverter_models: [], inverter_model: 'C' })).toEqual(['C']);
    expect(accessoryRuleInverterModels({ inverter_models: null, inverter_model: null })).toEqual([]);
  });
});

describe('slugPart / sanitizePathPart', () => {
  it('slugPart strips punctuation and collapses to dashes', () => {
    expect(slugPart('X1-Hybrid 5.0kW!')).toBe('X1-Hybrid-5-0kW');
    expect(slugPart('   ')).toBe('item');
  });

  it('sanitizePathPart lowercases and keeps a narrower charset', () => {
    expect(sanitizePathPart('X1 Hybrid 5.0kW')).toBe('x1-hybrid-5.0kw');
    expect(sanitizePathPart('   ')).toBe('produto');
  });
});

function makeBattery(partial: Partial<BatteryRow> & Pick<BatteryRow, 'model' | 'topology'>): BatteryRow {
  return {
    id: partial.model,
    capacity_kwh: 5,
    standard_power_kw: 2.5,
    peak_power_kw: 3.5,
    min_soc_percent: 10,
    nominal_voltage_v: null,
    voltage_min_v: null,
    voltage_max_v: null,
    recommended_current_a: null,
    max_current_a: null,
    flags: [],
    max_association_qty: 15,
    image_url: null,
    documents: [],
    ...partial,
  };
}

function makeInverter(partial: Partial<InverterRow> & Pick<InverterRow, 'model'>): InverterRow {
  return {
    id: partial.model,
    power_kw: 5,
    standard_power_kva: 5,
    peak_power_kva: 7,
    phases: 1,
    topology: 'HV',
    grid_types: ['1P_220V'],
    max_battery_qty: 6,
    battery_ports: 1,
    battery_voltage_min_v: null,
    battery_voltage_max_v: null,
    battery_current_max_a: null,
    max_power_per_phase_w: null,
    flags: [],
    pv_oversizing_percent: 100,
    image_url: null,
    documents: [],
    ...partial,
  };
}

describe('batteryAssociationMax', () => {
  it('clamps to [1, 15], defaulting to 15 when the battery has no explicit value', () => {
    expect(batteryAssociationMax(undefined)).toBe(15);
    expect(batteryAssociationMax(makeBattery({ model: 'b1', topology: 'HV', max_association_qty: 3 }))).toBe(3);
    expect(batteryAssociationMax(makeBattery({ model: 'b1', topology: 'HV', max_association_qty: 99 }))).toBe(15);
  });
});

describe('inverterSupportedBatteryTopologies', () => {
  it('returns both topologies for BOTH, the single one otherwise, and [] for no inverter', () => {
    expect(inverterSupportedBatteryTopologies(undefined)).toEqual([]);
    expect(inverterSupportedBatteryTopologies(makeInverter({ model: 'i1', topology: 'BOTH' }))).toEqual(['HV', 'LV']);
    expect(inverterSupportedBatteryTopologies(makeInverter({ model: 'i1', topology: 'LV' }))).toEqual(['LV']);
  });
});

describe('normalizeEssBatteryConfigs', () => {
  const batteries = [makeBattery({ model: 'TP-HS3.6', topology: 'HV', max_association_qty: 6 })];

  it('normalizes an explicit battery_configs array, clamping quantities to the battery cap', () => {
    const rule: Partial<EssCompatibilityRuleRow> = {
      battery_configs: [{ battery_model: 'TP-HS3.6', battery_topology: 'HV', min_battery_qty: 1, max_battery_qty: 99 }],
    };
    expect(normalizeEssBatteryConfigs(rule, batteries)).toEqual([
      { battery_model: 'TP-HS3.6', battery_topology: 'HV', min_battery_qty: 1, max_battery_qty: 6 },
    ]);
  });

  it('drops a config whose battery is unknown and has no topology fallback', () => {
    const rule: Partial<EssCompatibilityRuleRow> = {
      battery_configs: [{ battery_model: 'ghost', battery_topology: undefined as never, min_battery_qty: 1, max_battery_qty: 2 }],
    };
    expect(normalizeEssBatteryConfigs(rule, batteries)).toEqual([]);
  });

  it('falls back to the legacy single battery_model field when battery_configs is empty', () => {
    const rule: Partial<EssCompatibilityRuleRow> = {
      battery_model: 'TP-HS3.6',
      battery_topology: 'HV',
      min_battery_qty: 2,
      max_battery_qty: 4,
      battery_configs: [],
    };
    expect(normalizeEssBatteryConfigs(rule, batteries)).toEqual([
      { battery_model: 'TP-HS3.6', battery_topology: 'HV', min_battery_qty: 2, max_battery_qty: 4 },
    ]);
  });

  it('returns [] when there is neither battery_configs nor a legacy battery_model', () => {
    expect(normalizeEssBatteryConfigs({}, batteries)).toEqual([]);
  });
});

describe('solutionRuleMetricValue', () => {
  const solution = { inverter_quantity: 2, battery_quantity: 4, battery_ports_used: 1 };

  it('reads the field matching the given metric', () => {
    expect(solutionRuleMetricValue(solution, 'per_solution')).toBe(1);
    expect(solutionRuleMetricValue(solution, 'inverter_quantity')).toBe(2);
    expect(solutionRuleMetricValue(solution, 'battery_quantity')).toBe(4);
    // battery_ports_used stays a single inverter's port count, not summed
    // across every inverter — pre-existing rules were calibrated against that.
    expect(solutionRuleMetricValue(solution, 'battery_ports_used')).toBe(1);
  });
});

function makeGeneratedSolution(partial: Partial<GeneratedSolutionPayload> = {}): GeneratedSolutionPayload {
  return {
    source_file: 'generated-rules',
    solution_code: 'code-1',
    schema_version: '1.0',
    inverter_model: 'X1-Hybrid-5.0kW-G4',
    inverter_quantity: 1,
    battery_ports_used: 1,
    nominal_voltage_v: 220,
    rated_power_w: 5000,
    peak_power_w: 7000,
    grid_topology: '1p_220V',
    battery_model: 'TP-HS3.6',
    battery_topology: 'HV',
    battery_quantity: 1,
    battery_power_w: 2500,
    available_energy_wh: 3200,
    accessories: [],
    comments: [],
    raw_solution: {},
    active: true,
    ...partial,
  };
}

function makeAccessoryRule(partial: Partial<AccessoryRuleRow> & Pick<AccessoryRuleRow, 'id'>): AccessoryRuleRow {
  return {
    accessory_id: 'acc-1',
    name: 'Regra',
    inclusion: 'required',
    trigger_metric: 'per_solution',
    min_quantity: 1,
    inverter_model: null,
    inverter_models: null,
    battery_model: null,
    grid_topology: null,
    battery_topology: null,
    quantity_per_match: 1,
    scale_with_metric: false,
    metric_divisor: 1,
    comment: null,
    desired_features: [],
    active: true,
    accessories: { model: 'Smart Meter' },
    ...partial,
  };
}

describe('accessoryRuleMatches', () => {
  it('rejects an inactive rule outright', () => {
    const rule = makeAccessoryRule({ id: 'r1', active: false });
    expect(accessoryRuleMatches(makeGeneratedSolution(), rule)).toBe(false);
  });

  it('matches a rule with no constraints against any solution meeting the quantity', () => {
    const rule = makeAccessoryRule({ id: 'r1' });
    expect(accessoryRuleMatches(makeGeneratedSolution(), rule)).toBe(true);
  });

  it('rejects when the inverter model does not match', () => {
    const rule = makeAccessoryRule({ id: 'r1', inverter_models: ['Other-Model'] });
    expect(accessoryRuleMatches(makeGeneratedSolution(), rule)).toBe(false);
  });

  it('rejects when the battery model does not match', () => {
    const rule = makeAccessoryRule({ id: 'r1', battery_model: 'Other-Battery' });
    expect(accessoryRuleMatches(makeGeneratedSolution(), rule)).toBe(false);
  });

  it('rejects when the required quantity is not met', () => {
    const rule = makeAccessoryRule({ id: 'r1', trigger_metric: 'inverter_quantity', min_quantity: 3 });
    expect(accessoryRuleMatches(makeGeneratedSolution({ inverter_quantity: 2 }), rule)).toBe(false);
    expect(accessoryRuleMatches(makeGeneratedSolution({ inverter_quantity: 3 }), rule)).toBe(true);
  });

  it('rejects a rule gated by desired_features, since bulk generation has no customer context', () => {
    // Otherwise-unconstrained rule that would normally match everything.
    const rule = makeAccessoryRule({ id: 'r1', desired_features: ['external_ats'] });
    expect(accessoryRuleMatches(makeGeneratedSolution(), rule)).toBe(false);
  });
});

describe('applyAccessoryRules', () => {
  it('sums quantities from matching rules for the same accessory model', () => {
    const solution = makeGeneratedSolution();
    const rules = [
      makeAccessoryRule({ id: 'r1', quantity_per_match: 1, accessories: { model: 'Smart Meter' } }),
      makeAccessoryRule({ id: 'r2', quantity_per_match: 2, accessories: { model: 'Smart Meter' } }),
    ];
    const result = applyAccessoryRules(solution, rules);
    expect(result.accessories).toEqual([{ model: 'Smart Meter', quantity: 3 }]);
  });

  it('collects the rule comment, plus an "optional" note when inclusion is optional', () => {
    const solution = makeGeneratedSolution();
    const rules = [
      makeAccessoryRule({ id: 'r1', comment: 'Necessário para paralelo.', inclusion: 'optional', accessories: { model: 'X1-Matebox' } }),
    ];
    const result = applyAccessoryRules(solution, rules);
    expect(result.comments).toEqual(['Necessário para paralelo.', 'Acessório opcional: X1-Matebox.']);
  });

  it('ignores rules that do not match or have no linked accessory', () => {
    const solution = makeGeneratedSolution();
    const rules = [
      makeAccessoryRule({ id: 'r1', active: false, accessories: { model: 'X' } }),
      makeAccessoryRule({ id: 'r2', accessories: null }),
    ];
    expect(applyAccessoryRules(solution, rules)).toEqual({ accessories: [], comments: [] });
  });

  it('multiplies quantity_per_match by the trigger metric\'s value when scale_with_metric is on', () => {
    const solution = makeGeneratedSolution({ battery_ports_used: 2 });
    const rules = [
      makeAccessoryRule({
        id: 'r1',
        quantity_per_match: 1,
        scale_with_metric: true,
        trigger_metric: 'battery_ports_used',
        min_quantity: 1,
        accessories: { model: 'TBMS-MCS0800' },
      }),
    ];
    const result = applyAccessoryRules(solution, rules);
    expect(result.accessories).toEqual([{ model: 'TBMS-MCS0800', quantity: 2 }]);
  });

  it('keeps a flat quantity_per_match when scale_with_metric is off, even past min_quantity', () => {
    const solution = makeGeneratedSolution({ battery_ports_used: 2 });
    const rules = [
      makeAccessoryRule({
        id: 'r1',
        quantity_per_match: 1,
        scale_with_metric: false,
        trigger_metric: 'battery_ports_used',
        min_quantity: 1,
        accessories: { model: 'TBMS-MCS0800' },
      }),
    ];
    const result = applyAccessoryRules(solution, rules);
    expect(result.accessories).toEqual([{ model: 'TBMS-MCS0800', quantity: 1 }]);
  });

  it('scales battery_ports_used by a single inverter\'s ports, not summed across every inverter', () => {
    // 2 inverters x 2 ports each — battery_ports_used stays a per-inverter fact
    // so pre-existing rules built around it keep meaning what they always meant.
    const solution = makeGeneratedSolution({ inverter_quantity: 2, battery_ports_used: 2 });
    const rules = [
      makeAccessoryRule({
        id: 'r1',
        quantity_per_match: 1,
        scale_with_metric: true,
        trigger_metric: 'battery_ports_used',
        min_quantity: 1,
        accessories: { model: 'TBMS-MCS0800' },
      }),
    ];
    const result = applyAccessoryRules(solution, rules);
    expect(result.accessories).toEqual([{ model: 'TBMS-MCS0800', quantity: 2 }]);
  });

  it('gates battery_ports_used on a single inverter\'s ports, not summed across every inverter', () => {
    // 2 inverters x 1 port each — each inverter alone only uses 1 port, so a
    // min_quantity of 2 must NOT be cleared just because there happen to be 2 inverters.
    const solution = makeGeneratedSolution({ inverter_quantity: 2, battery_ports_used: 1 });
    const rule = makeAccessoryRule({
      id: 'r1',
      trigger_metric: 'battery_ports_used',
      min_quantity: 2,
      accessories: { model: 'TBMS-MCS0800' },
    });
    expect(accessoryRuleMatches(solution, rule)).toBe(false);
  });

  it('divides the metric by metric_divisor, rounding up, before multiplying by quantity_per_match', () => {
    const rule = makeAccessoryRule({
      id: 'r1',
      quantity_per_match: 1,
      scale_with_metric: true,
      trigger_metric: 'battery_quantity',
      metric_divisor: 4,
      min_quantity: 1,
      accessories: { model: 'Management Module' },
    });

    // Exactly one group of 4 -> 1 unit.
    expect(applyAccessoryRules(makeGeneratedSolution({ battery_quantity: 4 }), [rule]).accessories).toEqual([
      { model: 'Management Module', quantity: 1 },
    ]);
    // One battery over a full group of 4 still needs a second unit (rounds up).
    expect(applyAccessoryRules(makeGeneratedSolution({ battery_quantity: 5 }), [rule]).accessories).toEqual([
      { model: 'Management Module', quantity: 2 },
    ]);
    // Two full groups -> 2 units, no rounding needed.
    expect(applyAccessoryRules(makeGeneratedSolution({ battery_quantity: 8 }), [rule]).accessories).toEqual([
      { model: 'Management Module', quantity: 2 },
    ]);
  });

  it('multiplies quantity_per_match by the number of complete groups when scaling with a divisor', () => {
    const solution = makeGeneratedSolution({ battery_quantity: 9 });
    const rules = [
      makeAccessoryRule({
        id: 'r1',
        quantity_per_match: 2,
        scale_with_metric: true,
        trigger_metric: 'battery_quantity',
        metric_divisor: 4,
        min_quantity: 1,
        accessories: { model: 'Bracket Pair' },
      }),
    ];
    // ceil(9/4) = 3 groups x 2 per group = 6.
    const result = applyAccessoryRules(solution, rules);
    expect(result.accessories).toEqual([{ model: 'Bracket Pair', quantity: 6 }]);
  });

  it('gates battery_quantity_per_port on average batteries-per-port, but scales by total ports (not the ratio)', () => {
    const rule = makeAccessoryRule({
      id: 'r1',
      quantity_per_match: 1,
      scale_with_metric: true,
      trigger_metric: 'battery_quantity_per_port',
      min_quantity: 4,
      metric_divisor: 1,
      accessories: { model: 'Port Module' },
    });

    // 2 inverters x 1 port each = 2 total ports; 8 batteries / 2 ports = 4/port -> gate passes.
    const dense = makeGeneratedSolution({ inverter_quantity: 2, battery_ports_used: 1, battery_quantity: 8 });
    expect(applyAccessoryRules(dense, [rule]).accessories).toEqual([{ model: 'Port Module', quantity: 2 }]);

    // Same 2 ports but only 6 batteries -> 3/port, still >= 4? No: 3 < 4, gate fails, rule doesn't match at all.
    const sparse = makeGeneratedSolution({ inverter_quantity: 2, battery_ports_used: 1, battery_quantity: 6 });
    expect(applyAccessoryRules(sparse, [rule]).accessories).toEqual([]);
  });
});

describe('buildRuleGeneratedSolutions', () => {
  const inverter = makeInverter({ model: 'X1-Hybrid-5.0kW-G4', grid_types: ['1P_220V'], battery_ports: 1 });
  const battery = makeBattery({ model: 'TP-HS3.6', topology: 'HV', max_association_qty: 3 });
  const essRule: EssCompatibilityRuleRow = {
    id: 'rule-1',
    name: 'Regra 1',
    inverter_model: 'X1-Hybrid-5.0kW-G4',
    battery_model: 'TP-HS3.6',
    battery_topology: 'HV',
    grid_topology: null,
    max_parallel_inverters: 1,
    min_battery_qty: 1,
    max_battery_qty: 2,
    battery_configs: [],
    comment: null,
    active: true,
    created_at: '',
  };

  it('generates one combination per battery quantity in range, with unique deterministic codes', () => {
    const solutions = buildRuleGeneratedSolutions({
      inverters: [inverter],
      batteries: [battery],
      accessoryRules: [],
      essRules: [essRule],
    });

    expect(solutions).toHaveLength(2); // 1 and 2 batteries per port
    expect(solutions.map((s) => s.battery_quantity)).toEqual([1, 2]);
    expect(new Set(solutions.map((s) => s.solution_code)).size).toBe(2);
    expect(solutions[0].source_file).toBe('generated-rules');
    expect(solutions[0].grid_topology).toBe('1p_220V');
  });

  it('skips a rule whose inverter or battery is unknown', () => {
    const solutions = buildRuleGeneratedSolutions({
      inverters: [],
      batteries: [battery],
      accessoryRules: [],
      essRules: [essRule],
    });
    expect(solutions).toEqual([]);
  });

  it('skips an inactive rule', () => {
    const solutions = buildRuleGeneratedSolutions({
      inverters: [inverter],
      batteries: [battery],
      accessoryRules: [],
      essRules: [{ ...essRule, active: false }],
    });
    expect(solutions).toEqual([]);
  });

  it('honors filterInverterModels / filterBatteryModels', () => {
    const solutions = buildRuleGeneratedSolutions({
      inverters: [inverter],
      batteries: [battery],
      accessoryRules: [],
      essRules: [essRule],
      filterInverterModels: new Set(['some-other-model']),
    });
    expect(solutions).toEqual([]);
  });

  it('applies matching accessory rules onto each generated solution', () => {
    const rules = [makeAccessoryRule({ id: 'r1', accessories: { model: 'Smart Meter' } })];
    const solutions = buildRuleGeneratedSolutions({
      inverters: [inverter],
      batteries: [battery],
      accessoryRules: rules,
      essRules: [essRule],
    });
    expect(solutions[0].accessories).toEqual([{ model: 'Smart Meter', quantity: 1 }]);
  });

  it('sorts results by inverter, battery, inverter qty, ports, then batteries per port', () => {
    const solutions = buildRuleGeneratedSolutions({
      inverters: [inverter],
      batteries: [battery],
      accessoryRules: [],
      essRules: [essRule],
    });
    const quantities = solutions.map((s) => s.battery_quantity);
    expect(quantities).toEqual([...quantities].sort((a, b) => a - b));
  });
});

describe('expansionModelSet', () => {
  it('collects every expansion_model referenced by any battery, ignoring null/undefined', () => {
    const set = expansionModelSet([
      makeBattery({ model: 'T58 V2 Master', topology: 'HV', expansion_model: 'T58 Slave' }),
      makeBattery({ model: 'TP-HS3.6', topology: 'HV' }),
    ]);
    expect(set).toEqual(new Set(['T58 Slave']));
  });
});

describe('buildRuleGeneratedSolutions: expansion/Slave battery exclusion', () => {
  const inverter = makeInverter({ model: 'X1-Hybrid-5.0kW-G4', grid_types: ['1P_220V'], battery_ports: 1 });

  it('never generates a combination whose battery_model is another battery\'s expansion_model', () => {
    const master = makeBattery({ model: 'T58 V2 Master', topology: 'HV', expansion_model: 'T58 Slave' });
    const slave = makeBattery({ model: 'T58 Slave', topology: 'HV' });
    const ruleTargetingSlaveDirectly: EssCompatibilityRuleRow = {
      id: 'rule-slave',
      name: 'Regra com Slave direto',
      inverter_model: 'X1-Hybrid-5.0kW-G4',
      battery_model: 'T58 Slave',
      battery_topology: 'HV',
      grid_topology: null,
      max_parallel_inverters: 1,
      min_battery_qty: 1,
      max_battery_qty: 2,
      battery_configs: [],
      comment: null,
      active: true,
      created_at: '',
    };

    const solutions = buildRuleGeneratedSolutions({
      inverters: [inverter],
      batteries: [master, slave],
      accessoryRules: [],
      essRules: [ruleTargetingSlaveDirectly],
    });

    expect(solutions).toEqual([]);
  });
});

describe('fetchApprovedSolutions', () => {
  it('returns all rows from a single page', async () => {
    const rows = [{ id: 's1' }, { id: 's2' }];
    const supabase = createSupabaseMock({ tableResults: { approved_solutions: { data: rows, error: null } } });
    const result = await fetchApprovedSolutions(supabase as never);
    expect(result.data).toEqual(rows);
    expect(result.error).toBeNull();
  });

  it('returns the error and whatever was collected so far when a page fails', async () => {
    const supabase = createSupabaseMock({
      tableResults: { approved_solutions: { data: null, error: { message: 'db down' } } },
    });
    const result = await fetchApprovedSolutions(supabase as never);
    expect(result.data).toEqual([]);
    expect(result.error).toEqual({ message: 'db down' });
  });
});
