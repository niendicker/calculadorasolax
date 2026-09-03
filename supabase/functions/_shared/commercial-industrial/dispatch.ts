// Energy dispatch engine — Fase 3 of docs/CI-MODULE-PLAN.md section 5.2/5.3,
// substantially revised by the Fase 7 audit (business rules below). Simulates
// BESS operation interval-by-interval against a normalized LoadCurve. Pure
// and deterministic: no React/Zustand/Supabase, no tariff pricing (that's
// Fase 4's tariff.ts — this only classifies each interval as peak/off-peak,
// it never touches R$).
//
// One dispatch loop for every strategy (BASE/PEAK_SHAVING/LOAD_SHIFTING/
// HYBRID) — the plan explicitly forbids the hybrid strategy from calling two
// independent engines, and the same discipline is applied to the other
// three for a single, testable code path.
//
// ARCHITECTURE (Fase 7 audit, section 11): strategy and physical restriction
// are deliberately separate concerns, never duplicated per strategy:
//   - decideStrategy() decides WHEN/WHY to charge or discharge (intent only,
//     unbounded);
//   - calculateAllowedChargePower() decides HOW MUCH the BESS may charge,
//     given the contracted-demand ceiling — shared by every strategy;
//   - runDispatch()'s own SOC/power/no-export clamps decide HOW MUCH the
//     BESS may discharge — also shared, never re-implemented per strategy.

import type { BessRuntimeParams, BessStrategyId, DispatchPoint, LoadCurve, TariffPeriod } from './types.ts';

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
  /** PEAK_SHAVING/HYBRID's demand-shaving *discharge* target — distinct
   * from `contractedDemandKw` below (Fase 7 audit, section 5): the
   * contracted demand bounds CHARGING (section 4) for every strategy,
   * while this bounds discharge intent for the two strategies that shave
   * demand. The two concepts are kept as separate parameters even though,
   * absent a dedicated UI field yet, callers currently default this to the
   * same `contractedDemandKw` value — see index.ts. */
  peakShavingTargetKw: number | null;
  /** The tariff's contracted demand (kW) — also acts as a hard ceiling on
   * how much the BESS may charge in any interval, for *every* strategy
   * (Fase 7 audit, section 4): `siteLoadKw + bessChargePowerKw` must never
   * exceed this. Required for every simulation, even strategies that
   * rarely charge, so the limiter is never accidentally skipped. */
  contractedDemandKw: number;
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

// ─── Shared charge restriction (Fase 7 audit, section 4) ────────────────

export interface AllowedChargePowerInput {
  siteLoadKw: number;
  /** What the strategy would like to charge at, before any restriction
   * (typically the BESS's own rated power — "charge as much as possible"). */
  requestedChargeKw: number;
  contractedDemandKw: number;
  bessMaxChargePowerKw: number;
  /** How much the BESS could still charge this interval before its own SOC
   * ceiling — computed by the caller from live simulation state. */
  socLimitedChargePowerKw: number;
}

/** Central, strategy-agnostic charge-power limiter (Fase 7 audit, section
 * 4.3: "criar uma função ou mecanismo central compartilhado no dispatch" —
 * every strategy that charges goes through this alone, so the
 * contracted-demand ceiling is never re-implemented three times).
 *
 * `availableChargePowerKw = max(0, contractedDemandKw - siteLoadKw)` is the
 * headroom left under the contract at this exact instant; the effective
 * charge power is the smallest of the BESS's own rating, that headroom, the
 * SOC-based ceiling, and whatever the strategy actually asked for. When
 * `siteLoadKw >= contractedDemandKw` the headroom is zero, so the BESS
 * never charges while already at or above the contracted demand — it must
 * not make an existing overrun worse. */
export function calculateAllowedChargePower(input: AllowedChargePowerInput): number {
  const availableChargePowerKw = Math.max(0, input.contractedDemandKw - input.siteLoadKw);
  return Math.max(
    0,
    Math.min(input.requestedChargeKw, input.bessMaxChargePowerKw, availableChargePowerKw, input.socLimitedChargePowerKw)
  );
}

interface StrategyDecision {
  /** Desired grid-side charge power, before any clamping. */
  chargeKw: number;
  /** Desired load-side discharge power, before any clamping. */
  dischargeKw: number;
  /** Hybrid-only: an additional stored-energy ceiling (kWh, on top of the
   * ordinary SOC-based one) protecting the dynamic ponta reserve (section
   * 3) — `undefined` means "no extra ceiling". */
  extraDrawableEnergyCapKwh?: number;
}

/** Strategy rules decide *intent* only — every physical limit (power,
 * energy/SOC, no grid export, contracted-demand charge ceiling) is enforced
 * uniformly afterward in runDispatch, not re-implemented per strategy. */
function decideStrategy(
  strategy: BessStrategyId,
  loadKw: number,
  period: TariffPeriod,
  peakShavingTargetKw: number | null,
  bess: BessRuntimeParams,
  availableForPeakShavingKwh: number
): StrategyDecision {
  switch (strategy) {
    case 'BASE':
      return { chargeKw: 0, dischargeKw: 0 };

    case 'PEAK_SHAVING': {
      // "Reduz potência acima do target de demanda e só carrega fora
      // ponta" (Fase 7 audit, section 2.1). Discharge is target-driven and
      // period-independent — it may fire on-peak or off-peak alike.
      const target = peakShavingTargetKw ?? loadKw;
      if (loadKw > target) return { chargeKw: 0, dischargeKw: loadKw - target };
      // Charging is off-peak only. The requested amount is deliberately
      // "as much as possible" (bess.totalPowerKw) — the shared
      // calculateAllowedChargePower call in runDispatch is what actually
      // bounds it by the contracted-demand headroom (section 4), not this
      // strategy. Previously this branch capped itself at
      // `target - loadKw`, conflating the Peak Shaving target with the
      // contracted-demand charge ceiling — the two are now separate
      // concepts (section 5).
      if (period === 'offPeak') return { chargeKw: bess.totalPowerKw, dischargeKw: 0 };
      return { chargeKw: 0, dischargeKw: 0 };
    }

    case 'LOAD_SHIFTING':
      // "Carrega fora ponta e descarrega na ponta acompanhando
      // dinamicamente o consumo até o limite de potência" (Fase 7 audit,
      // section 2.2). Discharge intent now explicitly follows the
      // instantaneous load (capped by the BESS's own rated power) instead
      // of requesting a constant `bess.totalPowerKw` — runDispatch's
      // pre-existing no-export clamp already produced the same *numeric*
      // result, but the intent itself is now dynamic per the audit's
      // explicit requirement, not an implementation detail hidden behind a
      // later clamp.
      return period === 'offPeak'
        ? { chargeKw: bess.totalPowerKw, dischargeKw: 0 }
        : { chargeKw: 0, dischargeKw: Math.min(loadKw, bess.totalPowerKw) };

    case 'HYBRID': {
      // Fase 7 audit, section 3: Hybrid combines Load Shifting and Peak
      // Shaving through a dynamic energy reserve, not by running both
      // algorithms independently.
      if (period === 'peak') {
        // During the ponta itself, Load Shifting's "follow consumption up
        // to rated power" and Peak Shaving's "reduce demand" objectives
        // coincide exactly: the maximum useful discharge is always
        // min(loadKw, bess.totalPowerKw) regardless of which objective is
        // named — discharging any more isn't possible (rated-power limit),
        // and discharging any less would under-serve both objectives
        // identically. There is therefore no separate "priority" decision
        // to make here; SOC/energy availability (enforced uniformly in
        // runDispatch) is the only real constraint left.
        return { chargeKw: 0, dischargeKw: Math.min(loadKw, bess.totalPowerKw) };
      }
      // Off-peak: charging is the default (subject to the shared
      // contracted-demand clamp), UNLESS load is already above the
      // Peak Shaving target — in which case demand-shaving discharge takes
      // priority, but *only* using energy above the dynamic ponta reserve
      // (section 3.2). "Se não houver energia excedente, Peak Shaving deve
      // parar" — charging here would only worsen this instant's own demand
      // overrun, so when there's no excess we do neither.
      const target = peakShavingTargetKw ?? loadKw;
      if (loadKw > target) {
        if (availableForPeakShavingKwh > 1e-9) {
          return { chargeKw: 0, dischargeKw: loadKw - target, extraDrawableEnergyCapKwh: availableForPeakShavingKwh };
        }
        return { chargeKw: 0, dischargeKw: 0 };
      }
      return { chargeKw: bess.totalPowerKw, dischargeKw: 0 };
    }
  }
}

// ─── Hybrid's dynamic ponta reserve (Fase 7 audit, section 3.1) ─────────

/** One maximal run of consecutive `peak`-classified points in the curve —
 * a single ponta window occurrence (a curve spanning a representative week
 * typically has one instance per day). */
interface PeakWindowSpan {
  /** Index of the first point in the window (inclusive). */
  start: number;
  /** Index one past the last point in the window (exclusive). */
  end: number;
}

/** For every point in the curve, the stored energy (kWh) that Hybrid must
 * keep untouched off-peak so the *next* (or, if already inside one, the
 * current) ponta window can still run its own Load Shifting discharge in
 * full. Pure function of the curve and BESS spec alone — deliberately
 * ignorant of `contractedDemandKw`/`peakShavingTargetKw`, since the reserve
 * exists to protect ponta *energy arbitrage*, not demand shaving (section
 * 3.1/3.3's item #30: a contracted demand far above the actual load must
 * never inflate this reserve).
 *
 * The required energy for a window is computed once, up front, from the
 * curve's own load values within it (Σ min(loadKw, bessMaxPowerKw) *
 * intervalHours, converted from delivered to stored terms via discharge
 * efficiency, capped at the BESS's useful capacity) — "calcula
 * antecipadamente" per the spec, not adaptively re-estimated from what
 * actually happens during simulation. The reserve is then held constant at
 * that full amount for every off-peak point before the window starts, and
 * decreases point-by-point through the window itself as that idealized
 * discharge is "spent" — see the worked example in the audit's section
 * 3.1 (310 -> 190 -> 80 -> 0 kWh). */
export function computeHybridReserve(curve: LoadCurve, tariffWindow: TariffWindow, bess: BessRuntimeParams): number[] {
  const intervalHours = curve.resolutionMinutes / 60;
  const dischargeEfficiency = Math.sqrt(bess.efficiencyPercent / 100);
  const usefulCapacityKwh = (bess.totalCapacityKwh * (bess.socMaxPercent - bess.socMinPercent)) / 100;

  const periods = curve.points.map((point) => classifyTariffPeriod(point.timestamp, curve.timezone, tariffWindow));

  const windows: PeakWindowSpan[] = [];
  let cursor = 0;
  while (cursor < periods.length) {
    if (periods[cursor] === 'peak') {
      const start = cursor;
      while (cursor < periods.length && periods[cursor] === 'peak') cursor++;
      windows.push({ start, end: cursor });
    } else {
      cursor++;
    }
  }

  const windowRequiredKwh = windows.map(({ start, end }) => {
    let idealDischargeEnergyKwh = 0;
    for (let idx = start; idx < end; idx++) {
      idealDischargeEnergyKwh += Math.min(curve.points[idx].powerKw, bess.totalPowerKw) * intervalHours;
    }
    const storedEnergyNeededKwh = idealDischargeEnergyKwh / dischargeEfficiency;
    return Math.min(storedEnergyNeededKwh, usefulCapacityKwh);
  });

  const reserve: number[] = new Array(curve.points.length).fill(0);
  let windowIndex = 0;
  let spentInWindowKwh = 0;

  for (let idx = 0; idx < curve.points.length; idx++) {
    while (windowIndex < windows.length && idx >= windows[windowIndex].end) {
      windowIndex++;
      spentInWindowKwh = 0;
    }
    if (windowIndex >= windows.length) {
      reserve[idx] = 0; // no more ponta windows ahead in this curve
      continue;
    }
    const window = windows[windowIndex];
    if (idx < window.start) {
      // Off-peak, preparing for this upcoming window: full reserve,
      // constant regardless of how far away the window still is.
      reserve[idx] = windowRequiredKwh[windowIndex];
    } else {
      reserve[idx] = Math.max(0, windowRequiredKwh[windowIndex] - spentInWindowKwh);
      const idealDischargeKwh = Math.min(curve.points[idx].powerKw, bess.totalPowerKw) * intervalHours;
      spentInWindowKwh += idealDischargeKwh / dischargeEfficiency;
    }
  }

  return reserve;
}

/** Runs the full interval-by-interval simulation. Every physical constraint
 * (plan section 5.2, steps 3-7, plus the Fase 7 audit's contracted-demand
 * charge ceiling) is enforced here, uniformly across strategies:
 *   - power clamped to bess.totalPowerKw;
 *   - energy clamped so SOC never leaves [socMinPercent, socMaxPercent];
 *   - charging additionally clamped so siteLoad + charge never exceeds
 *     contractedDemandKw (section 4);
 *   - charge and discharge are mutually exclusive per interval;
 *   - discharge never exceeds the interval's own load — "sem exportação
 *     para a rede" (no selling back to the grid). */
export function runDispatch(input: DispatchInput): DispatchPoint[] {
  const { curve, bess, strategy, tariffWindow, peakShavingTargetKw, contractedDemandKw } = input;
  const intervalHours = curve.resolutionMinutes / 60;
  const chargeEfficiency = Math.sqrt(bess.efficiencyPercent / 100);
  const dischargeEfficiency = chargeEfficiency;

  // Only Hybrid needs the lookahead reserve — cheap to compute (curve is
  // capped at 672 points) but skipped entirely for the other strategies.
  const reserve = strategy === 'HYBRID' ? computeHybridReserve(curve, tariffWindow, bess) : null;

  let socPercent = bess.initialSocPercent ?? bess.socMaxPercent;
  const trace: DispatchPoint[] = [];

  curve.points.forEach((point, index) => {
    const period = classifyTariffPeriod(point.timestamp, curve.timezone, tariffWindow);
    const storedEnergyKwh = (socPercent / 100) * bess.totalCapacityKwh;
    const availableForPeakShavingKwh = reserve ? Math.max(0, storedEnergyKwh - reserve[index]) : 0;
    const decision = decideStrategy(strategy, point.powerKw, period, peakShavingTargetKw, bess, availableForPeakShavingKwh);

    let chargeKw = 0;
    let dischargeKw = 0;

    if (decision.chargeKw > 0) {
      const maxStorableEnergyKwh = ((bess.socMaxPercent - socPercent) / 100) * bess.totalCapacityKwh;
      const socLimitedChargePowerKw = maxStorableEnergyKwh > 0 ? maxStorableEnergyKwh / (intervalHours * chargeEfficiency) : 0;
      chargeKw = calculateAllowedChargePower({
        siteLoadKw: point.powerKw,
        requestedChargeKw: decision.chargeKw,
        contractedDemandKw,
        bessMaxChargePowerKw: bess.totalPowerKw,
        socLimitedChargePowerKw,
      });
    } else if (decision.dischargeKw > 0) {
      const maxDrawableEnergyKwh = ((socPercent - bess.socMinPercent) / 100) * bess.totalCapacityKwh;
      const effectiveDrawableEnergyKwh =
        decision.extraDrawableEnergyCapKwh !== undefined
          ? Math.min(Math.max(0, maxDrawableEnergyKwh), Math.max(0, decision.extraDrawableEnergyCapKwh))
          : Math.max(0, maxDrawableEnergyKwh);
      const maxDeliverableEnergyKwh = effectiveDrawableEnergyKwh * dischargeEfficiency;
      const maxDischargeKwByEnergy = maxDeliverableEnergyKwh / intervalHours;
      // Never exceed the interval's own load — a BESS only offsets
      // consumption in this MVP, it does not export to the grid.
      dischargeKw = Math.max(0, Math.min(decision.dischargeKw, bess.totalPowerKw, maxDischargeKwByEnergy, point.powerKw));
    }

    if (chargeKw > 0) {
      const storedDeltaKwh = chargeKw * intervalHours * chargeEfficiency;
      socPercent += (storedDeltaKwh / bess.totalCapacityKwh) * 100;
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
  });

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

/** Post-hoc physical sanity checks on a dispatch trace — catches "results
 * that shouldn't be physically possible" (Fase 6 audit's explicit ask)
 * rather than trusting runDispatch's own clamping unconditionally. Returns a
 * list of human-readable violations (empty = trace is physically
 * consistent). A small numeric tolerance absorbs floating-point drift, not
 * real violations. Exported so tests can assert `checkDispatchInvariants(...)
 * .toEqual([])` against both handwritten and randomized fixtures.
 *
 * `contractedDemandKw` is optional so existing callers that only care about
 * the BESS's own physical limits (not the Fase 7 charge-ceiling rule) don't
 * have to thread it through — the charge-ceiling check is skipped when
 * omitted. */
export function checkDispatchInvariants(
  trace: DispatchPoint[],
  bess: BessRuntimeParams,
  resolutionMinutes: number,
  contractedDemandKw?: number
): string[] {
  const violations: string[] = [];
  const epsilon = 1e-6;
  const intervalHours = resolutionMinutes / 60;
  const socMinKwh = (bess.socMinPercent / 100) * bess.totalCapacityKwh;
  const socMaxKwh = (bess.socMaxPercent / 100) * bess.totalCapacityKwh;
  const chargeEfficiency = Math.sqrt(bess.efficiencyPercent / 100);
  const dischargeEfficiency = chargeEfficiency;

  let previousSocKwh: number | null = null;

  trace.forEach((point, index) => {
    if (point.socKwh < socMinKwh - epsilon || point.socKwh > socMaxKwh + epsilon) {
      violations.push(`interval ${index}: socKwh=${point.socKwh} outside [${socMinKwh}, ${socMaxKwh}]`);
    }
    if (point.chargeKw < -epsilon || point.chargeKw > bess.totalPowerKw + epsilon) {
      violations.push(`interval ${index}: chargeKw=${point.chargeKw} outside [0, ${bess.totalPowerKw}]`);
    }
    if (point.dischargeKw < -epsilon || point.dischargeKw > bess.totalPowerKw + epsilon) {
      violations.push(`interval ${index}: dischargeKw=${point.dischargeKw} outside [0, ${bess.totalPowerKw}]`);
    }
    if (point.chargeKw > epsilon && point.dischargeKw > epsilon) {
      violations.push(`interval ${index}: chargeKw and dischargeKw both nonzero (mutual exclusion violated)`);
    }
    // No grid export: a BESS only offsets load in this MVP (plan section
    // 5.2), so import can't go negative and discharge can't exceed load.
    if (point.gridImportKw < -epsilon) {
      violations.push(`interval ${index}: gridImportKw=${point.gridImportKw} is negative (implies export to grid)`);
    }
    if (point.dischargeKw > point.loadKw + epsilon) {
      violations.push(`interval ${index}: dischargeKw=${point.dischargeKw} exceeds loadKw=${point.loadKw}`);
    }
    // Fase 7 audit, section 7: charging must never push grid import past
    // the contracted demand — checked only for the charging portion, since
    // the load itself may already exceed the contract for reasons outside
    // the BESS's control.
    if (contractedDemandKw !== undefined && point.chargeKw > epsilon && point.gridImportKw > contractedDemandKw + epsilon) {
      violations.push(
        `interval ${index}: charging pushed gridImportKw=${point.gridImportKw} above contractedDemandKw=${contractedDemandKw}`
      );
    }

    // Energy conservation: the SOC delta must match what charge/discharge +
    // efficiency implies, not just land inside bounds by coincidence.
    if (previousSocKwh !== null) {
      const actualDeltaKwh = point.socKwh - previousSocKwh;
      let expectedDeltaKwh = 0;
      if (point.chargeKw > epsilon) {
        expectedDeltaKwh = point.chargeKw * intervalHours * chargeEfficiency;
      } else if (point.dischargeKw > epsilon) {
        expectedDeltaKwh = -(point.dischargeKw * intervalHours) / dischargeEfficiency;
      }
      // Skip the check for intervals where the previous point was already
      // clamped at a SOC bound — the clamp itself legitimately absorbs the
      // mismatch there (see runDispatch's own end-of-loop clamp).
      const previousWasAtBound = previousSocKwh <= socMinKwh + epsilon || previousSocKwh >= socMaxKwh - epsilon;
      if (!previousWasAtBound && Math.abs(actualDeltaKwh - expectedDeltaKwh) > 1e-3) {
        violations.push(
          `interval ${index}: socKwh delta=${actualDeltaKwh} does not match charge/discharge-implied delta=${expectedDeltaKwh}`
        );
      }
    }
    previousSocKwh = point.socKwh;
  });

  return violations;
}
