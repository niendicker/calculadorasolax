// Structural validation for CommercialIndustrialOptions — mirrors the style
// of supabase/functions/calculate-residential/logic.ts's
// validateResidentialOptions: works on untrusted `unknown` input (the API
// boundary), returns a list of human-readable error strings instead of
// throwing, and never assumes a field exists before checking its type.
//
// This validates the contract's shape and numeric bounds (plan section 4).
// It does not do curve-import semantics (CSV/XLSX parsing, gap detection) —
// that is Fase 2's load-curve.ts job, run before a LoadCurve ever reaches
// this validator.

import { LOAD_CURVE_MAX_POINTS, type LoadCurveProfileBasis, type LoadCurveResolutionMinutes } from './types.ts';

const VALID_RESOLUTIONS: LoadCurveResolutionMinutes[] = [15, 30, 60];
const VALID_PROFILE_BASES: LoadCurveProfileBasis[] = ['representative_day', 'representative_period', 'annual_series'];
const VALID_STRATEGIES = ['BASE', 'PEAK_SHAVING', 'LOAD_SHIFTING', 'HYBRID'] as const;
const VALID_TARIFF_MODALITIES = ['verde', 'azul'] as const;
const VALID_TARIFF_MARKETS = ['cativo', 'livre'] as const;
const VALID_SIZING_MODES = ['fixed', 'auto'] as const;
const VALID_CURVE_SOURCES = ['manual', 'csv', 'xlsx'] as const;
const VALID_RANKING_CRITERIA = ['PAYBACK', 'ROI', 'NPV'] as const;

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validateLoadCurve(raw: unknown, errors: string[]): void {
  if (raw === null) return;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('loadCurve must be an object or null');
    return;
  }
  const curve = raw as Record<string, unknown>;

  if (!Array.isArray(curve.points)) {
    errors.push('loadCurve.points must be an array');
  } else {
    if (curve.points.length === 0) {
      errors.push('loadCurve.points must not be empty');
    }
    if (curve.points.length > LOAD_CURVE_MAX_POINTS) {
      errors.push(`loadCurve.points must not exceed ${LOAD_CURVE_MAX_POINTS} points`);
    }

    let previousTimestamp: string | null = null;
    const seenTimestamps = new Set<string>();
    curve.points.forEach((point, index) => {
      if (!point || typeof point !== 'object') {
        errors.push(`loadCurve.points[${index}] must be an object`);
        return;
      }
      const { timestamp, powerKw } = point as Record<string, unknown>;
      if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
        errors.push(`loadCurve.points[${index}].timestamp must be a valid ISO 8601 string`);
        return;
      }
      if (!isNonNegativeFiniteNumber(powerKw)) {
        errors.push(`loadCurve.points[${index}].powerKw must be a non-negative finite number`);
      }
      if (seenTimestamps.has(timestamp)) {
        errors.push(`loadCurve.points[${index}].timestamp is duplicated: ${timestamp}`);
      }
      seenTimestamps.add(timestamp);
      if (previousTimestamp !== null && timestamp < previousTimestamp) {
        errors.push(`loadCurve.points[${index}] is out of chronological order`);
      }
      previousTimestamp = timestamp;
    });
  }

  if (!VALID_RESOLUTIONS.includes(curve.resolutionMinutes as LoadCurveResolutionMinutes)) {
    errors.push('loadCurve.resolutionMinutes must be one of: ' + VALID_RESOLUTIONS.join(', '));
  }
  if (typeof curve.timezone !== 'string' || curve.timezone.length === 0) {
    errors.push('loadCurve.timezone must be a non-empty string');
  }
  if (!VALID_PROFILE_BASES.includes(curve.profileBasis as LoadCurveProfileBasis)) {
    errors.push('loadCurve.profileBasis must be one of: ' + VALID_PROFILE_BASES.join(', '));
  }
  if (typeof curve.periodStart !== 'string' || !ISO_DATE_PATTERN.test(curve.periodStart)) {
    errors.push('loadCurve.periodStart must be an ISO date string (YYYY-MM-DD)');
  }
  if (typeof curve.periodEnd !== 'string' || !ISO_DATE_PATTERN.test(curve.periodEnd)) {
    errors.push('loadCurve.periodEnd must be an ISO date string (YYYY-MM-DD)');
  }
  if (!VALID_CURVE_SOURCES.includes(curve.source as (typeof VALID_CURVE_SOURCES)[number])) {
    errors.push('loadCurve.source must be one of: ' + VALID_CURVE_SOURCES.join(', '));
  }
}

function validateTariff(raw: unknown, errors: string[]): void {
  if (raw === null) return;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('tariff must be an object or null');
    return;
  }
  const tariff = raw as Record<string, unknown>;

  if (!isNonNegativeFiniteNumber(tariff.energyRatePeakBrlPerMwh)) {
    errors.push('tariff.energyRatePeakBrlPerMwh must be a non-negative finite number');
  }
  if (!isNonNegativeFiniteNumber(tariff.energyRateOffPeakBrlPerMwh)) {
    errors.push('tariff.energyRateOffPeakBrlPerMwh must be a non-negative finite number');
  }
  if (!isNonNegativeFiniteNumber(tariff.demandRateBrlPerKwMonth)) {
    errors.push('tariff.demandRateBrlPerKwMonth must be a non-negative finite number');
  }
  if (!isNonNegativeFiniteNumber(tariff.contractedDemandKw)) {
    errors.push('tariff.contractedDemandKw must be a non-negative finite number');
  }
  if (typeof tariff.peakStart !== 'string' || !HHMM_PATTERN.test(tariff.peakStart)) {
    errors.push('tariff.peakStart must be a HH:mm string');
  }
  if (typeof tariff.peakEnd !== 'string' || !HHMM_PATTERN.test(tariff.peakEnd)) {
    errors.push('tariff.peakEnd must be a HH:mm string');
  }
  if (!VALID_TARIFF_MODALITIES.includes(tariff.tariffModality as (typeof VALID_TARIFF_MODALITIES)[number])) {
    errors.push('tariff.tariffModality must be one of: ' + VALID_TARIFF_MODALITIES.join(', '));
  }
  if (!VALID_TARIFF_MARKETS.includes(tariff.market as (typeof VALID_TARIFF_MARKETS)[number])) {
    errors.push('tariff.market must be one of: ' + VALID_TARIFF_MARKETS.join(', '));
  }
  if (!isFiniteNumber(tariff.icmsPercent) || tariff.icmsPercent < 0 || tariff.icmsPercent > 100) {
    errors.push('tariff.icmsPercent must be a number between 0 and 100');
  }
  if (!isFiniteNumber(tariff.pisCofinsPercent) || tariff.pisCofinsPercent < 0 || tariff.pisCofinsPercent > 100) {
    errors.push('tariff.pisCofinsPercent must be a number between 0 and 100');
  }
}

function validateSizing(raw: unknown, errors: string[]): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('sizing must be an object');
    return;
  }
  const sizing = raw as Record<string, unknown>;

  if (!VALID_SIZING_MODES.includes(sizing.mode as (typeof VALID_SIZING_MODES)[number])) {
    errors.push('sizing.mode must be one of: ' + VALID_SIZING_MODES.join(', '));
    return;
  }

  if (sizing.mode === 'fixed') {
    if (!isPositiveInteger(sizing.moduleCount)) {
      errors.push('sizing.moduleCount must be a positive integer when sizing.mode is "fixed"');
    }
  } else {
    const min = sizing.minModules;
    const max = sizing.maxModules;
    if (!isPositiveInteger(min)) {
      errors.push('sizing.minModules must be a positive integer when sizing.mode is "auto"');
    }
    if (!isPositiveInteger(max)) {
      errors.push('sizing.maxModules must be a positive integer when sizing.mode is "auto"');
    }
    if (isPositiveInteger(min) && isPositiveInteger(max) && min > max) {
      errors.push('sizing.minModules must not be greater than sizing.maxModules');
    }
  }
}

function validateFinancialAssumptions(raw: unknown, errors: string[]): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('financialAssumptions must be an object');
    return;
  }
  const assumptions = raw as Record<string, unknown>;

  if (
    !isFiniteNumber(assumptions.discountRatePercent) ||
    assumptions.discountRatePercent < 0 ||
    assumptions.discountRatePercent > 100
  ) {
    errors.push('financialAssumptions.discountRatePercent must be a number between 0 and 100');
  }
  if (
    !isPositiveInteger(assumptions.analysisHorizonYears) ||
    (assumptions.analysisHorizonYears as number) > 30
  ) {
    errors.push('financialAssumptions.analysisHorizonYears must be an integer between 1 and 30');
  }
  if (!isFiniteNumber(assumptions.annualEnergyInflationPercent)) {
    errors.push('financialAssumptions.annualEnergyInflationPercent must be a finite number');
  }
  if (
    !isPositiveInteger(assumptions.monthsPerYear) ||
    (assumptions.monthsPerYear as number) > 12
  ) {
    errors.push('financialAssumptions.monthsPerYear must be an integer between 1 and 12');
  }
}

/** Validates a raw (untrusted) payload against the CommercialIndustrialOptions
 * contract. Returns an empty array when valid. Mirrors
 * validateResidentialOptions's calling convention so the API route layer can
 * treat both the same way. */
export function validateCommercialIndustrialOptions(raw: unknown): string[] {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['payload must be a JSON object'];
  }

  const options = raw as Record<string, unknown>;

  validateLoadCurve(options.loadCurve ?? null, errors);
  validateTariff(options.tariff ?? null, errors);

  if (options.bessProductId !== null && typeof options.bessProductId !== 'string') {
    errors.push('bessProductId must be a string or null');
  }

  if (!VALID_STRATEGIES.includes(options.strategy as (typeof VALID_STRATEGIES)[number])) {
    errors.push('strategy must be one of: ' + VALID_STRATEGIES.join(', '));
  }

  validateSizing(options.sizing, errors);
  validateFinancialAssumptions(options.financialAssumptions, errors);

  if (!VALID_RANKING_CRITERIA.includes(options.rankingCriterion as (typeof VALID_RANKING_CRITERIA)[number])) {
    errors.push('rankingCriterion must be one of: ' + VALID_RANKING_CRITERIA.join(', '));
  }

  return errors;
}
