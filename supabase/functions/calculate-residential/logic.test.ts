import { describe, expect, it } from 'vitest';
import {
  blockingDesiredFeatures,
  buildSolutionPayload,
  computeHardFilterFeatures,
  computePvMonthlyGenerationKwh,
  computePvPowerKw,
  desiredPvPowerKw,
  effectiveTargetEnergyWh,
  effectiveTargetPowerW,
  filterSolutionsByPvCapacity,
  filterSolutionsByRequiredFlags,
  inverterSatisfiesRequiredFlags,
  matchingEssBatteryConfig,
  normalizeStandardGridTopology,
  rankByLeastShortfall,
  requiredInverterFlags,
  resolveMicrogridSelection,
  ruleMatches,
  solutionSupportsMicrogrid,
  totalDailyKwh,
  totalNominalW,
  totalPeakW,
  validateResidentialOptions,
  type AccessoryRule,
  type ApprovedSolution,
  type EssCompatibilityRule,
  type InverterCapabilities,
  type MicrogridConfig,
  type PvCapableInverter,
  type SingleLoad,
  type WhiteTariffConfig,
} from './logic';

function makeWhiteTariff(partial: Partial<WhiteTariffConfig> = {}): WhiteTariffConfig {
  return {
    requiredPowerW: 2000,
    pontaEnergyWh: 4000,
    intermediateEnergyWh: 0,
    pontaTariffPerKwh: 1.2,
    intermediateTariffPerKwh: 0.95,
    foraPontaTariffPerKwh: 0.8,
    ...partial,
  };
}

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
    scale_with_metric: false,
    metric_divisor: 1,
    comment: null,
    desired_features: [],
    excludes_accessory_models: [],
    bundled: false,
    accessories: { model: 'Smart Meter' },
    ...partial,
  };
}

describe('totalNominalW / totalPeakW / totalDailyKwh', () => {
  const loads: SingleLoad[] = [
    { powerW: 1000, qty: 1, ipInRatio: 3 },
    { powerW: 100, qty: 4 },
  ];

  it('totalNominalW sums powerW x qty, ignoring ipInRatio', () => {
    expect(totalNominalW(loads)).toBe(1000 * 1 + 100 * 4);
  });

  it('totalDailyKwh sums powerW x qty across loads, scaled by the shared operationHours, in kWh', () => {
    // (1000 x 1 + 100 x 4) W x 2h / 1000 = 2.8 kWh
    expect(totalDailyKwh(loads, 2)).toBeCloseTo(((1000 * 1 + 100 * 4) * 2) / 1000);
  });

  it('totalDailyKwh returns 0 when operationHours is 0', () => {
    expect(totalDailyKwh(loads, 0)).toBe(0);
  });

  it('totalDailyKwh scales by usageFactor, defaulting to 1 when absent', () => {
    const withUsageFactor: SingleLoad[] = [{ powerW: 1000, qty: 1, usageFactor: 0.5 }];
    expect(totalDailyKwh(withUsageFactor, 2)).toBeCloseTo(1.0);
  });

  it('totalPeakW ignores usageFactor (energy-only factor does not affect peak power)', () => {
    const withUsageFactor: SingleLoad[] = [{ powerW: 1000, qty: 1, ipInRatio: 2, usageFactor: 0.5 }];
    expect(totalPeakW(withUsageFactor)).toBe(2000);
  });

  it('totalPeakW sum mode multiplies by ipInRatio per load', () => {
    expect(totalPeakW(loads, 'sum')).toBe(1000 * 3 * 1 + 100 * 1 * 4);
  });

  it('totalPeakW largest-surge mode only applies the biggest single-unit surge', () => {
    // nominal = 1000 + 400 = 1400; largest extra = 1000 x (3-1) = 2000
    expect(totalPeakW(loads, 'largest-surge')).toBe(1400 + 2000);
  });

  it('totalPeakW select mode only sums loads flagged includedInPeak', () => {
    const selectLoads: SingleLoad[] = [
      { powerW: 1000, qty: 3, ipInRatio: 1, includedInPeak: true },
      { powerW: 100, qty: 4, ipInRatio: 1, includedInPeak: false },
    ];
    expect(totalPeakW(selectLoads, 'select')).toBe(1000 * 3);
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
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(true);
  });

  it('rejects when the solution inverter is not in inverter_models', () => {
    const solution = makeSolution({ inverter_model: 'X1-Hybrid-5.0-D' });
    const rule = makeRule({ inverter_models: ['X3-ULT-30K'] });
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(false);
  });

  it('accepts when the solution inverter is included in inverter_models', () => {
    const solution = makeSolution({ inverter_model: 'X3-ULT-30K' });
    const rule = makeRule({ inverter_models: ['X3-ULT-30K', 'X1-Hybrid-5.0-D'] });
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(true);
  });

  it('rejects when battery_model is set and does not match', () => {
    const solution = makeSolution({ battery_model: 'Battery A' });
    const rule = makeRule({ battery_model: 'Battery B' });
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(false);
  });

  it('rejects when grid_topology is set and does not match the requested topology', () => {
    const solution = makeSolution();
    const rule = makeRule({ grid_topology: '3p_380V' });
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(false);
  });

  it('accepts when grid_topology matches after normalization', () => {
    const solution = makeSolution();
    const rule = makeRule({ grid_topology: '1p_220V' });
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(true);
  });

  it('rejects when battery_topology is set and does not match', () => {
    const solution = makeSolution({ battery_topology: 'HV' });
    const rule = makeRule({ battery_topology: 'LV' });
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(false);
  });

  it('rejects when the trigger metric value is below min_quantity', () => {
    const solution = makeSolution({ inverter_quantity: 1 });
    const rule = makeRule({ trigger_metric: 'inverter_quantity', min_quantity: 2 });
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(false);
  });

  it('accepts when the trigger metric value meets min_quantity', () => {
    const solution = makeSolution({ battery_quantity: 3 });
    const rule = makeRule({ trigger_metric: 'battery_quantity', min_quantity: 2 });
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(true);
  });

  it('accepts a rule with no desired_features regardless of what the customer enabled', () => {
    const solution = makeSolution();
    const rule = makeRule({ desired_features: [] });
    expect(ruleMatches(solution, rule, '1P_220V', [])).toBe(true);
    expect(ruleMatches(solution, rule, '1P_220V', ['backup'])).toBe(true);
  });

  it('rejects a rule with desired_features when none of them is enabled', () => {
    const solution = makeSolution();
    const rule = makeRule({ desired_features: ['external_ats', 'external_generator'] });
    expect(ruleMatches(solution, rule, '1P_220V', ['backup'])).toBe(false);
  });

  it('accepts a rule with desired_features when at least one is enabled (OR)', () => {
    const solution = makeSolution();
    const rule = makeRule({ desired_features: ['external_ats', 'external_generator'] });
    expect(ruleMatches(solution, rule, '1P_220V', ['backup', 'external_generator'])).toBe(true);
  });
});

describe('desiredPvPowerKw', () => {
  it('sizes from monthly consumption / 30 / HSP, uncapped by any inverter', () => {
    // 3000 kWh/mo / 30 = 100 kWh/day; / 2 HSP = 50 kW — computePvPowerKw would
    // cap this, but the raw desired size doesn't.
    expect(desiredPvPowerKw({ monthlyConsumptionKwh: 3000, hsp: 2 })).toBe(50);
  });

  it('returns 0 when monthlyConsumptionKwh or hsp is not positive', () => {
    expect(desiredPvPowerKw({ monthlyConsumptionKwh: 0, hsp: 4 })).toBe(0);
    expect(desiredPvPowerKw({ monthlyConsumptionKwh: 300, hsp: 0 })).toBe(0);
  });
});

describe('computePvPowerKw', () => {
  it('sizes from monthly consumption / 30 / HSP', () => {
    // 300 kWh/mo / 30 = 10 kWh/day; / 4 HSP = 2.5 kW.
    expect(computePvPowerKw({ monthlyConsumptionKwh: 300, hsp: 4 }, 10000, 100)).toBe(2.5);
  });

  it('caps at rated power scaled by pv_oversizing_percent', () => {
    // Raw would be 3000/30/2 = 50 kW, but 5000W rated x (1+50%) = 7.5 kW caps it.
    expect(computePvPowerKw({ monthlyConsumptionKwh: 3000, hsp: 2 }, 5000, 50)).toBe(7.5);
  });

  it('returns 0 when monthlyConsumptionKwh or hsp is not positive', () => {
    expect(computePvPowerKw({ monthlyConsumptionKwh: 0, hsp: 4 }, 10000, 100)).toBe(0);
    expect(computePvPowerKw({ monthlyConsumptionKwh: 300, hsp: 0 }, 10000, 100)).toBe(0);
  });
});

describe('computePvMonthlyGenerationKwh', () => {
  it('multiplies pvPowerKw x HSP x 30 days', () => {
    expect(computePvMonthlyGenerationKwh(2.5, 4)).toBe(300);
  });
});

describe('buildSolutionPayload', () => {
  it('uses the solution own available_energy_wh when there is no per-battery override', () => {
    const solution = makeSolution({ available_energy_wh: 5220 });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      // 108 kWh/mo / 30 / 3 HSP = 1.2 kW raw, well under the 10kW oversizing cap.
      pv: { monthlyConsumptionKwh: 108, hsp: 3 },
      pvOversizingPercent: 100,
      accessoryRules: [],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.availableEnergyWh).toBe(5220);
    expect(payload.pvPowerKw).toBe(1.2);
    expect(payload.solutionId).toBe(solution.id);
    expect(payload.inverterModel).toBe(solution.inverter_model);
  });

  it('overrides available energy with usefulEnergyWhPerBattery x battery_quantity when given', () => {
    const solution = makeSolution({ available_energy_wh: 9999, battery_quantity: 2 });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: 5220,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.availableEnergyWh).toBe(10440);
    expect(payload.pvPowerKw).toBeNull();
  });

  it('rounds pvPowerKw up to one decimal place', () => {
    const solution = makeSolution();
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      // 110.7 kWh/mo / 30 / 3 HSP = 1.23 kW raw -> rounds up to 1.3.
      pv: { monthlyConsumptionKwh: 110.7, hsp: 3 },
      pvOversizingPercent: 100,
      accessoryRules: [],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.pvPowerKw).toBe(1.3);
  });

  it('caps pvPowerKw at the inverter rated power scaled by pv_oversizing_percent', () => {
    // 5000W rated x (1 + 50%) = 7.5 kW max — well below the raw consumption-based figure.
    const solution = makeSolution({ rated_power_w: 5000 });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: { monthlyConsumptionKwh: 3000, hsp: 3 },
      pvOversizingPercent: 50,
      accessoryRules: [],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.pvPowerKw).toBe(7.5);
  });

  it('computes monthly generation from pvPowerKw and HSP', () => {
    const solution = makeSolution({ rated_power_w: 10000 });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: { monthlyConsumptionKwh: 450, hsp: 5 },
      pvOversizingPercent: 100,
      accessoryRules: [],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    // 450/30/5 = 3 kW raw, under the 20kW cap -> pvPowerKw 3.
    expect(payload.pvPowerKw).toBe(3);
    // 3 kW x 5 HSP x 30 days = 450 kWh/mo.
    expect(payload.pvMonthlyGenerationKwh).toBe(450);
  });

  it('omits monthly generation when pv is null (PV not opted into)', () => {
    const solution = makeSolution();
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.pvPowerKw).toBeNull();
    expect(payload.pvMonthlyGenerationKwh).toBeNull();
  });

  it('applies matching accessory rules on top of the solution own accessories, deduped and labeled', () => {
    const solution = makeSolution({ accessories: [{ model: 'X1-Matebox Advanced', quantity: 1 }] });
    const matchingRule = makeRule({
      quantity_per_match: 2,
      inclusion: 'optional',
      accessories: { model: 'Smart Meter - M1-40' },
    });
    const nonMatchingRule = makeRule({
      inverter_models: ['some-other-inverter'],
      accessories: { model: 'Should Not Appear' },
    });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [matchingRule, nonMatchingRule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(
      expect.objectContaining({ model: 'X1-Matebox Advanced', optional: false, appliesTo: 'system' })
    );
    expect(payload.accessories).toContainEqual(
      expect.objectContaining({ model: 'Smart Meter - M1-40', qty: 2, optional: true })
    );
    expect(payload.accessories.some((a) => a.model.includes('Should Not Appear'))).toBe(false);
  });

  it('multiplies quantity_per_match by the trigger metric\'s value when scale_with_metric is on', () => {
    const solution = makeSolution({ battery_ports_used: 2 });
    const rule = makeRule({
      quantity_per_match: 1,
      scale_with_metric: true,
      trigger_metric: 'battery_ports_used',
      min_quantity: 1,
      accessories: { model: 'TBMS-MCS0800' },
    });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(expect.objectContaining({ model: 'TBMS-MCS0800', qty: 2 }));
  });

  it('scales battery_ports_used by the total ports across every inverter, not just one inverter\'s ports', () => {
    // 2 inverters x 2 ports each = 4 physical ports in the whole solution.
    const solution = makeSolution({ inverter_quantity: 2, battery_ports_used: 2 });
    const rule = makeRule({
      quantity_per_match: 1,
      scale_with_metric: true,
      trigger_metric: 'battery_ports_used',
      min_quantity: 1,
      accessories: { model: 'TBMS-MCS0800' },
    });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(expect.objectContaining({ model: 'TBMS-MCS0800', qty: 4 }));
  });

  it('gates battery_ports_used on the total ports across every inverter', () => {
    // 2 inverters x 1 port each = 2 total ports, enough to clear a min_quantity of 2
    // even though each inverter alone only uses 1 port.
    const solution = makeSolution({ inverter_quantity: 2, battery_ports_used: 1 });
    const rule = makeRule({
      trigger_metric: 'battery_ports_used',
      min_quantity: 2,
      accessories: { model: 'TBMS-MCS0800' },
    });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(expect.objectContaining({ model: 'TBMS-MCS0800' }));
  });

  it('keeps a flat quantity_per_match when scale_with_metric is off, even past min_quantity', () => {
    const solution = makeSolution({ battery_ports_used: 2 });
    const rule = makeRule({
      quantity_per_match: 1,
      scale_with_metric: false,
      trigger_metric: 'battery_ports_used',
      min_quantity: 1,
      accessories: { model: 'TBMS-MCS0800' },
    });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(expect.objectContaining({ model: 'TBMS-MCS0800', qty: 1 }));
  });

  it('divides the metric by metric_divisor, rounding up, before multiplying by quantity_per_match', () => {
    const rule = makeRule({
      quantity_per_match: 1,
      scale_with_metric: true,
      trigger_metric: 'battery_quantity',
      metric_divisor: 4,
      min_quantity: 1,
      accessories: { model: 'Management Module' },
    });
    const build = (batteryQuantity: number) =>
      buildSolutionPayload(makeSolution({ battery_quantity: batteryQuantity }), {
        usefulEnergyWhPerBattery: null,
        pv: null,
        pvOversizingPercent: 100,
        accessoryRules: [rule],
        standardGridTopology: '1P_220V',
        desiredFeatures: [],
      });

    // Exactly one group of 4 -> 1 unit.
    expect(build(4).accessories).toContainEqual(expect.objectContaining({ model: 'Management Module', qty: 1 }));
    // One battery over a full group of 4 still needs a second unit (rounds up).
    expect(build(5).accessories).toContainEqual(expect.objectContaining({ model: 'Management Module', qty: 2 }));
    // Two full groups -> 2 units, no rounding needed.
    expect(build(8).accessories).toContainEqual(expect.objectContaining({ model: 'Management Module', qty: 2 }));
  });

  it('gates battery_quantity_per_port on average batteries-per-port, but scales by total ports (not the ratio)', () => {
    const rule = makeRule({
      quantity_per_match: 1,
      scale_with_metric: true,
      trigger_metric: 'battery_quantity_per_port',
      min_quantity: 4,
      metric_divisor: 1,
      accessories: { model: 'Port Module' },
    });

    // 2 inverters x 1 port each = 2 total ports; 8 batteries / 2 ports = 4/port -> gate passes.
    const dense = buildSolutionPayload(makeSolution({ inverter_quantity: 2, battery_ports_used: 1, battery_quantity: 8 }), {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(dense.accessories).toContainEqual(expect.objectContaining({ model: 'Port Module', qty: 2 }));

    // Same 2 ports but only 6 batteries -> 3/port, below the 4 threshold: rule doesn't match at all.
    const sparse = buildSolutionPayload(makeSolution({ inverter_quantity: 2, battery_ports_used: 1, battery_quantity: 6 }), {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(sparse.accessories.some((a) => a.model === 'Port Module')).toBe(false);
  });

  it('drops an accessory whose own rule matched when another matching rule excludes it', () => {
    const solution = makeSolution({ inverter_quantity: 2 });
    const rules = [
      makeRule({
        trigger_metric: 'inverter_quantity',
        min_quantity: 2,
        accessories: { model: 'Paralleling Bracket' },
      }),
      makeRule({
        accessories: { model: 'ATS Enclosure' },
        excludes_accessory_models: ['Paralleling Bracket'],
      }),
    ];
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: rules,
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories.some((a) => a.model === 'Paralleling Bracket')).toBe(false);
    expect(payload.accessories).toContainEqual(expect.objectContaining({ model: 'ATS Enclosure' }));
  });

  it('excludes even an accessory baked into the solution\'s own base accessory list', () => {
    const solution = makeSolution({ inverter_quantity: 2, accessories: [{ model: 'Paralleling Bracket', quantity: 1 }] });
    const rule = makeRule({
      accessories: { model: 'ATS Enclosure' },
      excludes_accessory_models: ['Paralleling Bracket'],
    });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories.some((a) => a.model === 'Paralleling Bracket')).toBe(false);
  });

  it('marks an accessory bundled when the matching rule has bundled set', () => {
    const solution = makeSolution();
    const rule = makeRule({ accessories: { model: 'WiFi Dongle' }, bundled: true });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(expect.objectContaining({ model: 'WiFi Dongle', bundled: true }));
  });

  it('marks an accessory baked into the solution\'s own base list as bundled when its rule matches', () => {
    const solution = makeSolution({ accessories: [{ model: 'WiFi Dongle', quantity: 1 }] });
    const rule = makeRule({ accessories: { model: 'WiFi Dongle' }, bundled: true });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(expect.objectContaining({ model: 'WiFi Dongle', bundled: true }));
  });

  it('infers appliesTo from the matching rule\'s inverter/battery model scope', () => {
    const solution = makeSolution();
    const inverterRule = makeRule({
      inverter_models: [solution.inverter_model],
      accessories: { model: 'Inverter Only Accessory' },
    });
    const batteryRule = makeRule({
      battery_model: solution.battery_model,
      accessories: { model: 'Battery Only Accessory' },
    });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [inverterRule, batteryRule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(
      expect.objectContaining({ model: 'Inverter Only Accessory', appliesTo: 'inverter' })
    );
    expect(payload.accessories).toContainEqual(
      expect.objectContaining({ model: 'Battery Only Accessory', appliesTo: 'battery' })
    );
  });

  it('only includes an accessory gated by desired_features when the customer enabled it', () => {
    const solution = makeSolution();
    const gatedRule = makeRule({
      desired_features: ['external_ats'],
      accessories: { model: 'ATS Accessory' },
    });
    const withoutFeature = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [gatedRule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(withoutFeature.accessories.some((a) => a.model === 'ATS Accessory')).toBe(false);

    const withFeature = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [gatedRule],
      standardGridTopology: '1P_220V',
      desiredFeatures: ['external_ats'],
    });
    expect(withFeature.accessories.some((a) => a.model === 'ATS Accessory')).toBe(true);
  });

  it('does not duplicate an accessory already present in the solution', () => {
    const solution = makeSolution({ accessories: [{ model: 'Smart Meter - M1-40', quantity: 1 }] });
    const rule = makeRule({ accessories: { model: 'Smart Meter - M1-40' } });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories.filter((a) => a.model.includes('Smart Meter')).length).toBe(1);
  });

  it('enriches a base-list accessory with optional/appliesTo/comment when a rule also matches it', () => {
    const solution = makeSolution({ accessories: [{ model: 'Smart Meter - M1-40', quantity: 1 }] });
    const rule = makeRule({
      inclusion: 'optional',
      battery_model: solution.battery_model,
      comment: 'Instalar próximo ao quadro.',
      accessories: { model: 'Smart Meter - M1-40' },
    });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(
      expect.objectContaining({
        model: 'Smart Meter - M1-40',
        optional: true,
        appliesTo: 'battery',
        comment: 'Instalar próximo ao quadro.',
      })
    );
  });

  it('merges the solution own comments with automatic comments from matching rules, deduped', () => {
    const solution = makeSolution({ comments: ['comentário original'] });
    const rule = makeRule({ comment: 'comentário automático' });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pv: null,
      pvOversizingPercent: 100,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.comments).toContain('comentário original');
    expect(payload.comments).toContain('comentário automático');
  });
});

describe('requiredInverterFlags / inverterSatisfiesRequiredFlags', () => {
  it('returns no required flags when no desired feature maps to one', () => {
    expect(requiredInverterFlags([])).toEqual([]);
    expect(requiredInverterFlags(['pv', 'white_tariff'])).toEqual([]);
  });

  it('collects the inverter flag for each flag-based desired feature', () => {
    expect(requiredInverterFlags(['external_ats'])).toEqual(['external_ats']);
    expect(new Set(requiredInverterFlags(['external_ats', 'microgrid', 'pv']))).toEqual(
      new Set(['external_ats', 'microgrid'])
    );
  });

  it('requires no inverter flag for "backup" (every hybrid inverter supports it)', () => {
    expect(requiredInverterFlags(['backup'])).toEqual([]);
  });

  it('is satisfied with no required flags regardless of the inverter', () => {
    expect(inverterSatisfiesRequiredFlags(null, [])).toBe(true);
    expect(inverterSatisfiesRequiredFlags(undefined, [])).toBe(true);
    expect(inverterSatisfiesRequiredFlags([], [])).toBe(true);
  });

  it('requires every requested flag to be present', () => {
    expect(inverterSatisfiesRequiredFlags(['external_ats'], ['external_ats'])).toBe(true);
    expect(inverterSatisfiesRequiredFlags(['external_ats', 'microgrid'], ['external_ats', 'microgrid'])).toBe(true);
    expect(inverterSatisfiesRequiredFlags(['external_ats'], ['external_ats', 'microgrid'])).toBe(false);
    expect(inverterSatisfiesRequiredFlags(null, ['external_ats'])).toBe(false);
    expect(inverterSatisfiesRequiredFlags([], ['external_ats'])).toBe(false);
  });
});

describe('blockingDesiredFeatures', () => {
  it('returns nothing when no desired feature requires an inverter flag', () => {
    expect(blockingDesiredFeatures(['backup', 'pv'], [{ flags: [] }])).toEqual([]);
  });

  it('reports a feature as blocking when zero candidate inverters have its flag', () => {
    const candidates = [{ flags: ['external_ats'] }, { flags: [] }];
    expect(blockingDesiredFeatures(['microgrid'], candidates)).toEqual(['microgrid']);
  });

  it('reports nothing blocking when some candidate has every required flag', () => {
    const candidates = [{ flags: ['external_ats', 'microgrid'] }];
    expect(blockingDesiredFeatures(['external_ats', 'microgrid'], candidates)).toEqual([]);
  });

  it('reports the whole combination as blocking when each flag has support individually but no single inverter has both', () => {
    const candidates = [{ flags: ['external_ats'] }, { flags: ['microgrid'] }];
    expect(new Set(blockingDesiredFeatures(['external_ats', 'microgrid'], candidates))).toEqual(
      new Set(['external_ats', 'microgrid'])
    );
  });

  it('only reports the specific unsupported feature, not ones already covered', () => {
    const candidates = [{ flags: ['external_ats'] }];
    expect(blockingDesiredFeatures(['external_ats', 'microgrid'], candidates)).toEqual(['microgrid']);
  });

  it('treats null/undefined flags as no flags', () => {
    const candidates = [{ flags: null }, { flags: undefined }];
    expect(blockingDesiredFeatures(['microgrid'], candidates)).toEqual(['microgrid']);
  });
});

describe('computeHardFilterFeatures', () => {
  it('leaves desiredFeatures untouched when microgrid is not selected', () => {
    expect(computeHardFilterFeatures(['backup', 'pv'], false)).toEqual(['backup', 'pv']);
  });

  it('drops microgrid when it is selected but not a fundamental requirement', () => {
    expect(computeHardFilterFeatures(['backup', 'microgrid'], false)).toEqual(['backup']);
  });

  it('keeps microgrid when it is a fundamental requirement', () => {
    expect(computeHardFilterFeatures(['backup', 'microgrid'], true)).toEqual(['backup', 'microgrid']);
  });

  it('is a no-op when microgrid is fundamental but not actually selected', () => {
    expect(computeHardFilterFeatures(['backup'], true)).toEqual(['backup']);
  });
});

describe('filterSolutionsByRequiredFlags', () => {
  function makeInverter(partial: Partial<InverterCapabilities> = {}): InverterCapabilities {
    return { model: 'X1-Hybrid-5.0-D', flags: [], max_power_per_phase_w: null, ...partial };
  }

  it('is a no-op that never blocks when requiredFlags is empty', () => {
    const solutions = [makeSolution({ id: 's1' })];
    expect(filterSolutionsByRequiredFlags(solutions, [], [])).toEqual({ compatibleSolutions: solutions, blocked: false });
  });

  it('keeps only solutions whose inverter satisfies every required flag', () => {
    const withFlag = makeSolution({ id: 's1', inverter_model: 'has-flag' });
    const withoutFlag = makeSolution({ id: 's2', inverter_model: 'no-flag' });
    const inverters = [
      makeInverter({ model: 'has-flag', flags: ['external_ats'] }),
      makeInverter({ model: 'no-flag', flags: [] }),
    ];
    expect(filterSolutionsByRequiredFlags([withFlag, withoutFlag], ['external_ats'], inverters)).toEqual({
      compatibleSolutions: [withFlag],
      blocked: false,
    });
  });

  it('reports blocked when no solution survives the flag filter', () => {
    const solution = makeSolution({ id: 's1', inverter_model: 'no-flag' });
    const inverters = [makeInverter({ model: 'no-flag', flags: [] })];
    expect(filterSolutionsByRequiredFlags([solution], ['microgrid'], inverters)).toEqual({
      compatibleSolutions: [],
      blocked: true,
    });
  });

  it('treats a solution with no matching candidate inverter row as unsatisfied', () => {
    const solution = makeSolution({ id: 's1', inverter_model: 'unknown-model' });
    expect(filterSolutionsByRequiredFlags([solution], ['microgrid'], [])).toEqual({
      compatibleSolutions: [],
      blocked: true,
    });
  });
});

describe('filterSolutionsByPvCapacity', () => {
  function makeInverter(partial: Partial<PvCapableInverter> = {}): PvCapableInverter {
    return { model: 'X1-Hybrid-5.0-D', pv_oversizing_percent: 100, ...partial };
  }

  it('is a no-op that never blocks when desiredPvKw is 0', () => {
    const solutions = [makeSolution({ id: 's1' })];
    expect(filterSolutionsByPvCapacity(solutions, 0, [])).toEqual({ compatibleSolutions: solutions, blocked: false });
  });

  it('keeps only solutions whose inverter can carry the desired PV array', () => {
    // 5kW rated x (1+50%) = 7.5kWp max — enough for 6kWp desired.
    const enough = makeSolution({ id: 's1', inverter_model: 'big-enough', rated_power_w: 5000 });
    // 2kW rated x (1+50%) = 3kWp max — short of 6kWp desired.
    const tooSmall = makeSolution({ id: 's2', inverter_model: 'too-small', rated_power_w: 2000 });
    const inverters = [
      makeInverter({ model: 'big-enough', pv_oversizing_percent: 50 }),
      makeInverter({ model: 'too-small', pv_oversizing_percent: 50 }),
    ];
    expect(filterSolutionsByPvCapacity([enough, tooSmall], 6, inverters)).toEqual({
      compatibleSolutions: [enough],
      blocked: false,
    });
  });

  it('reports blocked when no solution survives the PV capacity filter', () => {
    const solution = makeSolution({ id: 's1', inverter_model: 'too-small', rated_power_w: 2000 });
    const inverters = [makeInverter({ model: 'too-small', pv_oversizing_percent: 50 })];
    expect(filterSolutionsByPvCapacity([solution], 6, inverters)).toEqual({
      compatibleSolutions: [],
      blocked: true,
    });
  });

  it('defaults pv_oversizing_percent to 100% when a candidate inverter row is missing or has it null', () => {
    // 5kW rated x (1+100%) = 10kWp max, the same default computePvPowerKw uses.
    const solution = makeSolution({ id: 's1', inverter_model: 'unknown-model', rated_power_w: 5000 });
    expect(filterSolutionsByPvCapacity([solution], 9, [])).toEqual({
      compatibleSolutions: [solution],
      blocked: false,
    });

    const solutionWithNullField = makeSolution({ id: 's2', inverter_model: 'null-oversizing', rated_power_w: 5000 });
    expect(
      filterSolutionsByPvCapacity([solutionWithNullField], 9, [makeInverter({ model: 'null-oversizing', pv_oversizing_percent: null })])
    ).toEqual({ compatibleSolutions: [solutionWithNullField], blocked: false });
  });
});

describe('solutionSupportsMicrogrid', () => {
  function makeMicrogrid(partial: Partial<MicrogridConfig> = {}): MicrogridConfig {
    return {
      onGridPhases: 1,
      onGridApparentPowerVA: 1000,
      isFundamentalRequirement: false,
      ...partial,
    };
  }

  it('accepts when on-grid power is comfortably below inverter and battery power', () => {
    const solution = makeSolution({ rated_power_w: 5000, battery_power_w: 2800 });
    expect(solutionSupportsMicrogrid(solution, null, makeMicrogrid({ onGridApparentPowerVA: 1000 }))).toBe(true);
  });

  it('rejects when on-grid power is at or above the inverter rated power', () => {
    const solution = makeSolution({ rated_power_w: 5000, battery_power_w: 8000 });
    expect(solutionSupportsMicrogrid(solution, null, makeMicrogrid({ onGridApparentPowerVA: 5000 }))).toBe(false);
    expect(solutionSupportsMicrogrid(solution, null, makeMicrogrid({ onGridApparentPowerVA: 6000 }))).toBe(false);
  });

  it('rejects when on-grid power is at or above the battery power', () => {
    const solution = makeSolution({ rated_power_w: 8000, battery_power_w: 2800 });
    expect(solutionSupportsMicrogrid(solution, null, makeMicrogrid({ onGridApparentPowerVA: 2800 }))).toBe(false);
    expect(solutionSupportsMicrogrid(solution, null, makeMicrogrid({ onGridApparentPowerVA: 3000 }))).toBe(false);
  });

  it('ignores the per-phase check when the inverter has no max_power_per_phase_w', () => {
    const solution = makeSolution({ rated_power_w: 5000, battery_power_w: 8000 });
    expect(solutionSupportsMicrogrid(solution, null, makeMicrogrid({ onGridApparentPowerVA: 4000, onGridPhases: 1 }))).toBe(true);
  });

  it('rejects when the on-grid power plus margin exceeds max_power_per_phase_w', () => {
    const solution = makeSolution({ rated_power_w: 10000, battery_power_w: 10000 });
    // 2501 W * 1.2 / 3 phases exceeds the 1000 W per-phase limit.
    expect(solutionSupportsMicrogrid(solution, 1000, makeMicrogrid({ onGridApparentPowerVA: 2501, onGridPhases: 3 }))).toBe(false);
    // Equality is accepted: 2500 W * 1.2 / 3 phases = 1000 W per phase.
    expect(solutionSupportsMicrogrid(solution, 1000, makeMicrogrid({ onGridApparentPowerVA: 2500, onGridPhases: 3 }))).toBe(true);
  });
});

describe('resolveMicrogridSelection', () => {
  function makeMicrogrid(partial: Partial<MicrogridConfig> = {}): MicrogridConfig {
    return {
      onGridPhases: 1,
      onGridApparentPowerVA: 1000,
      isFundamentalRequirement: false,
      ...partial,
    };
  }

  function makeInverter(partial: Partial<InverterCapabilities> = {}): InverterCapabilities {
    return { model: 'X1-Hybrid-5.0-D', flags: ['microgrid'], max_power_per_phase_w: null, ...partial };
  }

  describe('when microgrid is a fundamental requirement', () => {
    it('narrows compatibleSolutions to the microgrid-compatible subset', () => {
      const compatible = makeSolution({ id: 's1', inverter_model: 'ok', rated_power_w: 8000, battery_power_w: 8000 });
      const incompatible = makeSolution({ id: 's2', inverter_model: 'no-flag', rated_power_w: 8000, battery_power_w: 8000 });
      const inverters = [makeInverter({ model: 'ok' }), makeInverter({ model: 'no-flag', flags: [] })];
      const microgrid = makeMicrogrid({ isFundamentalRequirement: true, onGridApparentPowerVA: 1000 });

      expect(resolveMicrogridSelection([compatible, incompatible], microgrid, true, inverters)).toEqual({
        compatibleSolutions: [compatible],
        microgridAlternativeSolution: null,
        blocked: false,
      });
    });

    it('reports blocked when nothing satisfies microgrid, instead of falling back silently', () => {
      const solution = makeSolution({ id: 's1', inverter_model: 'no-flag' });
      const inverters = [makeInverter({ model: 'no-flag', flags: [] })];
      const microgrid = makeMicrogrid({ isFundamentalRequirement: true });

      expect(resolveMicrogridSelection([solution], microgrid, true, inverters)).toEqual({
        compatibleSolutions: [solution],
        microgridAlternativeSolution: null,
        blocked: true,
      });
    });
  });

  describe('when microgrid is optional', () => {
    it('leaves compatibleSolutions untouched and never blocks', () => {
      const economicTop = makeSolution({ id: 's1', inverter_model: 'no-flag' });
      const inverters = [makeInverter({ model: 'no-flag', flags: [] })];
      const microgrid = makeMicrogrid({ isFundamentalRequirement: false });

      expect(resolveMicrogridSelection([economicTop], microgrid, false, inverters)).toEqual({
        compatibleSolutions: [economicTop],
        microgridAlternativeSolution: null,
        blocked: false,
      });
    });

    it('surfaces the best microgrid-compatible solution as an alternative when it differs from the top pick', () => {
      const economicTop = makeSolution({ id: 's1', inverter_model: 'no-flag', rated_power_w: 5000, battery_power_w: 5000 });
      const microgridCandidate = makeSolution({ id: 's2', inverter_model: 'ok', rated_power_w: 8000, battery_power_w: 8000 });
      const inverters = [makeInverter({ model: 'no-flag', flags: [] }), makeInverter({ model: 'ok' })];
      const microgrid = makeMicrogrid({ isFundamentalRequirement: false, onGridApparentPowerVA: 1000 });

      expect(resolveMicrogridSelection([economicTop, microgridCandidate], microgrid, false, inverters)).toEqual({
        compatibleSolutions: [economicTop, microgridCandidate],
        microgridAlternativeSolution: microgridCandidate,
        blocked: false,
      });
    });

    it('does not surface an alternative when the best microgrid-compatible solution is already the top pick', () => {
      const economicTop = makeSolution({ id: 's1', inverter_model: 'ok', rated_power_w: 8000, battery_power_w: 8000 });
      const inverters = [makeInverter({ model: 'ok' })];
      const microgrid = makeMicrogrid({ isFundamentalRequirement: false, onGridApparentPowerVA: 1000 });

      expect(resolveMicrogridSelection([economicTop], microgrid, false, inverters)).toEqual({
        compatibleSolutions: [economicTop],
        microgridAlternativeSolution: null,
        blocked: false,
      });
    });

    it('does not surface an alternative when no candidate is microgrid-compatible', () => {
      const economicTop = makeSolution({ id: 's1', inverter_model: 'no-flag' });
      const inverters = [makeInverter({ model: 'no-flag', flags: [] })];
      const microgrid = makeMicrogrid({ isFundamentalRequirement: false });

      expect(resolveMicrogridSelection([economicTop], microgrid, false, inverters).microgridAlternativeSolution).toBeNull();
    });
  });
});

describe('rankByLeastShortfall', () => {
  const targets = { minRatedPowerW: 10000, targetPowerW: 12000, targetEnergyWh: 10000, usefulEnergyWhPerBattery: null };

  it('ranks the maximin candidate first, not just the one with the single biggest dimension', () => {
    // "Power-heavy": comfortably covers power, but energy is far short (ratio 0.3).
    const powerHeavy = makeSolution({
      id: 'power-heavy',
      rated_power_w: 15000,
      peak_power_w: 18000,
      available_energy_wh: 3000,
    });
    // "Balanced": every dimension is somewhat short, but none as short as
    // powerHeavy's worst (energy 0.3) — its worst ratio (power 0.8) is better.
    const balanced = makeSolution({
      id: 'balanced',
      rated_power_w: 8000,
      peak_power_w: 9600,
      available_energy_wh: 8000,
    });

    const ranked = rankByLeastShortfall([powerHeavy, balanced], targets);
    expect(ranked[0].id).toBe('balanced');
  });

  it('breaks ties (equal worst ratio) by the same cheapest-first order the strict path uses', () => {
    // Both have worst ratio = min(rated/10000, peak/12000, energy/10000) = 1.0
    // (bottleneck is energy for both), but "bigger" is unnecessarily larger.
    const cheaper = makeSolution({ id: 'cheaper', rated_power_w: 10000, peak_power_w: 12000, available_energy_wh: 10000 });
    const bigger = makeSolution({ id: 'bigger', rated_power_w: 20000, peak_power_w: 24000, available_energy_wh: 10000 });

    const ranked = rankByLeastShortfall([bigger, cheaper], targets);
    expect(ranked[0].id).toBe('cheaper');
  });

  it('uses usefulEnergyWhPerBattery × battery_quantity instead of raw available_energy_wh when a battery model is pinned', () => {
    const rawEnergyWinner = makeSolution({
      id: 'raw-energy-winner',
      rated_power_w: 12000,
      peak_power_w: 14400,
      available_energy_wh: 9000,
      battery_quantity: 1,
    });
    const perBatteryWinner = makeSolution({
      id: 'per-battery-winner',
      rated_power_w: 12000,
      peak_power_w: 14400,
      available_energy_wh: 100, // irrelevant once usefulEnergyWhPerBattery is set
      battery_quantity: 3,
    });

    const withoutPinnedBattery = rankByLeastShortfall([rawEnergyWinner, perBatteryWinner], targets);
    expect(withoutPinnedBattery[0].id).toBe('raw-energy-winner');

    const withPinnedBattery = rankByLeastShortfall([rawEnergyWinner, perBatteryWinner], {
      ...targets,
      usefulEnergyWhPerBattery: 4000, // 4000 * 3 = 12000 Wh, well above the raw-energy winner's 9000
    });
    expect(withPinnedBattery[0].id).toBe('per-battery-winner');
  });

  it('treats a zero target dimension as always satisfied (Infinity ratio), never the worst dimension', () => {
    const solution = makeSolution({ rated_power_w: 5000, peak_power_w: 6000, available_energy_wh: 100 });
    const ranked = rankByLeastShortfall([solution], { ...targets, targetEnergyWh: 0 });
    // Should not throw/NaN, and the single candidate is trivially "first".
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe(solution.id);
  });

  it('does not mutate the input array', () => {
    const a = makeSolution({ id: 'a', rated_power_w: 5000 });
    const b = makeSolution({ id: 'b', rated_power_w: 20000, peak_power_w: 24000, available_energy_wh: 20000 });
    const input = [a, b];
    rankByLeastShortfall(input, targets);
    expect(input[0].id).toBe('a');
    expect(input[1].id).toBe('b');
  });
});

describe('effectiveTargetPowerW / effectiveTargetEnergyWh', () => {
  it('is 0 when neither Backup nor Tarifa Branca applies, regardless of the base value', () => {
    expect(effectiveTargetPowerW([], makeWhiteTariff(), 3000)).toBe(0);
    expect(effectiveTargetPowerW(['external_ats'], makeWhiteTariff(), 3000)).toBe(0);
    expect(effectiveTargetEnergyWh([], makeWhiteTariff(), 5000)).toBe(0);
  });

  it('ignores the white-tariff power/energy floor when the config is missing, even with white_tariff selected', () => {
    expect(effectiveTargetPowerW(['white_tariff'], null, 3000)).toBe(0);
    expect(effectiveTargetEnergyWh(['white_tariff'], null, 5000)).toBe(0);
  });

  it('uses Backup\'s base power/energy alone when only Backup is selected', () => {
    expect(effectiveTargetPowerW(['backup'], makeWhiteTariff(), 3000)).toBe(3000);
    expect(effectiveTargetEnergyWh(['backup'], makeWhiteTariff(), 5000)).toBe(5000);
  });

  it('takes the larger of Backup\'s base power and the white-tariff required power', () => {
    expect(effectiveTargetPowerW(['backup', 'white_tariff'], makeWhiteTariff({ requiredPowerW: 2000 }), 3000)).toBe(3000);
    expect(effectiveTargetPowerW(['backup', 'white_tariff'], makeWhiteTariff({ requiredPowerW: 5000 }), 3000)).toBe(5000);
  });

  it('also raises a continuous/nominal power floor, not just the peak one, so the white-tariff requirement is sustainable rather than just survivable as a brief surge', () => {
    // Same call shape index.ts uses for minRatedPowerW: baseW = nominalW instead of peakW.
    expect(effectiveTargetPowerW(['white_tariff'], makeWhiteTariff({ requiredPowerW: 6000 }), 1200)).toBe(6000);
  });

  it('ignores the base power/energy entirely when Backup is not selected, even if it would be larger', () => {
    expect(effectiveTargetPowerW(['white_tariff'], makeWhiteTariff({ requiredPowerW: 2000 }), 9000)).toBe(2000);
  });

  it('uses only the ponta + intermediária white-tariff energy when Backup is not selected', () => {
    const energy = effectiveTargetEnergyWh(
      ['white_tariff'],
      makeWhiteTariff({ pontaEnergyWh: 4000, intermediateEnergyWh: 1000 }),
      5000
    );
    expect(energy).toBe(5000);
  });

  it('sums Backup\'s base energy on top of the white-tariff energy when both are selected', () => {
    const energy = effectiveTargetEnergyWh(
      ['backup', 'white_tariff'],
      makeWhiteTariff({ pontaEnergyWh: 4000, intermediateEnergyWh: 1000 }),
      5000
    );
    expect(energy).toBe(10000);
  });
});

describe('validateResidentialOptions', () => {
  function validPayload() {
    return {
      topology: 'HighVoltage',
      batteryModel: null,
      inverterModel: null,
      gridType: 'singlePhase_220',
      loads: [{ powerW: 100, qty: 1 }],
      operationHours: 2,
      desiredFeatures: [],
      whiteTariff: null,
      microgrid: null,
      generator: null,
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
      loads: [{ powerW: -10, qty: 1 }],
    });
    expect(errors.some((e) => e.includes('powerW'))).toBe(true);
  });

  it('rejects qty zero or non-integer', () => {
    const zeroQty = validateResidentialOptions({
      ...validPayload(),
      loads: [{ powerW: 100, qty: 0 }],
    });
    expect(zeroQty.some((e) => e.includes('qty'))).toBe(true);

    const fractionalQty = validateResidentialOptions({
      ...validPayload(),
      loads: [{ powerW: 100, qty: 1.5 }],
    });
    expect(fractionalQty.some((e) => e.includes('qty'))).toBe(true);
  });

  it('rejects a missing or invalid operationHours', () => {
    const missing = validateResidentialOptions({ ...validPayload(), operationHours: undefined });
    expect(missing.some((e) => e.includes('operationHours'))).toBe(true);

    const negative = validateResidentialOptions({ ...validPayload(), operationHours: -1 });
    expect(negative.some((e) => e.includes('operationHours'))).toBe(true);

    const tooHigh = validateResidentialOptions({ ...validPayload(), operationHours: 25 });
    expect(tooHigh.some((e) => e.includes('operationHours'))).toBe(true);

    const valid = validateResidentialOptions({ ...validPayload(), operationHours: 0 });
    expect(valid.some((e) => e.includes('operationHours'))).toBe(false);
  });

  it('rejects an ipInRatio below 1 when provided', () => {
    const errors = validateResidentialOptions({
      ...validPayload(),
      loads: [{ powerW: 100, qty: 1, ipInRatio: 0.5 }],
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

  it('accepts an empty or omitted desiredFeatures, and rejects an unknown one', () => {
    expect(validateResidentialOptions({ ...validPayload(), desiredFeatures: [] })).toEqual([]);
    const { desiredFeatures: _drop, ...withoutDesiredFeatures } = validPayload();
    expect(validateResidentialOptions(withoutDesiredFeatures)).toEqual([]);
    const errors = validateResidentialOptions({ ...validPayload(), desiredFeatures: ['nuclear_plant'] });
    expect(errors.some((e) => e.includes('desiredFeatures'))).toBe(true);
  });

  it('requires a well-formed whiteTariff config when white_tariff is a desired feature', () => {
    const missing = validateResidentialOptions({ ...validPayload(), desiredFeatures: ['white_tariff'] });
    expect(missing.some((e) => e.includes('whiteTariff'))).toBe(true);

    const valid = validateResidentialOptions({
      ...validPayload(),
      desiredFeatures: ['white_tariff'],
      whiteTariff: {
        totalMonthlyConsumptionKwh: 200,
        requiredPowerW: 2000,
        pontaEnergyWh: 4000,
        intermediateEnergyWh: 1000,
        pontaTariffPerKwh: 1.2,
        intermediateTariffPerKwh: 0.95,
        foraPontaTariffPerKwh: 0.8,
      },
    });
    expect(valid).toEqual([]);

    const invalid = validateResidentialOptions({
      ...validPayload(),
      desiredFeatures: ['white_tariff'],
      whiteTariff: {
        requiredPowerW: -1,
        pontaEnergyWh: 'lots',
        intermediateEnergyWh: 'lots',
        pontaTariffPerKwh: -0.4,
        intermediateTariffPerKwh: -0.2,
        foraPontaTariffPerKwh: -0.1,
      },
    });
    expect(invalid.some((e) => e.includes('requiredPowerW'))).toBe(true);
    expect(invalid.some((e) => e.includes('pontaEnergyWh'))).toBe(true);
    expect(invalid.some((e) => e.includes('intermediateEnergyWh'))).toBe(true);
    expect(invalid.some((e) => e.includes('pontaTariffPerKwh'))).toBe(true);
    expect(invalid.some((e) => e.includes('intermediateTariffPerKwh'))).toBe(true);
    expect(invalid.some((e) => e.includes('foraPontaTariffPerKwh'))).toBe(true);
  });

  it('requires a well-formed microgrid config when microgrid is a desired feature', () => {
    const missing = validateResidentialOptions({ ...validPayload(), desiredFeatures: ['microgrid'] });
    expect(missing.some((e) => e.includes('microgrid'))).toBe(true);

    const valid = validateResidentialOptions({
      ...validPayload(),
      desiredFeatures: ['microgrid'],
      microgrid: { voltageV: 220, onGridPhases: 3, onGridApparentPowerVA: 5000, isFundamentalRequirement: false },
    });
    expect(valid).toEqual([]);

    const invalid = validateResidentialOptions({
      ...validPayload(),
      desiredFeatures: ['microgrid'],
      microgrid: { voltageV: -1, onGridPhases: 4, onGridApparentPowerVA: -1, isFundamentalRequirement: 'yes' },
    });
    expect(invalid.some((e) => e.includes('voltageV'))).toBe(true);
    expect(invalid.some((e) => e.includes('onGridPhases'))).toBe(true);
    expect(invalid.some((e) => e.includes('onGridApparentPowerVA'))).toBe(true);
    expect(invalid.some((e) => e.includes('isFundamentalRequirement'))).toBe(true);
  });

  it('requires a well-formed generator config when external_generator is a desired feature', () => {
    const missing = validateResidentialOptions({ ...validPayload(), desiredFeatures: ['external_generator'] });
    expect(missing.some((e) => e.includes('generator'))).toBe(true);

    const valid = validateResidentialOptions({
      ...validPayload(),
      desiredFeatures: ['external_generator'],
      generator: { voltageV: 220, phases: 3, apparentPowerVA: 8000 },
    });
    expect(valid).toEqual([]);

    const invalid = validateResidentialOptions({
      ...validPayload(),
      desiredFeatures: ['external_generator'],
      generator: { voltageV: -1, phases: 5, apparentPowerVA: -1 },
    });
    expect(invalid.some((e) => e.includes('voltageV'))).toBe(true);
    expect(invalid.some((e) => e.includes('phases'))).toBe(true);
    expect(invalid.some((e) => e.includes('apparentPowerVA'))).toBe(true);
  });

  it('requires a well-formed pv config when pv is a desired feature', () => {
    const missing = validateResidentialOptions({ ...validPayload(), desiredFeatures: ['pv'] });
    expect(missing.some((e) => e.includes('pv'))).toBe(true);

    const valid = validateResidentialOptions({
      ...validPayload(),
      desiredFeatures: ['pv'],
      pv: { monthlyConsumptionKwh: 450, hsp: 4.5 },
    });
    expect(valid).toEqual([]);

    const invalid = validateResidentialOptions({
      ...validPayload(),
      desiredFeatures: ['pv'],
      pv: { monthlyConsumptionKwh: 0, hsp: -1 },
    });
    expect(invalid.some((e) => e.includes('monthlyConsumptionKwh'))).toBe(true);
    expect(invalid.some((e) => e.includes('hsp'))).toBe(true);
  });
});
