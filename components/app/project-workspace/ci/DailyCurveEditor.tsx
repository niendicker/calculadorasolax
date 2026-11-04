'use client';

// Lets the user draw a representative day's load shape by dragging 24 hourly
// points directly on an SVG chart, synchronized with a lateral numeric editor
// for the selected hour. Features normal & smooth brush modes, undo support,
// and independent controls for weekdays and weekends.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn, readCssVar } from '@/lib/utils';
import { DAILY_CURVE_PRESETS } from '@/supabase/functions/_shared/commercial-industrial/manual-day-curve';

const HOURS_PER_DAY = 24;
type EditMode = 'normal' | 'smooth';
const EDIT_MODES: { id: EditMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'smooth', label: 'Suave' },
];

const BRUSH_RADIUS_HOURS = 3;
const SMOOTH_ADJACENT_THRESHOLD_KW = 5;
const DEFAULT_VIEW_WIDTH = 640;
const VIEW_HEIGHT = 235;
const MARGIN = { top: 26, right: 14, bottom: 26, left: 54 };
const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function niceCeiling(value: number): number {
  if (value <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function yToPx(kw: number, maxKw: number): number {
  return MARGIN.top + PLOT_HEIGHT - (kw / maxKw) * PLOT_HEIGHT;
}

function circularHourDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % HOURS_PER_DAY;
  return Math.min(diff, HOURS_PER_DAY - diff);
}

function applyPointUpdate(hourlyKw: number[], hour: number, newValue: number, mode: EditMode): number[] {
  if (mode === 'normal') {
    const next = hourlyKw.slice();
    next[hour] = newValue;
    return next;
  }

  const baseCenterKw = hourlyKw[hour];
  const delta = newValue - baseCenterKw;
  if (delta === 0) {
    return hourlyKw;
  }

  return hourlyKw.map((value, i) => {
    if (i === hour) return newValue;

    const distance = circularHourDistance(hour, i);
    if (distance > BRUSH_RADIUS_HOURS) return value;

    const weight = (Math.cos((Math.PI * distance) / BRUSH_RADIUS_HOURS) + 1) / 2;

    if (delta > 0) {
      // Movimento para cima: só arrasta quem está abaixo;
      // se passar quem está acima, este se torna abaixo e começa a ser puxado junto.
      const effectiveDelta = Math.max(0, Math.min(delta - SMOOTH_ADJACENT_THRESHOLD_KW, newValue - value));
      if (effectiveDelta <= 0) return value;
      return Math.round((value + effectiveDelta * weight) * 10) / 10;
    } else {
      // Movimento para baixo: só arrasta quem está acima;
      // se passar quem está abaixo, este se torna acima e começa a ser puxado junto.
      const downwardDelta = -delta;
      const effectiveDelta = Math.max(0, Math.min(downwardDelta - SMOOTH_ADJACENT_THRESHOLD_KW, value - newValue));
      if (effectiveDelta <= 0) return value;
      return Math.round(Math.max(0, value - effectiveDelta * weight) * 10) / 10;
    }
  });
}

function pxToKw(pxY: number, maxKw: number): number {
  const fraction = clamp((MARGIN.top + PLOT_HEIGHT - pxY) / PLOT_HEIGHT, 0, 1);
  return fraction * maxKw;
}

export interface DailyCurveEditorProps {
  /** 24 kW values for direct single-day editing. */
  hourlyKw?: number[];
  onChange?: (hourlyKw: number[]) => void;
  /** Full dual-pattern props when orchestrated with weekday/weekend. */
  weekdayKw?: number[];
  weekendKw?: number[];
  activePattern?: 'weekday' | 'weekend';
  onPatternChange?: (pattern: 'weekday' | 'weekend') => void;
  onUpdatePatternKw?: (pattern: 'weekday' | 'weekend', kw: number[]) => void;
  selectedPresetId?: string | null;
  onSelectPreset?: (presetId: string) => void;
}

export function DailyCurveEditor({
  hourlyKw,
  onChange,
  weekdayKw,
  weekendKw,
  activePattern = 'weekday',
  onPatternChange,
  onUpdatePatternKw,
  selectedPresetId,
  onSelectPreset,
}: DailyCurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Determine active dataset: dual-pattern mode if weekday/weekend provided, fallback to hourlyKw
  const isDualPattern = Boolean(weekdayKw && weekendKw);
  const activeDataset = isDualPattern
    ? (activePattern === 'weekday' ? weekdayKw! : weekendKw!)
    : (hourlyKw ?? new Array(HOURS_PER_DAY).fill(0));

  const [localKw, setLocalKw] = useState(activeDataset);
  const [selectedHour, setSelectedHour] = useState<number>(12);
  const [activeHour, setActiveHour] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('normal');
  const [undoKw, setUndoKw] = useState<number[] | null>(null);
  const [scaleCeilingOverride, setScaleCeilingOverride] = useState<number | null>(null);

  const pendingRef = useRef<number[] | null>(null);
  const frameRef = useRef<number | null>(null);
  const smoothInteractionRef = useRef<{ hour: number; startingKw: number[] } | null>(null);
  const dragScaleMaxRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);
  const lastPointerKwRef = useRef<number | null>(null);

  // Synchronize localKw when active dataset changes externally
  useEffect(() => {
    setLocalKw(activeDataset);
    setUndoKw(null);
    setScaleCeilingOverride(null);
  }, [activeDataset]);

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  function commitPending() {
    frameRef.current = null;
    if (pendingRef.current) {
      if (isDualPattern && onUpdatePatternKw) {
        onUpdatePatternKw(activePattern, pendingRef.current);
      }
      onChange?.(pendingRef.current);
      pendingRef.current = null;
    }
  }

  function updateHour(hour: number, kw: number) {
    setUndoKw(null);
    setLocalKw((previous) => {
      const roundedKw = Math.round(kw * 10) / 10;
      const smoothStartingKw = smoothInteractionRef.current?.hour === hour ? smoothInteractionRef.current.startingKw : previous;
      const next = applyPointUpdate(editMode === 'smooth' ? smoothStartingKw : previous, hour, roundedKw, editMode);
      pendingRef.current = next;
      if (frameRef.current == null) frameRef.current = requestAnimationFrame(commitPending);
      return next;
    });
  }

  function commitHourImmediately(hour: number, kw: number) {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRef.current = null;
    setUndoKw(null);
    setLocalKw((previous) => {
      const roundedKw = Math.round(kw * 10) / 10;
      const next = applyPointUpdate(previous, hour, roundedKw, 'normal');
      if (isDualPattern && onUpdatePatternKw) {
        onUpdatePatternKw(activePattern, next);
      }
      onChange?.(next);
      return next;
    });
  }

  function handleClearCurve() {
    setUndoKw(localKw.slice());
    const cleared = new Array(HOURS_PER_DAY).fill(0);
    setLocalKw(cleared);
    setScaleCeilingOverride(null);
    if (isDualPattern && onUpdatePatternKw) {
      onUpdatePatternKw(activePattern, cleared);
    }
    onChange?.(cleared);
  }

  function handleUndo() {
    if (undoKw) {
      const restored = undoKw.slice();
      setLocalKw(restored);
      setScaleCeilingOverride(null);
      if (isDualPattern && onUpdatePatternKw) {
        onUpdatePatternKw(activePattern, restored);
      }
      onChange?.(restored);
      setUndoKw(null);
    }
  }

  function beginInteraction(hour: number) {
    if (editMode === 'smooth' && smoothInteractionRef.current?.hour !== hour) {
      smoothInteractionRef.current = { hour, startingKw: localKw.slice() };
    }
  }

  function beginPointerInteraction(hour: number) {
    if (editMode === 'smooth') {
      smoothInteractionRef.current = { hour, startingKw: localKw.slice() };
    }
  }

  const baseMaxKw = niceCeiling(Math.max(...localKw, 1));
  const currentMaxKw = Math.max(baseMaxKw, scaleCeilingOverride ?? 0);
  // Keep the scale locked during an active drag gesture so the coordinate mapping doesn't oscillate or jump
  const maxKw = dragScaleMaxRef.current ?? currentMaxKw;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(DEFAULT_VIEW_WIDTH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const viewWidth = Math.max(DEFAULT_VIEW_WIDTH, containerWidth);
  const plotWidth = viewWidth - MARGIN.left - MARGIN.right;

  const xToPx = (hour: number) => MARGIN.left + (hour / (HOURS_PER_DAY - 1)) * plotWidth;

  const xAxisHours = useMemo(() => {
    if (viewWidth >= 960) {
      return [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 23];
    }
    if (viewWidth >= 740) {
      return [0, 3, 6, 9, 12, 15, 18, 21, 23];
    }
    return [0, 6, 12, 18, 23];
  }, [viewWidth]);

  // Cache resolved CSS custom properties to avoid synchronous getComputedStyle flushes on drag
  const colorsRef = useRef<{ primary: string; border: string; mutedForeground: string; foreground: string; card: string } | null>(null);
  if (!colorsRef.current) {
    colorsRef.current = {
      primary: readCssVar('--chart-1', '#24506b'),
      border: readCssVar('--border', '#d7e0ea'),
      mutedForeground: readCssVar('--muted-foreground', '#66788a'),
      foreground: readCssVar('--foreground', '#16324f'),
      card: readCssVar('--card', '#ffffff'),
    };
  }
  const { primary, border, mutedForeground, foreground, card } = colorsRef.current;

  const linePath = useMemo(
    () => localKw.map((kw, hour) => `${hour === 0 ? 'M' : 'L'} ${xToPx(hour)} ${yToPx(kw, maxKw)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localKw, maxKw, plotWidth]
  );
  const areaPath = useMemo(
    () => `${linePath} L ${xToPx(HOURS_PER_DAY - 1)} ${MARGIN.top + PLOT_HEIGHT} L ${xToPx(0)} ${MARGIN.top + PLOT_HEIGHT} Z`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linePath, plotWidth]
  );
  const gradientId = `daily-curve-editor-area-${activePattern}`;

  function pointerPositionToKw(clientY: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const scaleY = VIEW_HEIGHT / rect.height;
    return pxToKw((clientY - rect.top) * scaleY, maxKw);
  }

  function handlePointerDown(hour: number, event: React.PointerEvent<SVGCircleElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragScaleMaxRef.current = currentMaxKw;
    hasDraggedRef.current = false;
    const initialKw = pointerPositionToKw(event.clientY);
    lastPointerKwRef.current = initialKw;
    beginPointerInteraction(hour);
    setActiveHour(hour);
    setSelectedHour(hour);
    updateHour(hour, initialKw);
  }

  function handlePointerMove(hour: number, event: React.PointerEvent<SVGCircleElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    hasDraggedRef.current = true;
    const newKw = pointerPositionToKw(event.clientY);
    lastPointerKwRef.current = newKw;
    updateHour(hour, newKw);
  }

  function handlePointerUp(event: React.PointerEvent<SVGCircleElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const currentDragMax = dragScaleMaxRef.current;
    const lastKw = lastPointerKwRef.current;
    // Se o ponto foi arrastado até o valor máximo da escala (ou além do topo), ao soltar dobra a escala
    if (hasDraggedRef.current && currentDragMax !== null && lastKw !== null && lastKw >= currentDragMax - 0.5) {
      setScaleCeilingOverride(currentDragMax * 2);
    }
    hasDraggedRef.current = false;
    lastPointerKwRef.current = null;
    dragScaleMaxRef.current = null;
    smoothInteractionRef.current = null;
    setActiveHour(null);
  }

  function handleKeyDown(hour: number, event: React.KeyboardEvent<SVGCircleElement>) {
    const step = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      beginInteraction(hour);
      updateHour(hour, Math.max(0, localKw[hour] + step));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      beginInteraction(hour);
      updateHour(hour, Math.max(0, localKw[hour] - step));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prevHour = (hour + HOURS_PER_DAY - 1) % HOURS_PER_DAY;
      setSelectedHour(prevHour);
      const prevEl = svgRef.current?.querySelector(`circle[data-hour="${prevHour}"]`) as HTMLElement | null;
      prevEl?.focus();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextHour = (hour + 1) % HOURS_PER_DAY;
      setSelectedHour(nextHour);
      const nextEl = svgRef.current?.querySelector(`circle[data-hour="${nextHour}"]`) as HTMLElement | null;
      nextEl?.focus();
    }
  }

  const brushRange =
    editMode === 'smooth' && activeHour !== null
      ? { from: Math.max(0, activeHour - BRUSH_RADIUS_HOURS), to: Math.min(HOURS_PER_DAY - 1, activeHour + BRUSH_RADIUS_HOURS) }
      : null;

  const currentSelectedKw = localKw[selectedHour] ?? 0;

  return (
    <div className="space-y-3">
      {/* Top Controls Header: Pattern Segmented Control */}
      {isDualPattern && onPatternChange && (
        <div className="flex items-center justify-between gap-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              aria-pressed={activePattern === 'weekday'}
              onClick={() => onPatternChange('weekday')}
              className={cn(
                'flex h-7 items-center justify-center rounded-md px-3 text-xs font-medium transition',
                activePattern === 'weekday'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              Dias úteis
            </button>
            <button
              type="button"
              aria-pressed={activePattern === 'weekend'}
              onClick={() => onPatternChange('weekend')}
              className={cn(
                'flex h-7 items-center justify-center rounded-md px-3 text-xs font-medium transition',
                activePattern === 'weekend'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              Fim de semana
            </button>
          </div>
        </div>
      )}

      {/* Main 2-Column Area: SVG Chart + Side Numerical Editor Panel */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        {/* Left Column: Interactive SVG Chart */}
        <div className="flex-1 min-w-0 flex flex-col justify-between space-y-2">
          <div ref={containerRef} data-testid="daily-chart-container" className="relative w-full">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewWidth} ${VIEW_HEIGHT}`}
              className="h-[235px] w-full touch-none select-none rounded-lg bg-card"
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
              <rect
                x={xToPx(brushRange.from)}
                y={MARGIN.top}
                width={xToPx(brushRange.to) - xToPx(brushRange.from)}
                height={PLOT_HEIGHT}
                fill={primary}
                opacity={0.08}
              />
            )}

            {/* Gridlines & Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const kw = maxKw * fraction;
              const y = yToPx(kw, maxKw);
              return (
                <g key={fraction}>
                  <line x1={MARGIN.left} y1={y} x2={viewWidth - MARGIN.right} y2={y} stroke={border} strokeWidth={1} />
                  <text x={MARGIN.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={mutedForeground}>
                    {Math.round(kw)} kW
                  </text>
                </g>
              );
            })}

            {/* X-axis ticks */}
            {xAxisHours.map((hour) => (
              <text key={hour} x={xToPx(hour)} y={VIEW_HEIGHT - 8} textAnchor="middle" fontSize={11} fill={mutedForeground}>
                {hour}h
              </text>
            ))}

            {/* Vertical Guideline for Selected Hour */}
            {selectedHour !== null && (
              <line
                x1={xToPx(selectedHour)}
                y1={MARGIN.top}
                x2={xToPx(selectedHour)}
                y2={MARGIN.top + PLOT_HEIGHT}
                stroke={primary}
                strokeDasharray="3 3"
                strokeWidth={1.5}
                opacity={0.4}
              />
            )}

            {/* Shaded Area and Curve Line */}
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke={primary} strokeWidth={2} />

            {/* Interactive Points (Sliders) */}
            {localKw.map((kw, hour) => {
              const cx = xToPx(hour);
              const cy = yToPx(kw, maxKw);
              const isSelected = selectedHour === hour;
              const isHoveredOrActive = activeHour === hour;

              return (
                <g key={hour}>
                  <circle
                    data-hour={hour}
                    cx={cx}
                    cy={cy}
                    r={editMode === 'smooth' ? 8 : 7}
                    fill={editMode === 'smooth' ? primary : card}
                    stroke={editMode === 'smooth' ? card : primary}
                    strokeWidth={isSelected ? 3.5 : 2}
                    className={cn(
                      'cursor-ns-resize focus:outline-none transition-transform',
                      isSelected && 'drop-shadow-sm',
                      editMode === 'smooth' ? 'drop-shadow-sm' : 'drop-shadow-none'
                    )}
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
                    onPointerCancel={handlePointerUp}
                    onKeyDown={(event) => handleKeyDown(hour, event)}
                    onClick={() => setSelectedHour(hour)}
                    onFocus={() => {
                      setActiveHour(hour);
                      setSelectedHour(hour);
                    }}
                    onBlur={() => {
                      if (smoothInteractionRef.current?.hour === hour) smoothInteractionRef.current = null;
                      setActiveHour((current) => (current === hour ? null : current));
                    }}
                  />

                  {/* Tooltip badge for active/selected point */}
                  {(isSelected || isHoveredOrActive) && (() => {
                    const badgeWidth = 108;
                    const badgeHeight = 20;
                    const halfWidth = badgeWidth / 2;
                    const isNearTop = cy < MARGIN.top + 24;
                    const badgeY = isNearTop ? cy + 12 : cy - badgeHeight - 8;
                    const badgeX = clamp(cx - halfWidth, MARGIN.left, viewWidth - MARGIN.right - badgeWidth);

                    return (
                      <g className="pointer-events-none">
                        <rect
                          x={badgeX}
                          y={badgeY}
                          width={badgeWidth}
                          height={badgeHeight}
                          rx={5}
                          fill={foreground}
                          opacity={0.92}
                          className="drop-shadow-sm"
                        />
                        <text
                          x={badgeX + halfWidth}
                          y={badgeY + badgeHeight / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={10}
                          fontWeight={600}
                          fill={card}
                          className="select-none tabular-nums"
                        >
                          {String(hour).padStart(2, '0')}:00 · {kw.toFixed(1)} kW
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}
          </svg>

          {/* Opção Suavizar no corpo do gráfico */}
          <div className="absolute right-2.5 top-2.5 z-10">
            <button
              type="button"
              aria-pressed={editMode === 'smooth'}
              onClick={() => {
                smoothInteractionRef.current = null;
                setEditMode((prev) => (prev === 'smooth' ? 'normal' : 'smooth'));
              }}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition border shadow-xs',
                editMode === 'smooth'
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background/90 hover:bg-background text-muted-foreground hover:text-foreground border-border/80 backdrop-blur-xs'
              )}
              title={
                editMode === 'smooth'
                  ? 'Desativar suavização (ajuste ponto a ponto)'
                  : 'Ativar suavização (distribui ajuste para vizinhos)'
              }
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Suavizar</span>
            </button>
          </div>
        </div>

          {/* Bottom Bar: Instructions and Discrete Clear Action */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
            <span>Arraste os pontos ou edite o valor ao lado.</span>
            {undoKw ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span>Curva zerada.</span>
                <Button type="button" variant="link" size="xs" onClick={handleUndo} className="h-auto p-0 font-semibold text-primary">
                  <Undo2 className="h-3 w-3 mr-1" /> Desfazer
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleClearCurve}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                Limpar curva
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Lateral Numeric Editor Panel */}
        <div className="w-full lg:w-[185px] shrink-0 rounded-xl border border-border/80 bg-muted/25 p-3 flex flex-col justify-center space-y-3">
          {/* Hour Selector with Navigation Buttons */}
          <div className="space-y-1">
            <label htmlFor="select-hour-dropdown" className="text-[11px] font-medium text-muted-foreground">
              Horário
            </label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 bg-background"
                onClick={() => setSelectedHour((h) => (h + HOURS_PER_DAY - 1) % HOURS_PER_DAY)}
                aria-label="Hora anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Select
                id="select-hour-dropdown"
                value={String(selectedHour)}
                onChange={(e) => setSelectedHour(Number(e.target.value))}
                aria-label="Horário selecionado"
                className="h-8 text-xs font-semibold text-foreground bg-background"
              >
                {Array.from({ length: HOURS_PER_DAY }, (_, i) => (
                  <option key={i} value={i}>
                    {`${String(i).padStart(2, '0')}:00`}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 bg-background"
                onClick={() => setSelectedHour((h) => (h + 1) % HOURS_PER_DAY)}
                aria-label="Próxima hora"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Active Power Numeric Input */}
          <div className="space-y-1">
            <label htmlFor="active-power-input" className="text-[11px] font-medium text-muted-foreground">
              Potência
            </label>
            <div className="relative">
              <Input
                id="active-power-input"
                aria-label="Potência ativa"
                type="number"
                min={0}
                step={0.5}
                value={currentSelectedKw}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (!isNaN(parsed)) {
                    commitHourImmediately(selectedHour, Math.max(0, parsed));
                  }
                }}
                className="h-8.5 pr-9 text-sm font-semibold tabular-nums text-foreground bg-background [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground select-none">
                kW
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
