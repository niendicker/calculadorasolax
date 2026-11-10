'use client';

// Interactive dispatch & peak shaving chart for C&I results — compares the
// customer's original load curve against the net grid import after BESS
// dispatch, highlighting peak shaving and the contracted demand threshold.
// Built with uPlot for smooth pan/zoom and live crosshair inspection.

import { useCiAcPower } from './ci-ac-power';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BatteryCharging, MoreHorizontal, RefreshCw } from 'lucide-react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Button } from '@/components/ui/button';
import { readCssVar } from '@/lib/utils';
import type { CiRechargeWindow, DispatchPoint } from '@/supabase/functions/_shared/commercial-industrial/types';
import { ChartPopupMenu, type ChartPopupAction } from './ChartPopupMenu';

const CHART_HEIGHT = 260;

export interface CurvePlotGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface CiDispatchChartProps {
  powerFactor?: number;
  generatorPowerFactor?: number;
  dispatch: DispatchPoint[];
  contractedDemandKw?: number;
  rechargeWindow?: CiRechargeWindow | null;
  dischargeWindow?: CiRechargeWindow | null;
}

function parseHHMM(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatDispatchPointLabel(point: DispatchPoint | undefined): string {
  if (!point) return '';
  const date = new Date(point.timestamp);
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  if (date.getHours() === 0 && date.getMinutes() === 0) return weekday;
  return `${weekday} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function dayBoundaryIndices(points: DispatchPoint[]): number[] {
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

function areaFill(primary: string) {
  return (self: uPlot) => {
    const top = Number.isFinite(self.bbox.top) ? self.bbox.top : 0;
    const height = Number.isFinite(self.bbox.height) ? self.bbox.height : CHART_HEIGHT;
    const gradient = self.ctx.createLinearGradient(0, top, 0, top + height);
    gradient.addColorStop(0, `${primary}33`);
    gradient.addColorStop(1, `${primary}05`);
    return gradient;
  };
}

function buildDispatchData(dispatch: DispatchPoint[], factor = 1, generatorFactor = factor): uPlot.AlignedData {
  return [
    dispatch.map((_, index) => index),
    dispatch.map((point) => point.loadKw),
    dispatch.map((point) => point.gridImportKw),
    dispatch.map((point) => point.dischargeKw),
    dispatch.map((point) => point.solarGenerationKw ?? 0),
    dispatch.map((point) => (point.generatorKw ?? 0) * factor / generatorFactor),
  ];
}

function fullXRange(pointsRef: { current: DispatchPoint[] }): [number, number] {
  return [0, Math.max(pointsRef.current.length - 1, 0)];
}

function clampXRange(min: number, max: number, pointsRef: { current: DispatchPoint[] }): [number, number] {
  const [fullMin, fullMax] = fullXRange(pointsRef);
  const range = max - min;
  if (range >= fullMax - fullMin) return [fullMin, fullMax];
  if (min < fullMin) return [fullMin, fullMin + range];
  if (max > fullMax) return [fullMax - range, fullMax];
  return [min, max];
}

function attachPanAndZoom(
  chart: uPlot,
  pointsRef: { current: DispatchPoint[] }
): () => void {
  const over = chart.over;
  const ZOOM_FACTOR = 0.75;
  over.style.cursor = 'grab';

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
    if (!event.ctrlKey || event.deltaY === 0) return;
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

function buildOptions(
  width: number,
  pointsRef: { current: DispatchPoint[] },
  contractedDemandKwRef: { current: number | undefined },
  onZoomChange: (zoomed: boolean) => void,
  onDraw?: (chart: uPlot) => void,
  factor = 1
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
      points: { size: 6, width: 2, stroke: primary, fill: card },
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
          const contracted = contractedDemandKwRef.current;
          const targetMax = contracted && contracted > 0 ? Math.max(dataMax, contracted) : dataMax;
          const maxWithPadding = targetMax > 0 ? targetMax * 1.08 : 10;
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
        splits: (_self, _axisIdx, scaleMin, scaleMax) => {
          const boundaries = dayBoundaryIndices(pointsRef.current).filter((index) => index >= scaleMin && index <= scaleMax);
          return boundaries.length >= 2 ? boundaries : evenlySpacedIndices(scaleMin, scaleMax);
        },
        values: (_self, ticks) => ticks.map((tick) => formatDispatchPointLabel(pointsRef.current[Math.round(tick)])),
      },
      {
        stroke: mutedForeground,
        grid: { stroke: border, width: 1 },
        ticks: { stroke: border, width: 1 },
        gap: 8,
        size: 64,
        font: '12px ui-sans-serif, system-ui, sans-serif',
        values: (_self, ticks) => ticks.map((value) => `${Number((value / factor).toFixed(2))} kVA`),
      },
    ],
    series: [
      {
        value: (_self, rawValue) => formatDispatchPointLabel(pointsRef.current[Math.round(rawValue ?? 0)]),
      },
      {
        label: 'Carga Original',
        stroke: '#94a3b8',
        width: 1.5,
        dash: [4, 4],
        points: { show: false },
        value: (_self, rawValue) => (rawValue == null ? '—' : `${(Number(rawValue) / factor).toFixed(1)} kVA`),
      },
      {
        label: 'Demanda da Rede (com BESS)',
        stroke: primary,
        width: 2,
        fill: areaFill(primary),
        points: { show: false },
        value: (_self, rawValue) => (rawValue == null ? '—' : `${(Number(rawValue) / factor).toFixed(1)} kVA`),
      },
      {
        label: 'Descarga BESS (Corte)',
        stroke: '#16a34a',
        width: 1.5,
        points: { show: false },
        value: (_self, rawValue) => (rawValue == null ? '—' : `${(Number(rawValue) / factor).toFixed(1)} kVA`),
      },
      {
        label: 'Geração Solar FV',
        stroke: '#eab308',
        width: 1.5,
        points: { show: false },
        value: (_self, rawValue) => (rawValue == null ? '—' : `${(Number(rawValue) / factor).toFixed(1)} kVA`),
      },
      {
        label: 'Gerador (GMG)',
        stroke: '#f97316',
        width: 1.5,
        points: { show: false },
        value: (_self, rawValue) => (rawValue == null ? '—' : `${(Number(rawValue) / factor).toFixed(1)} kVA`),
      },
    ],
    hooks: {
      setScale: [
        (self, key) => {
          if (key !== 'x') return;
          const [fullMin, fullMax] = fullXRange(pointsRef);
          const { min, max } = self.scales.x;
          onZoomChange((min ?? fullMin) > fullMin + 0.5 || (max ?? fullMax) < fullMax - 0.5);
          onDraw?.(self);
        },
      ],
      draw: [
        (self) => {
          const top = Number.isFinite(self.bbox.top) ? self.bbox.top : 0;
          const height = Number.isFinite(self.bbox.height) ? self.bbox.height : CHART_HEIGHT;
          const bLeft = Number.isFinite(self.bbox.left) ? self.bbox.left : 0;
          const bWidth = Number.isFinite(self.bbox.width) ? self.bbox.width : self.width;

          const contracted = contractedDemandKwRef.current;
          if (contracted != null && contracted > 0) {
            const yPos = self.valToPos(contracted, 'y', true);
            if (Number.isFinite(yPos) && yPos >= top && yPos <= top + height) {
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
          onDraw?.(self);
        },
      ],
    },
  };
}

function computeActiveDaySlices(points: DispatchPoint[]): { startIndex: number; count: number }[] {
  const slices: { startIndex: number; count: number }[] = [];
  let curStart = 0;
  let curDayKey = '';
  points.forEach((point, idx) => {
    const key = point.timestamp ? point.timestamp.slice(0, 10) : '';
    if (key !== curDayKey && idx > 0) {
      slices.push({ startIndex: curStart, count: idx - curStart });
      curStart = idx;
    }
    curDayKey = key;
  });
  if (points.length > curStart) {
    slices.push({ startIndex: curStart, count: points.length - curStart });
  }
  return slices;
}

export function CiDispatchChart({
  dispatch,
  contractedDemandKw,
  powerFactor,
  generatorPowerFactor,
  rechargeWindow,
  dischargeWindow,
}: CiDispatchChartProps) {
  const { factor } = useCiAcPower(powerFactor);
  const generatorFactor = generatorPowerFactor ?? factor;

  const [selectedDayIndex, setSelectedDayIndex] = useState<number | 'all'>('all');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const [geometry, setGeometry] = useState<CurvePlotGeometry>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
  });

  // Group points into days
  const dayGroups = useMemo(() => {
    const groups: { label: string; points: DispatchPoint[] }[] = [];
    let currentGroup: DispatchPoint[] = [];
    let currentDayKey = '';

    dispatch.forEach((point) => {
      const dayKey = point.timestamp ? point.timestamp.slice(0, 10) : '';
      if (dayKey !== currentDayKey && currentGroup.length > 0) {
        const date = new Date(currentGroup[0].timestamp);
        const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        const dayNum = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        groups.push({ label: `${weekday} (${dayNum})`, points: currentGroup });
        currentGroup = [];
      }
      currentDayKey = dayKey;
      currentGroup.push(point);
    });
    if (currentGroup.length > 0) {
      const date = new Date(currentGroup[0].timestamp);
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const dayNum = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      groups.push({ label: `${weekday} (${dayNum})`, points: currentGroup });
    }
    return groups;
  }, [dispatch]);

  const activePoints = useMemo(() => {
    return selectedDayIndex === 'all' || !dayGroups[selectedDayIndex]
      ? dispatch
      : dayGroups[selectedDayIndex].points;
  }, [selectedDayIndex, dayGroups, dispatch]);

  const pointsRef = useRef(activePoints);
  const contractedDemandKwRef = useRef(contractedDemandKw);
  const isInitialContractMountRef = useRef(true);
  const skipNextPointsEffectRef = useRef(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [resetZoomTrigger, setResetZoomTrigger] = useState(0);

  const updateGeometry = useCallback((chart?: uPlot | null) => {
    const activeChart = chart ?? chartRef.current;
    const container = containerRef.current;
    if (!activeChart || !container) return;
    const rect = activeChart.over ? activeChart.over.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const parent = container.getBoundingClientRect();
    const width = rect.width || activeChart.bbox?.width || container.clientWidth || 600;
    const height = rect.height || activeChart.bbox?.height || CHART_HEIGHT;
    const nextLeft = rect.left && parent.left ? rect.left - parent.left : 0;
    const nextTop = rect.top && parent.top ? rect.top - parent.top : 0;
    const nextXMin = activeChart.scales.x?.min ?? 0;
    const nextXMax = activeChart.scales.x?.max ?? Math.max(pointsRef.current.length - 1, 1);
    const nextYMin = activeChart.scales.y?.min ?? 0;
    const nextYMax = activeChart.scales.y?.max ?? 100;

    setGeometry((prev) => {
      if (
        prev.left === nextLeft &&
        prev.top === nextTop &&
        prev.width === width &&
        prev.height === height &&
        prev.xMin === nextXMin &&
        prev.xMax === nextXMax &&
        prev.yMin === nextYMin &&
        prev.yMax === nextYMax
      ) {
        return prev;
      }
      return {
        left: nextLeft,
        top: nextTop,
        width,
        height,
        xMin: nextXMin,
        xMax: nextXMax,
        yMin: nextYMin,
        yMax: nextYMax,
      };
    });
  }, []);

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

  useEffect(() => {
    if (resetZoomTrigger === 0) return;
    const chart = chartRef.current;
    if (!chart) return;
    chart.setScale('x', { min: 0, max: Math.max(activePoints.length - 1, 0) });
  }, [resetZoomTrigger, activePoints.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || pointsRef.current.length === 0) return;

    pointsRef.current = activePoints;
    const options = buildOptions(el.clientWidth || 600, pointsRef, contractedDemandKwRef, setIsZoomed, updateGeometry, factor);
    const chart = new uPlot(options, buildDispatchData(pointsRef.current, factor, generatorFactor), el);
    chartRef.current = chart;
    updateGeometry(chart);
    skipNextPointsEffectRef.current = true;
    const detachPanAndZoom = attachPanAndZoom(chart, pointsRef);

    return () => {
      detachPanAndZoom();
      chart.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factor, generatorFactor, updateGeometry]);

  useEffect(() => {
    pointsRef.current = activePoints;
    if (skipNextPointsEffectRef.current) {
      skipNextPointsEffectRef.current = false;
      return;
    }
    const chart = chartRef.current;
    if (!chart) return;

    chart.setData(buildDispatchData(activePoints, factor, generatorFactor));
    if (chart.scales.x?.min == null) {
      const [min, max] = fullXRange(pointsRef);
      chart.setScale('x', { min, max });
    } else {
      chart.redraw(true, true);
    }
    updateGeometry(chart);
  }, [activePoints, factor, generatorFactor, updateGeometry]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (chartRef.current && el.clientWidth > 0) {
        chartRef.current.setSize({ width: el.clientWidth, height: CHART_HEIGHT });
        updateGeometry(chartRef.current);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateGeometry]);

  const handleResetZoom = useCallback(() => {
    setResetZoomTrigger((prev) => prev + 1);
    setMenu(null);
  }, []);

  if (dispatch.length === 0) return null;

  const activeSlices = computeActiveDaySlices(activePoints);

  const popupActions: ChartPopupAction[] = [];
  if (isZoomed) {
    popupActions.push({
      id: 'reset-zoom',
      label: 'Redefinir zoom',
      icon: <RefreshCw className="h-4 w-4" aria-hidden="true" />,
      onSelect: handleResetZoom,
    });
  }

  const toX = (index: number) => {
    if (geometry.xMax <= geometry.xMin || geometry.width <= 0) return 0;
    return ((index - geometry.xMin) / (geometry.xMax - geometry.xMin)) * geometry.width;
  };

  return (
    <div className="space-y-2">
      {/* Day selector tabs */}
      {dayGroups.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Exibição:</span>
          <button
            type="button"
            onClick={() => setSelectedDayIndex('all')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedDayIndex === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Semana Completa
          </button>
          {dayGroups.map((group, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedDayIndex(idx)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors capitalize ${
                selectedDayIndex === idx
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {group.label}
            </button>
          ))}
        </div>
      )}

      {/* Summary badges when active */}
      {(rechargeWindow || dischargeWindow) && (
        <div className="flex flex-wrap items-center gap-2">
          {rechargeWindow && (
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-900 dark:text-emerald-200">
              <BatteryCharging className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>
                Carga permitida: <strong>{rechargeWindow.start}</strong> às <strong>{rechargeWindow.end}</strong>
              </span>
            </div>
          )}
          {dischargeWindow && (
            <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-900 dark:text-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                Descarga (Ponta): <strong>{dischargeWindow.start}</strong> às <strong>{dischargeWindow.end}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <div ref={containerRef} className="w-full [&_.u-legend]:text-xs [&_.u-legend]:text-muted-foreground" />

        {/* Options popup menu button */}
        {popupActions.length > 0 && (
          <Button
            ref={menuTriggerRef}
            data-popup-trigger
            type="button"
            size="icon-sm"
            variant="outline"
            className="absolute right-2 top-2 z-40 rounded-full bg-card/90 shadow-sm backdrop-blur-md"
            aria-label="Opções do gráfico de despacho"
            aria-haspopup="dialog"
            aria-expanded={Boolean(menu)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}

        {/* Visual Recharge & Discharge Overlays */}
        {(rechargeWindow || dischargeWindow) && geometry.width > 0 && (
          <div
            className="pointer-events-none absolute z-20"
            style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height }}
          >
            {activeSlices.map((slice, sliceIdx) => {
              const renderWindow = (win: CiRechargeWindow, colorBorder: string, colorBg: string, labelPrefix: string, topOffset: number) => {
                const startMinute = parseHHMM(win.start);
                const endMinute = parseHHMM(win.end);
                const fracStart = slice.startIndex + (startMinute / 1440) * slice.count;
                const fracEnd = slice.startIndex + (endMinute / 1440) * slice.count;
                const xStart = toX(fracStart);
                const xEnd = toX(fracEnd);
                const xDayStart = toX(slice.startIndex);
                const xDayEnd = toX(slice.startIndex + slice.count);

                return (
                  <div key={labelPrefix} className="absolute inset-0 pointer-events-none">
                    {startMinute <= endMinute ? (
                      (() => {
                        const bandLeft = Math.max(0, xStart);
                        const bandRight = Math.min(geometry.width, xEnd);
                        if (bandRight <= bandLeft) return null;
                        return (
                          <div
                            className={`absolute inset-y-0 ${colorBg} pointer-events-none`}
                            style={{ left: bandLeft, width: bandRight - bandLeft }}
                          />
                        );
                      })()
                    ) : (
                      <>
                        {(() => {
                          const bandLeft = Math.max(0, xStart);
                          const bandRight = Math.min(geometry.width, xDayEnd);
                          if (bandRight <= bandLeft) return null;
                          return (
                            <div
                              className={`absolute inset-y-0 ${colorBg} pointer-events-none`}
                              style={{ left: bandLeft, width: bandRight - bandLeft }}
                            />
                          );
                        })()}
                        {(() => {
                          const bandLeft = Math.max(0, xDayStart);
                          const bandRight = Math.min(geometry.width, xEnd);
                          if (bandRight <= bandLeft) return null;
                          return (
                            <div
                              className={`absolute inset-y-0 ${colorBg} pointer-events-none`}
                              style={{ left: bandLeft, width: bandRight - bandLeft }}
                            />
                          );
                        })()}
                      </>
                    )}

                    {sliceIdx === 0 && xStart >= -4 && xStart <= geometry.width + 4 && (
                      <div className={`absolute inset-y-0 border-l-2 border-dashed ${colorBorder} z-30`} style={{ left: xStart }}>
                        <span
                          style={{ top: topOffset, transform: 'translateX(-50%)' }}
                          className="absolute whitespace-nowrap rounded border border-border/60 bg-card/90 px-1.5 py-0.5 text-[9px] font-medium shadow-xs"
                        >
                          {labelPrefix} {win.start}
                        </span>
                      </div>
                    )}

                    {sliceIdx === 0 && xEnd >= -4 && xEnd <= geometry.width + 4 && (
                      <div className={`absolute inset-y-0 border-l-2 border-dashed ${colorBorder} z-30`} style={{ left: xEnd }}>
                        <span
                          style={{ top: topOffset + 18, transform: 'translateX(-50%)' }}
                          className="absolute whitespace-nowrap rounded border border-border/60 bg-card/90 px-1.5 py-0.5 text-[9px] font-medium shadow-xs"
                        >
                          Fim {win.end}
                        </span>
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div key={sliceIdx} className="absolute inset-0 pointer-events-none">
                  {rechargeWindow && renderWindow(rechargeWindow, 'border-emerald-500/70', 'bg-emerald-500/10 dark:bg-emerald-500/15', 'Carga', 8)}
                  {dischargeWindow && renderWindow(dischargeWindow, 'border-amber-500/70', 'bg-amber-500/10 dark:bg-amber-500/15', 'Descarga', 44)}
                </div>
              );
            })}
          </div>
        )}

        {isZoomed && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="absolute right-12 top-2 z-40 bg-card/90 shadow-xs backdrop-blur-md"
            onClick={handleResetZoom}
          >
            <RefreshCw className="h-3 w-3 mr-1" aria-hidden="true" />
            Redefinir zoom
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Arraste para navegar · Ctrl + scroll para zoom
      </p>

      {/* Popup Menu */}
      {menu && (
        <ChartPopupMenu
          x={menu.x}
          y={menu.y}
          level="main"
          title="Opções do gráfico"
          actions={popupActions}
          onClose={() => setMenu(null)}
          returnFocus={menuTriggerRef}
        />
      )}
    </div>
  );
}
