import { describe, expect, it } from 'vitest';
import { adjustCurveRange, curveScaleMaximum, measureAboveReference } from './curve-analysis';

describe('curve analysis', () => {
  it('clamps each boundary to data and prevents crossing the other boundary', () => {
    const range = { startIndex: 2, endIndex: 6 };
    expect(adjustCurveRange(range, 'startIndex', -3, 10)).toEqual({ startIndex: 0, endIndex: 6 });
    expect(adjustCurveRange(range, 'startIndex', 9, 10)).toEqual({ startIndex: 6, endIndex: 6 });
    expect(adjustCurveRange(range, 'endIndex', 0, 10)).toEqual({ startIndex: 2, endIndex: 2 });
    expect(adjustCurveRange(range, 'endIndex', 12, 10)).toEqual({ startIndex: 2, endIndex: 9 });
    expect(adjustCurveRange(range, 'endIndex', 7.6, 10)).toEqual({ startIndex: 2, endIndex: 8 });
  });

  it('counts only samples strictly above the limit and integrates active excess energy', () => {
    expect(measureAboveReference([20, 60, 40, 80], 40, 15)).toEqual({ minutes: 30, energyKwh: 15, peakKw: 40 });
    expect(measureAboveReference([], 40, 30)).toEqual({ minutes: 0, energyKwh: 0, peakKw: 0 });
    expect(measureAboveReference([0, 10], 0, 60)).toEqual({ minutes: 60, energyKwh: 10, peakKw: 10 });
  });

  it('leaves headroom above consumption, generation and reference limits including zero curves', () => {
    expect(curveScaleMaximum(100, 80, 200)).toBeCloseTo(230);
    expect(curveScaleMaximum(200, 80, 100)).toBeCloseTo(230);
    expect(curveScaleMaximum(0, 0)).toBeGreaterThan(0);
  });
});
