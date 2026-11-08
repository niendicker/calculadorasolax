import { describe, expect, it } from 'vitest';
import { buildModularConfigurations, calculateModularStudy, MAX_MODULAR_SCENARIOS, validateCiCompatibility, validateModularSelection } from './modular';
import { modularFixture, modularOptions, modularSelection } from './modular.test-fixtures';
import { checkDispatchInvariants, runDispatch } from './dispatch';
import { validateCommercialIndustrialOptions } from './validation';

const prices = { pcsUnitBrl: 40000, batteryUnitBrl: 30000 };
describe('modular PCS and battery sizing', () => {
  it('rejects rules that exceed per-port battery association, physical port count or port current limits', () => {
    for (const field of ['association','count','current']) {
      const catalog=modularFixture();
      if (field==='association') catalog.batteries[0].maxAssociationQty=1;
      if (field==='count') catalog.pcs[0].batteryPorts=1;
      if (field==='current') {catalog.pcs[0].maxCurrentPerPortA=50;catalog.pcs[0].batteryPorts=1;}
      expect(()=>buildModularConfigurations(catalog,modularSelection(),prices)).toThrow(/limite|corrente|portas/i);
    }
  });
  it('sizes energy independently of PCS power', () => {
    const configurations = buildModularConfigurations(modularFixture(), modularSelection(), prices);
    expect(configurations).toHaveLength(4);
    expect(configurations[0].product.modulePowerKw).toBe(100);
    expect(configurations[0].product.moduleCapacityKwh).toBe(200);
    expect(configurations[1].product.modulePowerKw).toBe(100);
    expect(configurations[1].product.moduleCapacityKwh).toBe(400);
    expect(configurations[2].product.modulePowerKw).toBe(200);
    expect(configurations[2].product.moduleCapacityKwh).toBe(400);
    expect(configurations[0].composition.voltageMinV).toBe(800);
    expect(configurations[0].composition.voltageMaxV).toBe(960);
  });

  it('limits charge and discharge by the lowest DC voltage, individual current limits and PCS efficiency', () => {
    const catalog = modularFixture();
    catalog.batteries[0].charge_current_a = 10;
    catalog.batteries[0].discharge_current_a = 20;
    const configuration = buildModularConfigurations(catalog, modularSelection(), prices)[0];
    expect(configuration.product.moduleChargePowerKw).toBeCloseTo(800 * 10 / 1000 / 0.96);
    expect(configuration.product.modulePowerKw).toBeCloseTo(800 * 20 / 1000 * 0.95);
    expect(configuration.product.efficiencyPercent).toBeCloseTo(0.96 * 0.95 * 98);
    expect(configuration.product.dischargeEfficiencyPercent).toBeCloseTo(0.95 * Math.sqrt(0.98) * 100);
  });

  it('requires documented approval even when voltage and current fit', () => {
    const catalog = modularFixture();
    catalog.rules[0].approval_status = 'draft';
    expect(() => buildModularConfigurations(catalog, modularSelection(), prices)).toThrow(/aprovada/);
    catalog.rules[0].approval_status = 'approved';
    catalog.rules[0].reference_document = '';
    expect(() => buildModularConfigurations(catalog, modularSelection(), prices)).toThrow(/documento/);
  });

  it('rejects voltage outside the PCS window and incomplete inherited ratings', () => {
    const catalog = modularFixture();
    catalog.rules[0].max_series = 3;
    expect(validateCiCompatibility(catalog.rules[0], catalog.pcs[0], catalog.batteries[0]).join(' ')).toMatch(/tensões/);
    catalog.pcs[0].voltageMinV = null;
    expect(validateCiCompatibility(catalog.rules[0], catalog.pcs[0], catalog.batteries[0]).join(' ')).toMatch(/Complete as tensões/);
  });

  it('includes mandatory controllers in quantities and CAPEX, and rejects missing prices', () => {
    const catalog = modularFixture();
    catalog.rules[0].controller_accessory_id = 'controller';
    catalog.accessories = [{ id: 'controller', model: 'Controlador teste', active: true }];
    expect(() => buildModularConfigurations(catalog, modularSelection(), prices)).toThrow(/Portfólio/);
    const configurations = buildModularConfigurations(catalog, modularSelection(), { ...prices, controllerUnitBrl: 1500 });
    expect(configurations[0].capex).toBe(101500);
    expect(configurations[2].composition.items[2].quantity).toBe(2);
    catalog.accessories[0].active = false;
    expect(() => buildModularConfigurations(catalog, modularSelection(), { ...prices, controllerUnitBrl: 1500 })).toThrow(/controlador/);
  });

  it('rejects quantities outside the approved ranges and bounds automatic enumeration', () => {
    const selection = modularSelection();
    selection.series = { min: 1, max: 1 };
    expect(() => buildModularConfigurations(modularFixture(), selection, prices)).toThrow(/entre 2 e 2/);
    selection.series = { min: 2, max: 2 };
    selection.pcs = { min: 1, max: MAX_MODULAR_SCENARIOS + 1 };
    expect(validateModularSelection(selection).join(' ')).toContain(`até ${MAX_MODULAR_SCENARIOS}`);
  });

  it('calculates and materializes the selected assembly with a distinct identity, quantities and prices', () => {
    const options = modularOptions();
    expect(validateCommercialIndustrialOptions(options)).toEqual([]);
    const result = calculateModularStudy(options, modularFixture(), prices);
    expect(result.scenarios).toHaveLength(4);
    expect(new Set(result.scenarios.map((scenario) => scenario.scenarioId)).size).toBe(4);
    expect(result.selected?.composition?.batteryModel).toBe('Rack teste 100');
    expect(result.selected?.dispatch).toHaveLength(672);
    for (const point of result.selected!.dispatch) {
      expect(point.chargeKw).toBeLessThanOrEqual(result.selected!.composition!.chargePowerKw + 1e-8);
      expect(point.dischargeKw).toBeLessThanOrEqual(result.selected!.composition!.dischargePowerKw + 1e-8);
    }
  });

  it('does not infer backup capability from grid-connected compatibility', () => {
    const catalog = modularFixture();
    catalog.rules[0].supports_backup = false;
    const options = modularOptions();
    options.backup = { enabled: true } as NonNullable<typeof options.backup>;
    expect(() => calculateModularStudy(options, catalog, prices)).toThrow(/backup/);
  });

  it('retains separate runtime power and efficiency bounds when charge power exceeds discharge power', () => {
    const curve = modularOptions().loadCurve!;
    curve.points = [{ timestamp: '2026-01-01T03:00:00Z', powerKw: 0 }];
    const bess = { totalPowerKw: 20, maxChargePowerKw: 80, totalCapacityKwh: 100, socMinPercent: 0, socMaxPercent: 100, initialSocPercent: 0, efficiencyPercent: 72, chargeEfficiencyPercent: 90, dischargeEfficiencyPercent: 80 };
    const trace = runDispatch({ curve, bess, strategy: 'LOAD_SHIFTING', tariffWindow: { peakStart: '18:00', peakEnd: '21:00' }, peakShavingTargetKw: null, contractedDemandKw: 100 });
    expect(trace[0].chargeKw).toBe(80);
    expect(trace[0].socKwh).toBe(18); // 80 kW × 0.25h × 0.9
    expect(checkDispatchInvariants(trace, bess, 15)).toEqual([]);
  });
  it('does not approve backup when starting power exceeds the continuous capability of the selected PCS', () => {
    const options = modularOptions();
    options.backup = { enabled: true, inputMode: 'simple', targetPowerKw: 50, targetPeakPowerKw: 140, autonomyHours: 1, safetyMarginPercent: 0, loads: [] };
    const result = calculateModularStudy(options, modularFixture(), prices);
    const singlePcs = result.scenarios.find((scenario) => scenario.composition?.pcsCount === 1)!;
    expect(singlePcs.backupResult?.status).toBe('insufficient_power');
    expect(singlePcs.technicalValidity).toBe(false);
    expect(singlePcs.backupResult?.warningMessage).toContain('pico crítico');
  });

});
