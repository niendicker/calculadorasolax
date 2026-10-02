// Builds a full-period LoadCurve from a hand-edited "representative day"
// pattern instead of a CSV file — Fase 6+, closing the "importar ou editar
// uma curva horária" MVP objective (plan section 3.1) that only the CSV half
// of was implemented so far. `LoadCurveSource = 'manual'` (types.ts) was
// already reserved for exactly this and unused until now.
//
// Two patterns, not one: plan section 4.2 already closed why the MVP curve
// is `representative_period` (a week) instead of `representative_day` — "it
// distinguishes a weekday profile from a weekend one, which commonly diverge
// in C&I load." Repeating a single day identically across the whole period
// would throw that distinction away, so this always takes a weekday pattern
// and a weekend pattern and applies whichever one matches each date's real
// day of week. The output is still always `profileBasis:
// 'representative_period'` — the dispatch/financial engine (dispatch.ts,
// tariff.ts) has zero branching on `profileBasis` and just walks
// `curve.points` positionally, so there is nothing for a real
// `representative_day` basis to plug into; this stays a pure input-shaping
// concern.

import { LOAD_CURVE_MAX_POINTS, type LoadCurve, type LoadCurvePoint, type LoadCurveResolutionMinutes } from './types.ts';

const HOURS_PER_DAY = 24;

export interface DailyCurvePreset {
  id: string;
  label: string;
  description: string;
  /** 24 kW values, index = local hour of day (0-23). */
  weekdayKw: number[];
  weekendKw: number[];
}

export const DAILY_CURVE_PRESETS: DailyCurvePreset[] = [
  {
    id: 'comercio',
    label: 'Comércio',
    description: 'Baixa carga noturna, rampa pela manhã e platô comercial com queda no almoço; fim de semana reduzido.',
    weekdayKw: [
      15, 15, 15, 15, 15, 15, // 0-5h
      20, 45, 80, 95, 100, 98, // 6-11h
      70, 85, 95, 98, 95, 88, // 12-17h
      70, 45, 25, 18, 15, 15, // 18-23h
    ],
    weekendKw: [
      12, 12, 12, 12, 12, 12, // 0-5h
      15, 25, 40, 55, 60, 58, // 6-11h
      50, 45, 35, 28, 22, 18, // 12-17h
      15, 14, 13, 12, 12, 12, // 18-23h
    ],
  },
  {
    id: 'industria-1-turno',
    label: 'Indústria 1 turno',
    description: 'Platô único das 7h às 17h nos dias úteis; fábrica praticamente parada no fim de semana.',
    weekdayKw: [
      8, 8, 8, 8, 8, 8, // 0-5h
      20, 90, 100, 100, 100, 100, // 6-11h
      95, 100, 100, 100, 95, 60, // 12-17h
      20, 10, 8, 8, 8, 8, // 18-23h
    ],
    weekendKw: new Array(HOURS_PER_DAY).fill(10),
  },
  {
    id: 'industria-2-turnos',
    label: 'Indústria 2 turnos',
    description: 'Dois platôs (manhã e tarde/noite) com um vale na troca de turno; fim de semana reduzido/manutenção.',
    weekdayKw: [
      30, 30, 30, 30, 30, 30, // 0-5h
      50, 90, 95, 95, 90, 85, // 6-11h
      60, 70, 90, 95, 95, 90, // 12-17h
      85, 60, 40, 35, 30, 30, // 18-23h
    ],
    weekendKw: new Array(HOURS_PER_DAY).fill(25),
  },
  {
    id: 'industria-continua',
    label: 'Indústria contínua (24h)',
    description: 'Processo contínuo: base alta o dia inteiro, todos os dias — dia útil e fim de semana iguais.',
    weekdayKw: [
      70, 70, 68, 68, 70, 72, // 0-5h
      80, 88, 92, 95, 95, 93, // 6-11h
      90, 92, 95, 95, 93, 90, // 12-17h
      85, 80, 78, 75, 72, 70, // 18-23h
    ],
    weekendKw: [
      70, 70, 68, 68, 70, 72, // 0-5h
      80, 88, 92, 95, 95, 93, // 6-11h
      90, 92, 95, 95, 93, 90, // 12-17h
      85, 80, 78, 75, 72, 70, // 18-23h
    ],
  },
  {
    id: 'perfil-plano',
    label: 'Perfil plano',
    description: 'Carga constante o dia inteiro — ponto de partida em branco para desenhar do zero.',
    weekdayKw: new Array(HOURS_PER_DAY).fill(50),
    weekendKw: new Array(HOURS_PER_DAY).fill(50),
  },
];

export interface ManualDayCurveMetadata {
  resolutionMinutes: LoadCurveResolutionMinutes;
  timezone: string;
  /** ISO date (YYYY-MM-DD). */
  periodStart: string;
  /** ISO date (YYYY-MM-DD), inclusive. */
  periodEnd: string;
}

export type BuildManualDayCurveResult = { ok: true; curve: LoadCurve } | { ok: false; errors: string[] };

function parseIsoDateParts(isoDate: string): [number, number, number] {
  const [year, month, day] = isoDate.split('-').map(Number);
  return [year, month, day];
}

function eachIsoDateInclusive(startIsoDate: string, endIsoDate: string): string[] {
  const [startYear, startMonth, startDay] = parseIsoDateParts(startIsoDate);
  const [endYear, endMonth, endDay] = parseIsoDateParts(endIsoDate);
  const endMs = Date.UTC(endYear, endMonth - 1, endDay);

  const dates: string[] = [];
  let cursorMs = Date.UTC(startYear, startMonth - 1, startDay);
  while (cursorMs <= endMs) {
    dates.push(new Date(cursorMs).toISOString().slice(0, 10));
    cursorMs += 24 * 60 * 60 * 1000;
  }
  return dates;
}

/** A calendar date's day of week doesn't depend on timezone — reading it as
 * midnight UTC is safe here (this is never converted to an instant that
 * would need the curve's declared timezone). Sunday/Saturday = weekend. */
function isWeekendDate(isoDate: string): boolean {
  const [year, month, day] = parseIsoDateParts(isoDate);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/** Linear interpolation between the two nearest of the day's 24 hourly
 * anchors, wrapping past midnight (23h → 0h of the same array). */
function interpolateHourlyKw(hourlyKw: number[], hourFraction: number): number {
  const wrapped = ((hourFraction % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
  const hour0 = Math.floor(wrapped) % HOURS_PER_DAY;
  const hour1 = (hour0 + 1) % HOURS_PER_DAY;
  const fraction = wrapped - Math.floor(wrapped);
  return hourlyKw[hour0] + (hourlyKw[hour1] - hourlyKw[hour0]) * fraction;
}

/** Converts a local wall-clock date+time in an IANA timezone to a UTC ISO
 * instant. `Intl.DateTimeFormat` only converts instant→local, never the
 * reverse, and this project has no date/timezone library (dispatch.ts's
 * `minutesOfDay` solves the same problem in the other direction, also
 * without one) — so this guesses a UTC instant assuming the desired
 * wall-clock numbers, reads back what local time that guess actually lands
 * on in `timezone`, and corrects by the difference. Two passes cover a
 * guess that happens to land close to a DST transition (Brazilian timezones
 * have had none since 2019, but this field is free text). */
function zonedTimeToUtcIso(isoDate: string, hour: number, minute: number, timezone: string): string {
  const [year, month, day] = parseIsoDateParts(isoDate);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = desired;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  for (let pass = 0; pass < 2; pass++) {
    const parts = formatter.formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
    const observed = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), 0);
    const diff = desired - observed;
    if (diff === 0) break;
    guess += diff;
  }

  return new Date(guess).toISOString();
}

/** Expands a weekday/weekend hourly pattern into a full-period LoadCurve —
 * one point per `resolutionMinutes` step across every day from
 * `periodStart` to `periodEnd` (inclusive), picking whichever pattern
 * matches each date's real day of week. Errors out (never silently
 * truncates) if the period/resolution combination would exceed
 * `LOAD_CURVE_MAX_POINTS`, same discipline as parseLoadCurveCsv. */
export function buildManualDayCurve(weekdayKw: number[], weekendKw: number[], metadata: ManualDayCurveMetadata): BuildManualDayCurveResult {
  const errors: string[] = [];
  if (weekdayKw.length !== HOURS_PER_DAY) errors.push(`weekdayKw must have exactly ${HOURS_PER_DAY} entries, one per hour of the day`);
  if (weekendKw.length !== HOURS_PER_DAY) errors.push(`weekendKw must have exactly ${HOURS_PER_DAY} entries, one per hour of the day`);
  if (errors.length > 0) return { ok: false, errors };

  const dates = eachIsoDateInclusive(metadata.periodStart, metadata.periodEnd);
  const stepsPerDay = (HOURS_PER_DAY * 60) / metadata.resolutionMinutes;
  const totalPoints = dates.length * stepsPerDay;

  if (totalPoints > LOAD_CURVE_MAX_POINTS) {
    errors.push(
      `period (${dates.length} day${dates.length === 1 ? '' : 's'}) at ${metadata.resolutionMinutes}-minute resolution would produce ${totalPoints} points, exceeding the ${LOAD_CURVE_MAX_POINTS}-point limit`
    );
    return { ok: false, errors };
  }

  const points: LoadCurvePoint[] = [];
  for (const isoDate of dates) {
    const pattern = isWeekendDate(isoDate) ? weekendKw : weekdayKw;
    for (let step = 0; step < stepsPerDay; step++) {
      const minuteOfDay = step * metadata.resolutionMinutes;
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      const powerKw = Math.max(0, Math.round(interpolateHourlyKw(pattern, hour + minute / 60) * 100) / 100);
      points.push({ timestamp: zonedTimeToUtcIso(isoDate, hour, minute, metadata.timezone), powerKw });
    }
  }

  return {
    ok: true,
    curve: {
      points,
      resolutionMinutes: metadata.resolutionMinutes,
      timezone: metadata.timezone,
      profileBasis: 'representative_period',
      periodStart: metadata.periodStart,
      periodEnd: metadata.periodEnd,
      source: 'manual',
    },
  };
}
