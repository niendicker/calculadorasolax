import { describe, expect, it } from 'vitest';
import { batteryQuantityBreakdown } from './battery-quantity-breakdown';

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

  it('scales the Master count with mastersNeeded — one Master per battery port/string in use', () => {
    // 2 inverters x 2 ports x 3 batteries/port = 12 total, 4 strings -> 4 Masters + 8 Slaves.
    expect(batteryQuantityBreakdown('T58 V2 Master', 12, catalog, 4)).toEqual([
      { model: 'T58 V2 Master', qty: 4 },
      { model: 'T58 Slave', qty: 8 },
    ]);
  });

  it('falls back to a single Master when mastersNeeded is omitted', () => {
    expect(batteryQuantityBreakdown('T58 V2 Master', 3, catalog)).toEqual([
      { model: 'T58 V2 Master', qty: 1 },
      { model: 'T58 Slave', qty: 2 },
    ]);
  });

  it('does not split when mastersNeeded covers the entire quantity (one battery per string)', () => {
    expect(batteryQuantityBreakdown('T58 V2 Master', 4, catalog, 4)).toEqual([{ model: 'T58 V2 Master', qty: 4 }]);
  });

  it('clamps mastersNeeded to at least 1 and at most the total quantity', () => {
    expect(batteryQuantityBreakdown('T58 V2 Master', 3, catalog, 0)).toEqual([
      { model: 'T58 V2 Master', qty: 1 },
      { model: 'T58 Slave', qty: 2 },
    ]);
    expect(batteryQuantityBreakdown('T58 V2 Master', 3, catalog, 10)).toEqual([{ model: 'T58 V2 Master', qty: 3 }]);
  });
});
