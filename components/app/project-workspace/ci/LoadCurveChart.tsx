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
import { RefreshCw } from 'lucide-react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Button } from '@/components/ui/button';
import type { LoadCurvePoint } from '@/supabase/functions/_shared/commercial-industrial/types';

const CHART_HEIGHT = 240;

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
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

/** Click-drag to pan and scroll-wheel to zoom, mirroring uPlot's own
 * wheel-zoom demo — there's no built-in option for this, so it's wired
 * directly against the plot's `.u-over` element. `cursor.drag` stays off in
 * buildOptions() so uPlot's native rectangle-select-to-zoom doesn't fight
 * this plain-drag-to-pan behavior. */
function attachPanAndZoom(chart: uPlot, pointsRef: { current: LoadCurvePoint[] }): () => void {
  const over = chart.over;
  const ZOOM_FACTOR = 0.75;
  over.style.cursor = 'grab';

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

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
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
  onZoomChange: (zoomed: boolean) => void
): uPlot.Options {
  const primary = readCssVar('--chart-1', '#24506b');
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
    },
  };
}

export function LoadCurveChart({ points }: { points: LoadCurvePoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const pointsRef = useRef(points);
  const [isZoomed, setIsZoomed] = useState(false);

  // Created once per mount; the axis/legend formatters above close over
  // `pointsRef` (always current) instead of being rebuilt on every data
  // update, so importing a new curve doesn't tear down and recreate the
  // whole chart — see the data-sync effect below, which keeps the ref and
  // the plotted data in step whenever `points` changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || pointsRef.current.length === 0) return;

    const options = buildOptions(el.clientWidth || 600, pointsRef, setIsZoomed);
    const chart = new uPlot(options, buildData(pointsRef.current), el);
    chartRef.current = chart;
    const detachPanAndZoom = attachPanAndZoom(chart, pointsRef);

    return () => {
      detachPanAndZoom();
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    pointsRef.current = points;
    chartRef.current?.setData(buildData(points));
  }, [points]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (chartRef.current && el.clientWidth > 0) {
        chartRef.current.setSize({ width: el.clientWidth, height: CHART_HEIGHT });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return null;

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
      <p className="text-[11px] text-muted-foreground">Arraste para navegar · role o mouse para zoom · duplo clique para redefinir</p>
    </div>
  );
}
