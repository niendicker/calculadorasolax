import { describe, expect, it } from 'vitest';
import {
  TARIFF_BUSINESS_DAYS_PER_MONTH,
  batteryQuantityBreakdown,
  buildMarginSummary,
  calculateSystemCost,
  calculateTariffSavings,
  effectiveTargetEnergyWh,
  effectiveTargetPowerW,
  expansionModelSet,
  parseAccessoryLabel,
} from './helpers';
import type { Solution, UserStockItem, WhiteTariffConfig } from '@/lib/types';

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

describe('batteryQuantityBreakdown', () => {
  const catalog = [
    { model: 'T58 V2 Master', expansionModel: 'T58 Slave' },
    { model: 'TP-HS3.6' },
  ];

  it('splits into 1x Master + (qty-1)x expansion when the model has an expansionModel and qty > 1', () => {
    expect(batteryQuantityBreakdown('T58 V2 Master', 3, catalog)).toEqual([
      { model: 'T58 V2 Master', qty: 1 },
      { model: 'T58 Slave', qty: 2 },
    ]);
  });

  it('does not split when qty is 1, even if an expansionModel is configured', () => {
    expect(batteryQuantityBreakdown('T58 V2 Master', 1, catalog)).toEqual([{ model: 'T58 V2 Master', qty: 1 }]);
  });

  it('does not split when the model has no expansionModel', () => {
    expect(batteryQuantityBreakdown('TP-HS3.6', 3, catalog)).toEqual([{ model: 'TP-HS3.6', qty: 3 }]);
  });

  it('does not split when the model is not in the catalog', () => {
    expect(batteryQuantityBreakdown('unknown-model', 3, catalog)).toEqual([{ model: 'unknown-model', qty: 3 }]);
  });
});

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
    requiredEnergyWh: 6000,
    includeBackupReserve: false,
    tariffSpreadPerKwh: 0.5,
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

  it('replaces the base energy target with whiteTariff.requiredEnergyWh when includeBackupReserve is off', () => {
    expect(effectiveTargetEnergyWh(['white_tariff'], whiteTariff, 3000)).toBe(6000);
  });

  it('adds the base energy target on top when includeBackupReserve is on', () => {
    expect(effectiveTargetEnergyWh(['white_tariff'], { ...whiteTariff, includeBackupReserve: true }, 3000)).toBe(9000);
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
      nominalW: 3000,
      peakW: 6000,
      dailyKwh: 3,
      solution: baseSolution,
    });
    expect(rows).toEqual([
      { key: 'nominal', label: 'Potência padrão', requiredValue: 3000, providedValue: 5000, unit: 'W' },
      { key: 'peak', label: 'Potência de pico', requiredValue: 6000, providedValue: 7000, unit: 'W' },
      { key: 'energy', label: 'Energia', requiredValue: 3000, providedValue: 3240, unit: 'Wh' },
    ]);
  });

  it('adds microgrid rows only when the feature is active with a positive on-grid power', () => {
    const rows = buildMarginSummary({
      desiredFeatures: ['microgrid'],
      whiteTariff: null,
      microgrid: { onGridPhases: 1, onGridApparentPowerVA: 2000, isFundamentalRequirement: false, photoUrl: null },
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
      microgrid: { onGridPhases: 1, onGridApparentPowerVA: 2000, isFundamentalRequirement: false, photoUrl: null },
      nominalW: 3000,
      peakW: 6000,
      dailyKwh: 3,
      solution: baseSolution,
    });
    expect(rows.some((row) => row.key.startsWith('microgrid'))).toBe(false);
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

  it('includes accessories parsed from the solution.accessories labels', () => {
    const stock = [
      makeStockItem({ id: '1', productType: 'inverter', productModel: 'X1-Hybrid-5.0-D', unitValue: 5000 }),
      makeStockItem({ id: '2', productType: 'battery', productModel: 'T-BAT-SYS HV 5.8 V2', unitValue: 8000 }),
      makeStockItem({ id: '3', productType: 'accessory', productModel: 'Smart Meter - M1-40', unitValue: 300 }),
    ];
    const result = calculateSystemCost(
      makeSolution({ accessories: ['Smart Meter - M1-40 x2', 'X1-Matebox Advanced (opcional)'] }),
      stock
    );
    // inverter (5000x1) + battery (8000x1) + Smart Meter (300x2) priced; Matebox unpriced
    expect(result.totalCost).toBe(5000 + 8000 + 300 * 2);
    expect(result.pricedItemsCount).toBe(3);
    expect(result.totalItemsCount).toBe(4);
    expect(result.isComplete).toBe(false);
  });

  it('does not match a stock item of the wrong product type even with the same model name', () => {
    const stock = [makeStockItem({ productType: 'battery', productModel: 'X1-Hybrid-5.0-D', unitValue: 999 })];
    const result = calculateSystemCost(makeSolution(), stock);
    expect(result.totalCost).toBe(0);
    expect(result.pricedItemsCount).toBe(0);
  });
});

describe('calculateTariffSavings', () => {
  function makeWhiteTariff(partial: Partial<WhiteTariffConfig> = {}): WhiteTariffConfig {
    return {
      requiredPowerW: 2000,
      requiredEnergyWh: 4000,
      includeBackupReserve: false,
      tariffSpreadPerKwh: 0.4,
      ...partial,
    };
  }

  it('returns null when there is no white tariff config', () => {
    expect(calculateTariffSavings(null)).toBeNull();
  });

  it('computes monthly savings as energy (kWh) x spread x business days', () => {
    const result = calculateTariffSavings(makeWhiteTariff({ requiredEnergyWh: 4000, tariffSpreadPerKwh: 0.5 }));
    expect(result).not.toBeNull();
    const expectedMonthly = 4 * 0.5 * TARIFF_BUSINESS_DAYS_PER_MONTH;
    expect(result!.monthlySavings).toBeCloseTo(expectedMonthly);
    expect(result!.annualSavings).toBeCloseTo(expectedMonthly * 12);
    expect(result!.businessDaysPerMonth).toBe(TARIFF_BUSINESS_DAYS_PER_MONTH);
  });

  it('returns zero savings when the spread is zero', () => {
    const result = calculateTariffSavings(makeWhiteTariff({ tariffSpreadPerKwh: 0 }));
    expect(result!.monthlySavings).toBe(0);
    expect(result!.annualSavings).toBe(0);
  });
});

describe('parseAccessoryLabel (regression coverage for calculateSystemCost)', () => {
  it('parses plain, quantity-suffixed, and optional labels', () => {
    expect(parseAccessoryLabel('Smart Meter - M1-40')).toEqual({
      model: 'Smart Meter - M1-40',
      qty: 1,
      optional: false,
    });
    expect(parseAccessoryLabel('Smart Meter - M1-40 x3')).toEqual({
      model: 'Smart Meter - M1-40',
      qty: 3,
      optional: false,
    });
    expect(parseAccessoryLabel('X1-Matebox Advanced (opcional)')).toEqual({
      model: 'X1-Matebox Advanced',
      qty: 1,
      optional: true,
    });
  });
});
