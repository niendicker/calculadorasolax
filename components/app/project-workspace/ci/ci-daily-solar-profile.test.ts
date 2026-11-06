import { describe, expect, it } from 'vitest';
import { buildDailySolarProfile } from './ci-daily-solar-profile';
import { DEFAULT_CI_SOLAR_CONFIG } from '@/supabase/functions/_shared/commercial-industrial/types';

describe('daily solar profile', () => {
  it('uses the configured estimate and omits disabled solar', () => {
    expect(buildDailySolarProfile(DEFAULT_CI_SOLAR_CONFIG, 'weekday', 'America/Sao_Paulo')).toBeUndefined();
    const profile = buildDailySolarProfile({ ...DEFAULT_CI_SOLAR_CONFIG, enabled: true }, 'weekday', 'America/Sao_Paulo')!;
    expect(profile).toHaveLength(96);
    expect(profile[0]).toBe(0);
    expect(profile[48]).toBe(50);
  });
  it('averages imported local weekdays, repeats interval averages and leaves missing slots empty', () => {
    const solar = { ...DEFAULT_CI_SOLAR_CONFIG, enabled: true, generationCurve: {
      resolutionMinutes: 30 as const, timezone: 'America/Sao_Paulo', profileBasis: 'representative_period' as const,
      periodStart: '2026-11-02', periodEnd: '2026-11-07', source: 'csv' as const,
      points: [{ timestamp: '2026-11-02T12:00:00-03:00', powerKw: 100 }, { timestamp: '2026-11-03T12:00:00-03:00', powerKw: 200 }, { timestamp: '2026-11-07T12:00:00-03:00', powerKw: 50 }],
    } };
    const weekday = buildDailySolarProfile(solar, 'weekday', 'America/Sao_Paulo')!;
    expect(weekday[48]).toBe(150);
    expect(weekday[49]).toBe(150);
    expect(weekday[50]).toBeNull();
    expect(buildDailySolarProfile(solar, 'weekend', 'America/Sao_Paulo')![48]).toBe(50);
    solar.generationCurve.points.pop();
    expect(buildDailySolarProfile(solar, 'weekend', 'America/Sao_Paulo')!.every(value => value === null)).toBe(true);
  });
});

describe('edited PV persistence and weekly projection', () => {
  it('preserves independent daily patterns and maps quarter-hours into actual consumption timestamps', async () => {
    const { updateDailySolarProfile, buildSolarPreviewPoints } = await import('./ci-daily-solar-profile');
    const consumption = { points: [{ timestamp: '2026-11-02T12:00:00-03:00', powerKw: 100 }, { timestamp: '2026-11-07T12:00:00-03:00', powerKw: 100 }], resolutionMinutes: 30 as const, timezone: 'America/Sao_Paulo', profileBasis: 'representative_period' as const, source: 'csv' as const, periodStart: '2026-11-02', periodEnd: '2026-11-07' };
    const solar = { ...DEFAULT_CI_SOLAR_CONFIG, enabled: true };
    const weekday = Array(96).fill(0); weekday[48] = 80; weekday[49] = 120;
    const edited = updateDailySolarProfile(solar, consumption, 'weekday', weekday);
    expect(edited.generationCurve!.source).toBe('manual');
    expect(edited.generationCurve!.points[0].powerKw).toBe(100);
    expect(buildDailySolarProfile(edited, 'weekday', consumption.timezone)![49]).toBe(120);
    const weekend = Array(96).fill(20);
    const updated = updateDailySolarProfile(edited, consumption, 'weekend', weekend);
    expect(updated.generationCurve!.points.map(point => point.powerKw)).toEqual([100, 20]);
    const reopened = JSON.parse(JSON.stringify(updated));
    expect(buildDailySolarProfile(reopened, 'weekday', consumption.timezone)![48]).toBe(80);
    expect(buildSolarPreviewPoints(reopened, { ...consumption, points: [{ timestamp: '2026-11-03T12:00:00-03:00', powerKw: 100 }] })![0].powerKw).toBe(100);
  });
});
