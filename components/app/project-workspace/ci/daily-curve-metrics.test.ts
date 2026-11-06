import { describe, expect, it } from 'vitest';
import {
  applyBatchOperation,
  applyMovingAverageSmoothing,
  calculateDailyMetrics,
  formatPtNumber,
} from './daily-curve-metrics';

describe('daily-curve-metrics', () => {
  it('calculates daily metrics correctly for constant 24h consumption', () => {
    const flat24 = new Array(24).fill(100);
    const metrics = calculateDailyMetrics(flat24);

    expect(metrics.totalConsumptionKwh).toBe(2400);
    expect(metrics.avgConsumptionKw).toBe(100);
    expect(metrics.peakConsumptionKw).toBe(100);
    expect(metrics.peakConsumptionIndex).toBe(0);
    expect(metrics.totalSolarKwh).toBe(0);
    expect(metrics.solarCoveragePercent).toBe(0);
    expect(metrics.solarExportKwh).toBe(0);
  });

  it('calculates daily metrics for 96 quarter-hour points with solar injection', () => {
    // 96 points = 0.25h each
    const consumption = new Array(96).fill(50);
    const solar = new Array(96).fill(0);
    // Solar peak at midday (index 48 = 12:00) with 150 kW for 4 hours (16 points, 10:00-14:00)
    for (let i = 40; i < 56; i++) {
      solar[i] = 150;
    }

    const metrics = calculateDailyMetrics(consumption, solar);

    // Total consumption: 96 * 50 * 0.25 = 1200 kWh
    expect(metrics.totalConsumptionKwh).toBe(1200);
    expect(metrics.avgConsumptionKw).toBe(50);
    expect(metrics.peakConsumptionKw).toBe(50);

    // Total solar: 16 * 150 * 0.25 = 600 kWh
    expect(metrics.totalSolarKwh).toBe(600);
    expect(metrics.peakSolarKw).toBe(150);
    expect(metrics.peakSolarIndex).toBe(40);
    expect(metrics.solarCoveragePercent).toBe(50); // 600 / 1200 * 100

    // Solar export: in the 16 points, solar (150) > consumption (50) by 100 kW
    // Export = 16 * 100 * 0.25 = 400 kWh
    expect(metrics.solarExportKwh).toBe(400);
  });

  it('applies batch operations: set, scale, offset', () => {
    const initial = new Array(10).fill(100);

    // Set 50 kW from index 2 to 4
    const setRes = applyBatchOperation(initial, 2, 4, 'set', 50);
    expect(setRes.slice(2, 5)).toEqual([50, 50, 50]);
    expect(setRes[0]).toBe(100);

    // Scale +20% from index 1 to 3
    const scaleRes = applyBatchOperation(initial, 1, 3, 'scale', 20);
    expect(scaleRes.slice(1, 4)).toEqual([120, 120, 120]);
    expect(scaleRes[0]).toBe(100);

    // Offset -15 kW from index 5 to 7
    const offsetRes = applyBatchOperation(initial, 7, 5, 'offset', -15);
    expect(offsetRes.slice(5, 8)).toEqual([85, 85, 85]);
    expect(offsetRes[0]).toBe(100);

    // Clamps to min 0
    const clampedRes = applyBatchOperation(initial, 0, 2, 'offset', -200);
    expect(clampedRes.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('applies moving average smoothing', () => {
    const noisy = [50, 100, 50, 100, 50];
    const smoothed = applyMovingAverageSmoothing(noisy);

    // Index 1: 50*0.25 + 100*0.5 + 50*0.25 = 12.5 + 50 + 12.5 = 75
    expect(smoothed[1]).toBe(75);
    // Index 2: 100*0.25 + 50*0.5 + 100*0.25 = 25 + 25 + 25 = 75
    expect(smoothed[2]).toBe(75);
    // Boundary points are preserved
    expect(smoothed[0]).toBe(50);
    expect(smoothed[4]).toBe(50);
  });

  it('formats pt-BR numbers with comma decimal separator', () => {
    expect(formatPtNumber(1452.8, 1)).toBe('1.452,8');
    expect(formatPtNumber(60.5, 1)).toBe('60,5');
    expect(formatPtNumber(0, 1)).toBe('0,0');
  });
});
