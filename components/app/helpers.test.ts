import { describe, expect, it } from 'vitest';
import {
  TARIFF_BUSINESS_DAYS_PER_MONTH,
  buildMarginSummary,
  buildPdfFileName,
  calculateDegradedPaybackMonths,
  calculateSystemCost,
  calculateTariffSavings,
  checkPhaseVoltageCompatibility,
  effectiveTargetEnergyWh,
  effectiveTargetPowerW,
  expansionModelSet,
  isGeneratorAtsUnacknowledged,
  isGeneratorPhaseVoltageIncompatible,
  isGeneratorPowerInsufficient,
  isMicrogridPhaseVoltageIncompatible,
  isMicrogridPowerNoticeUnacknowledged,
  normalizeAccessoryLine,
  solutionHasInsufficientMargin,
} from './helpers';
import type { AccessoryLine, GeneratorConfig, MicrogridConfig, Solution, UserStockItem, WhiteTariffConfig } from '@/lib/types';

function makeGenerator(partial: Partial<GeneratorConfig> = {}): GeneratorConfig {
  return { voltageV: 220, phases: 1, apparentPowerVA: 5000, photoUrl: null, ownAtsAcknowledged: false, ...partial };
}

function makeMicrogrid(partial: Partial<MicrogridConfig> = {}): MicrogridConfig {
  return {
    voltageV: 220,
    onGridPhases: 1,
    onGridApparentPowerVA: 1000,
    isFundamentalRequirement: true,
    photoUrl: null,
    powerNoticeAcknowledged: false,
    ...partial,
  };
}

function makeAccessory(partial: Partial<AccessoryLine> & { model: string }): AccessoryLine {
  return { qty: 1, optional: false, appliesTo: 'system', comment: null, bundled: false, ...partial };
}

function makeSolution(partial: Partial<Solution> = {}): Solution {
  return {
    inverterId: 'inv-1',
    inverterModel: 'X1-Hybrid-5.0-D',
    inverterQty: 1,
    batteryId: 'bat-1',
    batteryModel: 'T-BAT-SYS HV 5.8 V2',
    batteryQty: 1,
    pvPowerKw: 1,
    accessories: [],
    ...partial,
  };
}

function makeStockItem(partial: Partial<UserStockItem> = {}): UserStockItem {
  return {
    id: 'stock-1',
    productType: 'inverter',
    productModel: 'X1-Hybrid-5.0-D',
    unitValue: 5000,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('expansionModelSet', () => {
  it('collects every expansionModel referenced by any battery, ignoring null/undefined', () => {
    const set = expansionModelSet([
      { expansionModel: 'T58 Slave' },
      { expansionModel: null },
      { expansionModel: undefined },
    ]);
    expect(set).toEqual(new Set(['T58 Slave']));
  });
});

describe('effectiveTargetPowerW / effectiveTargetEnergyWh', () => {
  const whiteTariff: WhiteTariffConfig = {
    requiredPowerW: 4000,
    pontaEnergyWh: 6000,
    intermediateEnergyWh: 2000,
    includeBackupReserve: false,
    pontaTariffPerKwh: 1.2,
    intermediateTariffPerKwh: 0.95,
    foraPontaTariffPerKwh: 0.7,
  };

  it('ignores white_tariff\'s power floor when the feature is not selected, even with a config present', () => {
    expect(effectiveTargetPowerW([], whiteTariff, 2000)).toBe(2000);
  });

  it('raises the power floor to whiteTariff.requiredPowerW when that is higher than the base', () => {
    expect(effectiveTargetPowerW(['white_tariff'], whiteTariff, 2000)).toBe(4000);
  });

  it('keeps the base power floor when it already exceeds whiteTariff.requiredPowerW', () => {
    expect(effectiveTargetPowerW(['white_tariff'], whiteTariff, 5000)).toBe(5000);
  });

  it('replaces the base energy target with pontaEnergyWh + intermediateEnergyWh when includeBackupReserve is off', () => {
    expect(effectiveTargetEnergyWh(['white_tariff'], whiteTariff, 3000)).toBe(8000);
  });

  it('adds the base energy target on top when includeBackupReserve is on', () => {
    expect(effectiveTargetEnergyWh(['white_tariff'], { ...whiteTariff, includeBackupReserve: true }, 3000)).toBe(11000);
  });

  it('ignores whiteTariff entirely when the feature is not selected', () => {
    expect(effectiveTargetEnergyWh([], whiteTariff, 3000)).toBe(3000);
  });
});

describe('buildMarginSummary', () => {
  const baseSolution = makeSolution({
    inverterRatedPowerW: 5000,
    inverterPeakPowerW: 7000,
    availableEnergyWh: 3240,
  });

  it('computes Potência padrão/Pico/Energia rows from the load-derived targets vs the solution', () => {
    const rows = buildMarginSummary({
      desiredFeatures: [],
      whiteTariff: null,
      microgrid: null,
      pv: null,
      nominalW: 3000,
      peakW: 6000,
      dailyKwh: 3,
      solution: baseSolution,
    });
    expect(rows).toEqual([
      { key: 'nominal', label: 'Potência padrão', requiredValue: 3000, providedValue: 5000, unit: 'W' },
      { key: 'peak', label: 'Potência máxima', requiredValue: 6000, providedValue: 7000, unit: 'W' },
      { key: 'energy', label: 'Energia', requiredValue: 3000, providedValue: 3240, unit: 'Wh' },
    ]);
  });

  it('adds microgrid rows only when the feature is active with a positive on-grid power', () => {
    const rows = buildMarginSummary({
      desiredFeatures: ['microgrid'],
      whiteTariff: null,
      microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 2000, isFundamentalRequirement: false, photoUrl: null, powerNoticeAcknowledged: false },
      pv: null,
      nominalW: 3000,
      peakW: 6000,
      dailyKwh: 3,
      solution: { ...baseSolution, batteryPowerW: 1800 },
    });
    expect(rows).toContainEqual({
      key: 'microgrid_inverter',
      label: 'Microrrede (inversor)',
      requiredValue: 2000,
      providedValue: 5000,
      unit: 'W',
    });
    expect(rows).toContainEqual({
      key: 'microgrid_battery',
      label: 'Microrrede (bateria)',
      requiredValue: 2000,
      providedValue: 1800,
      unit: 'W',
    });
  });

  it('omits microgrid rows when the feature is not active, even if a microgrid config is present', () => {
    const rows = buildMarginSummary({
      desiredFeatures: [],
      whiteTariff: null,
      microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 2000, isFundamentalRequirement: false, photoUrl: null, powerNoticeAcknowledged: false },
      pv: null,
      nominalW: 3000,
      peakW: 6000,
      dailyKwh: 3,
      solution: baseSolution,
    });
    expect(rows.some((row) => row.key.startsWith('microgrid'))).toBe(false);
  });

  it('adds a Geração FV row (monthly kWh) only when the feature is active with a positive consumption target', () => {
    const rows = buildMarginSummary({
      desiredFeatures: ['pv'],
      whiteTariff: null,
      microgrid: null,
      pv: { monthlyConsumptionKwh: 400, hsp: 4.5 },
      nominalW: 3000,
      peakW: 6000,
      dailyKwh: 3,
      solution: { ...baseSolution, pvMonthlyGenerationKwh: 350 },
    });
    expect(rows).toContainEqual({
      key: 'pv',
      label: 'Geração FV',
      requiredValue: 400000,
      providedValue: 350000,
      unit: 'Wh',
    });
  });

  it('omits the Geração FV row when the feature is not active, even with a pv config present', () => {
    const rows = buildMarginSummary({
      desiredFeatures: [],
      whiteTariff: null,
      microgrid: null,
      pv: { monthlyConsumptionKwh: 400, hsp: 4.5 },
      nominalW: 3000,
      peakW: 6000,
      dailyKwh: 3,
      solution: { ...baseSolution, pvMonthlyGenerationKwh: 350 },
    });
    expect(rows.some((row) => row.key === 'pv')).toBe(false);
  });
});

describe('solutionHasInsufficientMargin', () => {
  const params = { desiredFeatures: [], whiteTariff: null, microgrid: null, pv: null, nominalW: 3000, peakW: 6000, dailyKwh: 3 };

  it('returns true when any margin row falls short of what is required', () => {
    const shortOnEnergy = makeSolution({ inverterRatedPowerW: 5000, inverterPeakPowerW: 7000, availableEnergyWh: 1000 });
    expect(solutionHasInsufficientMargin(shortOnEnergy, params)).toBe(true);
  });

  it('returns false when every margin row meets or exceeds what is required', () => {
    const adequate = makeSolution({ inverterRatedPowerW: 5000, inverterPeakPowerW: 7000, availableEnergyWh: 3240 });
    expect(solutionHasInsufficientMargin(adequate, params)).toBe(false);
  });
});

describe('calculateSystemCost', () => {
  it('returns zero cost and incomplete when nothing is priced', () => {
    const result = calculateSystemCost(makeSolution(), []);
    expect(result.totalCost).toBe(0);
    expect(result.pricedItemsCount).toBe(0);
    expect(result.totalItemsCount).toBe(2);
    expect(result.isComplete).toBe(false);
  });

  it('sums inverter and battery cost by quantity when both are priced', () => {
    const stock = [
      makeStockItem({ id: '1', productType: 'inverter', productModel: 'X1-Hybrid-5.0-D', unitValue: 5000 }),
      makeStockItem({ id: '2', productType: 'battery', productModel: 'T-BAT-SYS HV 5.8 V2', unitValue: 8000 }),
    ];
    const result = calculateSystemCost(makeSolution({ inverterQty: 2, batteryQty: 3 }), stock);
    expect(result.totalCost).toBe(2 * 5000 + 3 * 8000);
    expect(result.isComplete).toBe(true);
  });

  it('includes required accessories and excludes optional recommendations from the investment', () => {
    const stock = [
      makeStockItem({ id: '1', productType: 'inverter', productModel: 'X1-Hybrid-5.0-D', unitValue: 5000 }),
      makeStockItem({ id: '2', productType: 'battery', productModel: 'T-BAT-SYS HV 5.8 V2', unitValue: 8000 }),
      makeStockItem({ id: '3', productType: 'accessory', productModel: 'Smart Meter - M1-40', unitValue: 300 }),
    ];
    const result = calculateSystemCost(
      makeSolution({
        accessories: [
          makeAccessory({ model: 'Smart Meter - M1-40', qty: 2 }),
          makeAccessory({ model: 'X1-Matebox Advanced', optional: true }),
        ],
      }),
      stock
    );
    // inverter + battery + required Smart Meter; the optional Matebox is not
    // part of the investment until the user explicitly opts into it.
    expect(result.totalCost).toBe(5000 + 8000 + 300 * 2);
    expect(result.pricedItemsCount).toBe(3);
    expect(result.totalItemsCount).toBe(3);
    expect(result.isComplete).toBe(true);
  });

  it('does not charge bundled accessories already included with a parent product', () => {
    const stock = [
      makeStockItem({ id: '1', productType: 'inverter', productModel: 'X1-Hybrid-5.0-D', unitValue: 5000 }),
      makeStockItem({ id: '2', productType: 'battery', productModel: 'T-BAT-SYS HV 5.8 V2', unitValue: 8000 }),
      makeStockItem({ id: '3', productType: 'accessory', productModel: 'WiFi Dongle', unitValue: 500 }),
    ];
    const result = calculateSystemCost(
      makeSolution({ accessories: [makeAccessory({ model: 'WiFi Dongle', bundled: true })] }),
      stock
    );
    expect(result.totalCost).toBe(5000 + 8000);
    expect(result.totalItemsCount).toBe(2);
  });

  it('prices Master and expansion battery models independently', () => {
    const stock = [
      makeStockItem({ id: '1', productType: 'inverter', productModel: 'X1-Hybrid-5.0-D', unitValue: 5000 }),
      makeStockItem({ id: '2', productType: 'battery', productModel: 'Master', unitValue: 8000 }),
      makeStockItem({ id: '3', productType: 'battery', productModel: 'Slave', unitValue: 6000 }),
    ];
    const result = calculateSystemCost(
      makeSolution({ batteryModel: 'Master', batteryQty: 3, inverterQty: 1, batteryPortsUsed: 1 }),
      stock,
      [],
      [],
      undefined,
      [{ model: 'Master', expansionModel: 'Slave' }]
    );
    expect(result.totalCost).toBe(5000 + 8000 + 6000 * 2);
    expect(result.isComplete).toBe(true);
  });

  it('still prices accessories persisted in the legacy string format', () => {
    const stock = [
      makeStockItem({ id: '1', productType: 'inverter', productModel: 'X1-Hybrid-5.0-D', unitValue: 5000 }),
      makeStockItem({ id: '2', productType: 'battery', productModel: 'T-BAT-SYS HV 5.8 V2', unitValue: 8000 }),
      makeStockItem({ id: '3', productType: 'accessory', productModel: 'Smart Meter - M1-40', unitValue: 300 }),
    ];
    const legacyAccessories = ['Smart Meter - M1-40 x2', 'X1-Matebox Advanced (opcional)'] as unknown as Solution['accessories'];
    const result = calculateSystemCost(makeSolution({ accessories: legacyAccessories }), stock);
    expect(result.totalCost).toBe(5000 + 8000 + 300 * 2);
    expect(result.pricedItemsCount).toBe(3);
  });

  it('does not match a stock item of the wrong product type even with the same model name', () => {
    const stock = [makeStockItem({ productType: 'battery', productModel: 'X1-Hybrid-5.0-D', unitValue: 999 })];
    const result = calculateSystemCost(makeSolution(), stock);
    expect(result.totalCost).toBe(0);
    expect(result.pricedItemsCount).toBe(0);
  });

  it('marks up each product category by its own sell margin percentage', () => {
    const stock = [
      makeStockItem({ id: '1', productType: 'inverter', productModel: 'X1-Hybrid-5.0-D', unitValue: 5000 }),
      makeStockItem({ id: '2', productType: 'battery', productModel: 'T-BAT-SYS HV 5.8 V2', unitValue: 8000 }),
      makeStockItem({ id: '3', productType: 'accessory', productModel: 'Smart Meter - M1-40', unitValue: 300 }),
    ];
    const result = calculateSystemCost(
      makeSolution({ accessories: [makeAccessory({ model: 'Smart Meter - M1-40' })] }),
      stock,
      undefined,
      undefined,
      { inverterPercent: 10, batteryPercent: 20, accessoryPercent: 0 }
    );
    // inverter marked up 10% (5000 -> 5500), battery 20% (8000 -> 9600), accessory unchanged.
    expect(result.totalCost).toBe(5500 + 9600 + 300);
  });

  it('applies no margin by default, keeping the raw stock price', () => {
    const stock = [makeStockItem({ id: '1', productType: 'inverter', productModel: 'X1-Hybrid-5.0-D', unitValue: 5000 })];
    const result = calculateSystemCost(makeSolution(), stock);
    expect(result.totalCost).toBe(5000);
  });

  it('does not apply a product margin to services, which have no separate cost basis', () => {
    const services = [{ serviceId: 's1', name: 'Instalação', qty: 1 }];
    const userServices = [{ id: 's1', name: 'Instalação', unitValue: 500, createdAt: '', updatedAt: '' }];
    const result = calculateSystemCost(null, [], services, userServices, {
      inverterPercent: 50,
      batteryPercent: 50,
      accessoryPercent: 50,
    });
    expect(result.totalCost).toBe(500);
  });

  it('adds priced project services (by serviceId) on top of the solution cost', () => {
    const stock = [
      makeStockItem({ id: '1', productType: 'inverter', productModel: 'X1-Hybrid-5.0-D', unitValue: 5000 }),
      makeStockItem({ id: '2', productType: 'battery', productModel: 'T-BAT-SYS HV 5.8 V2', unitValue: 8000 }),
    ];
    const services = [{ serviceId: 's1', name: 'Instalação', qty: 2 }];
    const userServices = [{ id: 's1', name: 'Instalação', unitValue: 500, createdAt: '', updatedAt: '' }];
    const result = calculateSystemCost(makeSolution(), stock, services, userServices);
    expect(result.totalCost).toBe(5000 + 8000 + 500 * 2);
    expect(result.pricedItemsCount).toBe(3);
    expect(result.totalItemsCount).toBe(3);
    expect(result.isComplete).toBe(true);
  });

  it('prices services even when there is no solution yet', () => {
    const services = [{ serviceId: 's1', name: 'Frete', qty: 1 }];
    const userServices = [{ id: 's1', name: 'Frete', unitValue: 150, createdAt: '', updatedAt: '' }];
    const result = calculateSystemCost(null, [], services, userServices);
    expect(result.totalCost).toBe(150);
    expect(result.totalItemsCount).toBe(1);
    expect(result.isComplete).toBe(true);
  });

  it('leaves a service unpriced (and isComplete false) when it no longer resolves in userServices', () => {
    const services = [{ serviceId: 'gone', name: 'Serviço removido', qty: 1 }];
    const result = calculateSystemCost(makeSolution(), [], services, []);
    expect(result.pricedItemsCount).toBe(0);
    expect(result.totalItemsCount).toBe(3);
    expect(result.isComplete).toBe(false);
  });
});

function makeWhiteTariff(partial: Partial<WhiteTariffConfig> = {}): WhiteTariffConfig {
  return {
    requiredPowerW: 2000,
    pontaEnergyWh: 4000,
    intermediateEnergyWh: 0,
    includeBackupReserve: false,
    pontaTariffPerKwh: 1.2,
    intermediateTariffPerKwh: 0.95,
    foraPontaTariffPerKwh: 0.8,
    ...partial,
  };
}

describe('calculateTariffSavings', () => {
  it('returns null when there is no white tariff config', () => {
    expect(calculateTariffSavings(null)).toBeNull();
  });

  it('computes monthly savings as ponta energy (kWh) x spread (ponta - fora ponta) x business days', () => {
    const result = calculateTariffSavings(
      makeWhiteTariff({ pontaEnergyWh: 4000, intermediateEnergyWh: 0, pontaTariffPerKwh: 1.3, foraPontaTariffPerKwh: 0.8 })
    );
    expect(result).not.toBeNull();
    const expectedMonthly = 4 * 0.5 * TARIFF_BUSINESS_DAYS_PER_MONTH;
    expect(result!.monthlySavings).toBeCloseTo(expectedMonthly);
    expect(result!.annualSavings).toBeCloseTo(expectedMonthly * 12);
    expect(result!.businessDaysPerMonth).toBe(TARIFF_BUSINESS_DAYS_PER_MONTH);
  });

  it('adds the intermediária energy x spread (intermediária - fora ponta) on top of the ponta savings', () => {
    const result = calculateTariffSavings(
      makeWhiteTariff({
        pontaEnergyWh: 4000,
        intermediateEnergyWh: 2000,
        pontaTariffPerKwh: 1.3,
        intermediateTariffPerKwh: 1.0,
        foraPontaTariffPerKwh: 0.8,
      })
    );
    const pontaMonthly = 4 * 0.5 * TARIFF_BUSINESS_DAYS_PER_MONTH;
    const intermediateMonthly = 2 * 0.2 * TARIFF_BUSINESS_DAYS_PER_MONTH;
    expect(result!.monthlySavings).toBeCloseTo(pontaMonthly + intermediateMonthly);
  });

  it('returns zero savings when ponta, intermediária and fora ponta tariffs are all equal', () => {
    const result = calculateTariffSavings(
      makeWhiteTariff({ pontaTariffPerKwh: 0.8, intermediateTariffPerKwh: 0.8, foraPontaTariffPerKwh: 0.8 })
    );
    expect(result!.monthlySavings).toBe(0);
    expect(result!.annualSavings).toBe(0);
    expect(result!.tariffOrderValid).toBe(true);
  });

  it('flags an invalid tariff order and never returns a negative absolute bill', () => {
    const result = calculateTariffSavings(
      makeWhiteTariff({
        pontaEnergyWh: 4000,
        intermediateEnergyWh: 2000,
        pontaTariffPerKwh: 0.6,
        intermediateTariffPerKwh: 0.7,
        foraPontaTariffPerKwh: 0.8,
      }),
      { totalMonthlyConsumptionKwh: 400 }
    );
    expect(result!.tariffOrderValid).toBe(false);
    expect(result!.monthlyCostWithSolaxBrl).toBeGreaterThanOrEqual(0);
  });

  it('leaves the absolute cost fields null when no total consumption is given', () => {
    const result = calculateTariffSavings(makeWhiteTariff());
    expect(result!.monthlyCostWithoutSolaxBrl).toBeNull();
    expect(result!.monthlyCostWithSolaxBrl).toBeNull();
  });

  it('computes absolute sem/com SolaX monthly costs when a consistent total consumption is given', () => {
    // pontaEnergyWh = 4000 Wh/dia -> 4 kWh/dia x 22 = 88 kWh/mês na ponta.
    const result = calculateTariffSavings(
      makeWhiteTariff({ pontaEnergyWh: 4000, intermediateEnergyWh: 0, pontaTariffPerKwh: 1.2, foraPontaTariffPerKwh: 0.8 }),
      { totalMonthlyConsumptionKwh: 400 }
    );
    const monthlyPontaKwh = 4 * TARIFF_BUSINESS_DAYS_PER_MONTH;
    const monthlyForaPontaKwh = 400 - monthlyPontaKwh;
    const expectedWithout = monthlyForaPontaKwh * 0.8 + monthlyPontaKwh * 1.2;
    const expectedWith = 400 * 0.8;
    expect(result!.monthlyCostWithoutSolaxBrl).toBeCloseTo(expectedWithout);
    expect(result!.monthlyCostWithSolaxBrl).toBeCloseTo(expectedWith);
    // The delta between the two absolute totals always matches the plain savings figure.
    expect(result!.monthlyCostWithoutSolaxBrl! - result!.monthlyCostWithSolaxBrl!).toBeCloseTo(result!.monthlySavings);
  });

  it('leaves the absolute cost fields null when the total consumption is smaller than ponta + intermediária energy alone', () => {
    // 4 kWh/dia x 22 = 88 kWh/mês na ponta, mas o total informado é menor que isso.
    const result = calculateTariffSavings(makeWhiteTariff({ pontaEnergyWh: 4000, intermediateEnergyWh: 0 }), {
      totalMonthlyConsumptionKwh: 50,
    });
    expect(result!.monthlyCostWithoutSolaxBrl).toBeNull();
    expect(result!.monthlyCostWithSolaxBrl).toBeNull();
    // The plain delta still shows even when the breakdown doesn't.
    expect(result!.monthlySavings).toBeGreaterThan(0);
  });

  it('has zero pvMonthlySavings and unchanged monthlySavings when there is no PV generation estimate', () => {
    const result = calculateTariffSavings(makeWhiteTariff({ pontaEnergyWh: 4000, intermediateEnergyWh: 2000 }));
    expect(result!.pvMonthlySavings).toBe(0);
  });

  it('values PV generation shifted into ponta at the full ponta tariff, up to the battery capacity, ponta getting first claim', () => {
    // Battery holds 3 kWh/dia; ponta needs 4 kWh/dia, intermediária needs 2 kWh/dia; PV generates 5 kWh/dia (150/30).
    // Ponta gets first claim: min(3, 4) = 3 kWh/dia shifted to ponta, nothing left over for intermediária.
    const whiteTariff = makeWhiteTariff({
      pontaEnergyWh: 4000,
      intermediateEnergyWh: 2000,
      pontaTariffPerKwh: 1.2,
      intermediateTariffPerKwh: 1.0,
      foraPontaTariffPerKwh: 0.8,
    });
    const result = calculateTariffSavings(whiteTariff, { availableEnergyWh: 3000, pvMonthlyGenerationKwh: 150 });

    const pontaShiftKwh = 3; // capped by battery capacity
    const intermediateShiftKwh = 0; // battery capacity already used up by ponta
    const dailyExcessSolarKwh = 5 - pontaShiftKwh - intermediateShiftKwh;

    const expectedMonthlySavings =
      TARIFF_BUSINESS_DAYS_PER_MONTH *
        (pontaShiftKwh * 1.2 + intermediateShiftKwh * 1.0) +
      dailyExcessSolarKwh * 0.8 * 30;
    const expectedPvMonthlySavings =
      TARIFF_BUSINESS_DAYS_PER_MONTH * (pontaShiftKwh * 1.2 + intermediateShiftKwh * 1.0) + dailyExcessSolarKwh * 0.8 * 30;

    expect(result!.monthlySavings).toBeCloseTo(expectedMonthlySavings);
    expect(result!.pvMonthlySavings).toBeCloseTo(expectedPvMonthlySavings);
    // pvMonthlySavings never exceeds the combined total.
    expect(result!.pvMonthlySavings).toBeLessThanOrEqual(result!.monthlySavings);
  });

  it('spills leftover battery capacity from ponta into intermediária once ponta is fully covered', () => {
    // Battery holds 5 kWh/dia; ponta needs 2 kWh/dia (fully shiftable), leaving 3 kWh/dia for intermediária (needs 4).
    const whiteTariff = makeWhiteTariff({
      pontaEnergyWh: 2000,
      intermediateEnergyWh: 4000,
      pontaTariffPerKwh: 1.2,
      intermediateTariffPerKwh: 1.0,
      foraPontaTariffPerKwh: 0.8,
    });
    const result = calculateTariffSavings(whiteTariff, { availableEnergyWh: 5000, pvMonthlyGenerationKwh: 150 });

    // Ponta fully shifted (2 kWh/dia) + intermediária shifted 3 kWh/dia (remaining battery capacity).
    const expectedPvMonthlySavings = TARIFF_BUSINESS_DAYS_PER_MONTH * (2 * 1.2 + 3 * 1.0);
    expect(result!.pvMonthlySavings).toBeCloseTo(expectedPvMonthlySavings);
  });

  it('applies the battery and inverter efficiencies to grid-charged arbitrage', () => {
    const ideal = calculateTariffSavings(makeWhiteTariff({ pontaTariffPerKwh: 1.3, foraPontaTariffPerKwh: 0.8 }));
    const realistic = calculateTariffSavings(
      makeWhiteTariff({ pontaTariffPerKwh: 1.3, foraPontaTariffPerKwh: 0.8 }),
      {
        batteryRoundTripEfficiencyPercent: 95,
        inverterChargeEfficiencyPercent: 97,
        inverterDischargeEfficiencyPercent: 97,
      }
    );
    expect(realistic!.effectiveRoundTripEfficiencyPct).toBeCloseTo(89.3855);
    expect(realistic!.monthlySavings).toBeLessThan(ideal!.monthlySavings);
  });

  it('shares the usable battery energy between ponta and intermediária and respects initial SOH', () => {
    const result = calculateTariffSavings(
      makeWhiteTariff({ pontaEnergyWh: 4000, intermediateEnergyWh: 4000 }),
      { availableEnergyWh: 6000, initialSohPercent: 80 }
    );
    expect(result!.dailyPontaServedKwh).toBe(4);
    expect(result!.dailyIntermediateServedKwh).toBeCloseTo(0.8);
  });

  it('extends projected payback as annual SOH loss reduces battery savings', () => {
    const withoutFade = calculateDegradedPaybackMonths(1800, {
      batteryMonthlySavings: 100,
      pvMonthlySavings: 0,
      annualSohLossPercent: 0,
    });
    const withFade = calculateDegradedPaybackMonths(1800, {
      batteryMonthlySavings: 100,
      pvMonthlySavings: 0,
      annualSohLossPercent: 20,
    });
    expect(withoutFade).toBe(18);
    expect(withFade).toBe(20);
  });
});

describe('buildPdfFileName', () => {
  const date = new Date('2026-07-22T15:30:00Z');

  it('joins the project name and the date', () => {
    expect(buildPdfFileName('Casa de praia', date)).toBe('Casa_de_praia_2026-07-22');
  });

  it('falls back to "projeto" when the name is empty or only whitespace', () => {
    expect(buildPdfFileName('', date)).toBe('projeto_2026-07-22');
    expect(buildPdfFileName('   ', date)).toBe('projeto_2026-07-22');
  });

  it('strips characters unsafe in a filename and collapses whitespace into underscores', () => {
    expect(buildPdfFileName('  Projeto: "Norte" / Sul <2>  ', date)).toBe('Projeto_Norte_Sul_2_2026-07-22');
  });
});

describe('normalizeAccessoryLine', () => {
  it('parses plain, quantity-suffixed, and optional legacy string labels', () => {
    expect(normalizeAccessoryLine('Smart Meter - M1-40')).toEqual({
      model: 'Smart Meter - M1-40',
      qty: 1,
      optional: false,
      appliesTo: 'system',
      comment: null,
      bundled: false,
    });
    expect(normalizeAccessoryLine('Smart Meter - M1-40 x3')).toEqual({
      model: 'Smart Meter - M1-40',
      qty: 3,
      optional: false,
      appliesTo: 'system',
      comment: null,
      bundled: false,
    });
    expect(normalizeAccessoryLine('X1-Matebox Advanced (opcional)')).toEqual({
      model: 'X1-Matebox Advanced',
      qty: 1,
      optional: true,
      appliesTo: 'system',
      comment: null,
      bundled: false,
    });
  });

  it('passes through already-structured accessory lines unchanged', () => {
    const line = makeAccessory({ model: 'Smart Meter - M1-40', qty: 2, appliesTo: 'inverter', comment: 'Requer CT.' });
    expect(normalizeAccessoryLine(line)).toBe(line);
  });
});

describe('isGeneratorPowerInsufficient', () => {
  it('is false when external_generator is not selected, regardless of power', () => {
    expect(isGeneratorPowerInsufficient([], makeGenerator({ apparentPowerVA: 100 }), 5000)).toBe(false);
  });

  it('is false when external_generator is selected but no generator config exists yet', () => {
    expect(isGeneratorPowerInsufficient(['external_generator'], null, 5000)).toBe(false);
  });

  it('is true when the generator power is below the loads peak power', () => {
    expect(isGeneratorPowerInsufficient(['external_generator'], makeGenerator({ apparentPowerVA: 2000 }), 5000)).toBe(
      true
    );
  });

  it('is false when the generator power meets or exceeds the loads peak power', () => {
    expect(isGeneratorPowerInsufficient(['external_generator'], makeGenerator({ apparentPowerVA: 5000 }), 5000)).toBe(
      false
    );
    expect(isGeneratorPowerInsufficient(['external_generator'], makeGenerator({ apparentPowerVA: 6000 }), 5000)).toBe(
      false
    );
  });
});

describe('isGeneratorAtsUnacknowledged', () => {
  it('is false when external_generator is not selected', () => {
    expect(isGeneratorAtsUnacknowledged([], makeGenerator({ ownAtsAcknowledged: false }))).toBe(false);
  });

  it('is true when external_generator is selected but no generator config exists yet', () => {
    expect(isGeneratorAtsUnacknowledged(['external_generator'], null)).toBe(true);
  });

  it('is true when the acknowledgement checkbox has not been checked', () => {
    expect(isGeneratorAtsUnacknowledged(['external_generator'], makeGenerator({ ownAtsAcknowledged: false }))).toBe(
      true
    );
  });

  it('is false once the acknowledgement checkbox is checked', () => {
    expect(isGeneratorAtsUnacknowledged(['external_generator'], makeGenerator({ ownAtsAcknowledged: true }))).toBe(
      false
    );
  });
});

describe('isMicrogridPowerNoticeUnacknowledged', () => {
  it('is false when microgrid is not selected', () => {
    expect(isMicrogridPowerNoticeUnacknowledged([], makeMicrogrid({ powerNoticeAcknowledged: false }))).toBe(false);
  });

  it('is true when microgrid is selected but no config exists yet', () => {
    expect(isMicrogridPowerNoticeUnacknowledged(['microgrid'], null)).toBe(true);
  });

  it('is true when the acknowledgement checkbox has not been checked', () => {
    expect(
      isMicrogridPowerNoticeUnacknowledged(['microgrid'], makeMicrogrid({ powerNoticeAcknowledged: false }))
    ).toBe(true);
  });

  it('is false once the acknowledgement checkbox is checked', () => {
    expect(
      isMicrogridPowerNoticeUnacknowledged(['microgrid'], makeMicrogrid({ powerNoticeAcknowledged: true }))
    ).toBe(false);
  });
});

describe('checkPhaseVoltageCompatibility', () => {
  it('is unknown when no grid type is chosen yet', () => {
    expect(checkPhaseVoltageCompatibility(null, 1, 220, { forMicrogrid: false })).toBe('unknown');
  });

  it('is compatible when phases and voltage match the grid type exactly', () => {
    expect(checkPhaseVoltageCompatibility('threePhase_380', 3, 380, { forMicrogrid: false })).toBe('compatible');
  });

  it('is incompatible on a mismatch, for both generator and microgrid', () => {
    expect(checkPhaseVoltageCompatibility('singlePhase_220', 3, 380, { forMicrogrid: false })).toBe('incompatible');
    expect(checkPhaseVoltageCompatibility('singlePhase_220', 3, 380, { forMicrogrid: true })).toBe('incompatible');
  });

  it('allows the documented microgrid exception (220V monofásico on a 380V trifásico or 220V bifásico network)', () => {
    expect(checkPhaseVoltageCompatibility('threePhase_380', 1, 220, { forMicrogrid: true })).toBe('compatible');
    expect(checkPhaseVoltageCompatibility('splitPhase_220', 1, 220, { forMicrogrid: true })).toBe('compatible');
  });

  it('does not extend the microgrid exception to the generator', () => {
    expect(checkPhaseVoltageCompatibility('threePhase_380', 1, 220, { forMicrogrid: false })).toBe('incompatible');
  });

  it('does not apply the exception outside its two documented grid types', () => {
    expect(checkPhaseVoltageCompatibility('threePhase_220', 1, 220, { forMicrogrid: true })).toBe('incompatible');
  });
});

describe('isMicrogridPhaseVoltageIncompatible', () => {
  it('is false when microgrid is not selected, regardless of mismatch', () => {
    expect(isMicrogridPhaseVoltageIncompatible([], makeMicrogrid({ onGridPhases: 3, voltageV: 380 }), 'singlePhase_220')).toBe(
      false
    );
  });

  it('is false when microgrid is selected but no config exists yet', () => {
    expect(isMicrogridPhaseVoltageIncompatible(['microgrid'], null, 'singlePhase_220')).toBe(false);
  });

  it('is true when the configured phases/voltage mismatch the grid type', () => {
    expect(
      isMicrogridPhaseVoltageIncompatible(['microgrid'], makeMicrogrid({ onGridPhases: 3, voltageV: 380 }), 'singlePhase_220')
    ).toBe(true);
  });

  it('is false when the configured phases/voltage match the grid type', () => {
    expect(
      isMicrogridPhaseVoltageIncompatible(['microgrid'], makeMicrogrid({ onGridPhases: 1, voltageV: 220 }), 'singlePhase_220')
    ).toBe(false);
  });

  it('is false under the documented microgrid exception', () => {
    expect(
      isMicrogridPhaseVoltageIncompatible(['microgrid'], makeMicrogrid({ onGridPhases: 1, voltageV: 220 }), 'threePhase_380')
    ).toBe(false);
  });
});

describe('isGeneratorPhaseVoltageIncompatible', () => {
  it('is false when external_generator is not selected, regardless of mismatch', () => {
    expect(
      isGeneratorPhaseVoltageIncompatible([], makeGenerator({ phases: 3, voltageV: 380 }), 'singlePhase_220')
    ).toBe(false);
  });

  it('is false when external_generator is selected but no generator config exists yet', () => {
    expect(isGeneratorPhaseVoltageIncompatible(['external_generator'], null, 'singlePhase_220')).toBe(false);
  });

  it('is true when the configured phases/voltage mismatch the grid type', () => {
    expect(
      isGeneratorPhaseVoltageIncompatible(
        ['external_generator'],
        makeGenerator({ phases: 3, voltageV: 380 }),
        'singlePhase_220'
      )
    ).toBe(true);
  });

  it('is false when the configured phases/voltage match the grid type', () => {
    expect(
      isGeneratorPhaseVoltageIncompatible(
        ['external_generator'],
        makeGenerator({ phases: 1, voltageV: 220 }),
        'singlePhase_220'
      )
    ).toBe(false);
  });

  it('does not get the microgrid exception', () => {
    expect(
      isGeneratorPhaseVoltageIncompatible(
        ['external_generator'],
        makeGenerator({ phases: 1, voltageV: 220 }),
        'threePhase_380'
      )
    ).toBe(true);
  });
});
