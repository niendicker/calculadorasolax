'use client';

// Visual companion to the "Resumo da curva atual" metrics below it — until
// now the panel only showed aggregate numbers (peak/min/average/energy),
// with no way to actually see the curve's shape. Uses uPlot (canvas-based,
// ~50kb min, no React wrapper dependency) instead of a hand-rolled SVG: the
// live, following crosshair + legend and the built-in resize handling are
// what "dinâmico" actually needs, and this is still the only chart
// dependency in the whole app — see docs/CI-MODULE-PLAN.md section 8.3's
// own "SVG first, add a library only if it doesn't hold up" framing; a
// representative week already has up to 672 points; a hand-rolled tooltip
// with the same responsiveness would cost more than this one dependency.
//
// Loaded via next/dynamic with ssr:false (see CiLoadCurvePanel.tsx) so
// uPlot's canvas/DOM code never runs during SSR and its ~50kb only ships
// once a curve is actually imported.

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Button } from '@/components/ui/button';
import { readCssVar } from '@/lib/utils';
import type { LoadCurvePoint, LoadCurveResolutionMinutes } from '@/supabase/functions/_shared/commercial-industrial/types';

const CHART_HEIGHT = 240;
const MIN_SELECTION_DRAG_PX = 4;

export interface CurveRangeSelection {
  startIndex: number;
  endIndex: number;
}

/** Up to two periods pinned for comparison — A is the fixed baseline (the
 * first thing you select), B is what you're comparing against it. A third
 * shift-drag replaces B only, so you can try several candidate periods
 * against the same baseline without reselecting it every time. */
interface SelectionSlots {
  a: CurveRangeSelection | null;
  b: CurveRangeSelection | null;
}

const EMPTY_SELECTIONS: SelectionSlots = { a: null, b: null };

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

/** Weekday-only at midnight ("seg"), weekday+time otherwise ("seg 14:00") —
 * used for both axis ticks (mostly midnights, see dayBoundaryIndices) and
 * the live legend/cursor label (any point). */
function formatPointLabel(point: LoadCurvePoint | undefined): string {
  if (!point) return '';
  const date = new Date(point.timestamp);
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  if (date.getHours() === 0 && date.getMinutes() === 0) return weekday;
  return `${weekday} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Indices where the local day changes — gives clean "seg/ter/qua/..." tick
 * labels aligned to real day boundaries instead of arbitrary evenly-spaced
 * numeric ticks, which is what you actually want for a representative week. */
function dayBoundaryIndices(points: LoadCurvePoint[]): number[] {
  const indices: number[] = [];
  points.forEach((point, index) => {
    const date = new Date(point.timestamp);
    if (date.getHours() === 0 && date.getMinutes() === 0) indices.push(index);
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

function buildData(points: LoadCurvePoint[]): uPlot.AlignedData {
  return [points.map((_, index) => index), points.map((point) => point.powerKw)];
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

/** Click-drag to pan, scroll-wheel to zoom, and shift+click-drag to select a
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
  onResetSelections: () => void
): () => void {
  const over = chart.over;
  const ZOOM_FACTOR = 0.75;
  over.style.cursor = 'grab';

  function clearVisualSelect() {
    chart.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
  }

  // A trackpad or a fast mouse wheel can fire dozens of wheel events per
  // second; each one applying its own setScale() re-triggers uPlot's full
  // axis/redraw pass (including scanning every point for day boundaries),
  // which is more synchronous work than the input rate can keep up with and
  // was observed to lock up the tab for seconds under rapid scrolling.
  // Coalescing to one committed range per animation frame keeps the visual
  // result the same while capping how often that redraw actually runs.
  let pendingRange: { min: number; max: number } | null = null;
  let pendingFrame: number | null = null;

  function commitPendingRange() {
    pendingFrame = null;
    if (pendingRange) {
      chart.setScale('x', pendingRange);
      pendingRange = null;
    }
  }

  function scheduleRange(min: number, max: number) {
    pendingRange = { min, max };
    if (pendingFrame == null) {
      pendingFrame = requestAnimationFrame(commitPendingRange);
    }
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const rect = over.getBoundingClientRect();
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

  function startRangeSelection(event: MouseEvent) {
    event.preventDefault();
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

      const endPx = clampPx(upEvent.clientX - rect.left);
      if (Math.abs(endPx - startPx) < MIN_SELECTION_DRAG_PX) {
        clearVisualSelect();
        onSelectionChange(null);
        return;
      }

      // Ownership of "how to display this range" transfers to the persistent
      // A/B canvas bands (see buildOptions' draw hook) the moment the drag
      // completes — this native `.u-select` box was only ever the transient
      // live-preview while dragging, so it's cleared here rather than left
      // sitting on top of (and visually doubling up with) band A or B.
      clearVisualSelect();

      const leftPx = Math.min(startPx, endPx);
      const rightPx = Math.max(startPx, endPx);
      onSelectionChange({
        startIndex: clampIndex(Math.round(chart.posToVal(leftPx, 'x')), pointsRef.current.length),
        endIndex: clampIndex(Math.round(chart.posToVal(rightPx, 'x')), pointsRef.current.length),
      });
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    if (event.shiftKey) {
      startRangeSelection(event);
      return;
    }

    const { min: rangeMin, max: rangeMax } = chart.scales.x;
    if (rangeMin == null || rangeMax == null) return;
    // Re-bound as definitely-assigned: TS narrowing from the guard above
    // doesn't carry into the onMove closure defined below.
    const startMin = rangeMin;
    const startMax = rangeMax;

    event.preventDefault();
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
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onDoubleClick() {
    const [min, max] = fullXRange(pointsRef);
    scheduleRange(min, max);
    clearVisualSelect();
    onResetSelections();
  }

  over.addEventListener('wheel', onWheel, { passive: false });
  over.addEventListener('mousedown', onMouseDown);
  over.addEventListener('dblclick', onDoubleClick);

  return () => {
    over.removeEventListener('wheel', onWheel);
    over.removeEventListener('mousedown', onMouseDown);
    over.removeEventListener('dblclick', onDoubleClick);
    if (pendingFrame != null) cancelAnimationFrame(pendingFrame);
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
  onZoomChange: (zoomed: boolean) => void
): uPlot.Options {
  const primary = readCssVar('--chart-1', '#24506b');
  const secondary = readCssVar('--chart-2', '#ff9d00');
  const border = readCssVar('--border', '#d7e0ea');
  const mutedForeground = readCssVar('--muted-foreground', '#66788a');
  const card = readCssVar('--card', '#ffffff');

  return {
    width,
    height: CHART_HEIGHT,
    padding: [16, 12, 0, 4],
    cursor: {
      points: { size: 7, width: 2, stroke: primary, fill: card },
      drag: { x: false, y: false, setScale: false },
    },
    legend: { show: true, live: true },
    scales: { x: { time: false } },
    axes: [
      {
        stroke: mutedForeground,
        grid: { stroke: border, width: 1 },
        ticks: { stroke: border, width: 1 },
        gap: 8,
        font: '12px ui-sans-serif, system-ui, sans-serif',
        splits: (_self, _axisIdx, scaleMin, scaleMax) => {
          const boundaries = dayBoundaryIndices(pointsRef.current).filter((index) => index >= scaleMin && index <= scaleMax);
          return boundaries.length >= 2 ? boundaries : evenlySpacedIndices(scaleMin, scaleMax);
        },
        values: (_self, ticks) => ticks.map((tick) => formatPointLabel(pointsRef.current[Math.round(tick)])),
      },
      {
        stroke: mutedForeground,
        grid: { stroke: border, width: 1 },
        ticks: { stroke: border, width: 1 },
        gap: 8,
        // Fixed instead of auto-measured: uPlot's own gutter-width
        // convergence can settle a pass early and leave the y-axis labels
        // clipped on the left (e.g. "250 kW" rendered as "50 kW") — a fixed
        // width sized for "999 kW" sidesteps that outright.
        size: 64,
        font: '12px ui-sans-serif, system-ui, sans-serif',
        values: (_self, ticks) => ticks.map((value) => `${value} kW`),
      },
    ],
    series: [
      {
        value: (_self, rawValue) => formatPointLabel(pointsRef.current[Math.round(rawValue ?? 0)]),
      },
      {
        label: 'Potência',
        stroke: primary,
        width: 2,
        fill: areaFill(primary),
        points: { show: false },
        value: (_self, rawValue) => (rawValue == null ? '—' : `${Number(rawValue).toFixed(2)} kW`),
      },
    ],
    hooks: {
      setScale: [
        (self, key) => {
          if (key !== 'x') return;
          const [fullMin, fullMax] = fullXRange(pointsRef);
          const { min, max } = self.scales.x;
          onZoomChange((min ?? fullMin) > fullMin + 0.5 || (max ?? fullMax) < fullMax - 0.5);
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

          drawBand(selectionsRef.current.a, `${primary}26`);
          drawBand(selectionsRef.current.b, `${secondary}26`);
        },
      ],
    },
  };
}

function clearChartSelect(chart: uPlot | null) {
  chart?.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
}

interface SelectionSummary {
  peakKw: number;
  minKw: number;
  averageKw: number;
  totalEnergyKwh: number;
  pointCount: number;
}

const METRIC_ROWS: { key: 'peakKw' | 'minKw' | 'averageKw' | 'totalEnergyKwh'; label: string; unit: string }[] = [
  { key: 'peakKw', label: 'Pico', unit: 'kW' },
  { key: 'minKw', label: 'Mínima', unit: 'kW' },
  { key: 'averageKw', label: 'Média', unit: 'kW' },
  { key: 'totalEnergyKwh', label: 'Energia', unit: 'kWh' },
];

/** Same shape/formula as summarizeLoadCurve (load-curve.ts), applied to a
 * dragged sub-range instead of the whole curve — kept local rather than
 * imported since it only needs `resolutionMinutes`, not a full LoadCurve. */
function summarizeSelection(points: LoadCurvePoint[], resolutionMinutes: LoadCurveResolutionMinutes): SelectionSummary {
  const intervalHours = resolutionMinutes / 60;
  let peakKw = points[0].powerKw;
  let minKw = points[0].powerKw;
  let sumKw = 0;
  for (const point of points) {
    if (point.powerKw > peakKw) peakKw = point.powerKw;
    if (point.powerKw < minKw) minKw = point.powerKw;
    sumKw += point.powerKw;
  }
  return { peakKw, minKw, averageKw: sumKw / points.length, totalEnergyKwh: sumKw * intervalHours, pointCount: points.length };
}

/** "B relative to A": positive means B is higher. `aValue` is the
 * denominator for the percentage since A is the fixed baseline the user
 * picked first — a null percentage (aValue === 0) still shows the absolute
 * delta rather than hiding the row. */
function formatDelta(aValue: number, bValue: number, unit: string): string {
  const delta = bValue - aValue;
  const sign = delta >= 0 ? '+' : '';
  const percent = aValue !== 0 ? ` (${sign}${((delta / aValue) * 100).toFixed(1)}%)` : '';
  return `${sign}${delta.toFixed(2)} ${unit}${percent}`;
}

function PeriodHeader({
  label,
  color,
  range,
  points,
  onClear,
}: {
  label: string;
  color: string;
  range: CurveRangeSelection;
  points: LoadCurvePoint[];
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        {label}: {formatPointLabel(points[range.startIndex])} – {formatPointLabel(points[range.endIndex])} (
        {range.endIndex - range.startIndex + 1} pontos)
      </p>
      <Button type="button" variant="ghost" size="xs" onClick={onClear}>
        <X className="h-3 w-3" aria-hidden="true" />
        Limpar
      </Button>
    </div>
  );
}

export function LoadCurveChart({ points, resolutionMinutes }: { points: LoadCurvePoint[]; resolutionMinutes: LoadCurveResolutionMinutes }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const pointsRef = useRef(points);
  // Set right after (re)creating the chart below, consumed by the very next
  // run of the points-sync effect — see that effect for why this is needed.
  const skipNextPointsEffectRef = useRef(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [selections, setSelections] = useState<SelectionSlots>(EMPTY_SELECTIONS);
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
    if (selections.a || selections.b) setSelections(EMPTY_SELECTIONS);
  }

  // The first completed drag pins A as the baseline; once A exists, every
  // later drag replaces B — so you can try several candidate periods against
  // the same fixed baseline instead of reselecting it each time. A plain
  // shift-click (no real drag — see MIN_SELECTION_DRAG_PX) reports `null`
  // here and drops whichever slot was filled most recently, undo-style.
  function handleSelectionChange(range: CurveRangeSelection | null) {
    setSelections((previous) => {
      if (range === null) {
        if (previous.b) return { ...previous, b: null };
        if (previous.a) return EMPTY_SELECTIONS;
        return previous;
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
    if (!el || pointsRef.current.length === 0) return;

    const options = buildOptions(el.clientWidth || 600, pointsRef, selectionsRef, setIsZoomed);
    const chart = new uPlot(options, buildData(pointsRef.current), el);
    chartRef.current = chart;
    skipNextPointsEffectRef.current = true;
    const detachPanAndZoom = attachPanAndZoom(chart, pointsRef, handleSelectionChange, handleResetSelections);

    return () => {
      detachPanAndZoom();
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    selectionsRef.current = selections;
    // Nothing about the data or scale changed — this just needs the `draw`
    // hook (which reads selectionsRef) to run again so the bands reflect the
    // new state; redraw(false, ...) calls commit() directly instead of
    // re-ranging the x-scale like redraw(true, ...) would.
    chartRef.current?.redraw(false, false);
  }, [selections]);

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
    chart.setData(buildData(points), false);
    if (lengthChanged) {
      const [min, max] = fullXRange(pointsRef);
      chart.setScale('x', { min, max });
      clearChartSelect(chart);
    } else {
      chart.redraw(true, true);
    }
  }, [points]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (chartRef.current && el.clientWidth > 0) {
        chartRef.current.setSize({ width: el.clientWidth, height: CHART_HEIGHT });
        // The comparison bands are repainted by the canvas draw hook on every
        // redraw (setSize triggers one), so they'd actually survive a resize
        // on their own — reset anyway for consistency with the live-drag
        // overlay below, which genuinely is stuck at the old pixel width.
        setSelections(EMPTY_SELECTIONS);
        clearChartSelect(chartRef.current);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return null;

  function summaryFor(range: CurveRangeSelection | null): SelectionSummary | null {
    if (!range) return null;
    const slice = points.slice(range.startIndex, range.endIndex + 1);
    return slice.length > 0 ? summarizeSelection(slice, resolutionMinutes) : null;
  }

  const summaryA = summaryFor(selections.a);
  const summaryB = summaryFor(selections.b);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <div ref={containerRef} className="w-full [&_.u-legend]:text-xs [&_.u-legend]:text-muted-foreground" />
        {isZoomed && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="absolute right-0 top-0 bg-card"
            onClick={() => chartRef.current?.setScale('x', { min: 0, max: Math.max(points.length - 1, 0) })}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Redefinir zoom
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Arraste para navegar · role o mouse para zoom · shift+arraste seleciona um período (de novo compara com o
        primeiro) · duplo clique para redefinir
      </p>

      {/* Exactly one period pinned: the plain single-period readout. */}
      {summaryA && !summaryB && selections.a && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <PeriodHeader
            label="Seleção"
            color="var(--chart-1)"
            range={selections.a}
            points={points}
            onClear={() => setSelections(EMPTY_SELECTIONS)}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METRIC_ROWS.map((row) => (
              <div key={row.key}>
                <p className="text-[11px] text-muted-foreground">{row.label}</p>
                <p className="text-sm font-semibold">
                  {summaryA[row.key].toFixed(2)} {row.unit}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {summaryB && !summaryA && selections.b && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <PeriodHeader
            label="Seleção"
            color="var(--chart-2)"
            range={selections.b}
            points={points}
            onClear={() => setSelections(EMPTY_SELECTIONS)}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METRIC_ROWS.map((row) => (
              <div key={row.key}>
                <p className="text-[11px] text-muted-foreground">{row.label}</p>
                <p className="text-sm font-semibold">
                  {summaryB[row.key].toFixed(2)} {row.unit}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Both periods pinned: side-by-side comparison with a delta column. */}
      {summaryA && summaryB && selections.a && selections.b && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <PeriodHeader
            label="Período A"
            color="var(--chart-1)"
            range={selections.a}
            points={points}
            onClear={() => setSelections((previous) => ({ ...previous, a: null }))}
          />
          <PeriodHeader
            label="Período B"
            color="var(--chart-2)"
            range={selections.b}
            points={points}
            onClear={() => setSelections((previous) => ({ ...previous, b: null }))}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 text-left font-medium">
                    <span className="sr-only">Métrica</span>
                  </th>
                  <th className="py-1 text-right font-medium">A</th>
                  <th className="py-1 text-right font-medium">B</th>
                  <th className="py-1 text-right font-medium">Diferença (B − A)</th>
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row) => (
                  <tr key={row.key} className="border-t">
                    <th scope="row" className="py-1.5 text-left font-normal text-muted-foreground">
                      {row.label}
                    </th>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {summaryA[row.key].toFixed(2)} {row.unit}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {summaryB[row.key].toFixed(2)} {row.unit}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {formatDelta(summaryA[row.key], summaryB[row.key], row.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
