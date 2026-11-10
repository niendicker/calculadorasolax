import { describe, expect, it } from 'vitest';
import { buildManualDayCurve } from '@/supabase/functions/_shared/commercial-industrial/manual-day-curve';
import { editGroupedCurvePoints } from './weekly-curve-editing';

function curve() {
  const result = buildManualDayCurve(Array(96).fill(50), Array(96).fill(20), {
    resolutionMinutes: 30, timezone: 'America/Manaus', periodStart: '2026-01-05', periodEnd: '2026-01-11',
  });
  if (!result.ok) throw new Error('Invalid fixture');
  return result.curve;
}

describe('grouped weekly edits', () => {
  it('replicates only edited local clock times across explicitly linked dates', () => {
    const saved = curve();
    // 23:30 on Monday is already Tuesday in UTC.
    const points = editGroupedCurvePoints(saved, [{ index: 47, powerKw: 80 }], ['2026-01-05', '2026-01-10']);
    expect(points[47].powerKw).toBe(80);
    expect(points[5*48+47].powerKw).toBe(80);
    expect(points[6*48+47].powerKw).toBe(20);
    expect(points[46]).toBe(saved.points[46]);
    expect(saved.points[47].powerKw).toBe(50);
    expect(points.map(point=>point.timestamp)).toEqual(saved.points.map(point=>point.timestamp));
  });

  it('edits a day outside the group individually and ignores invalid edits', () => {
    const saved = curve();
    const points = editGroupedCurvePoints(saved, [{ index: 48, powerKw: 81 }, { index: 0, powerKw: NaN }, { index: 2, powerKw: -1 }], ['2026-01-05', '2026-01-10']);
    expect(points[48].powerKw).toBe(81);
    expect(points[0].powerKw).toBe(50);
    expect(points[5*48].powerKw).toBe(20);
    expect(points[2].powerKw).toBe(50);
  });

  it('preserves partial imported days without inventing samples', () => {
    const saved = curve();
    const partial = { ...saved, points: saved.points.filter((_,index)=>index!==5*48+47) };
    const points = editGroupedCurvePoints(partial, [{ index: 47, powerKw: 80 }], ['2026-01-05', '2026-01-10']);
    expect(points).toHaveLength(partial.points.length);
    expect(points[5*48+46].powerKw).toBe(20);
  });
});
