import type { CurveRangeSelection } from './LoadCurveChart';

export function adjustCurveRange(range: CurveRangeSelection, edge: 'startIndex' | 'endIndex', index: number, length: number): CurveRangeSelection {
  const value = Math.round(Math.max(0, Math.min(length - 1, index)));
  return edge === 'startIndex'
    ? { ...range, startIndex: Math.min(value, range.endIndex) }
    : { ...range, endIndex: Math.max(value, range.startIndex) };
}

/** Each recorded power sample represents one full resolution interval. */
export function measureAboveReference(values: number[], referenceKw: number, resolutionMinutes: number) {
  return values.reduce((result, value) => {
    const excess = Math.max(0, value - referenceKw);
    return {
      minutes: result.minutes + (excess > 0 ? resolutionMinutes : 0),
      energyKwh: result.energyKwh + excess * resolutionMinutes / 60,
      peakKw: Math.max(result.peakKw, excess),
    };
  }, { minutes: 0, energyKwh: 0, peakKw: 0 });
}

/** A positive headroom remains even when every point is zero. */
export function curveScaleMaximum(dataMax: number, ...limits: (number | undefined)[]) {
  return Math.max(1, dataMax, ...limits.map(value => value ?? 0)) * 1.15;
}
