import type { LoadCurve, LoadCurvePoint } from '@/supabase/functions/_shared/commercial-industrial/types';
import { ciCurveDays } from './ci-curve-days';

export interface CurvePointEdit { index: number; powerKw: number }

/** Replicate only changed clock times, leaving every other reading intact. */
export function editGroupedCurvePoints(curve: LoadCurve, edits: CurvePointEdit[], groupedDates: string[]): LoadCurvePoint[] {
  const days = ciCurveDays(curve);
  const locations = new Map<number, { date: string; minute: number }>();
  for (const day of days) day.indices.forEach((index, slot) => locations.set(index, { date: day.date, minute: day.minutes[slot] }));
  const updates = new Map<number, number>();
  for (const edit of edits) {
    const source = locations.get(edit.index);
    if (!source || !Number.isFinite(edit.powerKw) || edit.powerKw < 0) continue;
    const targets = groupedDates.includes(source.date) ? groupedDates : [source.date];
    for (const day of days) {
      if (!targets.includes(day.date)) continue;
      const slot = day.minutes.indexOf(source.minute);
      if (slot >= 0) updates.set(day.indices[slot], edit.powerKw);
    }
  }
  return curve.points.map((point, index) => updates.has(index) ? { ...point, powerKw: updates.get(index)! } : point);
}
