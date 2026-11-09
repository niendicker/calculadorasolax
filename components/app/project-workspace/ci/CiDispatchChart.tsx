'use client';

// Interactive dispatch & peak shaving chart for C&I results — compares the
// customer's original load curve against the net grid import after BESS
// dispatch, highlighting peak shaving and the contracted demand threshold.
// Built with uPlot for smooth pan/zoom and live crosshair inspection.

import { useCiAcPower } from './ci-ac-power';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Button } from '@/components/ui/button';
import { readCssVar } from '@/lib/utils';
import type { DispatchPoint } from '@/supabase/functions/_shared/commercial-industrial/types';

const CHART_HEIGHT = 260;

export interface CiDispatchChartProps {
  powerFactor?: number;
  generatorPowerFactor?: number;
  dispatch: DispatchPoint[];
  contractedDemandKw?: number;
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
        },
      ],
    },
  };
}

export function CiDispatchChart({ dispatch, contractedDemandKw, powerFactor, generatorPowerFactor }: CiDispatchChartProps) {
  const { factor } = useCiAcPower(powerFactor);
  const generatorFactor = generatorPowerFactor ?? factor;

  const [selectedDayIndex, setSelectedDayIndex] = useState<number | 'all'>('all');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);

  // Group points into days (using day boundary or 00:00 marks, or by date string)
  const dayGroups: { label: string; points: DispatchPoint[] }[] = [];
  let currentGroup: DispatchPoint[] = [];
  let currentDayKey = '';

  dispatch.forEach((point) => {
    const dayKey = point.timestamp ? point.timestamp.slice(0, 10) : '';
    if (dayKey !== currentDayKey && currentGroup.length > 0) {
      const date = new Date(currentGroup[0].timestamp);
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const dayNum = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      dayGroups.push({ label: `${weekday} (${dayNum})`, points: currentGroup });
      currentGroup = [];
    }
    currentDayKey = dayKey;
    currentGroup.push(point);
  });
  if (currentGroup.length > 0) {
    const date = new Date(currentGroup[0].timestamp);
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const dayNum = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    dayGroups.push({ label: `${weekday} (${dayNum})`, points: currentGroup });
  }

  const activePoints = selectedDayIndex === 'all' || !dayGroups[selectedDayIndex]
    ? dispatch
    : dayGroups[selectedDayIndex].points;

  const pointsRef = useRef(activePoints);
  const contractedDemandKwRef = useRef(contractedDemandKw);
  const isInitialContractMountRef = useRef(true);
  const skipNextPointsEffectRef = useRef(false);
  const [isZoomed, setIsZoomed] = useState(false);

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
    const el = containerRef.current;
    if (!el || pointsRef.current.length === 0) return;

    // A new study may change both FP and dispatch in the same render.
    pointsRef.current = activePoints;
    const options = buildOptions(el.clientWidth || 600, pointsRef, contractedDemandKwRef, setIsZoomed, factor);
    const chart = new uPlot(options, buildDispatchData(pointsRef.current, factor, generatorFactor), el);
    chartRef.current = chart;
    skipNextPointsEffectRef.current = true;
    const detachPanAndZoom = attachPanAndZoom(chart, pointsRef);

    return () => {
      detachPanAndZoom();
      chart.destroy();
      chartRef.current = null;
    };
    // The data effect keeps ordinary edits in the existing chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factor, generatorFactor]);

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
  }, [activePoints, factor, generatorFactor]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (chartRef.current && el.clientWidth > 0) {
        chartRef.current.setSize({ width: el.clientWidth, height: CHART_HEIGHT });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (dispatch.length === 0) return null;

  return (
    <div className="space-y-2">
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

      <div className="relative">
        <div ref={containerRef} className="w-full [&_.u-legend]:text-xs [&_.u-legend]:text-muted-foreground" />
        {isZoomed && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="absolute right-0 top-0 bg-card"
            onClick={() => chartRef.current?.setScale('x', { min: 0, max: Math.max(activePoints.length - 1, 0) })}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Redefinir zoom
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Arraste para navegar · Ctrl + scroll para zoom · duplo clique para redefinir
      </p>
    </div>
  );
}
