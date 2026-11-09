import { describe, expect, it } from 'vitest';
import { paintDailyCurveSegment } from './daily-curve-brush';

describe('daily curve freehand stroke', () => {
  it.each([false, true])('fills skipped points in either direction (reverse: %s)', reverse => {
    const original = Array(16).fill(80);
    const a = { index: 4, powerKw: 20 }, b = { index: 8, powerKw: 60 };
    const result = paintDailyCurveSegment(original, reverse ? b : a, reverse ? a : b, 1);
    expect(result.slice(4, 9)).toEqual([20, 30, 40, 50, 60]);
    expect(result.slice(0, 4)).toEqual(original.slice(0, 4));
    expect(result.slice(9)).toEqual(original.slice(9));
    expect(original).toEqual(Array(16).fill(80));
  });

  it('updates the same point vertically without moving its neighbors', () => {
    expect(paintDailyCurveSegment([5, 5, 5], { index: 1, powerKw: 10 }, { index: 1, powerKw: 30 }, 1)).toEqual([5, 30, 5]);
  });

  it('quantizes in displayed kVA and retains active kW at nonunity FP', () => {
    const result = paintDailyCurveSegment([0, 0, 0], { index: 0, powerKw: 64 }, { index: 2, powerKw: 80 }, .8);
    expect(result).toEqual([64, 72, 80]);
  });
});
