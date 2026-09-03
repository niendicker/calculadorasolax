'use client';

// Lets the user draw a representative day's load shape by dragging 24 hourly
// points directly on a small chart — the companion to LoadCurveChart.tsx's
// read-only, 672-point uPlot view, not a replacement for it. Hand-rolled SVG,
// not uPlot: uPlot has no draggable-point support to build on top of, and a
// 24-point chart with no need for zoom/pan/hundreds-of-points canvas
// performance is exactly the "small chart" case docs/CI-MODULE-PLAN.md
// section 8.3 says to reach for plain SVG before a library.

import { useEffect, useRef, useState } from 'react';
import { cn, readCssVar } from '@/lib/utils';

const HOURS_PER_DAY = 24;
type EditMode = 'normal' | 'smooth';
const EDIT_MODES: { id: EditMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'smooth', label: 'Suave' },
];
// Fixed, not user-adjustable (plan: "pincel de raio fixo") — 3h on each side
// is enough to visibly round out a single-point tweak on a 24-point day
// without a drag one hour away accidentally reshaping the whole morning.
const BRUSH_RADIUS_HOURS = 3;
const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 220;
// left is generous on purpose: a 3-digit "### kW" label right-aligned with
// only ~8px of gap needs more room than it looks like it should — too little
// clips its leading digit against the SVG's own left edge (the same lesson
// learned the hard way sizing LoadCurveChart.tsx's uPlot y-axis gutter).
const MARGIN = { top: 12, right: 12, bottom: 28, left: 54 };
const PLOT_WIDTH = VIEW_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;
const X_AXIS_HOURS = [0, 6, 12, 18, 23];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds up to a "nice" axis ceiling (1/2/5/10 × a power of ten) instead of
 * the raw max, so gridlines land on round kW values. */
function niceCeiling(value: number): number {
  if (value <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function xToPx(hour: number): number {
  return MARGIN.left + (hour / (HOURS_PER_DAY - 1)) * PLOT_WIDTH;
}

function yToPx(kw: number, maxKw: number): number {
  return MARGIN.top + PLOT_HEIGHT - (kw / maxKw) * PLOT_HEIGHT;
}

/** Shortest hour-of-day distance between two hours, wrapping past midnight
 * (23h and 0h are 1h apart, not 23h apart) — the brush's falloff needs this
 * so smoothing near a day boundary doesn't stop dead at the array edges. */
function circularHourDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % HOURS_PER_DAY;
  return Math.min(diff, HOURS_PER_DAY - diff);
}

/** Normal mode: only the dragged hour changes. Smooth mode: the same delta
 * (not the absolute value) is applied to every hour within
 * BRUSH_RADIUS_HOURS, tapering with a raised-cosine falloff — 1 at the
 * dragged point, 0 at the radius edge — so the dragged hour still lands
 * exactly where the user dropped it, and neighbors ease into the change
 * instead of forming a sawtooth. */
function applyPointUpdate(hourlyKw: number[], hour: number, newValue: number, mode: EditMode): number[] {
  if (mode === 'normal') {
    const next = hourlyKw.slice();
    next[hour] = newValue;
    return next;
  }

  const delta = newValue - hourlyKw[hour];
  return hourlyKw.map((value, i) => {
    const distance = circularHourDistance(hour, i);
    if (distance > BRUSH_RADIUS_HOURS) return value;
    const weight = (Math.cos((Math.PI * distance) / BRUSH_RADIUS_HOURS) + 1) / 2;
    return Math.round(Math.max(0, value + delta * weight) * 10) / 10;
  });
}

// Deliberately floors at 0 only, with no upper clamp: `maxKw` is the current
// frame's axis ceiling, derived from today's values — clamping drag input to
// it would make any point already at the top impossible to raise further
// (raising it needs a higher maxKw, which needs the raise to have already
// happened). Dragging above the visible plot extrapolates past the current
// ceiling instead; the axis then grows to fit on the very next render.
function pxToKw(pxY: number, maxKw: number): number {
  const fraction = (MARGIN.top + PLOT_HEIGHT - pxY) / PLOT_HEIGHT;
  return Math.max(0, fraction * maxKw);
}

interface DailyCurveEditorProps {
  /** 24 kW values, index = local hour of day (0-23). */
  hourlyKw: number[];
  onChange: (hourlyKw: number[]) => void;
}

export function DailyCurveEditor({ hourlyKw, onChange }: DailyCurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Seeded once from the initial `hourlyKw` and updated locally on every
  // drag from then on. If the parent needs to reset this to a different
  // starting pattern (a new preset, or switching the weekday/weekend tab),
  // it does so by remounting with a different `key` — the idiomatic React
  // way to treat a prop as "initial state only" — rather than this syncing
  // via an effect on every `hourlyKw` change.
  const [localKw, setLocalKw] = useState(hourlyKw);
  const [activeHour, setActiveHour] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('normal');
  const pendingRef = useRef<number[] | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  function commitPending() {
    frameRef.current = null;
    if (pendingRef.current) {
      onChange(pendingRef.current);
      pendingRef.current = null;
    }
  }

  // Mirrors attachPanAndZoom in LoadCurveChart.tsx: the dragged point moves
  // instantly (cheap, local state), but `onChange` — which can cascade into
  // rebuilding up to 672 curve points and a uPlot setData in the preview
  // below — is coalesced to at most once per animation frame.
  function updateHour(hour: number, kw: number) {
    setLocalKw((previous) => {
      const next = applyPointUpdate(previous, hour, Math.round(kw * 10) / 10, editMode);
      pendingRef.current = next;
      if (frameRef.current == null) frameRef.current = requestAnimationFrame(commitPending);
      return next;
    });
  }

  const maxKw = niceCeiling(Math.max(...localKw, 1));
  const primary = readCssVar('--chart-1', '#24506b');
  const border = readCssVar('--border', '#d7e0ea');
  const mutedForeground = readCssVar('--muted-foreground', '#66788a');
  const foreground = readCssVar('--foreground', '#16324f');
  const card = readCssVar('--card', '#ffffff');

  const linePath = localKw.map((kw, hour) => `${hour === 0 ? 'M' : 'L'} ${xToPx(hour)} ${yToPx(kw, maxKw)}`).join(' ');
  const areaPath = `${linePath} L ${xToPx(HOURS_PER_DAY - 1)} ${MARGIN.top + PLOT_HEIGHT} L ${xToPx(0)} ${MARGIN.top + PLOT_HEIGHT} Z`;
  const gradientId = 'daily-curve-editor-area';

  function pointerPositionToKw(clientY: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const scaleY = VIEW_HEIGHT / rect.height;
    return pxToKw((clientY - rect.top) * scaleY, maxKw);
  }

  function handlePointerDown(hour: number, event: React.PointerEvent<SVGCircleElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveHour(hour);
    updateHour(hour, pointerPositionToKw(event.clientY));
  }

  function handlePointerMove(hour: number, event: React.PointerEvent<SVGCircleElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateHour(hour, pointerPositionToKw(event.clientY));
  }

  function handlePointerUp(event: React.PointerEvent<SVGCircleElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setActiveHour(null);
  }

  function handleKeyDown(hour: number, event: React.KeyboardEvent<SVGCircleElement>) {
    const step = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      updateHour(hour, Math.max(0, localKw[hour] + step));
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      updateHour(hour, Math.max(0, localKw[hour] - step));
    }
  }

  const brushRange =
    editMode === 'smooth' && activeHour !== null
      ? { from: Math.max(0, activeHour - BRUSH_RADIUS_HOURS), to: Math.min(HOURS_PER_DAY - 1, activeHour + BRUSH_RADIUS_HOURS) }
      : null;

  return (
    <div className="space-y-2">
      <div className="grid w-fit grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {EDIT_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            aria-pressed={editMode === mode.id}
            onClick={() => setEditMode(mode.id)}
            className={cn(
              'flex h-7 items-center justify-center rounded-md px-3 text-xs font-medium transition',
              editMode === mode.id
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-[220px] w-full touch-none select-none"
        role="img"
        aria-label="Editor da curva diária — arraste os pontos para ajustar a potência de cada hora"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary} stopOpacity={0.3} />
            <stop offset="100%" stopColor={primary} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {brushRange && (
          // Visual-only approximation: doesn't wrap past midnight the way the
          // actual falloff (circularHourDistance) does, so a brush centered
          // near 0h/23h looks slightly truncated here even though the data
          // effect on the other side of midnight is real. A cosmetic
          // simplification, not a data bug.
          <rect
            x={xToPx(brushRange.from)}
            y={MARGIN.top}
            width={xToPx(brushRange.to) - xToPx(brushRange.from)}
            height={PLOT_HEIGHT}
            fill={primary}
            opacity={0.08}
          />
        )}

        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const kw = maxKw * fraction;
          const y = yToPx(kw, maxKw);
          return (
            <g key={fraction}>
              <line x1={MARGIN.left} y1={y} x2={VIEW_WIDTH - MARGIN.right} y2={y} stroke={border} strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={mutedForeground}>
                {Math.round(kw)} kW
              </text>
            </g>
          );
        })}

        {X_AXIS_HOURS.map((hour) => (
          <text key={hour} x={xToPx(hour)} y={VIEW_HEIGHT - 8} textAnchor="middle" fontSize={11} fill={mutedForeground}>
            {hour}h
          </text>
        ))}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={primary} strokeWidth={2} />

        {localKw.map((kw, hour) => (
          <g key={hour}>
            <circle
              cx={xToPx(hour)}
              cy={yToPx(kw, maxKw)}
              r={7}
              fill={card}
              stroke={primary}
              strokeWidth={2}
              className="cursor-ns-resize focus:outline-none focus-visible:stroke-[3]"
              tabIndex={0}
              role="slider"
              aria-label={`Potência às ${hour}h`}
              aria-valuemin={0}
              aria-valuemax={maxKw}
              aria-valuenow={kw}
              aria-valuetext={`${kw.toFixed(1)} kW`}
              onPointerDown={(event) => handlePointerDown(hour, event)}
              onPointerMove={(event) => handlePointerMove(hour, event)}
              onPointerUp={handlePointerUp}
              onKeyDown={(event) => handleKeyDown(hour, event)}
              onFocus={() => setActiveHour(hour)}
              onBlur={() => setActiveHour((current) => (current === hour ? null : current))}
            />
            {activeHour === hour && (
              <text
                x={clamp(xToPx(hour), MARGIN.left + 24, VIEW_WIDTH - MARGIN.right - 24)}
                y={Math.max(yToPx(kw, maxKw) - 14, MARGIN.top + 10)}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill={foreground}
              >
                {kw.toFixed(1)} kW
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
