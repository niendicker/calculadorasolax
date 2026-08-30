// Energy dispatch engine — Fase 3 of docs/CI-MODULE-PLAN.md section 5.2/5.3.
// Simulates BESS operation interval-by-interval against a normalized
// LoadCurve. Pure and deterministic: no React/Zustand/Supabase, no tariff
// pricing (that's Fase 4's tariff.ts — this only classifies each interval
// as peak/off-peak, it never touches R$).
//
// One dispatch loop for every strategy (BASE/PEAK_SHAVING/LOAD_SHIFTING/
// HYBRID) — the plan explicitly forbids the hybrid strategy from calling two
// independent engines, and the same discipline is applied to the other
// three for a single, testable code path.

import type { BessRuntimeParams, BessStrategyId, DispatchPoint, LoadCurve, TariffPeriod } from './types';

export interface TariffWindow {
  /** HH:mm, local to the curve's declared timezone. */
  peakStart: string;
  peakEnd: string;
}

export interface DispatchInput {
  curve: LoadCurve;
  bess: BessRuntimeParams;
  strategy: BessStrategyId;
  tariffWindow: TariffWindow;
  /** Required (and only meaningful) for PEAK_SHAVING and HYBRID — the grid
   * import level the strategy tries to shave down to. Plan section 5.2:
   * "Peak Shaving deve ter um alvo explícito". Typically the tariff's
   * contracted demand, but the caller decides that, not this module. */
  targetDemandKw: number | null;
}

function parseHHMM(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Minutes since local midnight, in `timezone`, for an ISO timestamp —
 * without a date library: Intl.DateTimeFormat already knows every IANA
 * timezone's offset (including DST) for a given instant. */
function minutesOfDay(timestamp: string, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(timestamp));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** Handles a window that wraps past midnight (e.g. 22:00-06:00) as well as
 * the ordinary case. `start === end` means no peak window at all — every
 * interval is off-peak (plan section 12.1's "curva sem período de ponta"). */
export function classifyTariffPeriod(timestamp: string, timezone: string, window: TariffWindow): TariffPeriod {
  if (window.peakStart === window.peakEnd) return 'offPeak';
  const minute = minutesOfDay(timestamp, timezone);
  const start = parseHHMM(window.peakStart);
  const end = parseHHMM(window.peakEnd);
  const isPeak = start <= end ? minute >= start && minute < end : minute >= start || minute < end;
  return isPeak ? 'peak' : 'offPeak';
}

interface StrategyDecision {
  /** Desired grid-side charge power, before any clamping. */
  chargeKw: number;
  /** Desired load-side discharge power, before any clamping. */
  dischargeKw: number;
}

/** Strategy rules decide *intent* only — every physical limit (power,
 * energy/SOC, no grid export) is enforced uniformly afterward in
 * runDispatch, not re-implemented per strategy. */
function decideStrategy(
  strategy: BessStrategyId,
  loadKw: number,
  period: TariffPeriod,
  targetDemandKw: number | null,
  bess: BessRuntimeParams
): StrategyDecision {
  switch (strategy) {
    case 'BASE':
      return { chargeKw: 0, dischargeKw: 0 };

    case 'PEAK_SHAVING': {
      const target = targetDemandKw ?? loadKw;
      if (loadKw > target) return { chargeKw: 0, dischargeKw: loadKw - target };
      // Opportunistic recharge below the target, capped so charging itself
      // never creates a new peak above it (plan doesn't specify a charging
      // rule for Peak Shaving explicitly; this is the documented MVP
      // interpretation — see docs/CI-MODULE-PLAN.md Fase 3 notes).
      return { chargeKw: Math.max(0, target - loadKw), dischargeKw: 0 };
    }

    case 'LOAD_SHIFTING':
      // Pure time-based arbitrage, independent of instantaneous load level
      // (plan section 5.2: "permitir carga fora da ponta e descarga na
      // ponta"). Amounts are capped later; request the battery's full power
      // in the intended direction.
      return period === 'offPeak' ? { chargeKw: bess.totalPowerKw, dischargeKw: 0 } : { chargeKw: 0, dischargeKw: bess.totalPowerKw };

    case 'HYBRID': {
      // Plan section 5.3's four-step priority, implemented as: Peak
      // Shaving's discharge rule during peak (steps 1+2 — SOC's own floor
      // acts as the "reserve", so it never over-discharges) unioned with
      // Load Shifting's charge rule during off-peak (step 3). Documented as
      // needing fixture validation before UI — see the tests in
      // dispatch.test.ts covering exactly this strategy.
      if (period === 'peak') {
        const target = targetDemandKw ?? loadKw;
        return loadKw > target ? { chargeKw: 0, dischargeKw: loadKw - target } : { chargeKw: 0, dischargeKw: 0 };
      }
      return { chargeKw: bess.totalPowerKw, dischargeKw: 0 };
    }
  }
}

/** Runs the full interval-by-interval simulation. Every physical constraint
 * (plan section 5.2, steps 3-7) is enforced here, uniformly across
 * strategies:
 *   - power clamped to bess.totalPowerKw;
 *   - energy clamped so SOC never leaves [socMinPercent, socMaxPercent];
 *   - charge and discharge are mutually exclusive per interval;
 *   - discharge never exceeds the interval's own load — "sem exportação
 *     para a rede" (no selling back to the grid). */
export function runDispatch(input: DispatchInput): DispatchPoint[] {
  const { curve, bess, strategy, tariffWindow, targetDemandKw } = input;
  const intervalHours = curve.resolutionMinutes / 60;
  const chargeEfficiency = Math.sqrt(bess.efficiencyPercent / 100);
  const dischargeEfficiency = chargeEfficiency;

  let socPercent = bess.initialSocPercent ?? bess.socMaxPercent;
  const trace: DispatchPoint[] = [];

  for (const point of curve.points) {
    const period = classifyTariffPeriod(point.timestamp, curve.timezone, tariffWindow);
    const decision = decideStrategy(strategy, point.powerKw, period, targetDemandKw, bess);

    let chargeKw = 0;
    let dischargeKw = 0;

    if (decision.chargeKw > 0) {
      const maxStorableEnergyKwh = ((bess.socMaxPercent - socPercent) / 100) * bess.totalCapacityKwh;
      const maxChargeKwByEnergy = maxStorableEnergyKwh > 0 ? maxStorableEnergyKwh / (intervalHours * chargeEfficiency) : 0;
      chargeKw = Math.max(0, Math.min(decision.chargeKw, bess.totalPowerKw, maxChargeKwByEnergy));
    } else if (decision.dischargeKw > 0) {
      const maxDrawableEnergyKwh = ((socPercent - bess.socMinPercent) / 100) * bess.totalCapacityKwh;
      const maxDeliverableEnergyKwh = Math.max(0, maxDrawableEnergyKwh) * dischargeEfficiency;
      const maxDischargeKwByEnergy = maxDeliverableEnergyKwh / intervalHours;
      // Never exceed the interval's own load — a BESS only offsets
      // consumption in this MVP, it does not export to the grid.
      dischargeKw = Math.max(0, Math.min(decision.dischargeKw, bess.totalPowerKw, maxDischargeKwByEnergy, point.powerKw));
    }

    if (chargeKw > 0) {
      const storedEnergyKwh = chargeKw * intervalHours * chargeEfficiency;
      socPercent += (storedEnergyKwh / bess.totalCapacityKwh) * 100;
    } else if (dischargeKw > 0) {
      const drawnEnergyKwh = (dischargeKw * intervalHours) / dischargeEfficiency;
      socPercent -= (drawnEnergyKwh / bess.totalCapacityKwh) * 100;
    }
    // Clamp away any floating-point drift past the SOC bounds.
    socPercent = Math.min(bess.socMaxPercent, Math.max(bess.socMinPercent, socPercent));

    const socKwh = (socPercent / 100) * bess.totalCapacityKwh;
    const gridImportKw = point.powerKw + chargeKw - dischargeKw;

    trace.push({
      timestamp: point.timestamp,
      tariffPeriod: period,
      loadKw: point.powerKw,
      chargeKw,
      dischargeKw,
      gridImportKw,
      socKwh,
    });
  }

  return trace;
}

export interface DispatchSummary {
  maxDemandPeakKw: number;
  maxDemandOffPeakKw: number;
  energyImportedPeakKwh: number;
  energyImportedOffPeakKwh: number;
  energyImportedTotalKwh: number;
}

/** Aggregates a dispatch trace into the figures Fase 4 (tariff/financial)
 * and Fase 5 (scenario comparison) need — without requiring the full trace
 * to be kept around for every candidate (plan section 4.5). */
export function summarizeDispatch(trace: DispatchPoint[], resolutionMinutes: number): DispatchSummary {
  const intervalHours = resolutionMinutes / 60;
  let maxDemandPeakKw = 0;
  let maxDemandOffPeakKw = 0;
  let energyImportedPeakKwh = 0;
  let energyImportedOffPeakKwh = 0;

  for (const point of trace) {
    const energyKwh = point.gridImportKw * intervalHours;
    if (point.tariffPeriod === 'peak') {
      maxDemandPeakKw = Math.max(maxDemandPeakKw, point.gridImportKw);
      energyImportedPeakKwh += energyKwh;
    } else {
      maxDemandOffPeakKw = Math.max(maxDemandOffPeakKw, point.gridImportKw);
      energyImportedOffPeakKwh += energyKwh;
    }
  }

  return {
    maxDemandPeakKw,
    maxDemandOffPeakKw,
    energyImportedPeakKwh,
    energyImportedOffPeakKwh,
    energyImportedTotalKwh: energyImportedPeakKwh + energyImportedOffPeakKwh,
  };
}
