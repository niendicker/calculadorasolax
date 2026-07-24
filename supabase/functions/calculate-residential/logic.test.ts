import { describe, expect, it } from 'vitest';
import {
  blockingDesiredFeatures,
  buildSolutionPayload,
  effectiveTargetEnergyWh,
  effectiveTargetPowerW,
  inverterSatisfiesRequiredFlags,
  matchingEssBatteryConfig,
  normalizeStandardGridTopology,
  requiredInverterFlags,
  ruleMatches,
  solutionSupportsMicrogrid,
  totalDailyKwh,
  totalNominalW,
  totalPeakW,
  validateResidentialOptions,
  type AccessoryRule,
  type ApprovedSolution,
  type EssCompatibilityRule,
  type MicrogridConfig,
  type SingleLoad,
  type WhiteTariffConfig,
} from './logic';

function makeWhiteTariff(partial: Partial<WhiteTariffConfig> = {}): WhiteTariffConfig {
  return {
    requiredPowerW: 2000,
    requiredEnergyWh: 4000,
    includeBackupReserve: false,
    tariffSpreadPerKwh: 0.4,
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

  it('totalDailyKwh scales by usageFactor, defaulting to 1 when absent', () => {
    const withUsageFactor: SingleLoad[] = [{ powerW: 1000, hoursPerDay: 2, qty: 1, usageFactor: 0.5 }];
    expect(totalDailyKwh(withUsageFactor)).toBeCloseTo(1.0);
  });

  it('totalPeakW ignores usageFactor (energy-only factor does not affect peak power)', () => {
    const withUsageFactor: SingleLoad[] = [{ powerW: 1000, hoursPerDay: 1, qty: 1, ipInRatio: 2, usageFactor: 0.5 }];
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
      { powerW: 1000, hoursPerDay: 1, qty: 3, ipInRatio: 1, includedInPeak: true },
      { powerW: 100, hoursPerDay: 1, qty: 4, ipInRatio: 1, includedInPeak: false },
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

describe('buildSolutionPayload', () => {
  it('uses the solution own available_energy_wh when there is no per-battery override', () => {
    const solution = makeSolution({ available_energy_wh: 5220 });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pvPowerKw: 1.2,
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
      pvPowerKw: null,
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
      pvPowerKw: 1.23,
      accessoryRules: [],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.pvPowerKw).toBe(1.3);
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
      pvPowerKw: null,
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
      pvPowerKw: null,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(expect.objectContaining({ model: 'TBMS-MCS0800', qty: 2 }));
  });

  it('scales battery_ports_used by a single inverter\'s ports, not summed across every inverter', () => {
    // 2 inverters x 2 ports each — battery_ports_used stays a per-inverter fact
    // so pre-existing rules built around it keep meaning what they always meant.
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
      pvPowerKw: null,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories).toContainEqual(expect.objectContaining({ model: 'TBMS-MCS0800', qty: 2 }));
  });

  it('gates battery_ports_used on a single inverter\'s ports, not summed across every inverter', () => {
    // 2 inverters x 1 port each — each inverter alone only uses 1 port, so a
    // min_quantity of 2 must NOT be cleared just because there happen to be 2 inverters.
    const solution = makeSolution({ inverter_quantity: 2, battery_ports_used: 1 });
    const rule = makeRule({
      trigger_metric: 'battery_ports_used',
      min_quantity: 2,
      accessories: { model: 'TBMS-MCS0800' },
    });
    const payload = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pvPowerKw: null,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(payload.accessories.some((a) => a.model === 'TBMS-MCS0800')).toBe(false);
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
      pvPowerKw: null,
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
        pvPowerKw: null,
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
      pvPowerKw: null,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(dense.accessories).toContainEqual(expect.objectContaining({ model: 'Port Module', qty: 2 }));

    // Same 2 ports but only 6 batteries -> 3/port, below the 4 threshold: rule doesn't match at all.
    const sparse = buildSolutionPayload(makeSolution({ inverter_quantity: 2, battery_ports_used: 1, battery_quantity: 6 }), {
      usefulEnergyWhPerBattery: null,
      pvPowerKw: null,
      accessoryRules: [rule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(sparse.accessories.some((a) => a.model === 'Port Module')).toBe(false);
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
      pvPowerKw: null,
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
      pvPowerKw: null,
      accessoryRules: [gatedRule],
      standardGridTopology: '1P_220V',
      desiredFeatures: [],
    });
    expect(withoutFeature.accessories.some((a) => a.model === 'ATS Accessory')).toBe(false);

    const withFeature = buildSolutionPayload(solution, {
      usefulEnergyWhPerBattery: null,
      pvPowerKw: null,
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
      pvPowerKw: null,
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
      pvPowerKw: null,
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
      pvPowerKw: null,
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
    expect(requiredInverterFlags(['no_pv', 'white_tariff'])).toEqual([]);
  });

  it('collects the inverter flag for each flag-based desired feature', () => {
    expect(requiredInverterFlags(['external_ats'])).toEqual(['external_ats']);
    expect(new Set(requiredInverterFlags(['external_ats', 'microgrid', 'no_pv']))).toEqual(
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
    expect(blockingDesiredFeatures(['backup', 'no_pv'], [{ flags: [] }])).toEqual([]);
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

  it('rejects when the on-grid power divided by phases is at or above max_power_per_phase_w', () => {
    const solution = makeSolution({ rated_power_w: 10000, battery_power_w: 10000 });
    // 3000 VA / 3 phases = 1000 VA per phase, right at the 1000 W limit
    expect(solutionSupportsMicrogrid(solution, 1000, makeMicrogrid({ onGridApparentPowerVA: 3000, onGridPhases: 3 }))).toBe(false);
    // 2999 VA / 3 phases < 1000 W limit
    expect(solutionSupportsMicrogrid(solution, 1000, makeMicrogrid({ onGridApparentPowerVA: 2999, onGridPhases: 3 }))).toBe(true);
  });
});

describe('effectiveTargetPowerW / effectiveTargetEnergyWh', () => {
  it('returns the base values unchanged when white_tariff is not selected', () => {
    expect(effectiveTargetPowerW([], makeWhiteTariff(), 3000)).toBe(3000);
    expect(effectiveTargetPowerW(['external_ats'], makeWhiteTariff(), 3000)).toBe(3000);
    expect(effectiveTargetEnergyWh([], makeWhiteTariff(), 5000)).toBe(5000);
  });

  it('returns the base values unchanged when white_tariff is selected but the config is missing', () => {
    expect(effectiveTargetPowerW(['white_tariff'], null, 3000)).toBe(3000);
    expect(effectiveTargetEnergyWh(['white_tariff'], null, 5000)).toBe(5000);
  });

  it('takes the larger of the normal peak and the white-tariff required power', () => {
    expect(effectiveTargetPowerW(['white_tariff'], makeWhiteTariff({ requiredPowerW: 2000 }), 3000)).toBe(3000);
    expect(effectiveTargetPowerW(['white_tariff'], makeWhiteTariff({ requiredPowerW: 5000 }), 3000)).toBe(5000);
  });

  it('also raises a continuous/nominal power floor, not just the peak one, so the white-tariff requirement is sustainable rather than just survivable as a brief surge', () => {
    // Same call shape index.ts uses for minRatedPowerW: baseW = nominalW instead of peakW.
    expect(effectiveTargetPowerW(['white_tariff'], makeWhiteTariff({ requiredPowerW: 6000 }), 1200)).toBe(6000);
  });

  it('uses only the white-tariff energy when backup reserve is not requested', () => {
    const energy = effectiveTargetEnergyWh(
      ['white_tariff'],
      makeWhiteTariff({ requiredEnergyWh: 4000, includeBackupReserve: false }),
      5000
    );
    expect(energy).toBe(4000);
  });

  it('adds the base backup reserve on top of the white-tariff energy when requested', () => {
    const energy = effectiveTargetEnergyWh(
      ['white_tariff'],
      makeWhiteTariff({ requiredEnergyWh: 4000, includeBackupReserve: true }),
      5000
    );
    expect(energy).toBe(9000);
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
        requiredPowerW: 2000,
        requiredEnergyWh: 4000,
        includeBackupReserve: true,
        tariffSpreadPerKwh: 0.4,
      },
    });
    expect(valid).toEqual([]);

    const invalid = validateResidentialOptions({
      ...validPayload(),
      desiredFeatures: ['white_tariff'],
      whiteTariff: { requiredPowerW: -1, requiredEnergyWh: 'lots', includeBackupReserve: 'yes', tariffSpreadPerKwh: -0.4 },
    });
    expect(invalid.some((e) => e.includes('requiredPowerW'))).toBe(true);
    expect(invalid.some((e) => e.includes('requiredEnergyWh'))).toBe(true);
    expect(invalid.some((e) => e.includes('includeBackupReserve'))).toBe(true);
    expect(invalid.some((e) => e.includes('tariffSpreadPerKwh'))).toBe(true);
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
});
