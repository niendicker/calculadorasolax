// CSV parsing/normalization for a C&I load curve — Fase 2 of
// docs/CI-MODULE-PLAN.md. Pure logic only, no UI: takes raw CSV text plus
// the metadata the user declares about it (resolution, timezone, period,
// profile basis) and produces a normalized LoadCurve, or a list of errors.
//
// Deliberately CSV-only for now (plan section 3.2/15: privilegiar
// simplicidade); XLSX support is a later addition once there's a concrete
// need, per the same "no dependency without clear necessity" principle that
// kept this file free of a CSV parsing library — the expected input (two
// columns, ISO timestamps, numeric power) doesn't need one.

import { LOAD_CURVE_MAX_POINTS, type LoadCurve, type LoadCurveMetadata, type LoadCurvePoint } from './types.ts';

export type ParseLoadCurveResult =
  | { ok: true; curve: LoadCurve; warnings: string[] }
  | { ok: false; errors: string[] };

const TIMESTAMP_HEADER_ALIASES = new Set(['timestamp', 'data', 'datahora', 'datetime', 'date']);
const POWER_HEADER_ALIASES = new Set(['powerkw', 'potenciakw', 'potencia', 'power']);

/** Strips accents/punctuation and lowercases, so "Potência (kW)" and
 * "potencia_kw" both match the same alias. */
const COMBINING_DIACRITICS_PATTERN = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizeHeaderName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function splitLines(csvText: string): string[] {
  return csvText.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
}

/** Brazilian spreadsheet exports commonly use `;` as the delimiter and `,`
 * as the decimal separator; everything else here uses `,`/`.`. Detected from
 * the header line so a stray comma inside a later value can't mislead it. */
function detectDelimiter(headerLine: string): { delimiter: ';' | ','; decimalSeparator: ',' | '.' } {
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semicolons > commas ? { delimiter: ';', decimalSeparator: ',' } : { delimiter: ',', decimalSeparator: '.' };
}

function findColumnIndex(headers: string[], aliases: Set<string>): number {
  return headers.findIndex((header) => aliases.has(normalizeHeaderName(header)));
}

/** Parses raw CSV text into a normalized LoadCurve, validating against
 * `metadata` (declared, not inferred — plan section 4.2: "resolução
 * informada e validada, sem inferência silenciosa"). Points are sorted
 * chronologically; exact duplicate rows (same timestamp AND power) are
 * deduped with a warning, but a timestamp repeated with conflicting power
 * readings is a hard error — there is no safe way to pick which one is
 * right for a study with financial consequences. */
export function parseLoadCurveCsv(csvText: string, metadata: LoadCurveMetadata): ParseLoadCurveResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (metadata.profileBasis !== 'representative_period') {
    errors.push(
      'profileBasis must be "representative_period" — "representative_day" and "annual_series" are not supported by the Fase 2 importer yet'
    );
  }

  const lines = splitLines(csvText);
  if (lines.length < 2) {
    errors.push('CSV must have a header row and at least one data row');
    return { ok: false, errors };
  }

  const { delimiter, decimalSeparator } = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  const timestampIdx = findColumnIndex(headers, TIMESTAMP_HEADER_ALIASES);
  const powerIdx = findColumnIndex(headers, POWER_HEADER_ALIASES);

  if (timestampIdx === -1 || powerIdx === -1) {
    errors.push('CSV header must include a timestamp column (e.g. "timestamp") and a power column (e.g. "powerKw")');
    return { ok: false, errors };
  }

  const rawPoints: LoadCurvePoint[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-based, header is row 1 — matches what a user sees in a spreadsheet
    const cells = lines[i].split(delimiter);
    const rawTimestamp = cells[timestampIdx]?.trim();
    const rawPower = cells[powerIdx]?.trim();

    if (!rawTimestamp || Number.isNaN(Date.parse(rawTimestamp))) {
      errors.push(`row ${rowNumber}: timestamp "${rawTimestamp ?? ''}" is not a valid ISO 8601 date`);
      continue;
    }

    const normalizedPower = decimalSeparator === ',' ? rawPower?.replace(/\./g, '').replace(',', '.') : rawPower;
    const powerKw = Number(normalizedPower);
    if (!rawPower || !Number.isFinite(powerKw) || powerKw < 0) {
      errors.push(`row ${rowNumber}: powerKw "${rawPower ?? ''}" must be a non-negative number`);
      continue;
    }

    rawPoints.push({ timestamp: new Date(rawTimestamp).toISOString(), powerKw });
  }

  if (errors.length > 0) return { ok: false, errors };

  if (rawPoints.length === 0) {
    return { ok: false, errors: ['CSV has no valid data rows'] };
  }

  rawPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const points: LoadCurvePoint[] = [];
  const byTimestamp = new Map<string, number>();
  for (const point of rawPoints) {
    const previousPower = byTimestamp.get(point.timestamp);
    if (previousPower === undefined) {
      byTimestamp.set(point.timestamp, point.powerKw);
      points.push(point);
      continue;
    }
    if (previousPower === point.powerKw) {
      warnings.push(`timestamp ${point.timestamp} is duplicated (identical powerKw) — extra row ignored`);
      continue;
    }
    errors.push(
      `timestamp ${point.timestamp} appears more than once with conflicting powerKw values (${previousPower} vs ${point.powerKw})`
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  if (points.length > LOAD_CURVE_MAX_POINTS) {
    errors.push(`CSV has ${points.length} points, exceeding the ${LOAD_CURVE_MAX_POINTS}-point limit`);
    return { ok: false, errors };
  }

  const expectedIntervalMs = metadata.resolutionMinutes * 60 * 1000;
  for (let i = 1; i < points.length; i++) {
    const actualIntervalMs = Date.parse(points[i].timestamp) - Date.parse(points[i - 1].timestamp);
    if (actualIntervalMs > expectedIntervalMs * 1.5) {
      const gapMinutes = Math.round(actualIntervalMs / 60000);
      warnings.push(
        `gap detected between ${points[i - 1].timestamp} and ${points[i].timestamp} (${gapMinutes} min, expected ~${metadata.resolutionMinutes} min)`
      );
    } else if (actualIntervalMs < expectedIntervalMs * 0.5) {
      warnings.push(
        `points at ${points[i - 1].timestamp} and ${points[i].timestamp} are closer together than the declared ${metadata.resolutionMinutes}-minute resolution`
      );
    }
  }

  const curve: LoadCurve = {
    points,
    resolutionMinutes: metadata.resolutionMinutes,
    timezone: metadata.timezone,
    profileBasis: metadata.profileBasis,
    periodStart: metadata.periodStart,
    periodEnd: metadata.periodEnd,
    source: 'csv',
  };

  return { ok: true, curve, warnings };
}

export interface LoadCurveSummary {
  peakKw: number;
  minKw: number;
  averageKw: number;
  totalEnergyKwh: number;
  pointCount: number;
}

/** Aggregate stats over an already-normalized curve. Energy integrates each
 * point's power over the curve's declared resolution (not the actual gap to
 * the next point) — a gap means missing data, not a longer interval. */
export function summarizeLoadCurve(curve: LoadCurve): LoadCurveSummary {
  const { points, resolutionMinutes } = curve;
  if (points.length === 0) {
    return { peakKw: 0, minKw: 0, averageKw: 0, totalEnergyKwh: 0, pointCount: 0 };
  }

  const intervalHours = resolutionMinutes / 60;
  let peakKw = points[0].powerKw;
  let minKw = points[0].powerKw;
  let sumKw = 0;

  for (const point of points) {
    if (point.powerKw > peakKw) peakKw = point.powerKw;
    if (point.powerKw < minKw) minKw = point.powerKw;
    sumKw += point.powerKw;
  }

  return {
    peakKw,
    minKw,
    averageKw: sumKw / points.length,
    totalEnergyKwh: sumKw * intervalHours,
    pointCount: points.length,
  };
}
