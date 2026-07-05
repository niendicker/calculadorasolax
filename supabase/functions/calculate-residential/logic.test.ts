import { describe, expect, it } from 'vitest';
import {
  matchingEssBatteryConfig,
  normalizeStandardGridTopology,
  ruleMatches,
  totalDailyKwh,
  totalNominalW,
  totalPeakW,
  validateResidentialOptions,
  type AccessoryRule,
  type ApprovedSolution,
  type EssCompatibilityRule,
  type SingleLoad,
} from './logic';

function makeSolution(partial: Partial<ApprovedSolution> = {}): ApprovedSolution {
  return {
    id: 'sol-1',
    source_file: 'test',
    solution_code: 'code-1',
    inverter_model: 'X1-Hybrid-5.0-D',
    inverter_quantity: 1,
    battery_ports_used: 1,
    rated_power_w: 5000,
    peak_power_w: 6000,
    grid_topology: '1p_220V',
    battery_model: 'T-BAT-SYS HV 5.8 V2',
    battery_topology: 'HV',
    battery_quantity: 1,
    battery_power_w: 2800,
    available_energy_wh: 5220,
    accessories: [],
    comments: [],
    ...partial,
  };
}

function makeRule(partial: Partial<AccessoryRule> = {}): AccessoryRule {
  return {
    id: 'rule-1',
    name: 'rule',
    inclusion: 'optional',
    trigger_metric: 'per_solution',
    min_quantity: 1,
    inverter_model: null,
    inverter_models: null,
    battery_model: null,
    grid_topology: null,
    battery_topology: null,
    quantity_per_match: 1,
    comment: null,
    accessories: { model: 'Smart Meter' },
    ...partial,
  };
}

describe('totalNominalW / totalPeakW / totalDailyKwh', () => {
  const loads: SingleLoad[] = [
    { powerW: 1000, hoursPerDay: 2, qty: 1, ipInRatio: 3 },
    { powerW: 100, hoursPerDay: 5, qty: 4 },
  ];

  it('totalNominalW sums powerW x qty, ignoring ipInRatio', () => {
    expect(totalNominalW(loads)).toBe(1000 * 1 + 100 * 4);
  });

  it('totalDailyKwh sums powerW x hoursPerDay x qty in kWh', () => {
    expect(totalDailyKwh(loads)).toBeCloseTo((1000 * 2 * 1 + 100 * 5 * 4) / 1000);
  });

  it('totalPeakW sum mode multiplies by ipInRatio per load', () => {
    expect(totalPeakW(loads, 'sum')).toBe(1000 * 3 * 1 + 100 * 1 * 4);
  });

  it('totalPeakW largest-surge mode only applies the biggest single-unit surge', () => {
    // nominal = 1000 + 400 = 1400; largest extra = 1000 x (3-1) = 2000
    expect(totalPeakW(loads, 'largest-surge')).toBe(1400 + 2000);
  });
});

describe('normalizeStandardGridTopology', () => {
  it('accepts already-normalized values as-is', () => {
    expect(normalizeStandardGridTopology('3P_380V')).toBe('3P_380V');
  });

  it('upper-cases the approved-solutions lowercase form', () => {
    expect(normalizeStandardGridTopology('2p_220V')).toBe('2P_220V');
  });

  it('returns null for unknown or missing values', () => {
    expect(normalizeStandardGridTopology('9p_999V')).toBeNull();
    expect(normalizeStandardGridTopology(null)).toBeNull();
  });
});

describe('matchingEssBatteryConfig', () => {
  it('prefers a per-battery config from battery_configs when present', () => {
    const rule: EssCompatibilityRule = {
      id: 'r1',
      inverter_model: 'X3-ULT-30K',
      battery_model: 'fallback-model',
      battery_topology: 'HV',
      grid_topology: null,
      max_parallel_inverters: 1,
      min_battery_qty: 1,
      max_battery_qty: 2,
      active: true,
      battery_configs: [
        { battery_model: 'T-BAT-SYS HV 5.8 V2', battery_topology: 'HV', min_battery_qty: 2, max_battery_qty: 6 },
      ],
    };
    const config = matchingEssBatteryConfig(rule, 'T-BAT-SYS HV 5.8 V2');
    expect(config).toEqual({
      battery_model: 'T-BAT-SYS HV 5.8 V2',
      battery_topology: 'HV',
      min_battery_qty: 2,
      max_battery_qty: 6,
    });
  });

  it('falls back to the rule-level battery_model when no per-battery config matches', () => {
    const rule: EssCompatibilityRule = {
      id: 'r2',
      inverter_model: 'X3-ULT-30K',
      battery_model: 'T-BAT-SYS HV 5.8 V2',
      battery_topology: 'HV',
      grid_topology: null,
      max_parallel_inverters: 1,
      min_battery_qty: 1,
      max_battery_qty: 4,
      active: true,
      battery_configs: null,
    };
    expect(matchingEssBatteryConfig(rule, 'T-BAT-SYS HV 5.8 V2')).toEqual({
      battery_model: 'T-BAT-SYS HV 5.8 V2',
      battery_topology: 'HV',
      min_battery_qty: 1,
      max_battery_qty: 4,
    });
  });

  it('returns null when the battery model matches nothing in the rule', () => {
    const rule: EssCompatibilityRule = {
      id: 'r3',
      inverter_model: 'X3-ULT-30K',
      battery_model: 'Other Battery',
      battery_topology: 'HV',
      grid_topology: null,
      max_parallel_inverters: 1,
      min_battery_qty: 1,
      max_battery_qty: 4,
      active: true,
      battery_configs: null,
    };
    expect(matchingEssBatteryConfig(rule, 'T-BAT-SYS HV 5.8 V2')).toBeNull();
  });
});

describe('ruleMatches', () => {
  it('matches when there is no inverter/battery/grid restriction and the metric threshold is met', () => {
    const solution = makeSolution();
    const rule = makeRule({ min_quantity: 1, trigger_metric: 'per_solution' });
    expect(ruleMatches(solution, rule, '1P_220V')).toBe(true);
  });

  it('rejects when the solution inverter is not in inverter_models', () => {
    const solution = makeSolution({ inverter_model: 'X1-Hybrid-5.0-D' });
    const rule = makeRule({ inverter_models: ['X3-ULT-30K'] });
    expect(ruleMatches(solution, rule, '1P_220V')).toBe(false);
  });

  it('accepts when the solution inverter is included in inverter_models', () => {
    const solution = makeSolution({ inverter_model: 'X3-ULT-30K' });
    const rule = makeRule({ inverter_models: ['X3-ULT-30K', 'X1-Hybrid-5.0-D'] });
    expect(ruleMatches(solution, rule, '1P_220V')).toBe(true);
  });

  it('rejects when battery_model is set and does not match', () => {
    const solution = makeSolution({ battery_model: 'Battery A' });
    const rule = makeRule({ battery_model: 'Battery B' });
    expect(ruleMatches(solution, rule, '1P_220V')).toBe(false);
  });

  it('rejects when grid_topology is set and does not match the requested topology', () => {
    const solution = makeSolution();
    const rule = makeRule({ grid_topology: '3p_380V' });
    expect(ruleMatches(solution, rule, '1P_220V')).toBe(false);
  });

  it('accepts when grid_topology matches after normalization', () => {
    const solution = makeSolution();
    const rule = makeRule({ grid_topology: '1p_220V' });
    expect(ruleMatches(solution, rule, '1P_220V')).toBe(true);
  });

  it('rejects when battery_topology is set and does not match', () => {
    const solution = makeSolution({ battery_topology: 'HV' });
    const rule = makeRule({ battery_topology: 'LV' });
    expect(ruleMatches(solution, rule, '1P_220V')).toBe(false);
  });

  it('rejects when the trigger metric value is below min_quantity', () => {
    const solution = makeSolution({ inverter_quantity: 1 });
    const rule = makeRule({ trigger_metric: 'inverter_quantity', min_quantity: 2 });
    expect(ruleMatches(solution, rule, '1P_220V')).toBe(false);
  });

  it('accepts when the trigger metric value meets min_quantity', () => {
    const solution = makeSolution({ battery_quantity: 3 });
    const rule = makeRule({ trigger_metric: 'battery_quantity', min_quantity: 2 });
    expect(ruleMatches(solution, rule, '1P_220V')).toBe(true);
  });
});

describe('validateResidentialOptions', () => {
  function validPayload() {
    return {
      topology: 'HighVoltage',
      batteryModel: null,
      inverterModel: null,
      gridType: 'singlePhase_220',
      loads: [{ powerW: 100, hoursPerDay: 2, qty: 1 }],
      microGrid: null,
    };
  }

  it('accepts a well-formed payload with no errors', () => {
    expect(validateResidentialOptions(validPayload())).toEqual([]);
  });

  it('rejects a non-object payload', () => {
    expect(validateResidentialOptions(null)).toHaveLength(1);
    expect(validateResidentialOptions('nope')).toHaveLength(1);
    expect(validateResidentialOptions([1, 2, 3])).toHaveLength(1);
  });

  it('rejects an unknown gridType', () => {
    const errors = validateResidentialOptions({ ...validPayload(), gridType: 'fivePhase_9000' });
    expect(errors.some((e) => e.includes('gridType'))).toBe(true);
  });

  it('rejects an unknown topology', () => {
    const errors = validateResidentialOptions({ ...validPayload(), topology: 'Nuclear' });
    expect(errors.some((e) => e.includes('topology'))).toBe(true);
  });

  it('rejects an empty loads array', () => {
    const errors = validateResidentialOptions({ ...validPayload(), loads: [] });
    expect(errors).toContain('loads must be a non-empty array');
  });

  it('rejects negative or zero powerW', () => {
    const errors = validateResidentialOptions({
      ...validPayload(),
      loads: [{ powerW: -10, hoursPerDay: 1, qty: 1 }],
    });
    expect(errors.some((e) => e.includes('powerW'))).toBe(true);
  });

  it('rejects qty zero or non-integer', () => {
    const zeroQty = validateResidentialOptions({
      ...validPayload(),
      loads: [{ powerW: 100, hoursPerDay: 1, qty: 0 }],
    });
    expect(zeroQty.some((e) => e.includes('qty'))).toBe(true);

    const fractionalQty = validateResidentialOptions({
      ...validPayload(),
      loads: [{ powerW: 100, hoursPerDay: 1, qty: 1.5 }],
    });
    expect(fractionalQty.some((e) => e.includes('qty'))).toBe(true);
  });

  it('rejects hoursPerDay outside 0-24', () => {
    const errors = validateResidentialOptions({
      ...validPayload(),
      loads: [{ powerW: 100, hoursPerDay: 25, qty: 1 }],
    });
    expect(errors.some((e) => e.includes('hoursPerDay'))).toBe(true);
  });

  it('rejects an ipInRatio below 1 when provided', () => {
    const errors = validateResidentialOptions({
      ...validPayload(),
      loads: [{ powerW: 100, hoursPerDay: 1, qty: 1, ipInRatio: 0.5 }],
    });
    expect(errors.some((e) => e.includes('ipInRatio'))).toBe(true);
  });

  it('rejects a batteryModel that is neither a string nor null', () => {
    const errors = validateResidentialOptions({ ...validPayload(), batteryModel: 42 });
    expect(errors.some((e) => e.includes('batteryModel'))).toBe(true);
  });

  it('rejects an unknown peakCalcMode', () => {
    const errors = validateResidentialOptions({ ...validPayload(), peakCalcMode: 'yolo' });
    expect(errors.some((e) => e.includes('peakCalcMode'))).toBe(true);
  });

  it('accepts a null or omitted microGrid, and rejects an unknown one', () => {
    expect(validateResidentialOptions({ ...validPayload(), microGrid: null })).toEqual([]);
    const { microGrid: _drop, ...withoutMicroGrid } = validPayload();
    expect(validateResidentialOptions(withoutMicroGrid)).toEqual([]);
    const errors = validateResidentialOptions({ ...validPayload(), microGrid: 'Nuclear plant' });
    expect(errors.some((e) => e.includes('microGrid'))).toBe(true);
  });
});
