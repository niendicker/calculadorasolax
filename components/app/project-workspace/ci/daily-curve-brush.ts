import { activeKwToApparentKva, apparentKvaToActiveKw } from '@/supabase/functions/_shared/commercial-industrial/ac-power';

export interface CurveBrushPoint {
  index: number;
  powerKw: number;
}

/** Fill skipped samples as well, so quick strokes do not leave holes in the curve. */
export function paintDailyCurveSegment(values: number[], from: CurveBrushPoint, to: CurveBrushPoint, factor: number): number[] {
  const next = values.slice();
  const first = Math.max(0, Math.min(from.index, to.index));
  const last = Math.min(values.length - 1, Math.max(from.index, to.index));
  for (let index = first; index <= last; index++) {
    const fraction = from.index === to.index ? 1 : (index - from.index) / (to.index - from.index);
    const kw = Math.max(0, from.powerKw + (to.powerKw - from.powerKw) * fraction);
    next[index] = apparentKvaToActiveKw(Math.round(activeKwToApparentKva(kw, factor) * 10) / 10, factor);
  }
  return next;
}
