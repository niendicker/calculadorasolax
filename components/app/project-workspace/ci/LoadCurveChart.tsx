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

import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
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

/** `pointsRef` is read inside the formatters below at call time, not
 * captured once — options are only built on mount (see the component), so a
 * later curve re-import must still show up-to-date labels/ticks without
 * tearing down and recreating the chart. */
function buildOptions(width: number, pointsRef: { current: LoadCurvePoint[] }): uPlot.Options {
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
  };
}

export function LoadCurveChart({ points }: { points: LoadCurvePoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const pointsRef = useRef(points);

  // Created once per mount; the axis/legend formatters above close over
  // `pointsRef` (always current) instead of being rebuilt on every data
  // update, so importing a new curve doesn't tear down and recreate the
  // whole chart — see the data-sync effect below, which keeps the ref and
  // the plotted data in step whenever `points` changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || pointsRef.current.length === 0) return;

    const options = buildOptions(el.clientWidth || 600, pointsRef);
    const chart = new uPlot(options, buildData(pointsRef.current), el);
    chartRef.current = chart;

    return () => {
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

  return <div ref={containerRef} className="w-full [&_.u-legend]:text-xs [&_.u-legend]:text-muted-foreground" />;
}
