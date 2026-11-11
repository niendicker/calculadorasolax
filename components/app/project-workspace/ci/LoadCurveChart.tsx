'use client';

// One canvas chart for period navigation and interval analysis. Accessible HTML
// overlays add grouped point editing and reference controls without a second chart.

import { useCiAcPower } from './ci-ac-power';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AlertTriangle, ShieldCheck, MoreHorizontal, ScanLine, Pencil, Link2, Ruler, CalendarDays, Sun, Undo2, Redo2, Sparkles, Eraser, Zap, BatteryCharging } from 'lucide-react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { InfoTooltip, TooltipList } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn, readCssVar } from '@/lib/utils';
import type { CiBackupCurveSelection, CiTimeWindow, LoadCurve, LoadCurvePoint, LoadCurveResolutionMinutes } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CurveSelectionPopup } from './CurveSelectionPopup';
import { CurveAnalysisOverlay, CurveReferenceReadout, type CurvePlotGeometry } from './CurveAnalysisOverlay';
import { curveScaleMaximum } from './curve-analysis';
import { CiBackupSelectionAction } from './CiBackupSelectionAction';
import { CurveTimeline, curveDayLabel } from './CurveTimeline';
import { CurvePointEditor } from './CurvePointEditor';
import { ciCurveDays, type CiCurveDay } from './ci-curve-days';
import type { CurvePointEdit } from './weekly-curve-editing';
import { ChartPopupMenu, type ChartPopupAction } from './ChartPopupMenu';
import { applyMovingAverageSmoothing } from './daily-curve-metrics';

const CHART_HEIGHT = 320;
const MIN_SELECTION_DRAG_PX = 4;

export interface CurveRangeSelection {
  startIndex: number;
  endIndex: number;
}

/** Up to two periods pinned for comparison — A is the fixed baseline (the
 * first thing you select), B is what you're comparing against it. A third
 * shift-drag replaces B only, so you can try several candidate periods
 * against the same baseline without reselecting it every time. */
export interface SelectionSlots {
  a: CurveRangeSelection | null;
  b: CurveRangeSelection | null;
}

const EMPTY_SELECTIONS: SelectionSlots = { a: null, b: null };
const DEFAULT_RECHARGE_WINDOW: CiTimeWindow = { start: '08:00', end: '16:00' };
const DEFAULT_DISCHARGE_WINDOW: CiTimeWindow = { start: '18:00', end: '21:00' };

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

export interface PointBadgeInfo {
  index: number;
  point: LoadCurvePoint;
  x: number;
  y: number;
  labelPrefix?: string;
}

function formatBadgeText(point: LoadCurvePoint | undefined,timezone?:string, factor = 1): string {
  if (!point) return '';
  const date = new Date(point.timestamp);
  const weekdayRaw = date.toLocaleDateString('pt-BR', { weekday: 'short',timeZone:timezone }).replace('.', '');
  const weekday = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit',timeZone:timezone,hourCycle:'h23' });
  return `${weekday} ${time} · ${(point.powerKw / factor).toFixed(1)} kVA`;
}

function PointBadge({
  badge,
  chartWidth,
  timezone,
}: {
  badge: PointBadgeInfo;
  chartWidth: number;
  timezone?:string;
}) {
  const { factor } = useCiAcPower();
  const isNearTop = badge.y < 35;
  const clampedX = Math.max(65, Math.min(chartWidth - 65, badge.x));
  const top = isNearTop ? badge.y + 12 : badge.y - 28;

  return (
    <>
      <div
        className="pointer-events-none absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-sm ring-2 ring-primary/40"
        style={{ left: `${badge.x}px`, top: `${badge.y}px` }}
      />
      <div
        data-testid="point-badge"
        className="pointer-events-none absolute z-30 flex items-center justify-center rounded-md bg-[#1D3443] dark:bg-[#18242C] px-2.5 py-1 text-[10.5px] font-semibold text-white shadow-md tabular-nums whitespace-nowrap border border-white/10"
        style={{
          left: `${clampedX}px`,
          top: `${top}px`,
          transform: 'translateX(-50%)',
        }}
      >
        {badge.labelPrefix ? `${badge.labelPrefix}: ` : ''}
        {formatBadgeText(badge.point,timezone,factor)}
      </div>
    </>
  );
}

/** Weekday-only at midnight ("seg"), weekday+time otherwise ("seg 14:00") —
 * used for both axis ticks (mostly midnights, see dayBoundaryIndices) and
 * the live legend/cursor label (any point). */
function formatPointLabel(point: LoadCurvePoint | undefined,timezone?:string): string {
  if (!point) return '';
  const date = new Date(point.timestamp);
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short',timeZone:timezone }).replace('.', '');
  if (date.toLocaleTimeString('pt-BR',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'})==='00:00') return weekday;
  return `${weekday} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit',timeZone:timezone,hourCycle:'h23' })}`;
}

/** Indices where the local day changes — gives clean "seg/ter/qua/..." tick
 * labels aligned to real day boundaries instead of arbitrary evenly-spaced
 * numeric ticks, which is what you actually want for a representative week. */
function dayBoundaryIndices(points: LoadCurvePoint[],timezone?:string): number[] {
  const indices: number[] = [];
  const time=new Intl.DateTimeFormat('pt-BR',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  points.forEach((point, index) => {
    const date = new Date(point.timestamp);
    if (time.format(date)==='00:00') indices.push(index);
  });
  return indices;
}

function evenlySpacedIndices(scaleMin: number, scaleMax: number, count = 6): number[] {
  const span = scaleMax - scaleMin;
  if (span <= 0) return [Math.round(scaleMin)];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(scaleMin + i * step));
}

/** Vertical fade from the line color to transparent — the standard "modern
 * area chart" look, without implying any smoothing of the actual values
 * (the line itself stays perfectly linear between real data points, since
 * this is power data someone will size equipment from, not decoration). */
/** uPlot calls this once during construction (autoScaleX's commit()) before
 * its first _setSize() has populated `self.bbox`, so `top`/`height` are
 * `undefined` on that pass — createLinearGradient throws on a non-finite
 * value. Falling back to 0/CHART_HEIGHT is fine: that pre-layout paint is
 * immediately redone once _setSize runs, using the real bbox. */
function areaFill(primary: string) {
  return (self: uPlot) => {
    const top = Number.isFinite(self.bbox.top) ? self.bbox.top : 0;
    const height = Number.isFinite(self.bbox.height) ? self.bbox.height : CHART_HEIGHT;
    const gradient = self.ctx.createLinearGradient(0, top, 0, top + height);
    gradient.addColorStop(0, `${primary}4d`);
    gradient.addColorStop(1, `${primary}05`);
    return gradient;
  };
}

function buildData(points: LoadCurvePoint[], generation?: { timestamp: string; powerKw: number | null }[]): uPlot.AlignedData {
  const data: uPlot.AlignedData = [points.map((_, index) => index), points.map((point) => point.powerKw)];
  if (generation) {
    const byTimestamp = new Map(generation.map(point => [Date.parse(point.timestamp), point.powerKw]));
    data.push(points.map(point => byTimestamp.get(Date.parse(point.timestamp)) ?? null));
  }
  return data;
}

function fullXRange(pointsRef: { current: LoadCurvePoint[] }): [number, number] {
  return [0, Math.max(pointsRef.current.length - 1, 0)];
}

/** Keeps a candidate [min, max] window inside the full data range: slides it
 * back in bounds rather than shrinking it, so panning past an edge stops
 * cleanly instead of also changing the zoom level. */
function clampXRange(min: number, max: number, pointsRef: { current: LoadCurvePoint[] }): [number, number] {
  const [fullMin, fullMax] = fullXRange(pointsRef);
  const range = max - min;
  if (range >= fullMax - fullMin) return [fullMin, fullMax];
  if (min < fullMin) return [fullMin, fullMin + range];
  if (max > fullMax) return [fullMax - range, fullMax];
  return [min, max];
}

/** Click-drag to pan, Ctrl+scroll-wheel to zoom, and shift+click-drag to select a
 * range (for the min/max/energy readout below the chart) — mirroring
 * uPlot's own wheel-zoom demo, there's no built-in option for pan/zoom, so
 * it's wired directly against the plot's `.u-over` element. `cursor.drag`
 * stays off in buildOptions() so uPlot's native rectangle-select-to-zoom
 * doesn't fight plain-drag-to-pan; the shift modifier is what tells the two
 * apart on the same mousedown instead. Selection still uses uPlot's own
 * `setSelect()` for the `.u-select` overlay div — that part doesn't need
 * reimplementing, only the "clicking without shift means pan" gating does. */
function attachPanAndZoom(
  chart: uPlot,
  pointsRef: { current: LoadCurvePoint[] },
  onSelectionChange: (selection: CurveRangeSelection | null) => void,
  onResetSelections: () => void,
  onHoverPoint?: (badge: PointBadgeInfo | null) => void,
  onRedraw?: () => void,
  selectionModeRef: { current: boolean } = { current: false }
): () => void {
  const over = chart.over;
  // The edit layer is a sibling of the uPlot root; listen on their shared surface.
  const wheelTarget = chart.root.parentElement?.parentElement ?? over;
  const ZOOM_FACTOR = 0.75;
  over.style.cursor = 'grab';

  function clearVisualSelect() {
    chart.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
  }

  let pendingRange: { min: number; max: number } | null = null;
  let pendingFrame: number | null = null;

  function commitPendingRange() {
    pendingFrame = null;
    if (pendingRange) {
      chart.setScale('x', pendingRange);
      pendingRange = null;
      onRedraw?.();
    }
  }

  function scheduleRange(min: number, max: number) {
    pendingRange = { min, max };
    if (pendingFrame == null) {
      pendingFrame = requestAnimationFrame(commitPendingRange);
    }
  }

  function onWheel(event: WheelEvent) {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    const rect = over.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const left = event.clientX - rect.left;
    const xVal = chart.posToVal(left, 'x');
    const { min: curMin, max: curMax } = pendingRange ?? chart.scales.x;
    if (curMin == null || curMax == null) return;

    const curRange = curMax - curMin;
    const nextRange = event.deltaY < 0 ? curRange * ZOOM_FACTOR : curRange / ZOOM_FACTOR;
    const leftPct = left / rect.width;
    const nextMin = xVal - leftPct * nextRange;
    const [min, max] = clampXRange(nextMin, nextMin + nextRange, pointsRef);
    scheduleRange(min, max);
  }

  function onMouseMove(event: MouseEvent) {
    if (event.buttons !== 0) {
      onHoverPoint?.(null);
      return;
    }
    const rect = over.getBoundingClientRect();
    const left = event.clientX - rect.left;
    if (left < 0 || left > rect.width) {
      onHoverPoint?.(null);
      return;
    }
    const xVal = chart.posToVal(left, 'x');
    const index = clampIndex(Math.round(xVal), pointsRef.current.length);
    const point = pointsRef.current[index];
    if (!point) {
      onHoverPoint?.(null);
      return;
    }

    const bboxLeft = Number.isFinite(chart.bbox?.left) ? chart.bbox.left : 0;
    const bboxTop = Number.isFinite(chart.bbox?.top) ? chart.bbox.top : 0;
    const px = chart.valToPos(index, 'x');
    const py = chart.valToPos(point.powerKw, 'y');

    onHoverPoint?.({
      index,
      point,
      x: bboxLeft + px,
      y: bboxTop + py,
    });
  }

  function onMouseLeave() {
    onHoverPoint?.(null);
  }

  let cancelGesture: (() => void) | null = null;

  function startRangeSelection(event: MouseEvent) {
    event.preventDefault();
    onHoverPoint?.(null);
    const rect = over.getBoundingClientRect();
    const clampPx = (px: number) => Math.min(Math.max(px, 0), rect.width);
    const startPx = clampPx(event.clientX - rect.left);

    function onMove(moveEvent: MouseEvent) {
      const currentPx = clampPx(moveEvent.clientX - rect.left);
      chart.setSelect({ left: Math.min(startPx, currentPx), top: 0, width: Math.abs(currentPx - startPx), height: rect.height }, false);
    }

    function onUp(upEvent: MouseEvent) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', cancel);
      cancelGesture = null;

      const endPx = clampPx(upEvent.clientX - rect.left);
      if (Math.abs(endPx - startPx) < MIN_SELECTION_DRAG_PX) {
        clearVisualSelect();
        onSelectionChange(null);
        onRedraw?.();
        return;
      }

      clearVisualSelect();

      const leftPx = Math.min(startPx, endPx);
      const rightPx = Math.max(startPx, endPx);
      onSelectionChange({
        startIndex: clampIndex(Math.round(chart.posToVal(leftPx, 'x')), pointsRef.current.length),
        endIndex: clampIndex(Math.round(chart.posToVal(rightPx, 'x')), pointsRef.current.length),
      });
      onRedraw?.();
    }

    function cancel() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', cancel);
      clearVisualSelect();
      over.style.cursor = 'grab';
      cancelGesture = null;
    }
    cancelGesture?.();
    cancelGesture = cancel;
    const isTouch = event.type === 'pointerdown';
    document.addEventListener(isTouch ? 'pointermove' : 'mousemove', onMove);
    document.addEventListener(isTouch ? 'pointerup' : 'mouseup', onUp);
    document.addEventListener('pointercancel', cancel);
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    if (event.shiftKey || selectionModeRef.current) {
      startRangeSelection(event);
      return;
    }

    const { min: rangeMin, max: rangeMax } = chart.scales.x;
    if (rangeMin == null || rangeMax == null) return;
    const startMin = rangeMin;
    const startMax = rangeMax;

    event.preventDefault();
    onHoverPoint?.(null);
    const startX = event.clientX;
    const unitsPerPx = chart.posToVal(1, 'x') - chart.posToVal(0, 'x');
    over.style.cursor = 'grabbing';

    function onMove(moveEvent: MouseEvent) {
      const dx = unitsPerPx * (moveEvent.clientX - startX);
      const [min, max] = clampXRange(startMin - dx, startMax - dx, pointsRef);
      scheduleRange(min, max);
    }
    function onUp() {
      over.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', cancel);
      cancelGesture = null;
      onRedraw?.();
    }
    function cancel() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', cancel);
      clearVisualSelect();
      over.style.cursor = 'grab';
      cancelGesture = null;
    }
    cancelGesture?.();
    cancelGesture = cancel;
    const isTouch = event.type === 'pointerdown';
    document.addEventListener(isTouch ? 'pointermove' : 'mousemove', onMove);
    document.addEventListener(isTouch ? 'pointerup' : 'mouseup', onUp);
    document.addEventListener('pointercancel', cancel);
  }

  function onDoubleClick() {
    const [min, max] = fullXRange(pointsRef);
    scheduleRange(min, max);
    clearVisualSelect();
    onResetSelections();
    onHoverPoint?.(null);
    onRedraw?.();
  }

  function onTouchDown(event: PointerEvent) {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    onMouseDown(event);
  }

  over.style.touchAction = 'none';
  over.addEventListener('pointerdown', onTouchDown);
  const onSurfaceWheel = (event: WheelEvent) => {
    if (event.target instanceof Node && !over.contains(event.target)) onWheel(event);
  };
  over.addEventListener('wheel', onWheel, { passive: false });
  if (wheelTarget !== over) wheelTarget.addEventListener('wheel', onSurfaceWheel, { passive: false });
  over.addEventListener('mousedown', onMouseDown);
  over.addEventListener('dblclick', onDoubleClick);
  over.addEventListener('mousemove', onMouseMove);
  over.addEventListener('mouseleave', onMouseLeave);

  return () => {
    cancelGesture?.();
    over.removeEventListener('pointerdown', onTouchDown);
    over.removeEventListener('wheel', onWheel);
    if (wheelTarget !== over) wheelTarget.removeEventListener('wheel', onSurfaceWheel);
    over.removeEventListener('mousedown', onMouseDown);
    over.removeEventListener('dblclick', onDoubleClick);
    over.removeEventListener('mousemove', onMouseMove);
    over.removeEventListener('mouseleave', onMouseLeave);
    if (pendingFrame != null) cancelAnimationFrame(pendingFrame);
  };
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatMinutesToHHMM(totalMinutes: number): string {
  const clamped = Math.min(1439, Math.max(0, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeWindowToDayRange(
  day: CiCurveDay | undefined,
  window: CiTimeWindow | null | undefined
): CurveRangeSelection | null {
  if (!day || !window || !window.start || !window.end) return null;
  const startMin = parseHHMM(window.start);
  const endMin = parseHHMM(window.end);
  const isWrapping = startMin > endMin;

  const indices = day.indices.filter((_, i) => {
    const m = day.minutes[i];
    if (isWrapping) {
      return m >= startMin || m < endMin;
    }
    return m >= startMin && m < endMin;
  });

  if (!indices.length) return null;
  return { startIndex: indices[0], endIndex: indices[indices.length - 1] };
}

export function dayRangeToTimeWindow(
  day: CiCurveDay | undefined,
  range: CurveRangeSelection,
  resolutionMinutes: number
): CiTimeWindow {
  if (!day) return { start: '00:00', end: '00:00' };
  const startSlot = day.indices.indexOf(range.startIndex);
  const endSlot = day.indices.indexOf(range.endIndex);
  const startMin = startSlot !== -1 ? day.minutes[startSlot] : 0;
  const endMin = endSlot !== -1 ? (day.minutes[endSlot] + resolutionMinutes) : 1440;
  return {
    start: formatMinutesToHHMM(startMin),
    end: formatMinutesToHHMM(endMin >= 1440 ? 0 : endMin),
  };
}

/** `pointsRef` is read inside the formatters below at call time, not
 * captured once — options are only built on mount (see the component), so a
 * later curve re-import must still show up-to-date labels/ticks without
 * tearing down and recreating the chart. */
function buildOptions(
  width: number,
  pointsRef: { current: LoadCurvePoint[] },
  selectionsRef: { current: SelectionSlots },
  contractedDemandKwRef: { current: number | undefined },
  onZoomChange: (zoomed: boolean) => void,
  onRedraw?: () => void,
  seriesLabel = 'Potência',
  includeGeneration = false,
  timezoneRef:{current:string|undefined}={current:undefined},
  factor = 1,
  referenceKwRef: { current: number | undefined } = { current: undefined },
  frozenYMaxRef: { current: number | null } = { current: null },
  allBandsRef?: { current: { cargas: CurveRangeSelection[]; descargas: CurveRangeSelection[] } }
): uPlot.Options {
  const primary = readCssVar('--chart-1', '#24506b');
  const secondary = readCssVar('--chart-2', '#ff9d00');
  const border = readCssVar('--border', '#d7e0ea');
  const mutedForeground = readCssVar('--muted-foreground', '#66788a');
  const card = readCssVar('--card', '#ffffff');

  return {
    width,
    height: CHART_HEIGHT,
    padding: [16, 44, 0, 4],
    cursor: {
      points: { size: 7, width: 2, stroke: primary, fill: card },
      drag: { x: false, y: false, setScale: false },
    },
    legend: { show: true, live: true },
    scales: {
      x: {
        time: false,
        range: (_self, min, max) => {
          const fullMax = Math.max(pointsRef.current.length - 1, 0);
          return [min ?? 0, max ?? fullMax];
        },
      },
      y: {
        range: (_self, dataMin, dataMax) => {
          if (frozenYMaxRef.current !== null) return [Math.min(0, dataMin), frozenYMaxRef.current];
          const contracted = contractedDemandKwRef.current;
          const targetMax = contracted && contracted > 0 ? Math.max(dataMax, contracted) : dataMax;
          const maxWithPadding = curveScaleMaximum(targetMax, referenceKwRef.current);
          return [Math.min(0, dataMin), maxWithPadding];
        },
      },
    },
    axes: [
      {
        stroke: mutedForeground,
        grid: { stroke: border, width: 1 },
        ticks: { stroke: border, width: 1 },
        gap: 8,
        font: '12px ui-sans-serif, system-ui, sans-serif',
        splits: (self, _axisIdx, scaleMin, scaleMax) => {
          const boundaries = dayBoundaryIndices(pointsRef.current,timezoneRef.current).filter((index) => index >= scaleMin && index <= scaleMax);
          const tickCount = Math.max(2, Math.floor((self.width ?? width) / 100));
          const stride = Math.max(1, Math.ceil(boundaries.length / tickCount));
          return boundaries.length >= 2 ? boundaries.filter((_, index) => index % stride === 0) : evenlySpacedIndices(scaleMin, scaleMax, Math.min(6, tickCount));
        },
        values: (_self, ticks) => ticks.map((tick) => formatPointLabel(pointsRef.current[Math.round(tick)],timezoneRef.current)),
      },
      {
        stroke: mutedForeground,
        grid: { stroke: border, width: 1 },
        ticks: { stroke: border, width: 1 },
        gap: 8,
        // Fixed instead of auto-measured: uPlot's own gutter-width
        // convergence can settle a pass early and leave the y-axis labels
        // clipped on the left (e.g. "250 kVA" rendered as "50 kVA") — a fixed
        // width sized for "999 kVA" sidesteps that outright.
        size: 64,
        font: '12px ui-sans-serif, system-ui, sans-serif',
        values: (_self, ticks) => ticks.map((value) => `${Number((value / factor).toFixed(2))} kVA`),
      },
    ],
    series: [
      {
        label: 'Horário',
        value: (_self, rawValue) => rawValue == null ? '—' : formatPointLabel(pointsRef.current[Math.round(rawValue)],timezoneRef.current),
      },
      {
        label: seriesLabel,
        stroke: primary,
        width: 2,
        fill: areaFill(primary),
        points: { show: false },
        value: (_self, rawValue) => (rawValue == null ? '—' : `${(Number(rawValue) / factor).toFixed(2)} kVA`),
      },
      ...(includeGeneration ? [{ label: 'Fotovoltaico', stroke: secondary, width: 2, points: { show: false }, value: (_self: uPlot, rawValue: number | null) => rawValue == null ? '—' : `${(Number(rawValue) / factor).toFixed(2)} kVA` }] : []),
    ],
    hooks: {
      drawClear: [
        (self) => {
          const points = pointsRef.current;
          if (!points || points.length === 0) return;
          const top = Number.isFinite(self.bbox.top) ? self.bbox.top : 0;
          const height = Number.isFinite(self.bbox.height) ? self.bbox.height : CHART_HEIGHT;

          self.ctx.save();
          self.ctx.fillStyle = 'rgba(100, 116, 139, 0.08)';

          let rangeStart: number | null = null;
          const weekdayFormatter=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:timezoneRef.current});
          for (let i = 0; i < points.length; i++) {
            const d = new Date(points[i].timestamp);
            const weekday=weekdayFormatter.format(d);
            const isWeekend = weekday==='Sun'||weekday==='Sat';
            if (isWeekend) {
              if (rangeStart === null) rangeStart = i;
            } else if (rangeStart !== null) {
              const left = self.valToPos(rangeStart, 'x', true);
              const right = self.valToPos(i, 'x', true);
              if (Number.isFinite(left) && Number.isFinite(right)) {
                self.ctx.fillRect(Math.min(left, right), top, Math.abs(right - left), height);
              }
              rangeStart = null;
            }
          }
          if (rangeStart !== null) {
            const left = self.valToPos(rangeStart, 'x', true);
            const right = self.valToPos(points.length - 1, 'x', true);
            if (Number.isFinite(left) && Number.isFinite(right)) {
              self.ctx.fillRect(Math.min(left, right), top, Math.abs(right - left), height);
            }
          }
          self.ctx.restore();
        },
      ],
      setScale: [
        (self, key) => {
          if (key !== 'x') return;
          const [fullMin, fullMax] = fullXRange(pointsRef);
          const { min, max } = self.scales.x;
          onZoomChange((min ?? fullMin) > fullMin + 0.5 || (max ?? fullMax) < fullMax - 0.5);
          onRedraw?.();
        },
      ],
      // Pinned A/B comparison periods are painted directly on the canvas
      // instead of via uPlot's own `.u-select` DOM overlay — that overlay is
      // a single div, so it can only ever show one rectangle, and it's
      // already spoken for as the live in-progress drag preview (see
      // startRangeSelection). Hooking into `draw` (fires after everything
      // else, so the bands sit on top of the line) means the highlight
      // automatically stays aligned through pan/zoom/resize for free — no
      // separate position-tracking effect needed, since every one of those
      // already triggers a real uPlot redraw on its own.
      draw: [
        (self) => {
          onRedraw?.();
          const top = Number.isFinite(self.bbox.top) ? self.bbox.top : 0;
          const height = Number.isFinite(self.bbox.height) ? self.bbox.height : CHART_HEIGHT;

          function drawBand(range: CurveRangeSelection | null, color: string) {
            if (!range) return;
            const left = self.valToPos(range.startIndex, 'x', true);
            const right = self.valToPos(range.endIndex, 'x', true);
            if (!Number.isFinite(left) || !Number.isFinite(right)) return;
            self.ctx.save();
            self.ctx.fillStyle = color;
            self.ctx.fillRect(Math.min(left, right), top, Math.abs(right - left), height);
            self.ctx.restore();
          }

          if (allBandsRef?.current) {
            for (const r of allBandsRef.current.cargas) {
              drawBand(r, 'rgba(16, 185, 129, 0.16)');
            }
            for (const r of allBandsRef.current.descargas) {
              drawBand(r, 'rgba(245, 158, 11, 0.16)');
            }
          }

          drawBand(selectionsRef.current.a, `${primary}26`);
          drawBand(selectionsRef.current.b, `${secondary}26`);

          const contracted = contractedDemandKwRef.current;
          if (contracted != null && contracted > 0) {
            const yPos = self.valToPos(contracted, 'y', true);
            if (Number.isFinite(yPos) && yPos >= top && yPos <= top + height) {
              const bLeft = Number.isFinite(self.bbox.left) ? self.bbox.left : 0;
              const bWidth = Number.isFinite(self.bbox.width) ? self.bbox.width : self.width;
              self.ctx.save();
              self.ctx.strokeStyle = '#dc2626';
              self.ctx.lineWidth = 1.5;
              if (typeof self.ctx.setLineDash === 'function') {
                self.ctx.setLineDash([6, 4]);
              }
              if (typeof self.ctx.beginPath === 'function') {
                self.ctx.beginPath();
                self.ctx.moveTo(bLeft, yPos);
                self.ctx.lineTo(bLeft + bWidth, yPos);
                self.ctx.stroke();
              }
              if (typeof self.ctx.setLineDash === 'function') {
                self.ctx.setLineDash([]);
              }
              self.ctx.fillStyle = '#dc2626';
              self.ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
              self.ctx.textAlign = 'right';
              if (typeof self.ctx.fillText === 'function') {
                self.ctx.fillText(`Contratada: ${Number((contracted / factor).toFixed(2))} kVA`, bLeft + bWidth - 6, yPos - 4);
              }
              self.ctx.restore();
            }
          }
        },
      ],
    },
  };
}

function clearChartSelect(chart: uPlot | null) {
  chart?.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
}

export function LoadCurveChart({
  points,
  resolutionMinutes,
  contractedDemandKw,
  kind = 'load',
  generationPoints,
  backupCurve,
  backupSelection,
  onApplyBackupSelection,
  selectionSlots,
  onSelectionSlotsChange,
  timezone,
  referenceKw,
  onReferenceChange,
  curveDays,
  onEditPoints,
  editHistory,
  rechargeWindow,
  onRechargeWindowChange,
  dischargeWindow,
  onDischargeWindowChange,
}: {
  points: LoadCurvePoint[];
  resolutionMinutes: LoadCurveResolutionMinutes;
  contractedDemandKw?: number;
  kind?: 'load' | 'generation';
  generationPoints?: { timestamp: string; powerKw: number | null }[];
  backupCurve?: LoadCurve;
  backupSelection?: CiBackupCurveSelection;
  onApplyBackupSelection?: (selection:CiBackupCurveSelection)=>void;
  selectionSlots?:SelectionSlots;
  onSelectionSlotsChange?:Dispatch<SetStateAction<SelectionSlots>>;
  timezone?:string;
  referenceKw?: number;
  onReferenceChange?: (kw: number | undefined) => void;
  curveDays?: CiCurveDay[];
  onEditPoints?: (edits: CurvePointEdit[], groupedDates: string[], series: 'load' | 'generation') => void;
  editHistory?: {canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void};
  rechargeWindow?: CiTimeWindow | null;
  onRechargeWindowChange?: (window: CiTimeWindow | null) => void;
  dischargeWindow?: CiTimeWindow | null;
  onDischargeWindowChange?: (window: CiTimeWindow | null) => void;
}) {
  const { factor, toKva } = useCiAcPower();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const pointsRef = useRef(points);
  const generationRef = useRef(generationPoints);
  const includeGeneration = generationPoints !== undefined;
  const hasPoints = points.length > 0;
  const contractedDemandKwRef = useRef(contractedDemandKw);
  const referenceKwRef = useRef(referenceKw);
  const frozenYMaxRef = useRef<number | null>(null);
  const [geometry, setGeometry] = useState<CurvePlotGeometry>({ left: 0, top: 0, width: 0, height: 0, xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  const timezoneRef=useRef(timezone);
  // Set right after (re)creating the chart below, consumed by the very next
  // run of the points-sync effect — see that effect for why this is needed.
  const skipNextPointsEffectRef = useRef(false);
  const [, setIsZoomed] = useState(false);
  const [gestureTool, setGestureTool] = useState<'select' | 'draw' | null>(null);
  const [modifiers, setModifiers] = useState({ select: false, draw: false });
  const [menu, setMenu] = useState<{x: number; y: number; level: 'main' | 'days' | 'curve'} | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<{timer: ReturnType<typeof setTimeout>; x: number; y: number} | null>(null);
  const closeMenu = () => setMenu(null);
  const cancelLongPress = () => { if (longPressRef.current) clearTimeout(longPressRef.current.timer); longPressRef.current = null; };
  const openMenu = (x: number, y: number, level: 'main' | 'days' | 'curve' = 'main') => {
    cancelLongPress();
    chartRef.current?.over.dispatchEvent(new Event('pointercancel', {bubbles:true}));
    setMenu({x,y,level});
  };
  const openFromButton = (event: React.MouseEvent<HTMLButtonElement>, level: 'main' | 'days' = 'main') => {
    const rect = event.currentTarget.getBoundingClientRect();
    openMenu(rect.left + rect.width / 2, rect.bottom + 6, level);
  };
  useEffect(() => {
    const update = (event: KeyboardEvent) => {
      setModifiers({select:event.shiftKey&&!event.ctrlKey,draw:event.ctrlKey&&event.shiftKey});
      if (event.key==='Escape') setGestureTool(null);
    };
    const reset = () => setModifiers({select:false,draw:false});
    window.addEventListener('keydown', update); window.addEventListener('keyup', update); window.addEventListener('blur', reset);
    return () => { window.removeEventListener('keydown', update); window.removeEventListener('keyup', update); window.removeEventListener('blur', reset); if(longPressRef.current) clearTimeout(longPressRef.current.timer); };
  }, []);
  const [editSeries, setEditSeries] = useState<'load' | 'generation'>('load');
  const [groupedDates, setGroupedDates] = useState<string[]>([]);
  const [visibleRange, setVisibleRange] = useState<CurveRangeSelection>({ startIndex: 0, endIndex: Math.max(1, points.length - 1) });
  const changeVisibleRange = (range: CurveRangeSelection) => {
    setVisibleRange(range);
    chartRef.current?.setScale('x', { min: range.startIndex, max: range.endIndex });
    setRedrawSeq(sequence => sequence + 1);
  };
  const selectionModeRef = useRef(false);
  useEffect(() => { selectionModeRef.current = gestureTool === 'select'; }, [gestureTool]);
  const [ownSelections,setOwnSelections]=useState<SelectionSlots>(EMPTY_SELECTIONS);
  const selections=selectionSlots??ownSelections;
  const setSelections=onSelectionSlotsChange??setOwnSelections;
  const [redrawSeq, setRedrawSeq] = useState(0);
  const [hoverBadge, setHoverBadge] = useState<PointBadgeInfo | null>(null);
  const [chartWidth, setChartWidth] = useState(600);

  const effectiveDays = useMemo(() => {
    if (curveDays && curveDays.length > 0) return curveDays;
    if (!points.length) return [];
    try {
      return ciCurveDays({ points, resolutionMinutes, timezone: timezone ?? 'America/Sao_Paulo' } as LoadCurve);
    } catch {
      return [];
    }
  }, [curveDays, points, resolutionMinutes, timezone]);

  const fullView = visibleRange.startIndex <= 0 && visibleRange.endIndex >= points.length - 1;

  const visibleDay = useMemo(() => {
    return effectiveDays.find(
      (day) => !fullView && day.indices.at(-1)! >= visibleRange.startIndex && day.indices[0] <= visibleRange.endIndex
    ) ?? effectiveDays[0];
  }, [effectiveDays, fullView, visibleRange]);

  const activeRechargeWindow = rechargeWindow !== undefined ? rechargeWindow : DEFAULT_RECHARGE_WINDOW;
  const activeDischargeWindow = dischargeWindow !== undefined ? dischargeWindow : DEFAULT_DISCHARGE_WINDOW;

  const cargaRange = useMemo(() => {
    return timeWindowToDayRange(visibleDay, activeRechargeWindow);
  }, [visibleDay, activeRechargeWindow]);

  const descargaRange = useMemo(() => {
    return timeWindowToDayRange(visibleDay, activeDischargeWindow);
  }, [visibleDay, activeDischargeWindow]);

  const allBands = useMemo(() => {
    const cargas: CurveRangeSelection[] = [];
    const descargas: CurveRangeSelection[] = [];
    if (activeRechargeWindow) {
      for (const day of effectiveDays) {
        const r = timeWindowToDayRange(day, activeRechargeWindow);
        if (r) cargas.push(r);
      }
    }
    if (activeDischargeWindow) {
      for (const day of effectiveDays) {
        const r = timeWindowToDayRange(day, activeDischargeWindow);
        if (r) descargas.push(r);
      }
    }
    return { cargas, descargas };
  }, [effectiveDays, activeRechargeWindow, activeDischargeWindow]);

  const allBandsRef = useRef(allBands);

  // Mirrors `selections` for the canvas draw hook (see buildOptions), which
  // — like the other formatters there — is built once on mount and needs to
  // read current state at draw time, not whatever it closed over back then.
  const selectionsRef = useRef<SelectionSlots>(EMPTY_SELECTIONS);
  // Tracked as state, not a ref: refs can't be read/written during render,
  // but this "previous props" comparison is React's own recommended pattern
  // for resetting state when a prop changes, done here instead of in an
  // effect so the effect below stays a pure external-system sync with no
  // state calls of its own. Compared by length, not reference: dragging a
  // point in the manual editor produces a new `points` array on every
  // update (same shape, one value changed) — clearing the selection on
  // every one of those would make it useless for exactly the "watch this
  // range while I tweak it" case it's for. A real reshape (new CSV import,
  // a different preset, a resolution/period change) almost always changes
  // the point count, which is what should actually drop a stale selection.
  const [previousPointsLength, setPreviousPointsLength] = useState(points.length);

  if (previousPointsLength !== points.length) {
    setPreviousPointsLength(points.length);
    if (!selectionSlots&&(selections.a || selections.b)) setOwnSelections(EMPTY_SELECTIONS);
  }

  // The first completed drag pins A as the baseline; once A exists, every
  // later drag replaces B — so you can try several candidate periods against
  // the same fixed baseline instead of reselecting it each time. A plain
  // shift-click (no real drag — see MIN_SELECTION_DRAG_PX) reports `null`
  // here and drops whichever slot was filled most recently, undo-style.
  function handleSelectionChange(range: CurveRangeSelection | null) {
    setGestureTool(null);
    setSelections((previous) => {
      if (range === null) {
        if (previous.b) {
          onDischargeWindowChange?.(null);
          return { ...previous, b: null };
        }
        if (previous.a) {
          onRechargeWindowChange?.(null);
          return EMPTY_SELECTIONS;
        }
        return previous;
      }
      if (visibleDay) {
        const window = dayRangeToTimeWindow(visibleDay, range, resolutionMinutes);
        if (previous.a === null) {
          onRechargeWindowChange?.(window);
        } else {
          onDischargeWindowChange?.(window);
        }
      }
      return previous.a === null ? { ...previous, a: range } : { ...previous, b: range };
    });
  }

  function handleResetSelections() {
    setSelections(EMPTY_SELECTIONS);
  }

  // Created once per mount; the axis/legend formatters above close over
  // `pointsRef` (always current) instead of being rebuilt on every data
  // update, so importing a new curve doesn't tear down and recreate the
  // whole chart — see the data-sync effect below, which keeps the ref and
  // the plotted data in step whenever `points` changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasPoints) return;

    pointsRef.current = points;
    generationRef.current = generationPoints;
    const options = buildOptions(
      el.clientWidth || 600,
      pointsRef,
      selectionsRef,
      contractedDemandKwRef,
      setIsZoomed,
      () => setRedrawSeq((s) => s + 1),
      kind === 'generation' ? 'Fotovoltaico' : includeGeneration ? 'Consumo' : 'Potência',
      includeGeneration,
      timezoneRef,
      factor,
      referenceKwRef,
      frozenYMaxRef,
      allBandsRef
    );
    const chart = new uPlot(options, buildData(pointsRef.current, generationRef.current), el);
    chartRef.current = chart;
    skipNextPointsEffectRef.current = true;
    const detachPanAndZoom = attachPanAndZoom(
      chart,
      pointsRef,
      handleSelectionChange,
      handleResetSelections,
      setHoverBadge,
      () => setRedrawSeq((s) => s + 1),
      selectionModeRef
    );

    return () => {
      detachPanAndZoom();
      chart.destroy();
      chartRef.current = null;
    };
    // Values synchronize in the data effect; edits must preserve the chart and zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeGeneration, kind, hasPoints,factor]);

  useEffect(()=>{
    if(timezoneRef.current===timezone)return;
    timezoneRef.current=timezone;
    if(chartRef.current?.scales.x?.min!=null)chartRef.current.redraw(false,true);
  },[timezone]);

  useEffect(() => {
    if (referenceKwRef.current === referenceKw) return;
    referenceKwRef.current = referenceKw;
    const chart = chartRef.current;
    if (chart?.scales.x?.min != null) chart.redraw(true, true);
  }, [referenceKw]);

  const isInitialContractMountRef = useRef(true);
  useEffect(() => {
    contractedDemandKwRef.current = contractedDemandKw;
    if (isInitialContractMountRef.current) {
      isInitialContractMountRef.current = false;
      return;
    }
    const chart = chartRef.current;
    if (!chart || chart.scales.x?.min == null) return;
    chart.redraw(false, true);
  }, [contractedDemandKw]);

  const isInitialSelectionMountRef = useRef(true);
  useEffect(() => {
    selectionsRef.current = selections;
    if (isInitialSelectionMountRef.current) {
      isInitialSelectionMountRef.current = false;
      return;
    }
    const chart = chartRef.current;
    if (!chart || chart.scales.x?.min == null) return;
    // Nothing about the data or scale changed — this just needs the `draw`
    // hook (which reads selectionsRef) to run again so the bands reflect the
    // new state; redraw(false, ...) calls commit() directly instead of
    // re-ranging the x-scale like redraw(true, ...) would.
    chart.redraw(false, false);
  }, [selections]);

  const isInitialAllBandsMountRef = useRef(true);
  useEffect(() => {
    allBandsRef.current = allBands;
    if (isInitialAllBandsMountRef.current) {
      isInitialAllBandsMountRef.current = false;
      return;
    }
    const chart = chartRef.current;
    if (!chart || chart.scales.x?.min == null) return;
    chart.redraw(false, false);
  }, [allBands]);

  useEffect(() => {
    // The mount effect above just (re)created the chart from this exact
    // `points` value, one line earlier in the same commit — but uPlot defers
    // its actual scale/data commit to a microtask (see commit()/_commit() in
    // uplot's source), so immediately calling setData/redraw again here would
    // read the still-unset (null) x-scale and overwrite the chart's own
    // pending {0, length-1} with it, permanently corrupting the scale to
    // null/null — the chart then draws its axes but no line at all, since
    // uPlot can't place points on a null-ranged scale. Skipping this exact
    // first run (the mount effect's own initial paint is already correct)
    // avoids the double-write race entirely.
    if (skipNextPointsEffectRef.current) {
      skipNextPointsEffectRef.current = false;
      pointsRef.current = points;
      generationRef.current = generationPoints;
      return;
    }

    const lengthChanged = pointsRef.current.length !== points.length;
    pointsRef.current = points;
    const chart = chartRef.current;
    if (!chart) return;

    // `setData(_, false)` skips uPlot's own default of resetting the x-scale
    // to the full range on every call — that default is what was snapping
    // the view back to the whole week on every single drag update in the
    // manual curve editor, since each drag produces a same-length curve with
    // one value changed. A same-length update instead just redraws in place
    // (still fully picks up new y-axis bounds and repaints the line/legend —
    // see resetYSeries() in uPlot's own setData, called unconditionally
    // regardless of that flag) so pan/zoom survives point-by-point editing.
    // A different point count (new CSV, new preset, a changed resolution or
    // period) really is a different curve, so that case still jumps back to
    // the full view and drops any selection tied to the old range.
    generationRef.current = generationPoints;
    chart.setData(buildData(points, generationPoints), false);
    if (lengthChanged || chart.scales.x?.min == null) {
      const [min, max] = fullXRange(pointsRef);
      chart.setScale('x', { min, max });
      clearChartSelect(chart);
    } else {
      chart.redraw(true, true);
    }
  }, [points, generationPoints]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const chart = chartRef.current;
      if (chart && el.clientWidth > 0) {
        chart.setSize({ width: el.clientWidth, height: CHART_HEIGHT });
        // Pinned comparison bands survive chart resizing naturally because
        // the canvas draw hook recomputes valToPos dynamically from the stored indices.
        // Clearing selections here would unexpectedly discard them whenever rendering
        // summary tables or layout changes trigger container resize.
        clearChartSelect(chart);
        setRedrawSeq((s) => s + 1);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const activeSelection = selections.b ?? selections.a;
  const isSelectionActive = Boolean(activeSelection && points.length > 0);

  const peakKw = useMemo(() => {
    const target = activeSelection ? points.slice(activeSelection.startIndex, activeSelection.endIndex + 1) : points;
    return target.reduce((peak, point) => Math.max(peak, point.powerKw), 0);
  }, [points, activeSelection]);

  const canEditGeneration = Boolean(generationPoints?.every(point => point.powerKw !== null));
  const canEditVisible = visibleRange.endIndex - visibleRange.startIndex <= 1440 / resolutionMinutes && (editSeries === 'load' || canEditGeneration);
  const editVisible = (operation: 'smooth' | 'clear') => {
    if (!onEditPoints || !canEditVisible) return;
    const start = Math.max(0, Math.ceil(visibleRange.startIndex));
    const end = Math.min(points.length - 1, Math.floor(visibleRange.endIndex));
    const values = points.slice(start, end + 1).map((point, offset) => editSeries === 'generation' ? generationPoints![start + offset].powerKw! : point.powerKw);
    const updated = operation === 'clear' ? values.map(() => 0) : applyMovingAverageSmoothing(values, Number.POSITIVE_INFINITY);
    onEditPoints(updated.map((powerKw, offset) => ({ index: start + offset, powerKw })), groupedDates, editSeries);
  };

  // The hover badge follows the resized plot; selection details use the popup.
  useEffect(() => {
    setChartWidth(containerRef.current?.clientWidth || 600);
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;
    const startIndex = chart.scales.x.min ?? 0;
    const endIndex = chart.scales.x.max ?? Math.max(1, points.length - 1);
    setVisibleRange(previous => previous.startIndex === startIndex && previous.endIndex === endIndex ? previous : { startIndex, endIndex });
    if (chart.scales.y?.max == null) return;
    const rect = chart.over.getBoundingClientRect();
    const parent = container.getBoundingClientRect();
    setGeometry({ left: rect.left - parent.left, top: rect.top - parent.top, width: rect.width, height: rect.height, xMin: chart.scales.x.min ?? 0, xMax: chart.scales.x.max ?? points.length - 1, yMin: chart.scales.y.min ?? 0, yMax: chart.scales.y.max });
  }, [redrawSeq, points.length]);

  const isCargaOrDescarga = kind === 'load';
  const labels = useMemo(() => ({
    a: isCargaOrDescarga ? 'Carga' : 'Período A',
    b: isCargaOrDescarga ? 'Descarga' : 'Período B',
  }), [isCargaOrDescarga]);

  const overlayRanges = useMemo(() => {
    const list: { range: CurveRangeSelection; label: string }[] = [];
    if (selections.a || cargaRange) {
      list.push({ range: selections.a ?? cargaRange!, label: labels.a });
    }
    if (selections.b || descargaRange) {
      list.push({ range: selections.b ?? descargaRange!, label: labels.b });
    }
    return list;
  }, [selections.a, selections.b, cargaRange, descargaRange, labels]);
  const backupRanges=[{range:selections.a ?? cargaRange,label:labels.a},{range:selections.b ?? descargaRange,label:labels.b}].flatMap(({range,label})=>range?[{label,startIndex:range.startIndex,endIndex:range.endIndex}]:[]);

  if (points.length === 0) return null;

  const hasContract = Boolean(contractedDemandKw && contractedDemandKw > 0);
  const hasExceedance = Boolean(hasContract && peakKw > (contractedDemandKw ?? 0));
  const exceedanceKw = hasExceedance ? peakKw - (contractedDemandKw ?? 0) : 0;
  const exceedancePercent = hasExceedance && contractedDemandKw ? (exceedanceKw / contractedDemandKw) * 100 : 0;
  const marginKw = hasContract && !hasExceedance && contractedDemandKw ? contractedDemandKw - peakKw : 0;

  const handleRangeChange = (index: number, range: CurveRangeSelection) => {
    const activeLabel = overlayRanges[index]?.label;
    if (!activeLabel) return;
    const isCarga = activeLabel === 'Carga' || activeLabel.includes('A');
    const slot = isCarga ? 'a' : 'b';

    if (visibleDay) {
      const window = dayRangeToTimeWindow(visibleDay, range, resolutionMinutes);
      if (isCarga) {
        onRechargeWindowChange?.(window);
      } else {
        onDischargeWindowChange?.(window);
      }
    }

    setSelections(prev => ({ ...prev, [slot]: range }));
  };

  const finish = (action: () => void) => () => { action(); closeMenu(); };
  const startDrawing = () => {
    if (!canEditVisible && curveDays?.length) {
      const rect = chartRef.current?.over.getBoundingClientRect();
      const index = rect && menu ? Math.round(chartRef.current!.posToVal(Math.max(0,Math.min(rect.width,menu.x-rect.left)),'x')) : Math.round(visibleRange.startIndex);
      const day = curveDays.find(day=>day.indices.includes(index)) ?? curveDays[0];
      changeVisibleRange({startIndex:day.indices[0],endIndex:Math.max(day.indices[0]+1,day.indices.at(-1)!)});
    }
    setGestureTool('draw');
  };
  const icon = (Icon: typeof Pencil) => <Icon className="size-4" aria-hidden="true"/>;
  const popupActions: ChartPopupAction[] = menu?.level==='days' ? (curveDays??[]).map(day=>({
    id:day.date,label:curveDayLabel(day.date),icon:<CalendarDays className="size-4" aria-hidden="true"/>,selected:groupedDates.includes(day.date),
    onSelect:()=>setGroupedDates(previous=>previous.includes(day.date)?previous.filter(date=>date!==day.date):[...previous,day.date]),
  })) : menu?.level==='curve' ? [
    {id:'draw',label:'Desenhar curva',icon:icon(Pencil),disabled:!onEditPoints||(editSeries==='generation'&&!canEditGeneration),onSelect:()=>{startDrawing();closeMenu();}},
    {id:'load',label:'Consumo',icon:icon(Zap),selected:editSeries==='load',onSelect:finish(()=>setEditSeries('load'))},
    ...(includeGeneration?[{id:'solar',label:'Fotovoltaico',icon:icon(Sun),selected:editSeries==='generation',disabled:!canEditGeneration,onSelect:finish(()=>setEditSeries('generation'))}]:[]),
    {id:'undo',label:'Desfazer',icon:icon(Undo2),disabled:!editHistory?.canUndo,onSelect:finish(()=>editHistory?.undo())},
    {id:'redo',label:'Refazer',icon:icon(Redo2),disabled:!editHistory?.canRedo,onSelect:finish(()=>editHistory?.redo())},
    {id:'smooth',label:'Harmonizar picos',icon:icon(Sparkles),disabled:!canEditVisible,onSelect:finish(()=>editVisible('smooth'))},
    {id:'clear',label:'Zerar trecho visível',icon:icon(Eraser),disabled:!canEditVisible,onSelect:finish(()=>editVisible('clear'))},
  ] : [
    {id:'select',label:'Selecionar intervalo',icon:icon(ScanLine),onSelect:finish(()=>setGestureTool('select'))},
    ...(onEditPoints?[
      {id:'curve',label:'Editar curva',submenu:true,icon:icon(Pencil),onSelect:()=>setMenu(menu&&{...menu,level:'curve'})},
      {id:'days',label:'Vincular dias',submenu:true,icon:icon(Link2),disabled:!curveDays?.length,onSelect:()=>setMenu(menu&&{...menu,level:'days'})},
    ]:[]),
    ...(onReferenceChange?[{id:'reference',label:referenceKw===undefined?'Mostrar referência':'Ocultar referência',icon:icon(Ruler),selected:referenceKw!==undefined,onSelect:finish(()=>onReferenceChange(referenceKw===undefined?(contractedDemandKw??Math.max(1,...points.map(point=>point.powerKw))*.8):undefined))}]:[]),
    {id:'reset',label:'Ver semana inteira',icon:icon(CalendarDays),onSelect:()=>{changeVisibleRange({startIndex:0,endIndex:Math.max(1,points.length-1)});closeMenu();}},
  ];

  return (
    <div className="space-y-3">
      {(groupedDates.length>1 || editSeries==='generation' || gestureTool || (referenceKw!==undefined && onReferenceChange)) && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {groupedDates.length>1 && <Button type="button" size="xs" variant="secondary" onClick={event=>openFromButton(event,'days')}>Editando juntos: {curveDays?.filter(day=>groupedDates.includes(day.date)).map(day=>curveDayLabel(day.date).split(',')[0]).join(', ')}</Button>}
        {editSeries==='generation' && <span>Curva ativa: Fotovoltaico</span>}
        {gestureTool && <Button type="button" size="xs" variant="secondary" onClick={()=>setGestureTool(null)}>{gestureTool==='select'?'Arraste para selecionar':'Arraste para desenhar'} · Cancelar</Button>}
        {referenceKw!==undefined && onReferenceChange && <label className="flex items-center gap-1">Referência <input type="number" aria-label="Valor da referência em kVA" className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs text-foreground" min={0} step={1} value={Number(toKva(referenceKw).toFixed(2))} onChange={event=>{const value=event.target.valueAsNumber;if(Number.isFinite(value)&&value>=0)onReferenceChange(value*factor);}}/> kVA</label>}
      </div>}
      <header aria-label="Análise e ações da curva" className="space-y-2">
      {kind === 'load' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-1.5 text-xs backdrop-blur-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                <BatteryCharging className="h-3.5 w-3.5" aria-hidden="true" />
                Carga permitida:
              </span>
              <input
                type="time"
                aria-label="Hora de início da carga permitida"
                value={activeRechargeWindow?.start ?? '08:00'}
                onChange={(e) => onRechargeWindowChange?.({ start: e.target.value, end: activeRechargeWindow?.end ?? '16:00' })}
                className="h-6.5 rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="text-muted-foreground">às</span>
              <input
                type="time"
                aria-label="Hora de fim da carga permitida"
                value={activeRechargeWindow?.end ?? '16:00'}
                onChange={(e) => onRechargeWindowChange?.({ start: activeRechargeWindow?.start ?? '08:00', end: e.target.value })}
                className="h-6.5 rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="h-3.5 w-px bg-border/60 hidden sm:block" />

            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                Descarga (Ponta):
              </span>
              <input
                type="time"
                aria-label="Hora de início da descarga"
                value={activeDischargeWindow?.start ?? '18:00'}
                onChange={(e) => onDischargeWindowChange?.({ start: e.target.value, end: activeDischargeWindow?.end ?? '21:00' })}
                className="h-6.5 rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="text-muted-foreground">às</span>
              <input
                type="time"
                aria-label="Hora de fim da descarga"
                value={activeDischargeWindow?.end ?? '21:00'}
                onChange={(e) => onDischargeWindowChange?.({ start: activeDischargeWindow?.start ?? '18:00', end: e.target.value })}
                className="h-6.5 rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <span className="text-[11px] text-muted-foreground hidden lg:inline">
            Arraste as alças verticais no gráfico para ajustar as faixas diárias
          </span>
        </div>
      )}
      <CurveReferenceReadout values={(activeSelection ? points.slice(activeSelection.startIndex, activeSelection.endIndex + 1) : points).map(point => point.powerKw)} referenceKw={referenceKw} resolutionMinutes={resolutionMinutes} selected={isSelectionActive} />
      {kind==='load'&&backupCurve&&onApplyBackupSelection&&backupRanges.length>0&&<CiBackupSelectionAction curve={backupCurve} ranges={backupRanges} applied={backupSelection} onApply={onApplyBackupSelection}/>}

      {/* Base do painel: Status da demanda contratada */}
      {kind === 'generation' ? null : hasContract ? (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs',
            hasExceedance
              ? 'border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            {hasExceedance ? (
              <>
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive dark:text-red-400" aria-hidden="true" />
                <span>
                  <strong>Demanda contratada excedida</strong> (Ultrapassagem detectada): pico de {toKva(peakKw).toFixed(2)} kVA excede o contrato ({toKva(contractedDemandKw ?? 0)} kVA) em{' '}
                  <strong className="font-semibold text-foreground">
                    +{toKva(exceedanceKw).toFixed(2)} kVA (+{exceedancePercent.toFixed(1)}%)
                  </strong>
                  .
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>
                  <strong>Dentro da demanda contratada</strong>: pico de {toKva(peakKw).toFixed(2)} kVA dentro do contrato ({toKva(contractedDemandKw ?? 0)} kVA), com margem livre de{' '}
                  <strong className="font-semibold text-foreground">{toKva(marginKw).toFixed(2)} kVA</strong>.
                </span>
              </>
            )}
          </div>
          <span className="text-[11px] font-normal text-muted-foreground">Linha tracejada vermelha no gráfico</span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2 text-xs text-muted-foreground">
          <span>Demanda contratada: não definida (configure na etapa Tarifa para acompanhar limites).</span>
        </div>
      )}
      </header>

      {/* Gráfico semanal (320px, como o editor diário) com uPlot e fundo de fins de semana */}
      <div ref={surfaceRef} className="relative" data-testid="period-chart-surface"
        onContextMenu={event=>{if(event.target instanceof Element && event.target.closest('section[aria-label="Resumo do intervalo selecionado"], input, [data-popup-trigger]'))return;event.preventDefault();openMenu(event.clientX,event.clientY);}}
        onPointerDownCapture={event=>{
          if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
          if(event.target instanceof Element && event.target.closest('section[aria-label="Resumo do intervalo selecionado"], input, [data-popup-trigger]'))return;
          cancelLongPress();
          const {clientX:x,clientY:y}=event;
          longPressRef.current={x,y,timer:setTimeout(()=>openMenu(x,y),550)};
        }}
        onPointerMoveCapture={event=>{const press=longPressRef.current;if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8)cancelLongPress();}}
        onPointerUpCapture={cancelLongPress} onPointerCancelCapture={cancelLongPress}
      >
        <div ref={containerRef} className="w-full [&_.u-legend]:text-xs [&_.u-legend]:text-muted-foreground" />
        {!isSelectionActive && hoverBadge && <PointBadge timezone={timezone} badge={hoverBadge} chartWidth={chartWidth} />}
        {!menu && onEditPoints && canEditVisible && <CurvePointEditor draw={gestureTool==='draw'||modifiers.draw} selecting={gestureTool==='select'||modifiers.select} onComplete={()=>setGestureTool(null)} geometry={geometry} points={editSeries==='generation' && generationPoints ? generationPoints.map(point=>({...point,powerKw:point.powerKw??0})) : points} timezone={timezone} label={editSeries==='generation'?'Fotovoltaico':'Consumo'} onEdit={edits=>onEditPoints(edits,groupedDates,editSeries)} />}
        <CurveAnalysisOverlay geometry={geometry} ranges={overlayRanges} length={points.length} onRangeChange={handleRangeChange} referenceKw={referenceKw} onReferenceChange={onReferenceChange} onReferenceDragChange={dragging => {
          frozenYMaxRef.current = dragging ? geometry.yMax : null;
          if (!dragging) chartRef.current?.redraw(true, true);
        }} formatIndex={index => formatBadgeText(points[index], timezone, factor)} />
        <div data-popup-trigger className="absolute right-2 top-2 z-40 flex items-center gap-0.5 rounded-full border border-border bg-card/90 p-0.5 shadow-sm backdrop-blur-md">
          <InfoTooltip label="Atalhos do gráfico"><TooltipList items={[
            <><strong>Navegar:</strong> arraste o fundo do gráfico.</>,
            <><strong>Zoom:</strong> Ctrl + rolagem.</>,
            <><strong>Editar:</strong> amplie para até um dia e arraste os pontos.</>,
            <><strong>Desenhar:</strong> Ctrl + Shift + arraste.</>,
            <><strong>Selecionar:</strong> Shift + arraste.</>,
            <><strong>Opções:</strong> clique direito, toque prolongado ou botão ⋯.</>,
            <><strong>No celular:</strong> ative Desenhar ou Selecionar no menu.</>,
          ]}/></InfoTooltip>
          <Button ref={menuTriggerRef} data-popup-trigger type="button" size="icon-sm" variant="ghost" className="rounded-full" aria-label="Opções do gráfico" aria-haspopup="dialog" aria-expanded={Boolean(menu)} onClick={event=>openFromButton(event)}><MoreHorizontal aria-hidden="true"/></Button>
        </div>
        <CurveSelectionPopup points={points} generationPoints={generationPoints} resolutionMinutes={resolutionMinutes} timezone={timezone} selections={selectionSlots ?? { a: selections.a ?? cargaRange, b: selections.b ?? descargaRange }} onSelectionsChange={setSelections} kind={kind} labels={labels} />
      </div>
      {menu && <ChartPopupMenu x={menu.x} y={menu.y} level={menu.level} title={menu.level==='days'?'Vincular dias':menu.level==='curve'?'Editar curva':'Opções do gráfico'} actions={popupActions} onBack={menu.level==='main'?undefined:()=>setMenu({...menu,level:'main'})} onClose={closeMenu} returnFocus={menuTriggerRef}/>}
      {curveDays && points.length>1 && <CurveTimeline days={curveDays} length={points.length} range={visibleRange} onChange={changeVisibleRange} />}
      {curveDays && <div role="group" aria-label="Dias visíveis" className="flex flex-wrap items-center gap-1">
        <Button type="button" variant={fullView?'secondary':'ghost'} size="sm" className="h-8 text-xs" aria-pressed={fullView} onClick={()=>changeVisibleRange({startIndex:0,endIndex:Math.max(1,points.length-1)})}>Todos os dias</Button>
        {curveDays.map(day => {
          const visible = !fullView && day.indices.at(-1)! >= visibleRange.startIndex && day.indices[0] <= visibleRange.endIndex;
          return <Button key={day.date} type="button" variant={visible?'secondary':'ghost'} size="sm" className="h-8 text-xs" aria-pressed={visible} onClick={()=>changeVisibleRange({startIndex:day.indices[0],endIndex:Math.max(day.indices[0]+1,day.indices.at(-1)!)})}>{curveDayLabel(day.date)}</Button>;
        })}
      </div>}
    </div>
  );
}
