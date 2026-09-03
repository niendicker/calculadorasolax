import { describe, expect, it } from 'vitest';
import { parseLoadCurveCsv, summarizeLoadCurve } from './load-curve';
import { LOAD_CURVE_MAX_POINTS, type LoadCurve, type LoadCurveMetadata } from './types';

function makeMetadata(overrides: Partial<LoadCurveMetadata> = {}): LoadCurveMetadata {
  return {
    resolutionMinutes: 15,
    timezone: 'America/Sao_Paulo',
    profileBasis: 'representative_period',
    periodStart: '2026-08-24',
    periodEnd: '2026-08-30',
    ...overrides,
  };
}

describe('parseLoadCurveCsv', () => {
  it('parses a valid comma-delimited CSV with a dot decimal separator', () => {
    const csv = ['timestamp,powerKw', '2026-08-24T00:00:00Z,100.5', '2026-08-24T00:15:00Z,120', '2026-08-24T00:30:00Z,90.25'].join(
      '\n'
    );

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.curve.points).toHaveLength(3);
    expect(result.curve.points[0]).toEqual({ timestamp: '2026-08-24T00:00:00.000Z', powerKw: 100.5 });
    expect(result.curve.resolutionMinutes).toBe(15);
    expect(result.curve.source).toBe('csv');
    expect(result.warnings).toEqual([]);
  });

  it('parses a semicolon-delimited CSV with a comma decimal separator (Brazilian Excel export)', () => {
    const csv = ['timestamp;powerKw', '2026-08-24T00:00:00Z;1.234,5', '2026-08-24T00:15:00Z;900,75'].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.curve.points.map((p) => p.powerKw)).toEqual([1234.5, 900.75]);
  });

  it('accepts header aliases in Portuguese with accents', () => {
    const csv = ['Data/Hora,Potência (kW)', '2026-08-24T00:00:00Z,50'].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(true);
  });

  it('sorts out-of-order rows chronologically', () => {
    const csv = [
      'timestamp,powerKw',
      '2026-08-24T00:30:00Z,3',
      '2026-08-24T00:00:00Z,1',
      '2026-08-24T00:15:00Z,2',
    ].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.curve.points.map((p) => p.powerKw)).toEqual([1, 2, 3]);
  });

  it('dedupes an exact duplicate row with a warning', () => {
    const csv = ['timestamp,powerKw', '2026-08-24T00:00:00Z,100', '2026-08-24T00:00:00Z,100', '2026-08-24T00:15:00Z,110'].join(
      '\n'
    );

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.curve.points).toHaveLength(2);
    expect(result.warnings.some((w) => w.includes('duplicated'))).toBe(true);
  });

  it('rejects a duplicated timestamp with conflicting powerKw values', () => {
    const csv = ['timestamp,powerKw', '2026-08-24T00:00:00Z,100', '2026-08-24T00:00:00Z,200'].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('conflicting'))).toBe(true);
  });

  it('rejects a CSV with more than LOAD_CURVE_MAX_POINTS points', () => {
    const rows = Array.from({ length: LOAD_CURVE_MAX_POINTS + 1 }, (_, i) => {
      const ts = new Date(Date.UTC(2026, 0, 1, 0, i * 15)).toISOString();
      return `${ts},10`;
    });
    const csv = ['timestamp,powerKw', ...rows].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes(`${LOAD_CURVE_MAX_POINTS}-point limit`))).toBe(true);
  });

  it('rejects an invalid timestamp with a row-numbered error', () => {
    const csv = ['timestamp,powerKw', 'not-a-date,100'].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(['row 2: timestamp "not-a-date" is not a valid ISO 8601 date']);
  });

  it('rejects a negative power reading', () => {
    const csv = ['timestamp,powerKw', '2026-08-24T00:00:00Z,-5'].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('non-negative');
  });

  it('rejects a header missing a recognizable timestamp/power column', () => {
    const csv = ['foo,bar', '1,2'].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('CSV header must include');
  });

  it('rejects an unsupported profileBasis', () => {
    const csv = ['timestamp,powerKw', '2026-08-24T00:00:00Z,100'].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata({ profileBasis: 'representative_day' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('profileBasis');
  });

  it('warns about a gap larger than the declared resolution', () => {
    const csv = ['timestamp,powerKw', '2026-08-24T00:00:00Z,100', '2026-08-24T02:00:00Z,110'].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata({ resolutionMinutes: 15 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.includes('gap detected'))).toBe(true);
  });

  it('warns when points are closer together than the declared resolution', () => {
    const csv = ['timestamp,powerKw', '2026-08-24T00:00:00Z,100', '2026-08-24T00:01:00Z,110'].join('\n');

    const result = parseLoadCurveCsv(csv, makeMetadata({ resolutionMinutes: 60 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.includes('closer together'))).toBe(true);
  });
});

describe('summarizeLoadCurve', () => {
  it('computes peak, min, average and total energy at 15-minute resolution', () => {
    const curve: LoadCurve = {
      points: [
        { timestamp: '2026-08-24T00:00:00Z', powerKw: 100 },
        { timestamp: '2026-08-24T00:15:00Z', powerKw: 200 },
        { timestamp: '2026-08-24T00:30:00Z', powerKw: 50 },
        { timestamp: '2026-08-24T00:45:00Z', powerKw: 150 },
      ],
      resolutionMinutes: 15,
      timezone: 'America/Sao_Paulo',
      profileBasis: 'representative_period',
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      source: 'csv',
    };

    const summary = summarizeLoadCurve(curve);

    expect(summary.peakKw).toBe(200);
    expect(summary.minKw).toBe(50);
    expect(summary.averageKw).toBe(125);
    // (100+200+50+150) kW * 0.25 h = 125 kWh
    expect(summary.totalEnergyKwh).toBe(125);
    expect(summary.pointCount).toBe(4);
  });

  // Fase 6 audit's mandatory worked examples (Problem #1: a report showed
  // ~52x too much weekly energy — these three fixed, hand-computed cases
  // pin the kW->kWh integration down so that regression can never recur
  // silently.
  it('100 kW held for 1h in 15-min steps integrates to exactly 100 kWh', () => {
    const curve: LoadCurve = {
      points: Array.from({ length: 4 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, i * 15)).toISOString(),
        powerKw: 100,
      })),
      resolutionMinutes: 15,
      timezone: 'UTC',
      profileBasis: 'representative_period',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-01',
      source: 'manual',
    };
    expect(summarizeLoadCurve(curve).totalEnergyKwh).toBeCloseTo(100, 10);
  });

  it('100 kW held for 24h integrates to exactly 2400 kWh', () => {
    const pointsPerDay = (24 * 60) / 15;
    const curve: LoadCurve = {
      points: Array.from({ length: pointsPerDay }, (_, i) => ({
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, i * 15)).toISOString(),
        powerKw: 100,
      })),
      resolutionMinutes: 15,
      timezone: 'UTC',
      profileBasis: 'representative_period',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-01',
      source: 'manual',
    };
    expect(summarizeLoadCurve(curve).totalEnergyKwh).toBeCloseTo(2400, 10);
  });

  it('95 kW held for 7 days (a full representative week) integrates to exactly 15960 kWh', () => {
    const pointsPerWeek = (7 * 24 * 60) / 15;
    const curve: LoadCurve = {
      points: Array.from({ length: pointsPerWeek }, (_, i) => ({
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, i * 15)).toISOString(),
        powerKw: 95,
      })),
      resolutionMinutes: 15,
      timezone: 'UTC',
      profileBasis: 'representative_period',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-07',
      source: 'manual',
    };
    expect(summarizeLoadCurve(curve).totalEnergyKwh).toBeCloseTo(15960, 6);
  });

  it('returns zeros for an empty curve', () => {
    const curve: LoadCurve = {
      points: [],
      resolutionMinutes: 60,
      timezone: 'America/Sao_Paulo',
      profileBasis: 'representative_period',
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      source: 'manual',
    };

    expect(summarizeLoadCurve(curve)).toEqual({ peakKw: 0, minKw: 0, averageKw: 0, totalEnergyKwh: 0, pointCount: 0 });
  });
});
