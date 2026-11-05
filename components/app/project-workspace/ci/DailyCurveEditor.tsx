'use client';

// Lets the user draw a representative day's load shape by dragging quarter-hour
// points directly on an SVG chart, synchronized with a lateral numeric editor
// for the selected hour. Features local smoothing by default, undo support,
// and independent controls for weekdays and weekends.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Check, ChevronLeft, ChevronRight, RotateCcw, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn, readCssVar } from '@/lib/utils';

const EMPTY_DAY = new Array(24).fill(0);
type EditMode = 'normal' | 'smooth';
// Cosine falloff reaches zero two samples away; only immediate neighbors move.
const BRUSH_RADIUS_POINTS = 2;
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

function circularPointDistance(a: number, b: number, pointCount: number): number {
  const diff = Math.abs(a - b) % pointCount;
  return Math.min(diff, pointCount - diff);
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

    const distance = circularPointDistance(hour, i, hourlyKw.length);
    if (distance >= BRUSH_RADIUS_POINTS) return value;

    const weight = (Math.cos((Math.PI * distance) / BRUSH_RADIUS_POINTS) + 1) / 2;

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
  onSaveAsCustomModel?: (name: string, weekdayKw: number[], weekendKw: number[]) => boolean | void;
  saveModelLimitReached?: boolean;
  solarKw?: (number | null)[];
  solarDescription?: string;
  onSolarChange?: (kw: number[]) => void;
}

export function DailyCurveEditor({
  hourlyKw,
  onChange,
  weekdayKw,
  weekendKw,
  activePattern = 'weekday',
  onPatternChange,
  onUpdatePatternKw,
  onSaveAsCustomModel,
  saveModelLimitReached = false,
  solarKw,
  solarDescription,
  onSolarChange,
}: DailyCurveEditorProps) {
  const [focusedSeries, setFocusedSeries] = useState<'consumption' | 'solar'>('consumption');
  const hasSolar = Boolean(solarKw?.length);
  const solarSelected = hasSolar && focusedSeries === 'solar';
  const svgRef = useRef<SVGSVGElement>(null);

  // Determine active dataset: dual-pattern mode if weekday/weekend provided, fallback to hourlyKw
  const isDualPattern = Boolean(weekdayKw && weekendKw);
  const consumptionDataset = isDualPattern
    ? (activePattern === 'weekday' ? weekdayKw! : weekendKw!)
    : (hourlyKw ?? EMPTY_DAY);

  const normalizedSolar = useMemo(() => solarKw?.map(value => value ?? 0), [solarKw]);
  const activeDataset = solarSelected ? normalizedSolar! : consumptionDataset;
  const editingSeriesRef = useRef<'consumption' | 'solar'>('consumption');
  const [localKw, setLocalKw] = useState(activeDataset);
  const consumptionKw = solarSelected ? consumptionDataset : localKw;
  const generationKw = solarSelected ? localKw : solarKw;
  const pointCount = activeDataset.length;
  const [selectedHour, setSelectedHour] = useState<number>(Math.floor(pointCount / 2));
  const [viewRange, setViewRange] = useState({ start: 0, end: pointCount - 1 });
  const panRef = useRef<{ clientX: number; start: number; end: number } | null>(null);
  const formatTime = (index: number) => {
    const minutes = Math.round(index * 1440 / pointCount);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  };
  const [activeHour, setActiveHour] = useState<number | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<{ series: 'consumption' | 'solar'; hour: number } | null>(null);
  const [undoKw, setUndoKw] = useState<number[] | null>(null);
  const [scaleCeilingOverride, setScaleCeilingOverride] = useState<number | null>(null);
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [modelNameInput, setModelNameInput] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const latestKwRef = useRef(activeDataset);
  const lastEmittedRef = useRef<number[] | null>(null);
  const pendingRef = useRef<number[] | null>(null);
  const frameRef = useRef<number | null>(null);
  const smoothInteractionRef = useRef<{ hour: number; startingKw: number[] } | null>(null);
  const dragScaleMaxRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);
  const lastPointerKwRef = useRef<number | null>(null);

  // Synchronize localKw when active dataset changes externally
  useEffect(() => {
    editingSeriesRef.current = solarSelected ? 'solar' : 'consumption';
    if (activeDataset === lastEmittedRef.current || activeDataset.length === lastEmittedRef.current?.length && activeDataset.every((value, index) => value === lastEmittedRef.current![index])) return;
    latestKwRef.current = activeDataset;
    pendingRef.current = null;
    setLocalKw(activeDataset);
    setUndoKw(null);
    setScaleCeilingOverride(null);
  }, [activeDataset, solarSelected]);

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  function emit(next: number[]) {
    lastEmittedRef.current = next;
    if (editingSeriesRef.current === 'solar') { onSolarChange?.(next); return; }
    if (isDualPattern && onUpdatePatternKw) onUpdatePatternKw(activePattern, next);
    onChange?.(next);
  }

  function commitPending() {
    frameRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) emit(pending);
  }

  function selectSeries(series: 'consumption' | 'solar') {
    if (editingSeriesRef.current === series) return;
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    commitPending();
    editingSeriesRef.current = series;
    const values = series === 'solar' ? normalizedSolar! : consumptionDataset;
    latestKwRef.current = values;
    lastEmittedRef.current = null;
    setLocalKw(values);
    setUndoKw(null);
    smoothInteractionRef.current = null;
    setFocusedSeries(series);
  }

  function updateHour(hour: number, kw: number) {
    setUndoKw(null);
    const previous = latestKwRef.current;
    const roundedKw = Math.round(kw * 10) / 10;
    const starting = smoothInteractionRef.current?.hour === hour ? smoothInteractionRef.current.startingKw : previous;
    const next = applyPointUpdate(starting, hour, roundedKw, 'smooth');
    latestKwRef.current = next;
    setLocalKw(next);
    pendingRef.current = next;
    if (frameRef.current == null) frameRef.current = requestAnimationFrame(commitPending);
  }

  function cancelPending() {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingRef.current = null;
  }

  function commitHourImmediately(hour: number, kw: number) {
    cancelPending();
    setUndoKw(null);
    const next = applyPointUpdate(latestKwRef.current, hour, Math.round(kw * 10) / 10, 'normal');
    latestKwRef.current = next;
    setLocalKw(next);
    emit(next);
  }

  function handleClearCurve() {
    cancelPending();
    setUndoKw(localKw.slice());
    const cleared = new Array(pointCount).fill(0);
    latestKwRef.current = cleared;
    setLocalKw(cleared);
    setScaleCeilingOverride(null);
    emit(cleared);
  }

  function handleUndo() {
    if (undoKw) {
      const restored = undoKw.slice();
      cancelPending();
      latestKwRef.current = restored;
      setLocalKw(restored);
      setScaleCeilingOverride(null);
      emit(restored);
      setUndoKw(null);
    }
  }

  function beginInteraction(hour: number) {
    if (smoothInteractionRef.current?.hour !== hour) {
      smoothInteractionRef.current = { hour, startingKw: latestKwRef.current.slice() };
    }
  }

  function beginPointerInteraction(hour: number) {
    smoothInteractionRef.current = { hour, startingKw: latestKwRef.current.slice() };
  }

  const baseMaxKw = niceCeiling(Math.max(...consumptionKw, ...(generationKw ?? []).filter((value): value is number => value !== null), 1));
  const currentMaxKw = Math.max(baseMaxKw, scaleCeilingOverride ?? 0);
  // Keep the scale locked during an active drag gesture so the coordinate mapping doesn't oscillate or jump
  const [dragMaxKw, setDragMaxKw] = useState<number | null>(null);
  const maxKw = dragMaxKw ?? currentMaxKw;

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

  const viewWidth = Math.max(240, containerWidth);
  const plotWidth = viewWidth - MARGIN.left - MARGIN.right;

  const visibleSpan = viewRange.end - viewRange.start;
  const xToPx = (hour: number) => MARGIN.left + ((hour - viewRange.start) / visibleSpan) * plotWidth;

  function moveView(start: number, span = visibleSpan) {
    const boundedSpan = clamp(span, Math.min(4, pointCount - 1), pointCount - 1);
    const boundedStart = clamp(start, 0, pointCount - 1 - boundedSpan);
    setViewRange({ start: boundedStart, end: boundedStart + boundedSpan });
  }

  function zoom(factor: number, anchor = selectedHour >= viewRange.start && selectedHour <= viewRange.end ? selectedHour : (viewRange.start + viewRange.end) / 2) {
    const span = clamp(visibleSpan * factor, Math.min(4, pointCount - 1), pointCount - 1);
    moveView(anchor - (anchor - viewRange.start) * span / visibleSpan, span);
  }

  function selectPoint(index: number) {
    setSelectedHour(index);
    if (index < viewRange.start || index > viewRange.end) moveView(index - visibleSpan / 2);
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const fraction = clamp(((event.clientX - rect.left) * viewWidth / rect.width - MARGIN.left) / plotWidth, 0, 1);
      zoom(event.deltaY < 0 ? 0.75 : 1.333333, viewRange.start + fraction * visibleSpan);
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
    // The handler captures the current range and dimensions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRange, viewWidth, plotWidth, pointCount]);

  const xAxisHours = useMemo(() => {
    const count = Math.max(3, Math.floor(containerWidth / 80));
    const step = [1, 2, 4, 8, 12, 24, 48].find((value) => value >= visibleSpan / count) ?? 48;
    const first = Math.ceil(viewRange.start / step) * step;
    return Array.from({ length: Math.max(0, Math.floor((viewRange.end - first) / step) + 1) }, (_, index) => first + index * step);
  }, [viewRange, visibleSpan, containerWidth]);

  const [{ primary, border, mutedForeground, foreground, card }] = useState(() => ({
    primary: readCssVar('--chart-1', '#24506b'), border: readCssVar('--border', '#d7e0ea'),
    mutedForeground: readCssVar('--muted-foreground', '#66788a'), foreground: readCssVar('--foreground', '#16324f'), card: readCssVar('--card', '#ffffff'),
  }));

  const linePath = useMemo(
    () => consumptionKw.map((kw, hour) => `${hour === 0 ? 'M' : 'L'} ${xToPx(hour)} ${yToPx(kw, maxKw)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [consumptionKw, maxKw, plotWidth, viewRange]
  );
  const areaPath = useMemo(
    () => `${linePath} L ${xToPx(pointCount - 1)} ${MARGIN.top + PLOT_HEIGHT} L ${xToPx(0)} ${MARGIN.top + PLOT_HEIGHT} Z`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linePath, plotWidth]
  );
  const instanceId = useId();
  const gradientId = `daily-curve-editor-area-${instanceId}-${activePattern}`;

  function pointerPositionToKw(clientY: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const scaleY = VIEW_HEIGHT / rect.height;
    return pxToKw((clientY - rect.top) * scaleY, maxKw);
  }

  function handlePointerDown(hour: number, event: React.PointerEvent<SVGCircleElement>, series: 'consumption' | 'solar' = 'consumption') {
    selectSeries(series);
    event.currentTarget.focus();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragMaxKw(currentMaxKw);
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
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    commitPending();
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
    setDragMaxKw(null);
    smoothInteractionRef.current = null;
    setActiveHour(null);
  }

  function handleKeyDown(hour: number, event: React.KeyboardEvent<SVGCircleElement>) {
    const step = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      beginInteraction(hour);
      updateHour(hour, Math.max(0, latestKwRef.current[hour] + step));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      beginInteraction(hour);
      updateHour(hour, Math.max(0, latestKwRef.current[hour] - step));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prevHour = (hour + pointCount - 1) % pointCount;
      selectPoint(prevHour);
      const prevEl = svgRef.current?.querySelector(`circle[${editingSeriesRef.current === 'solar' ? 'data-solar-point' : 'data-hour'}="${prevHour}"]`) as HTMLElement | null;
      prevEl?.focus();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextHour = (hour + 1) % pointCount;
      selectPoint(nextHour);
      const nextEl = svgRef.current?.querySelector(`circle[${editingSeriesRef.current === 'solar' ? 'data-solar-point' : 'data-hour'}="${nextHour}"]`) as HTMLElement | null;
      nextEl?.focus();
    }
  }

  const brushRange =
    activeHour !== null
      ? { from: Math.max(0, activeHour - BRUSH_RADIUS_POINTS), to: Math.min(pointCount - 1, activeHour + BRUSH_RADIUS_POINTS) }
      : null;

  const currentSelectedKw = localKw[selectedHour] ?? 0;
  const solarColor = 'var(--chart-2, #ff9d00)';
  const solarLinePath = generationKw?.map((kw, index) => kw === null ? '' : `${index === 0 || generationKw[index - 1] === null ? 'M' : 'L'} ${xToPx(index)} ${yToPx(kw, maxKw)}`).join(' ') ?? '';

  return (
    <div className="space-y-3">
      {/* Pattern tabs and editing actions share the header. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isDualPattern && onPatternChange && (
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
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {undoKw ? (
            <div className="flex items-center gap-1.5 text-xs">
              <span>Curva zerada.</span>
              <Button type="button" variant="link" size="xs" disabled={solarSelected && !onSolarChange} onClick={handleUndo} className="h-auto p-0 font-semibold text-primary">
                <Undo2 className="h-3 w-3 mr-1" /> Desfazer
              </Button>
            </div>
          ) : (
            <button
              type="button"
              disabled={solarSelected && !onSolarChange}
              onClick={handleClearCurve}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Limpar curva
            </button>
          )}
          {onSaveAsCustomModel && (
            isSavingModel && !saveModelLimitReached ? (
              <div className="flex items-center gap-1.5 bg-background p-1 rounded-md border border-primary/40">
                <Input
                  type="text"
                  placeholder="Nome do modelo..."
                  value={modelNameInput}
                  onChange={(e) => setModelNameInput(e.target.value)}
                  className="h-6 w-36 text-xs px-2"
                  autoFocus
                />
                <Button
                  type="button"
                  size="xs"
                  className="h-6 px-2 text-[11px]"
                  disabled={!modelNameInput.trim() || saveModelLimitReached || solarSelected}
                  onClick={() => {
                    const targetWeekday = isDualPattern ? (weekdayKw ?? localKw) : localKw;
                    const targetWeekend = isDualPattern ? (weekendKw ?? localKw) : localKw;
                    if (onSaveAsCustomModel(modelNameInput.trim(), targetWeekday, targetWeekend) === false) return;
                    setIsSavingModel(false);
                    setModelNameInput('');
                    setSavedSuccess(true);
                    setTimeout(() => setSavedSuccess(false), 3000);
                  }}
                >
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={() => {
                    setIsSavingModel(false);
                    setModelNameInput('');
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <button
                type="button"
                  disabled={saveModelLimitReached || solarSelected}
                onClick={() => setIsSavingModel(true)}
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
              >
                {savedSuccess ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span className="text-emerald-600">Modelo salvo!</span>
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="h-3 w-3" />
                    <span>Salvar como modelo</span>
                  </>
                )}
              </button>
            )
          )}
          {onSaveAsCustomModel && saveModelLimitReached && (
            <span role="status" className="text-xs text-muted-foreground">Limite de 5 modelos atingido.</span>
          )}
        </div>
      </div>

      {solarKw && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button type="button" variant="ghost" size="sm" aria-pressed={!solarSelected} className={!solarSelected ? "bg-muted" : undefined} onClick={() => selectSeries('consumption')}><span className="h-2 w-2 rounded-full bg-chart-1" />Consumo</Button>
          <Button type="button" variant="ghost" size="sm" aria-pressed={solarSelected} className={solarSelected ? "bg-muted" : undefined} disabled={!hasSolar} onClick={() => selectSeries('solar')}><span className="h-2 w-2 rounded-full bg-chart-2" />Geração FV</Button>
          <span className="text-muted-foreground">{hasSolar ? solarDescription : 'Sem dados FV para os dias selecionados.'}</span>
        </div>
      )}

      {/* Main 2-Column Area: SVG Chart + Side Numerical Editor Panel */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        {/* Left Column: Interactive SVG Chart */}
        <div className="flex-1 min-w-0 flex flex-col justify-between space-y-2">
          <div ref={containerRef} data-testid="daily-chart-container" className="relative w-full">
            <div className="mb-2 flex flex-wrap items-center gap-1">
              <Button type="button" variant="outline" size="sm" aria-label="Ampliar gráfico diário" disabled={visibleSpan <= 4} onClick={() => zoom(0.5)}><ZoomIn aria-hidden="true" /></Button>
              <Button type="button" variant="outline" size="sm" aria-label="Reduzir zoom do gráfico diário" disabled={visibleSpan >= pointCount - 1} onClick={() => zoom(2)}><ZoomOut aria-hidden="true" /></Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setViewRange({ start: 0, end: pointCount - 1 })}><RotateCcw aria-hidden="true" />Ver dia inteiro</Button>
              <span role="status" aria-label="Período visível no gráfico diário" className="text-xs text-muted-foreground">{formatTime(Math.ceil(viewRange.start))}–{formatTime(Math.floor(viewRange.end))} · {1440 / pointCount} min</span>
            </div>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewWidth} ${VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              className="h-[235px] w-full touch-none select-none rounded-lg bg-card"
              role="group"
              aria-label="Editor da curva diária — arraste os pontos para ajustar a potência ou o fundo para navegar"
              onDoubleClick={() => setViewRange({ start: 0, end: pointCount - 1 })}
              onPointerDown={(event) => {
                if (event.button !== 0 || event.target instanceof Element && event.target.closest('[role="slider"], [data-solar-point]')) return;
                panRef.current = { clientX: event.clientX, ...viewRange };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const pan = panRef.current;
                if (!pan) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const delta = (event.clientX - pan.clientX) * viewWidth / rect.width / plotWidth * (pan.end - pan.start);
                moveView(pan.start - delta, pan.end - pan.start);
              }}
              onPointerUp={(event) => { panRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
              onPointerCancel={() => { panRef.current = null; }}
            >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primary} stopOpacity={0.3} />
                <stop offset="100%" stopColor={primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <defs><clipPath id={`${gradientId}-clip`}><rect x={MARGIN.left - 8} y={0} width={plotWidth + 16} height={VIEW_HEIGHT - MARGIN.bottom + 8} /></clipPath></defs>
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
                {formatTime(hour)}
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
            <g clipPath={`url(#${gradientId}-clip)`}>
            {hasSolar && <g data-testid="daily-solar-series" opacity={solarSelected ? 1 : 0.2} className="transition-opacity">
              <path d={solarLinePath} fill="none" stroke={solarColor} strokeWidth={2.5} />
              {generationKw!.map((kw, index) => kw === null || index < viewRange.start || index > viewRange.end ? null : (
                <circle key={index} data-solar-point={index} cx={xToPx(index)} cy={yToPx(kw, maxKw)} r={selectedHour === index && solarSelected ? 5 : 3} fill={card} stroke={solarColor} strokeWidth={2}
                  role="slider" tabIndex={selectedHour === index ? 0 : -1} aria-label={`Geração FV às ${formatTime(index)}`} aria-valuemin={0} aria-valuemax={maxKw} aria-valuenow={kw} aria-valuetext={`${kw.toFixed(1)} kW`} aria-readonly={!onSolarChange}
                  className="cursor-ns-resize focus:outline-none focus:stroke-[4]"
                  onPointerDown={(event) => { if (onSolarChange) handlePointerDown(index, event, 'solar'); else {event.stopPropagation(); selectSeries('solar'); selectPoint(index);} }}
                  onPointerMove={(event) => {if (onSolarChange) handlePointerMove(index, event);}} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
                  onClick={(event) => {event.currentTarget.focus(); selectSeries('solar'); selectPoint(index);}} onFocus={() => {selectSeries('solar'); selectPoint(index); setFocusedPoint({series: 'solar', hour: index});}} onBlur={() => {setFocusedPoint(null); setActiveHour(null); smoothInteractionRef.current = null;}}
                  onKeyDown={(event) => {if (onSolarChange) handleKeyDown(index, event);}}
                />
              ))}
              {solarSelected && focusedPoint?.series === 'solar' && focusedPoint.hour === selectedHour && generationKw![selectedHour] !== null && (() => {
                const x = clamp(xToPx(selectedHour) - 58, MARGIN.left, viewWidth - MARGIN.right - 116);
                const y = clamp(yToPx(generationKw![selectedHour]!, maxKw) - 28, MARGIN.top, MARGIN.top + PLOT_HEIGHT - 24);
                return <g className="pointer-events-none"><rect x={x} y={y} width={116} height={22} rx={5} fill={foreground} /><text x={x + 58} y={y + 14} textAnchor="middle" fontSize={10} fill={card}>{formatTime(selectedHour)} · {generationKw![selectedHour]!.toFixed(1)} kW FV</text></g>;
              })()}
            </g>}
            <g data-testid="daily-consumption-series" opacity={solarSelected ? 0.2 : 1} className="transition-opacity">
            <path pointerEvents="none" d={areaPath} fill={`url(#${gradientId})`} />
            <path pointerEvents="none" d={linePath} fill="none" stroke={primary} strokeWidth={2} />

            {/* Interactive Points (Sliders) */}
            {consumptionKw.map((kw, hour) => {
              if (hour < viewRange.start || hour > viewRange.end) return null;
              const cx = xToPx(hour);
              const cy = yToPx(kw, maxKw);
              const isSelected = selectedHour === hour;

              return (
                <g key={hour}>
                  <circle
                    data-hour={hour}
                    cx={cx}
                    cy={cy}
                    r={visibleSpan > 48 ? (selectedHour === hour ? 5 : 3) : 8}
                    fill={primary}
                    stroke={card}
                    strokeWidth={isSelected ? 3.5 : 2}
                    className={cn(
                      'cursor-ns-resize focus:outline-none transition-transform',
                      'drop-shadow-sm'
                    )}
                    tabIndex={selectedHour === hour ? 0 : -1}
                    role="slider"
                    aria-label={`Potência às ${pointCount === 24 ? `${hour}h` : formatTime(hour)}`}
                    aria-valuemin={0}
                    aria-valuemax={maxKw}
                    aria-valuenow={kw}
                    aria-valuetext={`${kw.toFixed(1)} kW`}
                    onPointerDown={(event) => {handlePointerDown(hour, event);}}
                    onPointerMove={(event) => handlePointerMove(hour, event)}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onKeyDown={(event) => handleKeyDown(hour, event)}
                    onClick={(event) => {event.currentTarget.focus(); selectSeries('consumption'); setSelectedHour(hour);}}
                    onFocus={() => {
                      selectSeries('consumption');
                      setFocusedPoint({ series: 'consumption', hour });
                      setActiveHour(hour);
                      setSelectedHour(hour);
                    }}
                    onBlur={() => {
                      setFocusedPoint(null);
                      if (smoothInteractionRef.current?.hour === hour) smoothInteractionRef.current = null;
                      setActiveHour((current) => (current === hour ? null : current));
                    }}
                  />

                  {/* Tooltip badge for active/selected point */}
                  {!solarSelected && focusedPoint?.series === 'consumption' && focusedPoint.hour === hour && (() => {
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
                          {formatTime(hour)} · {kw.toFixed(1)} kW
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}
            </g>
            </g>
          </svg>
          </div>

          {/* Chart interaction instructions */}
          <p className="px-1 text-xs text-muted-foreground">
            Arraste os pontos para editar; o fundo para navegar. Role para zoom; duplo clique para ver o dia.
          </p>
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
                onClick={() => selectPoint((selectedHour + pointCount - 1) % pointCount)}
                aria-label={pointCount === 24 ? 'Hora anterior' : 'Intervalo anterior'}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Select
                id="select-hour-dropdown"
                value={String(selectedHour)}
                onChange={(e) => selectPoint(Number(e.target.value))}
                aria-label="Horário selecionado"
                className="h-8 text-xs font-semibold text-foreground bg-background"
              >
                {Array.from({ length: pointCount }, (_, i) => (
                  <option key={i} value={i}>
                    {formatTime(i)}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 bg-background"
                onClick={() => selectPoint((selectedHour + 1) % pointCount)}
                aria-label={pointCount === 24 ? 'Próxima hora' : 'Próximo intervalo'}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {solarSelected && <p className="text-xs text-muted-foreground">{onSolarChange ? "Edite a geração arrastando os pontos ou informando a potência." : "Consulte ou ajuste a origem da geração na etapa Solar FV."}</p>}
          {/* Active Power Numeric Input */}
          <div className="space-y-1">
            <label htmlFor="active-power-input" className="text-[11px] font-medium text-muted-foreground">
              {solarSelected ? 'Geração FV' : 'Potência'}
            </label>
            <div className="relative">
              <Input
                id="active-power-input"
                aria-label={solarSelected ? 'Geração FV selecionada' : 'Potência ativa'}
                readOnly={solarSelected && !onSolarChange}
                type="number"
                min={0}
                step={0.5}
                value={currentSelectedKw}
                onChange={(e) => {
                  if (solarSelected && !onSolarChange) return;
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
