import { describe, expect, it } from 'vitest';
import { buildManualDayCurve, DAILY_CURVE_PRESETS, type ManualDayCurveMetadata } from './manual-day-curve';
import { LOAD_CURVE_MAX_POINTS } from './types';

const FLAT_WEEKDAY = new Array(24).fill(50);
const FLAT_WEEKEND = new Array(24).fill(20);

function makeMetadata(overrides: Partial<ManualDayCurveMetadata> = {}): ManualDayCurveMetadata {
  return {
    resolutionMinutes: 15,
    timezone: 'America/Sao_Paulo',
    periodStart: '2026-08-24', // a Monday
    periodEnd: '2026-08-30', // the following Sunday
    ...overrides,
  };
}

describe('buildManualDayCurve', () => {
  it('produces exactly 672 points for the default 7-day/15-min case', () => {
    const result = buildManualDayCurve(FLAT_WEEKDAY, FLAT_WEEKEND, makeMetadata());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.curve.points).toHaveLength(672);
    expect(result.curve.profileBasis).toBe('representative_period');
    expect(result.curve.source).toBe('manual');
  });

  it('produces strictly ascending, unique timestamps', () => {
    const result = buildManualDayCurve(FLAT_WEEKDAY, FLAT_WEEKEND, makeMetadata());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const timestamps = result.curve.points.map((point) => point.timestamp);
    const sorted = [...timestamps].sort();
    expect(timestamps).toEqual(sorted);
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it('applies the weekday pattern on weekdays and the weekend pattern on weekends', () => {
    const weekdayKw = new Array(24).fill(100);
    const weekendKw = new Array(24).fill(5);
    const result = buildManualDayCurve(weekdayKw, weekendKw, makeMetadata({ resolutionMinutes: 60 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 2026-08-24 is a Monday, 2026-08-29 a Saturday, 2026-08-30 a Sunday.
    const byDate = new Map(result.curve.points.map((point) => [point.timestamp.slice(0, 10), point.powerKw]));
    expect(byDate.get('2026-08-24')).toBe(100);
    expect(byDate.get('2026-08-28')).toBe(100); // Friday
    expect(byDate.get('2026-08-29')).toBe(5); // Saturday
    expect(byDate.get('2026-08-30')).toBe(5); // Sunday
  });

  it('interpolates linearly between hourly anchors', () => {
    const weekdayKw = FLAT_WEEKDAY.slice();
    weekdayKw[10] = 0;
    weekdayKw[11] = 100;
    const result = buildManualDayCurve(weekdayKw, FLAT_WEEKEND, makeMetadata({ resolutionMinutes: 15 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const at1030 = result.curve.points.find((point) => point.timestamp.startsWith('2026-08-24T') && localHourMinute(point.timestamp) === '10:30');
    expect(at1030?.powerKw).toBeCloseTo(50, 5);
  });

  it('errors instead of silently truncating when the period exceeds the point cap', () => {
    const result = buildManualDayCurve(FLAT_WEEKDAY, FLAT_WEEKEND, makeMetadata({ resolutionMinutes: 15, periodEnd: '2026-10-24' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(new RegExp(`exceeding the ${LOAD_CURVE_MAX_POINTS}-point limit`));
  });

  it('rejects hourly patterns that are not exactly 24 entries', () => {
    const result = buildManualDayCurve([1, 2, 3], FLAT_WEEKEND, makeMetadata());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/weekdayKw must have exactly 24 entries/);
  });

  it('generates a timestamp that reads back as the requested local hour in the declared timezone', () => {
    const weekdayKw = FLAT_WEEKDAY.slice();
    weekdayKw[14] = 77;
    const result = buildManualDayCurve(weekdayKw, FLAT_WEEKEND, makeMetadata({ resolutionMinutes: 60 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const point = result.curve.points.find((p) => p.timestamp.startsWith('2026-08-24') && p.powerKw === 77);
    expect(point).toBeDefined();
    expect(localHourMinute(point!.timestamp, 'America/Sao_Paulo')).toBe('14:00');
  });
});

function localHourMinute(isoTimestamp: string, timezone = 'America/Sao_Paulo'): string {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = formatter.formatToParts(new Date(isoTimestamp));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
  return `${hour}:${minute}`;
}

describe('DAILY_CURVE_PRESETS', () => {
  it('has 24-entry weekday and weekend patterns for every preset', () => {
    for (const preset of DAILY_CURVE_PRESETS) {
      expect(preset.weekdayKw).toHaveLength(24);
      expect(preset.weekendKw).toHaveLength(24);
    }
  });

  it('has unique ids', () => {
    const ids = DAILY_CURVE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
