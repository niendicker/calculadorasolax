'use client';

// Lets the user draw a representative day's load shape by dragging quarter-hour
// points directly on an SVG chart, synchronized with a lateral numeric editor
// for the selected hour. Features local smoothing by default, energetic KPIs,
// batch editing by time window, undo/redo support, and independent controls
// for weekdays and weekends.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn, readCssVar } from '@/lib/utils';
import {
  applyBatchOperation,
  applyMovingAverageSmoothing,
  BatchOperationMode,
  calculateDailyMetrics,
  formatPtNumber,
} from './daily-curve-metrics';

const EMPTY_DAY = new Array(24).fill(0);
type EditMode = 'normal' | 'smooth';
// Cosine falloff reaches zero two samples away; only immediate neighbors move.
const BRUSH_RADIUS_POINTS = 2;
const SMOOTH_ADJACENT_THRESHOLD_KW = 5;
const DEFAULT_VIEW_WIDTH = 640;
const VIEW_HEIGHT = 235;
const MARGIN = { top: 26, right: 14, bottom: 26, left: 54 };

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

function yToPx(kw: number, maxKw: number, plotHeight: number): number {
  return MARGIN.top + plotHeight - (kw / maxKw) * plotHeight;
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

function pxToKw(pxY: number, maxKw: number, plotHeight: number): number {
  const fraction = clamp((MARGIN.top + plotHeight - pxY) / plotHeight, 0, 1);
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
  onSolarChange,
}: DailyCurveEditorProps) {
  const [focusedSeries, setFocusedSeries] = useState<'consumption' | 'solar'>('consumption');
  const hasSolar = Boolean(solarKw?.length);
  const solarSelected = hasSolar && focusedSeries === 'solar';
  const svgRef = useRef<SVGSVGElement>(null);

  // Determine active dataset: dual-pattern mode if weekday/weekend provided, fallback to hourlyKw
  const isDualPattern = Boolean(weekdayKw && weekendKw);
  const consumptionDataset = isDualPattern
    ? activePattern === 'weekday'
      ? weekdayKw!
      : weekendKw!
    : hourlyKw ?? EMPTY_DAY;

  const normalizedSolar = useMemo(() => solarKw?.map((value) => value ?? 0), [solarKw]);
  const activeDataset = solarSelected ? normalizedSolar! : consumptionDataset;
  const editingSeriesRef = useRef<'consumption' | 'solar'>('consumption');
  const [localKw, setLocalKw] = useState(activeDataset);
  const consumptionKw = solarSelected ? consumptionDataset : localKw;
  const generationKw = solarSelected ? localKw : solarKw;
  const pointCount = activeDataset.length;
  const [selectedHour, setSelectedHour] = useState<number>(Math.floor(pointCount / 2));
  const [viewRange, setViewRange] = useState({ start: 0, end: pointCount - 1 });
  const panRef = useRef<{ clientX: number; start: number; end: number } | null>(null);

  const formatTime = useCallback(
    (index: number) => {
      const minutes = Math.round((index * 1440) / pointCount);
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    },
    [pointCount]
  );

  const [activeHour, setActiveHour] = useState<number | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<{ series: 'consumption' | 'solar'; hour: number } | null>(null);
  const [history, setHistory] = useState<number[][]>([]);
  const [redoStack, setRedoStack] = useState<number[][]>([]);
  const [dirtyCount, setDirtyCount] = useState<number>(0);
  const [scaleCeilingOverride, setScaleCeilingOverride] = useState<number | null>(null);

  // Layer toggles
  const [showPeakBand, setShowPeakBand] = useState<boolean>(true);
  const [showSecondary, setShowSecondary] = useState<boolean>(true);

  // Batch edit state
  const [batchStart, setBatchStart] = useState<number>(Math.round((8 * pointCount) / 24));
  const [batchEnd, setBatchEnd] = useState<number>(Math.round((18 * pointCount) / 24));
  const [batchMode, setBatchMode] = useState<BatchOperationMode>('scale');
  const [batchValue, setBatchValue] = useState<string>('10');

  // Toast / feedback message
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

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
    if (
      activeDataset === lastEmittedRef.current ||
      (activeDataset.length === lastEmittedRef.current?.length &&
        activeDataset.every((value, index) => value === lastEmittedRef.current![index]))
    )
      return;
    latestKwRef.current = activeDataset;
    pendingRef.current = null;
    setLocalKw(activeDataset);
    setHistory([]);
    setRedoStack([]);
    setDirtyCount(0);
    setScaleCeilingOverride(null);
  }, [activeDataset, solarSelected]);

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  function emit(next: number[]) {
    lastEmittedRef.current = next;
    if (editingSeriesRef.current === 'solar') {
      onSolarChange?.(next);
      return;
    }
    if (isDualPattern && onUpdatePatternKw) onUpdatePatternKw(activePattern, next);
    onChange?.(next);
  }

  function commitPending() {
    frameRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) emit(pending);
  }

  function pushHistoryState(previousSnapshot: number[]) {
    setHistory((prev) => [...prev.slice(-29), previousSnapshot]);
    setRedoStack([]);
    setDirtyCount((count) => count + 1);
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
    setHistory([]);
    setRedoStack([]);
    setDirtyCount(0);
    smoothInteractionRef.current = null;
    setFocusedSeries(series);
  }

  function updateHour(hour: number, kw: number) {
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
    pushHistoryState(latestKwRef.current.slice());
    if (kw > currentMaxKw) {
      setScaleCeilingOverride(niceCeiling(kw * 1.1));
    }
    const next = applyPointUpdate(latestKwRef.current, hour, Math.round(kw * 10) / 10, 'normal');
    latestKwRef.current = next;
    setLocalKw(next);
    emit(next);
  }

  function handleClearCurve() {
    cancelPending();
    pushHistoryState(latestKwRef.current.slice());
    const cleared = new Array(pointCount).fill(0);
    latestKwRef.current = cleared;
    setLocalKw(cleared);
    setScaleCeilingOverride(null);
    emit(cleared);
    showToast('Curva zerada (0 kW em todos os patamares).');
  }

  function handleUndo() {
    if (history.length > 0) {
      cancelPending();
      const current = latestKwRef.current.slice();
      const previous = history[history.length - 1];
      setHistory((prev) => prev.slice(0, -1));
      setRedoStack((prev) => [...prev, current]);
      setDirtyCount((count) => Math.max(0, count - 1));
      latestKwRef.current = previous;
      setLocalKw(previous);
      setScaleCeilingOverride(null);
      emit(previous);
      showToast('Ação desfeita.');
    }
  }

  function handleRedo() {
    if (redoStack.length > 0) {
      cancelPending();
      const current = latestKwRef.current.slice();
      const next = redoStack[redoStack.length - 1];
      setRedoStack((prev) => prev.slice(0, -1));
      setHistory((prev) => [...prev, current]);
      setDirtyCount((count) => count + 1);
      latestKwRef.current = next;
      setLocalKw(next);
      setScaleCeilingOverride(null);
      emit(next);
      showToast('Ação refeita.');
    }
  }

  function handleQuickStep(step: number) {
    cancelPending();
    const currentVal = localKw[selectedHour] ?? 0;
    const nextVal = Math.max(0, Math.round((currentVal + step) * 10) / 10);
    commitHourImmediately(selectedHour, nextVal);
  }

  function handleApplyBatch() {
    const val = Number(batchValue);
    if (!batchValue.trim() || !Number.isFinite(val)) return;
    cancelPending();
    pushHistoryState(latestKwRef.current.slice());
    const next = applyBatchOperation(latestKwRef.current, batchStart, batchEnd, batchMode, val, Number.POSITIVE_INFINITY);
    const maxInBatch = Math.max(...next);
    if (maxInBatch > currentMaxKw) {
      setScaleCeilingOverride(niceCeiling(maxInBatch * 1.1));
    }
    latestKwRef.current = next;
    setLocalKw(next);
    emit(next);
    const countPoints = Math.abs(batchEnd - batchStart) + 1;
    showToast(
      `Faixa ${formatTime(Math.min(batchStart, batchEnd))}–${formatTime(Math.max(batchStart, batchEnd))} atualizada (${countPoints} patamares).`
    );
  }

  function handleHarmonizeCurve() {
    cancelPending();
    pushHistoryState(latestKwRef.current.slice());
    const next = applyMovingAverageSmoothing(latestKwRef.current, maxKw);
    latestKwRef.current = next;
    setLocalKw(next);
    emit(next);
    showToast('Curva harmonizada com média móvel ponderada.');
  }

  function beginInteraction(hour: number) {
    if (smoothInteractionRef.current?.hour !== hour) {
      smoothInteractionRef.current = { hour, startingKw: latestKwRef.current.slice() };
      pushHistoryState(latestKwRef.current.slice());
    }
  }

  function beginPointerInteraction(hour: number) {
    smoothInteractionRef.current = { hour, startingKw: latestKwRef.current.slice() };
    pushHistoryState(latestKwRef.current.slice());
  }

  const baseMaxKw = niceCeiling(
    Math.max(
      ...consumptionKw,
      ...(generationKw ?? []).filter((value): value is number => value !== null),
      1
    )
  );
  const currentMaxKw = Math.max(baseMaxKw, scaleCeilingOverride ?? 0);
  const [dragMaxKw, setDragMaxKw] = useState<number | null>(null);
  const maxKw = dragMaxKw ?? currentMaxKw;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(DEFAULT_VIEW_WIDTH);
  const [viewHeight, setViewHeight] = useState(VIEW_HEIGHT);
  const plotHeight = viewHeight - MARGIN.top - MARGIN.bottom;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
      const svg = svgRef.current;
      if (svg && svg.clientHeight > 0) setViewHeight(svg.clientHeight);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    if (svgRef.current) observer.observe(svgRef.current);
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

  function zoom(
    factor: number,
    anchor = selectedHour >= viewRange.start && selectedHour <= viewRange.end
      ? selectedHour
      : (viewRange.start + viewRange.end) / 2
  ) {
    const span = clamp(visibleSpan * factor, Math.min(4, pointCount - 1), pointCount - 1);
    moveView(anchor - ((anchor - viewRange.start) * span) / visibleSpan, span);
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
      const fraction = clamp(((event.clientX - rect.left) * (viewWidth / rect.width) - MARGIN.left) / plotWidth, 0, 1);
      zoom(event.deltaY < 0 ? 0.75 : 1.333333, viewRange.start + fraction * visibleSpan);
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRange, viewWidth, plotWidth, pointCount]);

  const xAxisHours = useMemo(() => {
    const count = Math.max(3, Math.floor(containerWidth / 80));
    const step = [1, 2, 4, 8, 12, 24, 48].find((value) => value >= visibleSpan / count) ?? 48;
    const first = Math.ceil(viewRange.start / step) * step;
    return Array.from(
      { length: Math.max(0, Math.floor((viewRange.end - first) / step) + 1) },
      (_, index) => first + index * step
    );
  }, [viewRange, visibleSpan, containerWidth]);

  const [{ primary, border, mutedForeground, foreground, card }] = useState(() => ({
    primary: readCssVar('--chart-1', '#24506b'),
    border: readCssVar('--border', '#d7e0ea'),
    mutedForeground: readCssVar('--muted-foreground', '#66788a'),
    foreground: readCssVar('--foreground', '#16324f'),
    card: readCssVar('--card', '#ffffff'),
  }));

  const linePath = useMemo(
    () => consumptionKw.map((kw, hour) => `${hour === 0 ? 'M' : 'L'} ${xToPx(hour)} ${yToPx(kw, maxKw, plotHeight)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [consumptionKw, maxKw, plotWidth, viewRange, plotHeight]
  );
  const areaPath = useMemo(
    () => `${linePath} L ${xToPx(pointCount - 1)} ${MARGIN.top + plotHeight} L ${xToPx(0)} ${MARGIN.top + plotHeight} Z`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linePath, plotWidth, plotHeight]
  );
  const instanceId = useId();
  const gradientId = `daily-curve-editor-area-${instanceId}-${activePattern}`;
  const solarGradientId = `daily-curve-editor-solar-area-${instanceId}`;

  function pointerPositionToKw(clientY: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const scaleY = viewHeight / rect.height;
    return pxToKw((clientY - rect.top) * scaleY, maxKw, plotHeight);
  }

  function handlePointerDown(
    hour: number,
    event: React.PointerEvent<SVGCircleElement>,
    series: 'consumption' | 'solar' = 'consumption'
  ) {
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
      const prevEl = svgRef.current?.querySelector(
        `circle[${editingSeriesRef.current === 'solar' ? 'data-solar-point' : 'data-hour'}="${prevHour}"]`
      ) as HTMLElement | null;
      prevEl?.focus();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextHour = (hour + 1) % pointCount;
      selectPoint(nextHour);
      const nextEl = svgRef.current?.querySelector(
        `circle[${editingSeriesRef.current === 'solar' ? 'data-solar-point' : 'data-hour'}="${nextHour}"]`
      ) as HTMLElement | null;
      nextEl?.focus();
    }
  }

  const brushRange =
    activeHour !== null
      ? {
          from: Math.max(0, activeHour - BRUSH_RADIUS_POINTS),
          to: Math.min(pointCount - 1, activeHour + BRUSH_RADIUS_POINTS),
        }
      : null;

  const currentSelectedKw = localKw[selectedHour] ?? 0;
  const solarColor = 'var(--chart-2, #ff9d00)';
  const solarLinePath =
    generationKw
      ?.map((kw, index) =>
        kw === null ? '' : `${index === 0 || generationKw[index - 1] === null ? 'M' : 'L'} ${xToPx(index)} ${yToPx(kw, maxKw, plotHeight)}`
      )
      .join(' ') ?? '';

  const solarAreaPath = useMemo(() => {
    if (!solarLinePath) return '';
    return `${solarLinePath} L ${xToPx(pointCount - 1)} ${MARGIN.top + plotHeight} L ${xToPx(0)} ${MARGIN.top + plotHeight} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solarLinePath, pointCount, plotWidth, plotHeight]);

  // Energetic KPIs calculation
  const metrics = useMemo(
    () => calculateDailyMetrics(consumptionKw, generationKw),
    [consumptionKw, generationKw]
  );

  // Peak tariff band indices: in Brazil typically 18:00 to 21:00
  const peakBandStart = Math.round((18 * pointCount) / 24);
  const peakBandEnd = Math.round((21 * pointCount) / 24);
  const peakBandVisible =
    showPeakBand && peakBandEnd > viewRange.start && peakBandStart < viewRange.end;

  const currentConsumptionVal = consumptionKw[selectedHour] ?? 0;
  const currentSolarVal = generationKw?.[selectedHour] ?? 0;
  const currentNetVal = currentConsumptionVal - currentSolarVal;

  return (
    <div className="space-y-4">
      {/* 1. Header with Model Status and Global Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-border/50">
        <div className="flex flex-wrap items-center gap-2">
          {dirtyCount > 0 ? (
            <span
              id="dirtyBadge"
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Editado · {dirtyCount} {dirtyCount === 1 ? 'ajuste' : 'ajustes'}
            </span>
          ) : (
            <span
              id="dirtyBadge"
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Sincronizado com modelo
            </span>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
          {/* History: Undo / Redo controls */}
          <div
            className="inline-flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5"
            role="group"
            aria-label="Histórico de edição"
          >
            <Button
              id="btnUndo"
              type="button"
              variant="ghost"
              size="xs"
              aria-label="Desfazer"
              title="Desfazer última edição"
              disabled={history.length === 0}
              onClick={handleUndo}
              className="h-7 px-2 text-xs font-medium gap-1 text-foreground"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Desfazer</span>
            </Button>
            <Button
              id="btnRedo"
              type="button"
              variant="ghost"
              size="xs"
              aria-label="Refazer"
              title="Refazer edição"
              disabled={redoStack.length === 0}
              onClick={handleRedo}
              className="h-7 px-2 text-xs font-medium gap-1 text-foreground"
            >
              <Redo2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Refazer</span>
            </Button>
          </div>

          {/* Action: Limpar curva */}
          <button
            type="button"
            disabled={solarSelected && !onSolarChange}
            onClick={handleClearCurve}
            className="text-xs text-rose-600 dark:text-rose-400 hover:underline px-2 py-1 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Limpar curva
          </button>

          {/* Primary Action: Salvar como modelo */}
          {onSaveAsCustomModel &&
            (isSavingModel && !saveModelLimitReached ? (
              <div className="flex items-center gap-1.5 bg-background p-1 rounded-md border border-primary/40 shadow-xs">
                <Input
                  type="text"
                  placeholder="Nome do modelo..."
                  value={modelNameInput}
                  onChange={(e) => setModelNameInput(e.target.value)}
                  className="h-7 w-36 text-xs px-2"
                  autoFocus
                />
                <Button
                  type="button"
                  size="xs"
                  className="h-7 px-2.5 text-[11px]"
                  disabled={!modelNameInput.trim() || saveModelLimitReached || solarSelected}
                  onClick={() => {
                    const targetWeekday = isDualPattern ? (weekdayKw ?? localKw) : localKw;
                    const targetWeekend = isDualPattern ? (weekendKw ?? localKw) : localKw;
                    if (onSaveAsCustomModel(modelNameInput.trim(), targetWeekday, targetWeekend) === false) return;
                    setIsSavingModel(false);
                    setModelNameInput('');
                    setSavedSuccess(true);
                    setDirtyCount(0);
                    setHistory([]);
                    setRedoStack([]);
                    showToast('Perfil salvo como modelo com sucesso.');
                    setTimeout(() => setSavedSuccess(false), 3000);
                  }}
                >
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-7 px-1.5 text-[11px]"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savedSuccess ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-600">Modelo salvo!</span>
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    <span>Salvar como modelo</span>
                  </>
                )}
              </button>
            ))}
          {onSaveAsCustomModel && saveModelLimitReached && (
            <span role="status" className="text-xs text-muted-foreground">
              Limite de 5 modelos atingido.
            </span>
          )}
        </div>
      </div>

      {/* 2. Real-Time Energetic KPIs (Faixa de Indicadores Técnicos) */}
      <section
        aria-label="Resumo energético do dia"
        className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3"
      >
        {/* KPI 1: Consumo Total */}
        <div className="bg-muted/30 dark:bg-muted/20 rounded-xl p-3 border border-border/70 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>Consumo Diário Total</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1">
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-bold text-foreground tabular-nums">
                {formatPtNumber(metrics.totalConsumptionKwh, 1)}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">kWh/dia</span>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              <span>Média: </span>
              <span className="font-semibold text-foreground tabular-nums">
                {formatPtNumber(metrics.avgConsumptionKw, 1)} kW
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2: Demanda de Pico */}
        <div className="bg-muted/30 dark:bg-muted/20 rounded-xl p-3 border border-border/70 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-slate-600 dark:bg-slate-300" />
            <span>Demanda de Pico (Consumo)</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1">
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-bold text-foreground tabular-nums">
                {formatPtNumber(metrics.peakConsumptionKw, 1)}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">kW</span>
            </div>
            <button
              type="button"
              onClick={() => selectPoint(metrics.peakConsumptionIndex)}
              className="text-[11px] font-semibold text-primary hover:underline tabular-nums"
              title="Ir para o horário de pico no gráfico"
            >
              às {formatTime(metrics.peakConsumptionIndex)} →
            </button>
          </div>
        </div>

        {/* KPI 3: Geração FV Estimada */}
        <div className="bg-muted/30 dark:bg-muted/20 rounded-xl p-3 border border-border/70 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Geração FV Estimada</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1">
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-bold text-foreground tabular-nums">
                {hasSolar ? formatPtNumber(metrics.totalSolarKwh, 1) : '—'}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">kWh/dia</span>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              {hasSolar ? (
                <>
                  <span>Pico: </span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                    {formatPtNumber(metrics.peakSolarKw, 1)} kW
                  </span>
                </>
              ) : (
                <span>Sem dados FV</span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 4: Cobertura Solar / Excedente */}
        <div className="bg-muted/30 dark:bg-muted/20 rounded-xl p-3 border border-border/70 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Cobertura Solar / Excedente</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1">
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {hasSolar ? `${formatPtNumber(metrics.solarCoveragePercent, 1)}%` : '—'}
              </span>
              <span className="text-[11px] text-muted-foreground">do consumo</span>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              <span>Injeção: </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {hasSolar ? `${formatPtNumber(metrics.solarExportKwh, 1)} kWh` : '—'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Unified Controls Bar (Day Pattern + Series Selector + Layer Toggles + Zoom Presets) */}
      <section
        aria-label="Controles da curva e visualização"
        className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-2 border-b border-border/60"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Day Type Selector: Weekday vs Weekend */}
          {isDualPattern && onPatternChange && (
            <div className="inline-flex rounded-lg bg-muted p-0.5 border border-border/60">
              <button
                type="button"
                aria-pressed={activePattern === 'weekday'}
                onClick={() => onPatternChange('weekday')}
                className={cn(
                  'flex h-7 items-center justify-center rounded-md px-3 text-xs font-semibold transition',
                  activePattern === 'weekday'
                    ? 'bg-background text-foreground shadow-xs ring-1 ring-border/80'
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
                  'flex h-7 items-center justify-center rounded-md px-3 text-xs font-semibold transition',
                  activePattern === 'weekend'
                    ? 'bg-background text-foreground shadow-xs ring-1 ring-border/80'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
              >
                Fim de semana
              </button>
            </div>
          )}

          <div className="h-5 w-px bg-border/80 hidden sm:block" />

          {/* Explicit Series Selector: Editing Series vs Reference */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-1 hidden sm:inline">
              Curva em edição:
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Consumo"
              aria-pressed={!solarSelected}
              className={cn(
                'h-7 px-2.5 text-xs font-semibold gap-1.5 transition',
                !solarSelected
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-background text-foreground hover:bg-muted'
              )}
              onClick={() => selectSeries('consumption')}
            >
              <span className={cn('h-2 w-2 rounded-full', !solarSelected ? 'bg-sky-300' : 'bg-primary')} />
              <span>Consumo</span>
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded text-[10px] font-medium',
                  !solarSelected ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                )}
              >
                {!solarSelected ? 'Editando' : 'Referência'}
              </span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Geração FV"
              aria-pressed={solarSelected}
              disabled={!hasSolar}
              className={cn(
                'h-7 px-2.5 text-xs font-semibold gap-1.5 transition',
                solarSelected
                  ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                  : 'bg-background text-foreground hover:bg-muted'
              )}
              onClick={() => selectSeries('solar')}
            >
              <span className={cn('h-2 w-2 rounded-full', solarSelected ? 'bg-slate-950' : 'bg-amber-500')} />
              <span>Geração FV</span>
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded text-[10px] font-medium',
                  solarSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-muted text-muted-foreground'
                )}
              >
                {solarSelected ? 'Editando' : 'Referência'}
              </span>
            </Button>
          </div>
        </div>

        {/* Right side: Layer toggles and Zoom Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Layer toggles */}
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none bg-muted/40 px-2.5 py-1 rounded-lg border border-border/60">
            <input
              type="checkbox"
              checked={showPeakBand}
              onChange={(e) => setShowPeakBand(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
            />
            <span>Faixa de ponta (18h–21h)</span>
          </label>

          {hasSolar && (
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none bg-muted/40 px-2.5 py-1 rounded-lg border border-border/60">
              <input
                type="checkbox"
                checked={showSecondary}
                onChange={(e) => setShowSecondary(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>Sobrepor 2ª curva</span>
            </label>
          )}

          <div className="h-5 w-px bg-border/80 hidden sm:block" />

          {/* Quick Zoom Windows */}
          <div className="inline-flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => moveView(0, pointCount - 1)}
              className={cn(
                'px-2 py-0.5 rounded-md font-medium transition',
                viewRange.start === 0 && viewRange.end === pointCount - 1
                  ? 'bg-background text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              24h
            </button>
            <button
              type="button"
              onClick={() => {
                const s = Math.round((6 * pointCount) / 24);
                const e = Math.round((18 * pointCount) / 24);
                moveView(s, e - s);
              }}
              className={cn(
                'px-2 py-0.5 rounded-md font-medium transition',
                viewRange.start >= Math.round((5 * pointCount) / 24) &&
                  viewRange.end <= Math.round((19 * pointCount) / 24)
                  ? 'bg-background text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Solar (6h–18h)
            </button>
            <button
              type="button"
              onClick={() => {
                const s = Math.round((16 * pointCount) / 24);
                moveView(s, pointCount - 1 - s);
              }}
              className={cn(
                'px-2 py-0.5 rounded-md font-medium transition',
                viewRange.start >= Math.round((15 * pointCount) / 24)
                  ? 'bg-background text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Ponta (16h–24h)
            </button>
          </div>
        </div>
      </section>

      {/* 4. Main 2-Column Area: SVG Chart (Left) + Inspector & Batch Editor (Right) */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        {/* Left Column: Interactive SVG Chart */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Contextual Floating Info Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs shadow-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-white/20 font-bold tabular-nums">
                {formatTime(selectedHour)}
              </span>
              <span className="text-slate-300">
                Patamar #{selectedHour + 1} de {pointCount}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Consumo:{' '}
                <strong className="tabular-nums font-semibold">
                  {currentConsumptionVal.toFixed(1)} kW
                </strong>
              </span>
              {hasSolar && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  FV:{' '}
                  <strong className="tabular-nums font-semibold">
                    {currentSolarVal.toFixed(1)} kW
                  </strong>
                </span>
              )}
              {hasSolar && (
                <span
                  className={cn(
                    'px-2 py-0.5 rounded font-semibold tabular-nums text-[11px]',
                    currentNetVal < -0.05
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : currentNetVal > 0.05
                        ? 'bg-sky-500/20 text-sky-200'
                        : 'bg-slate-700 text-slate-300'
                  )}
                >
                  {currentNetVal < -0.05
                    ? `Saldo: ${currentNetVal.toFixed(1)} kW (Excedente FV)`
                    : currentNetVal > 0.05
                      ? `Líquido: +${currentNetVal.toFixed(1)} kW`
                      : 'Saldo: 0,0 kW'}
                </span>
              )}
            </div>
          </div>

          <div ref={containerRef} data-testid="daily-chart-container" className="relative flex w-full flex-1 flex-col">
            {/* Viewport Zoom & Reset Controls */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Ampliar gráfico diário"
                  disabled={visibleSpan <= 4}
                  onClick={() => zoom(0.5)}
                  className="h-7 w-7 p-0"
                >
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Reduzir zoom do gráfico diário"
                  disabled={visibleSpan >= pointCount - 1}
                  onClick={() => zoom(2)}
                  className="h-7 w-7 p-0"
                >
                  <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewRange({ start: 0, end: pointCount - 1 })}
                  className="h-7 px-2 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
                  Ver dia inteiro
                </Button>
              </div>

              <span
                role="status"
                aria-label="Período visível no gráfico diário"
                className="text-xs text-muted-foreground"
              >
                {formatTime(Math.ceil(viewRange.start))}–{formatTime(Math.floor(viewRange.end))} ·{' '}
                {1440 / pointCount} min ({visibleSpan + 1} pontos)
              </span>
            </div>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              preserveAspectRatio="none"
              className="h-[235px] min-h-[235px] flex-1 w-full touch-none select-none rounded-xl border border-border/70 bg-card shadow-xs"
              role="group"
              aria-label="Editor da curva diária — arraste os pontos para ajustar a potência ou o fundo para navegar"
              onDoubleClick={() => setViewRange({ start: 0, end: pointCount - 1 })}
              onPointerDown={(event) => {
                if (
                  event.button !== 0 ||
                  (event.target instanceof Element &&
                    event.target.closest('[role="slider"], [data-solar-point]'))
                )
                  return;
                panRef.current = { clientX: event.clientX, ...viewRange };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const pan = panRef.current;
                if (!pan) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const delta =
                  ((event.clientX - pan.clientX) * (viewWidth / rect.width) / plotWidth) *
                  (pan.end - pan.start);
                moveView(pan.start - delta, pan.end - pan.start);
              }}
              onPointerUp={(event) => {
                panRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                panRef.current = null;
              }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primary} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={primary} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id={solarGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
                <clipPath id={`${gradientId}-clip`}>
                  <rect
                    x={MARGIN.left - 8}
                    y={0}
                    width={plotWidth + 16}
                    height={viewHeight - MARGIN.bottom + 8}
                  />
                </clipPath>
              </defs>

              {/* Peak tariff band (18h-21h) */}
              {peakBandVisible && (
                <g className="pointer-events-none">
                  <rect
                    x={Math.max(MARGIN.left, xToPx(peakBandStart))}
                    y={MARGIN.top}
                    width={Math.min(
                      viewWidth - MARGIN.right,
                      xToPx(peakBandEnd) - Math.max(MARGIN.left, xToPx(peakBandStart))
                    )}
                    height={plotHeight}
                    fill="#f43f5e"
                    fillOpacity={0.08}
                  />
                  <line
                    x1={xToPx(peakBandStart)}
                    y1={MARGIN.top}
                    x2={xToPx(peakBandStart)}
                    y2={MARGIN.top + plotHeight}
                    stroke="#f43f5e"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    strokeOpacity={0.4}
                  />
                  <line
                    x1={xToPx(peakBandEnd)}
                    y1={MARGIN.top}
                    x2={xToPx(peakBandEnd)}
                    y2={MARGIN.top + plotHeight}
                    stroke="#f43f5e"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    strokeOpacity={0.4}
                  />
                  <text
                    x={(xToPx(peakBandStart) + xToPx(peakBandEnd)) / 2}
                    y={MARGIN.top + 12}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="#e11d48"
                  >
                    Ponta (18h–21h)
                  </text>
                </g>
              )}

              {brushRange && (
                <rect
                  x={xToPx(brushRange.from)}
                  y={MARGIN.top}
                  width={xToPx(brushRange.to) - xToPx(brushRange.from)}
                  height={plotHeight}
                  fill={primary}
                  opacity={0.08}
                />
              )}

              {/* Gridlines & Y-axis labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                const kw = maxKw * fraction;
                const y = yToPx(kw, maxKw, plotHeight);
                return (
                  <g key={fraction}>
                    <line
                      x1={MARGIN.left}
                      y1={y}
                      x2={viewWidth - MARGIN.right}
                      y2={y}
                      stroke={border}
                      strokeWidth={1}
                      strokeDasharray={fraction === 0 ? undefined : '2 2'}
                    />
                    <text
                      x={MARGIN.left - 8}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={11}
                      fill={mutedForeground}
                    >
                      {Math.round(kw)} kW
                    </text>
                  </g>
                );
              })}

              {/* X-axis ticks */}
              {xAxisHours.map((hour) => (
                <text
                  key={hour}
                  x={xToPx(hour)}
                  y={viewHeight - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill={mutedForeground}
                >
                  {formatTime(hour)}
                </text>
              ))}

              {/* Vertical Guideline for Selected Hour */}
              {selectedHour !== null && (
                <line
                  x1={xToPx(selectedHour)}
                  y1={MARGIN.top}
                  x2={xToPx(selectedHour)}
                  y2={MARGIN.top + plotHeight}
                  stroke={solarSelected ? '#f59e0b' : primary}
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  opacity={0.6}
                />
              )}

              {/* Shaded Area and Curve Line */}
              <g clipPath={`url(#${gradientId}-clip)`}>
                {hasSolar && (showSecondary || solarSelected) && (
                  <g
                    data-testid="daily-solar-series"
                    opacity={solarSelected ? 1 : 0.2}
                    className="transition-opacity"
                  >
                    {solarSelected && (
                      <path pointerEvents="none" d={solarAreaPath} fill={`url(#${solarGradientId})`} />
                    )}
                    <path d={solarLinePath} fill="none" stroke={solarColor} strokeWidth={2.5} />
                    {generationKw!.map((kw, index) =>
                      kw === null || index < viewRange.start || index > viewRange.end ? null : (
                        <circle
                          key={index}
                          data-solar-point={index}
                          cx={xToPx(index)}
                          cy={yToPx(kw, maxKw, plotHeight)}
                          r={selectedHour === index && solarSelected ? 5 : 3}
                          fill={card}
                          stroke={solarColor}
                          strokeWidth={2}
                          role="slider"
                          tabIndex={selectedHour === index ? 0 : -1}
                          aria-label={`Geração FV às ${formatTime(index)}`}
                          aria-valuemin={0}
                          aria-valuemax={maxKw}
                          aria-valuenow={kw}
                          aria-valuetext={`${kw.toFixed(1)} kW`}
                          aria-readonly={!onSolarChange}
                          className="cursor-ns-resize focus:outline-none focus:stroke-[4]"
                          onPointerDown={(event) => {
                            if (onSolarChange) handlePointerDown(index, event, 'solar');
                            else {
                              event.stopPropagation();
                              selectSeries('solar');
                              selectPoint(index);
                            }
                          }}
                          onPointerMove={(event) => {
                            if (onSolarChange) handlePointerMove(index, event);
                          }}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                          onClick={(event) => {
                            event.currentTarget.focus();
                            selectSeries('solar');
                            selectPoint(index);
                          }}
                          onFocus={() => {
                            selectSeries('solar');
                            selectPoint(index);
                            setFocusedPoint({ series: 'solar', hour: index });
                          }}
                          onBlur={() => {
                            setFocusedPoint(null);
                            setActiveHour(null);
                            smoothInteractionRef.current = null;
                          }}
                          onKeyDown={(event) => {
                            if (onSolarChange) handleKeyDown(index, event);
                          }}
                        />
                      )
                    )}
                    {solarSelected &&
                      focusedPoint?.series === 'solar' &&
                      focusedPoint.hour === selectedHour &&
                      generationKw![selectedHour] !== null &&
                      (() => {
                        const x = clamp(xToPx(selectedHour) - 58, MARGIN.left, viewWidth - MARGIN.right - 116);
                        const y = clamp(
                          yToPx(generationKw![selectedHour]!, maxKw, plotHeight) - 28,
                          MARGIN.top,
                          MARGIN.top + plotHeight - 24
                        );
                        return (
                          <g className="pointer-events-none">
                            <rect x={x} y={y} width={116} height={22} rx={5} fill={foreground} />
                            <text
                              x={x + 58}
                              y={y + 14}
                              textAnchor="middle"
                              fontSize={10}
                              fill={card}
                            >
                              {formatTime(selectedHour)} · {generationKw![selectedHour]!.toFixed(1)} kW FV
                            </text>
                          </g>
                        );
                      })()}
                  </g>
                )}

                {(showSecondary || !solarSelected) && (
                  <g
                    data-testid="daily-consumption-series"
                    opacity={solarSelected ? 0.2 : 1}
                    className="transition-opacity"
                  >
                    {!solarSelected && (
                      <path pointerEvents="none" d={areaPath} fill={`url(#${gradientId})`} />
                    )}
                    <path pointerEvents="none" d={linePath} fill="none" stroke={primary} strokeWidth={2} />

                    {/* Interactive Points (Sliders) */}
                    {consumptionKw.map((kw, hour) => {
                      if (hour < viewRange.start || hour > viewRange.end) return null;
                      const cx = xToPx(hour);
                      const cy = yToPx(kw, maxKw, plotHeight);
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
                              'cursor-ns-resize focus:outline-none transition-transform drop-shadow-xs'
                            )}
                            tabIndex={selectedHour === hour ? 0 : -1}
                            role="slider"
                            aria-label={`Potência às ${pointCount === 24 ? `${hour}h` : formatTime(hour)}`}
                            aria-valuemin={0}
                            aria-valuemax={maxKw}
                            aria-valuenow={kw}
                            aria-valuetext={`${kw.toFixed(1)} kW`}
                            onPointerDown={(event) => {
                              handlePointerDown(hour, event);
                            }}
                            onPointerMove={(event) => handlePointerMove(hour, event)}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onKeyDown={(event) => handleKeyDown(hour, event)}
                            onClick={(event) => {
                              event.currentTarget.focus();
                              selectSeries('consumption');
                              setSelectedHour(hour);
                            }}
                            onFocus={() => {
                              selectSeries('consumption');
                              setFocusedPoint({ series: 'consumption', hour });
                              setActiveHour(hour);
                              setSelectedHour(hour);
                            }}
                            onBlur={() => {
                              setFocusedPoint(null);
                              if (smoothInteractionRef.current?.hour === hour)
                                smoothInteractionRef.current = null;
                              setActiveHour((current) => (current === hour ? null : current));
                            }}
                          />

                          {/* Tooltip badge for active/selected point */}
                          {!solarSelected &&
                            focusedPoint?.series === 'consumption' &&
                            focusedPoint.hour === hour &&
                            (() => {
                              const badgeWidth = 108;
                              const badgeHeight = 20;
                              const halfWidth = badgeWidth / 2;
                              const isNearTop = cy < MARGIN.top + 24;
                              const badgeY = isNearTop ? cy + 12 : cy - badgeHeight - 8;
                              const badgeX = clamp(
                                cx - halfWidth,
                                MARGIN.left,
                                viewWidth - MARGIN.right - badgeWidth
                              );

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
                                    className="drop-shadow-xs"
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
                )}
              </g>
            </svg>
          </div>

          {/* Under Chart: Legend, Keyboard hints, and Smoothing action */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-foreground bg-muted border border-border/80 rounded">
                  Clique / Arraste
                </kbd>
                <span>ajustar pontos</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-foreground bg-muted border border-border/80 rounded">
                  ←
                </kbd>
                <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-foreground bg-muted border border-border/80 rounded">
                  →
                </kbd>
                <span>navegar</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-foreground bg-muted border border-border/80 rounded">
                  ↑
                </kbd>
                <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-foreground bg-muted border border-border/80 rounded">
                  ↓
                </kbd>
                <span>±1 kW (Shift: ±5 kW)</span>
              </span>
            </div>

            <Button
              id="btnHarmonizeCurve"
              type="button"
              variant="ghost"
              size="xs"
              disabled={solarSelected && !onSolarChange}
              onClick={handleHarmonizeCurve}
              className="h-7 text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Harmonizar picos
            </Button>
          </div>
        </div>

        {/* Right Column: Lateral Inspector (Top) + Batch Edit by Range (Bottom) */}
        <div className="w-full lg:w-[260px] shrink-0 flex flex-col gap-3">
          {/* Card 1: Point Inspector */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Inspetor de Patamar
                </span>
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      solarSelected ? 'bg-amber-500' : 'bg-primary'
                    )}
                  />
                  <span>Editando: {solarSelected ? 'Geração FV' : 'Consumo'}</span>
                </span>
              </div>
            </div>

            {/* Hour Selector with Navigation Buttons */}
            <div className="space-y-1">
              <label
                htmlFor="select-hour-dropdown"
                className="text-[11px] font-medium text-muted-foreground"
              >
                Horário do intervalo
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

            {/* Power Numeric Input & Quick Steppers */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <label htmlFor="active-power-input" className="font-medium">
                  {solarSelected ? 'Geração FV' : 'Potência'}
                </label>
                <span className="tabular-nums">0–{Math.round(maxKw)} kW</span>
              </div>
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

              {/* Quick Stepper Buttons */}
              <div className="grid grid-cols-4 gap-1 pt-1">
                <button
                  type="button"
                  disabled={solarSelected && !onSolarChange}
                  onClick={() => handleQuickStep(-5)}
                  className="py-1 rounded bg-muted hover:bg-muted/80 text-[11px] font-semibold tabular-nums text-foreground transition disabled:opacity-50"
                >
                  -5 kW
                </button>
                <button
                  type="button"
                  disabled={solarSelected && !onSolarChange}
                  onClick={() => handleQuickStep(-1)}
                  className="py-1 rounded bg-muted hover:bg-muted/80 text-[11px] font-semibold tabular-nums text-foreground transition disabled:opacity-50"
                >
                  -1 kW
                </button>
                <button
                  type="button"
                  disabled={solarSelected && !onSolarChange}
                  onClick={() => handleQuickStep(1)}
                  className="py-1 rounded bg-muted hover:bg-muted/80 text-[11px] font-semibold tabular-nums text-foreground transition disabled:opacity-50"
                >
                  +1 kW
                </button>
                <button
                  type="button"
                  disabled={solarSelected && !onSolarChange}
                  onClick={() => handleQuickStep(5)}
                  className="py-1 rounded bg-muted hover:bg-muted/80 text-[11px] font-semibold tabular-nums text-foreground transition disabled:opacity-50"
                >
                  +5 kW
                </button>
              </div>
            </div>

            {/* Instant Comparison in this Time Slot */}
            <div className="pt-2 border-t border-border/60 space-y-1 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Consumo às {formatTime(selectedHour)}:</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {currentConsumptionVal.toFixed(1)} kW
                </span>
              </div>
              {hasSolar && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>FV às {formatTime(selectedHour)}:</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                    {currentSolarVal.toFixed(1)} kW
                  </span>
                </div>
              )}
              {hasSolar && (
                <div className="flex items-center justify-between pt-1 border-t border-border/40 font-medium">
                  <span className="text-foreground">Balanço:</span>
                  <span
                    className={cn(
                      'font-bold tabular-nums',
                      currentNetVal < -0.05
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : currentNetVal > 0.05
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                    )}
                  >
                    {currentNetVal < -0.05
                      ? `${currentNetVal.toFixed(1)} kW (Injeção)`
                      : currentNetVal > 0.05
                        ? `+${currentNetVal.toFixed(1)} kW (Rede)`
                        : '0,0 kW (Neutro)'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Batch Editing by Time Window (Ajuste em Bloco) */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-3 shadow-xs">
            <div className="pb-1 border-b border-border/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Produtividade
              </span>
              <h3 className="text-xs font-semibold text-foreground">
                Ajuste em bloco de horário
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Aplique um patamar fixo ou variação percentual a múltiplos intervalos de uma só vez.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="batch-range-start" className="block text-[10px] font-medium text-muted-foreground mb-1">
                  Início
                </label>
                <Select
                  id="batch-range-start"
                  value={String(batchStart)}
                  onChange={(e) => setBatchStart(Number(e.target.value))}
                  className="h-7 text-xs font-semibold bg-background"
                >
                  {Array.from({ length: pointCount }, (_, i) => (
                    <option key={i} value={i}>
                      {formatTime(i)}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label htmlFor="batch-range-end" className="block text-[10px] font-medium text-muted-foreground mb-1">
                  Fim
                </label>
                <Select
                  id="batch-range-end"
                  value={String(batchEnd)}
                  onChange={(e) => setBatchEnd(Number(e.target.value))}
                  className="h-7 text-xs font-semibold bg-background"
                >
                  {Array.from({ length: pointCount }, (_, i) => (
                    <option key={i} value={i}>
                      {formatTime(i)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="batch-operation-mode" className="block text-[10px] font-medium text-muted-foreground mb-1">
                  Operação
                </label>
                <Select
                  id="batch-operation-mode"
                  value={batchMode}
                  onChange={(e) => setBatchMode(e.target.value as BatchOperationMode)}
                  className="h-7 text-xs font-semibold bg-background"
                >
                  <option value="scale">Escalar (%)</option>
                  <option value="set">Fixar (kW)</option>
                  <option value="offset">Somar/Subtrair (kW)</option>
                </Select>
              </div>

              <div>
                <label htmlFor="batch-operation-value" className="block text-[10px] font-medium text-muted-foreground mb-1">
                  Valor
                </label>
                <Input
                  id="batch-operation-value"
                  type="number"
                  step={batchMode === 'scale' ? 5 : 1}
                  value={batchValue}
                  onChange={(e) => setBatchValue(e.target.value)}
                  className="h-7 text-xs font-bold tabular-nums bg-background"
                />
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              disabled={solarSelected && !onSolarChange}
              onClick={handleApplyBatch}
              className="w-full h-8 text-xs font-semibold"
            >
              Aplicar à faixa selecionada
            </Button>
          </div>
        </div>
      </div>

      {/* Floating Action Toast */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-4 right-4 max-w-[calc(100vw-2rem)] z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg border border-slate-700 animate-in fade-in slide-in-from-bottom-2"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
