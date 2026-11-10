import type { LoadCurve } from '@/supabase/functions/_shared/commercial-industrial/types';
import type { CurveRangeSelection } from './LoadCurveChart';

export interface CiCurveDay {
  date: string;
  label: string;
  pattern: 'weekday' | 'weekend';
  indices: number[];
  minutes: number[];
}

/** Group actual samples by the project's local calendar, not the browser's. */
export function ciCurveDays(curve: LoadCurve | null): CiCurveDay[] {
  if (!curve) return [];
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: curve.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const days = new Map<string, CiCurveDay>();
  curve.points.forEach((point, index) => {
    const dateObj = new Date(point.timestamp);
    if (isNaN(dateObj.getTime())) return;
    const parts = Object.fromEntries(formatter.formatToParts(dateObj).map(part => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    let day = days.get(date);
    if (!day) {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const pattern = weekday === 0 || weekday === 6 ? 'weekend' : 'weekday';
      day = {
        date, pattern,
        label: `${parts.day}/${parts.month}/${parts.year} · ${pattern === 'weekend' ? 'Fim de semana' : 'Dia útil'}`,
        indices: [], minutes: [],
      };
      days.set(date, day);
    }
    day.indices.push(index);
    day.minutes.push(Number(parts.hour) * 60 + Number(parts.minute));
  });
  return [...days.values()];
}

/** The editor has quarter-hour bins; coarser saved curves select entire
 * original bins. No samples are invented or resampled for a backup interval. */
export function ciDayRange(curve: LoadCurve, day: CiCurveDay, range: CurveRangeSelection, editorPointCount = 96): CurveRangeSelection | null {
  const step = 1440 / editorPointCount;
  const start = range.startIndex * step;
  const end = (range.endIndex + 1) * step;
  const indices = day.indices.filter((_, i) => day.minutes[i] < end && day.minutes[i] + curve.resolutionMinutes > start);
  return indices.length ? { startIndex: indices[0], endIndex: indices[indices.length - 1] } : null;
}

export function ciEditorRange(curve: LoadCurve, day: CiCurveDay, range: CurveRangeSelection | null, editorPointCount = 96): CurveRangeSelection | null {
  if (!range) return null;
  const start = day.indices.indexOf(range.startIndex);
  const end = day.indices.indexOf(range.endIndex);
  if (start < 0 || end < 0) return null;
  const step = 1440 / editorPointCount;
  return {
    startIndex: day.minutes[start] / step,
    endIndex: Math.min(editorPointCount - 1, (day.minutes[end] + curve.resolutionMinutes) / step - 1),
  };
}
