'use client';

// Lets the user draw a representative day's load shape by dragging quarter-hour
// points directly on an SVG chart. Features local smoothing by default,
// energetic KPIs, undo/redo support, and independent controls
// for weekdays and weekends.

import { useCiAcPower } from './ci-ac-power';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Pencil,
  ScanLine,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfoTooltip } from '@/components/ui/tooltip';
import { cn, readCssVar } from '@/lib/utils';
import type {CurveRangeSelection} from './LoadCurveChart';
import {
  applyMovingAverageSmoothing,
  calculateDailyMetrics,
  formatPtNumber,
} from './daily-curve-metrics';

const EMPTY_DAY = new Array(24).fill(0);
type EditMode = 'normal' | 'smooth';
// Cosine falloff reaches zero two samples away; only immediate neighbors move.
const BRUSH_RADIUS_POINTS = 2;
const SMOOTH_ADJACENT_THRESHOLD_KW = 5;
const DEFAULT_VIEW_WIDTH = 640;
const VIEW_HEIGHT = 320;
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
  /** Active kW samples; CA controls display kVA at the project power factor. */
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
  solarOnly?:boolean;
  onSolarChange?: (kw: number[]) => void;
  onSelectRange?:(range:CurveRangeSelection|null)=>void;
  selectedRanges?:CurveRangeSelection[];
  selectionActions?: React.ReactNode;
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
  solarOnly=false,
  onSelectRange,
  selectedRanges=[],
  selectionActions,
}: DailyCurveEditorProps) {
  const { toKva, fromKva } = useCiAcPower();

  const [focusedSeries, setFocusedSeries] = useState<'consumption' | 'solar'>(solarOnly?'solar':'consumption');
  const hasSolar = Boolean(solarKw?.length);
  const solarSelected = hasSolar && (solarOnly||focusedSeries === 'solar');
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
  const rangeDragRef=useRef<{startIndex:number;clientX:number}|null>(null);
  const [rangeMode,setRangeMode]=useState(false);
  const canSelectRange = Boolean(onSelectRange);
  const [previousCanSelectRange, setPreviousCanSelectRange] = useState(canSelectRange);
  if (previousCanSelectRange !== canSelectRange) {
    setPreviousCanSelectRange(canSelectRange);
    if (!canSelectRange) setRangeMode(false);
  }
  const [rangePreview,setRangePreview]=useState<CurveRangeSelection|null>(null);

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

  const viewOptionsId = useId();
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);


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
  const pendingEmitterRef = useRef<((values: number[]) => void) | null>(null);
  const pointerEditingRef = useRef(false);
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
    pendingEmitterRef.current = null;
    pointerEditingRef.current = false;
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
      // An unfinished gesture belongs to this editor, not a replacement project.
      pendingRef.current = null;
      pendingEmitterRef.current = null;
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
    const publish = pendingEmitterRef.current;
    pendingRef.current = null;
    pendingEmitterRef.current = null;
    if (pending) {
      setLocalKw(pending);
      publish?.(pending);
    }
  }

  function paintPendingFrame() {
    frameRef.current = null;
    if (pointerEditingRef.current) {
      // Keep the gesture local; project/weekly/PV calculations run on release.
      if (pendingRef.current) setLocalKw(pendingRef.current);
    } else {
      commitPending();
    }
  }

  function pushHistoryState(previousSnapshot: number[]) {
    setHistory((prev) => [...prev.slice(-29), previousSnapshot]);
    setRedoStack([]);
    setDirtyCount((count) => count + 1);
  }

  function selectSeries(series: 'consumption' | 'solar') {
    if(solarOnly&&series==='consumption')return;
    if (editingSeriesRef.current === series) return;
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    commitPending();
    pointerEditingRef.current = false;
    editingSeriesRef.current = series;
    const values = series === 'solar' ? normalizedSolar! : consumptionDataset;
    latestKwRef.current = values;
    // This series is already synchronized; the following effect must not
    // discard a pointer gesture that started directly on its curve.
    lastEmittedRef.current = values;
    setLocalKw(values);
    setHistory([]);
    setRedoStack([]);
    setDirtyCount(0);
    smoothInteractionRef.current = null;
    setFocusedSeries(series);
  }

  function updateHour(hour: number, kw: number) {
    const previous = latestKwRef.current;
    const roundedKw = fromKva(Math.round(toKva(kw) * 10) / 10);
    const starting = smoothInteractionRef.current?.hour === hour ? smoothInteractionRef.current.startingKw : previous;
    const next = applyPointUpdate(starting, hour, roundedKw, 'smooth');
    latestKwRef.current = next;
    // Keyboard nudges remain immediate; pointer movement paints once per frame.
    if (!pointerEditingRef.current) setLocalKw(next);
    pendingRef.current = next;
    pendingEmitterRef.current = emit;
    if (frameRef.current == null) frameRef.current = requestAnimationFrame(paintPendingFrame);
  }

  function cancelPending() {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingRef.current = null;
    pendingEmitterRef.current = null;
    pointerEditingRef.current = false;
  }

  function handleClearCurve() {
    cancelPending();
    pushHistoryState(latestKwRef.current.slice());
    const cleared = new Array(pointCount).fill(0);
    latestKwRef.current = cleared;
    setLocalKw(cleared);
    setScaleCeilingOverride(null);
    emit(cleared);
    showToast('Curva zerada (0 kVA em todos os patamares).');
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
  const indexAtClientX=(clientX:number,svg:SVGSVGElement)=>{
    const rect=svg.getBoundingClientRect();
    const fraction=clamp(((clientX-rect.left)*viewWidth/rect.width-MARGIN.left)/plotWidth,0,1);
    return Math.round(clamp(viewRange.start+fraction*visibleSpan,0,pointCount-1));
  };

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
      if (!event.ctrlKey || event.deltaY === 0) return;
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
    pointerEditingRef.current = true;
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
    if (!pointerEditingRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    hasDraggedRef.current = true;
    const newKw = pointerPositionToKw(event.clientY);
    lastPointerKwRef.current = newKw;
    updateHour(hour, newKw);
  }

  function handlePointerUp(event: React.PointerEvent<SVGCircleElement>) {
    pointerEditingRef.current = false;
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
    if (rangeMode && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      return;
    }
    const step = fromKva(event.shiftKey ? 5 : 1);
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


  return (
    <div className="space-y-4">
      {/* 3. Unified Controls Bar (Day Pattern + Series Selector + Layer Toggles + Zoom Presets) */}
      {Boolean((isDualPattern&&onPatternChange)||hasSolar)&&<section
        aria-label="Controles da curva e visualização"
        className="flex flex-wrap items-center justify-between gap-2"
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

          {hasSolar&&<div className="h-5 w-px bg-border/80 hidden sm:block" />}

          {hasSolar && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Editar curva</span>
              <div role="group" aria-label="Curva em edição" className="inline-flex items-center rounded-lg border border-border/60 bg-muted/50 p-1">
                {([
                  { id: 'consumption', label: 'Consumo', selected: !solarSelected, dot: 'bg-primary' },
                  { id: 'solar', label: 'Geração FV', selected: solarSelected, dot: 'bg-amber-500' },
                ] as const).map(series => (
                  <Button
                    key={series.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={series.label}
                    aria-pressed={series.selected}
                    disabled={series.id === 'consumption' && solarOnly}
                    onClick={() => selectSeries(series.id)}
                    className={cn('h-9 gap-2 rounded-md px-3 text-xs md:h-8', series.selected ? 'bg-background text-foreground shadow-xs ring-1 ring-border/70 hover:bg-background' : 'text-muted-foreground')}
                  >
                    <span aria-hidden="true" className={cn('size-2 rounded-full', series.dot)} />
                    {series.label}
                    {series.selected && <Check className="size-3.5" aria-hidden="true" />}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>


      </section>}
      <div id={viewOptionsId} hidden={!viewOptionsOpen}>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
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

          {hasSolar&&!solarOnly && (
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
      </div>

      {/* 4. Main 2-Column Area: SVG Chart (Left) + Inspector & Batch Editor (Right) */}
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {/* Left Column: Interactive SVG Chart */}
        <div className="flex min-w-0 w-full flex-1 flex-col gap-2">
          <div ref={containerRef} data-testid="daily-chart-container" className="relative flex w-full flex-col">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {onSelectRange && <>
                  <div role="group" aria-label="Ferramenta da curva" className="inline-flex rounded-lg border border-border/60 bg-muted/50 p-1">
                    <Button type="button" size="sm" variant="ghost" aria-pressed={!rangeMode} onClick={() => setRangeMode(false)} className={cn('h-9 gap-1.5 rounded-md px-3 text-xs md:h-8', !rangeMode ? 'bg-background text-foreground shadow-xs ring-1 ring-border/70 hover:bg-background' : 'text-muted-foreground')}><Pencil aria-hidden="true" />Editar pontos</Button>
                    <Button type="button" size="sm" variant="ghost" aria-pressed={rangeMode} onClick={() => setRangeMode(true)} className={cn('h-9 gap-1.5 rounded-md px-3 text-xs md:h-8', rangeMode ? 'bg-background text-foreground shadow-xs ring-1 ring-border/70 hover:bg-background' : 'text-muted-foreground')}><ScanLine aria-hidden="true" />Selecionar intervalo</Button>
                  </div>
                </>}
              </div>
              <div className="flex flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant="ghost" aria-expanded={viewOptionsOpen} aria-controls={viewOptionsId} aria-label="Visualização" onClick={()=>setViewOptionsOpen(value=>!value)} className="h-9 gap-1.5 text-xs md:h-8"><SlidersHorizontal aria-hidden="true"/><span className="hidden sm:inline">Visualização</span><ChevronRight className={cn('h-3.5 w-3.5 transition-transform',viewOptionsOpen&&'rotate-90')} aria-hidden="true"/></Button>
          {/* History: Undo / Redo controls */}
          <div
            className="inline-flex items-center rounded-lg border border-border/60 bg-background p-0.5"
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
              className="h-9 w-9 p-0 text-foreground md:h-8 md:w-8"
            >
              <Undo2 className="h-3.5 w-3.5" />

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
              className="h-9 w-9 p-0 text-foreground md:h-8 md:w-8"
            >
              <Redo2 className="h-3.5 w-3.5" />

            </Button>
          </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Ampliar gráfico diário"
                  disabled={visibleSpan <= 4}
                  onClick={() => zoom(0.5)}
                  className="h-9 w-9 p-0 md:h-8 md:w-8"
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
                  className="h-9 w-9 p-0 md:h-8 md:w-8"
                >
                  <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewRange({ start: 0, end: pointCount - 1 })}
                  aria-label="Ver dia inteiro"
                  title="Ver dia inteiro"
                  className="h-9 px-2 text-xs md:h-8"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Ver dia inteiro</span>
                </Button>
              </div>
              </div>
            </div>
            <span role="status" aria-label="Período visível no gráfico diário" className="sr-only">{formatTime(Math.ceil(viewRange.start))}–{formatTime(Math.floor(viewRange.end))} · {1440/pointCount} min ({visibleSpan+1} pontos)</span>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              preserveAspectRatio="none"
              className="h-[320px] min-h-[320px] shrink-0 w-full touch-none select-none rounded-xl border border-border/70 bg-card shadow-xs"
              role="group"
              aria-label={rangeMode ? 'Seleção de intervalo da curva diária — arraste para marcar sem editar' : 'Editor da curva diária — arraste os pontos para ajustar a potência ou o fundo para navegar'}
              onDoubleClick={() => setViewRange({ start: 0, end: pointCount - 1 })}
              onPointerDownCapture={event=>{
                if(!onSelectRange||event.button!==0||(!event.shiftKey&&!rangeMode))return;
                event.preventDefault();event.stopPropagation();
                const startIndex=indexAtClientX(event.clientX,event.currentTarget);
                rangeDragRef.current={startIndex,clientX:event.clientX};
                setRangePreview({startIndex,endIndex:startIndex});
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
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
                if(rangeDragRef.current){
                  const a=rangeDragRef.current.startIndex,b=indexAtClientX(event.clientX,event.currentTarget);
                  setRangePreview({startIndex:Math.min(a,b),endIndex:Math.max(a,b)});return;
                }
                const pan = panRef.current;
                if (!pan) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const delta =
                  ((event.clientX - pan.clientX) * (viewWidth / rect.width) / plotWidth) *
                  (pan.end - pan.start);
                moveView(pan.start - delta, pan.end - pan.start);
              }}
              onPointerUp={(event) => {
                const range=rangeDragRef.current;
                if(range){
                  const end=indexAtClientX(event.clientX,event.currentTarget);
                  const selection={startIndex:Math.min(range.startIndex,end),endIndex:Math.max(range.startIndex,end)};
                  if(Math.abs(event.clientX-range.clientX)>=4){onSelectRange?.(selection);}
                  else onSelectRange?.(null);
                  rangeDragRef.current=null;setRangePreview(null);
                }
                panRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                panRef.current = null;
                rangeDragRef.current=null;setRangePreview(null);
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
                      {toKva(kw).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kVA
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
              <g clipPath={`url(#${gradientId}-clip)`} className="pointer-events-none">
                {(rangePreview?[...selectedRanges.slice(0,1),rangePreview]:selectedRanges).map((range,i)=>{
                  const left=Math.max(MARGIN.left,xToPx(range.startIndex)),right=Math.min(viewWidth-MARGIN.right,xToPx(range.endIndex+1));
                  return right>left?<rect data-testid="daily-interval-band" key={i} x={left} y={MARGIN.top} width={right-left} height={plotHeight} fill={i===0?primary:'#ff9d00'} fillOpacity={0.18}/>:null;
                })}
              </g>
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
                          aria-valuemax={toKva(maxKw)}
                          aria-valuenow={toKva(kw)}
                          aria-valuetext={`${toKva(kw).toFixed(1)} kVA`}
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
                          onLostPointerCapture={handlePointerUp}
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
                              {formatTime(selectedHour)} · {toKva(generationKw![selectedHour]!).toFixed(1)} kVA FV
                            </text>
                          </g>
                        );
                      })()}
                  </g>
                )}

                {!solarOnly&&(showSecondary || !solarSelected) && (
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
                            aria-valuemax={toKva(maxKw)}
                            aria-valuenow={toKva(kw)}
                            aria-valuetext={`${toKva(kw).toFixed(1)} kVA`}
                            onPointerDown={(event) => {
                              handlePointerDown(hour, event);
                            }}
                            onPointerMove={(event) => handlePointerMove(hour, event)}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                          onLostPointerCapture={handlePointerUp}
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
                                    {formatTime(hour)} · {toKva(kw).toFixed(1)} kVA
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
            <span className="inline-flex items-center gap-1">{rangeMode ? 'Arraste para marcar um intervalo' : 'Arraste os pontos para editar'}<InfoTooltip label="Como editar a curva">Clique ou arraste um ponto para ajustar a potência no modo Editar pontos. Ctrl + scroll aplica zoom; arraste o fundo para navegar. No ponto selecionado, use ← e → para mudar de horário; ↑ e ↓ ajustam 1 kVA, ou 5 kVA com Shift. Shift + arraste seleciona sem editar os pontos. No celular, ative Selecionar intervalo e arraste no gráfico. Use a seleção para configurar o backup no painel ao lado.</InfoTooltip></span>

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

        {selectionActions && <aside aria-label="Ações da seleção" className="flex w-full shrink-0 flex-col gap-3 lg:w-[256px]">
          {selectionActions}
        </aside>}
      </div>

      {!solarOnly&&<section aria-label="Resumo energético do dia" className={cn('grid grid-cols-2 gap-3 border-t pt-3',hasSolar&&'sm:grid-cols-4')}>
        <div><p className="text-xs text-muted-foreground">Consumo diário</p><p className="mt-1 text-sm font-semibold tabular-nums">{formatPtNumber(metrics.totalConsumptionKwh,1)} <span className="text-xs font-normal text-muted-foreground">kWh</span></p><p className="mt-0.5 text-xs text-muted-foreground">Média {formatPtNumber(toKva(metrics.avgConsumptionKw),1)} kVA</p></div>
        <div><p className="text-xs text-muted-foreground">Demanda de pico</p><div className="mt-1 flex flex-wrap items-baseline gap-x-2"><span className="text-sm font-semibold tabular-nums">{formatPtNumber(toKva(metrics.peakConsumptionKw),1)} <span className="text-xs font-normal text-muted-foreground">kVA</span></span><button type="button" onClick={()=>selectPoint(metrics.peakConsumptionIndex)} className="rounded text-xs text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">às {formatTime(metrics.peakConsumptionIndex)} →</button></div></div>
        {hasSolar&&<><div><p className="text-xs text-muted-foreground">Geração FV</p><p className="mt-1 text-sm font-semibold tabular-nums">{formatPtNumber(metrics.totalSolarKwh,1)} <span className="text-xs font-normal text-muted-foreground">kWh</span></p><p className="mt-0.5 text-xs text-muted-foreground">Pico {formatPtNumber(toKva(metrics.peakSolarKw),1)} kVA</p></div><div><p className="text-xs text-muted-foreground">Cobertura solar</p><p className="mt-1 text-sm font-semibold tabular-nums">{formatPtNumber(metrics.solarCoveragePercent,1)}%</p><p className="mt-0.5 text-xs text-muted-foreground">Excedente {formatPtNumber(metrics.solarExportKwh,1)} kWh</p></div></>}
      </section>}
      {/* 1. Header with Model Status and Global Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/50">
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
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/30 text-muted-foreground border border-border/50"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              Perfil atual
            </span>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
          {/* Action: Limpar curva */}
          <Button type="button" variant="ghost" size="sm" disabled={solarSelected && !onSolarChange} onClick={handleClearCurve} className="h-9 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive">
            Limpar curva
          </Button>

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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saveModelLimitReached || solarSelected}
                onClick={() => setIsSavingModel(true)}
                className="h-9 gap-1.5 text-xs"
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
              </Button>
            ))}
          {onSaveAsCustomModel && saveModelLimitReached && (
            <span role="status" className="text-xs text-muted-foreground">
              Limite de 5 modelos atingido.
            </span>
          )}
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
