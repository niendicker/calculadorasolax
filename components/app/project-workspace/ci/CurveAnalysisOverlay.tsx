'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CurveRangeSelection } from './LoadCurveChart';
import { adjustCurveRange, measureAboveReference } from './curve-analysis';
import { useCiAcPower } from './ci-ac-power';

export interface CurvePlotGeometry {
  left: number; top: number; width: number; height: number;
  xMin: number; xMax: number; yMin: number; yMax: number;
}

export function CurveAnalysisOverlay({ geometry, ranges, length, onRangeChange, referenceKw, onReferenceChange, onReferenceDragChange, rangeStep = 1, endAtBinBoundary = false, formatIndex }: {
  geometry: CurvePlotGeometry;
  ranges: { range: CurveRangeSelection; label: string }[];
  length: number;
  rangeStep?: number;
  endAtBinBoundary?: boolean;
  onRangeChange?: (index: number, range: CurveRangeSelection) => void;
  referenceKw?: number;
  onReferenceChange?: (kw: number) => void;
  onReferenceDragChange?: (dragging: boolean) => void;
  formatIndex: (index: number) => string;
}) {
  const { toKva, fromKva } = useCiAcPower();
  const [originalValue, setOriginalValue] = useState<number | CurveRangeSelection | null>(null);
  const g = geometry;
  if (g.width <= 0 || g.height <= 0 || g.xMax <= g.xMin || g.yMax <= g.yMin) return null;
  const latestRange = ranges.at(-1)?.range;
  const referenceOnLeft = latestRange && (latestRange.startIndex + latestRange.endIndex) / 2 < length / 2;
  const x = (index: number) => (index - g.xMin) / (g.xMax - g.xMin) * g.width;
  const indexAt = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
    return Math.round(g.xMin + (event.clientX - rect.left) / rect.width * (g.xMax - g.xMin));
  };
  const powerAt = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
    return Math.max(0, Math.min(g.yMax, g.yMax - (event.clientY - rect.top) / rect.height * (g.yMax - g.yMin)));
  };
  const begin = (event: React.PointerEvent<HTMLButtonElement>, value: number | CurveRangeSelection) => {
    event.preventDefault(); event.stopPropagation();
    setOriginalValue(value);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const end = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setOriginalValue(null);
  };
  return <div className="pointer-events-none absolute z-20" style={{ left: g.left, top: g.top, width: g.width, height: g.height }}>
    {onRangeChange && ranges.flatMap(({ range, label }, index) => (['startIndex', 'endIndex'] as const).map(edge => {
      const value = range[edge];
      if (value < g.xMin || value > g.xMax) return null;
      const isCarga = label.toLowerCase().includes('carga');
      const isDescarga = label.toLowerCase().includes('descarga');
      const preposition = label.toLowerCase().startsWith('o') || label.toLowerCase().startsWith('período') ? 'do' : 'da';
      const name = `${edge === 'startIndex' ? 'Início' : 'Fim'} ${preposition} ${label}`;
      return <div key={`${label}-${edge}`} className={cn('absolute inset-y-0 border-l border-dashed', isCarga ? 'border-emerald-500/80' : isDescarga ? 'border-amber-500/80' : 'border-foreground/40')} style={{ left: x(endAtBinBoundary && edge === 'endIndex' ? Math.min(value + 1, g.xMax) : value) }}>
        <button type="button" role="slider" aria-label={name} aria-orientation="horizontal" aria-valuemin={edge === 'endIndex' ? range.startIndex : 0} aria-valuemax={edge === 'startIndex' ? range.endIndex : length - 1} aria-valuenow={value} aria-valuetext={formatIndex(value)} title={`${name}: ${formatIndex(value)} · arraste para ajustar`}
          style={{ bottom: index * 28 + 4, transform: range.startIndex === range.endIndex ? (edge === 'startIndex' ? 'translateX(-100%)' : 'none') : 'translateX(-50%)' }}
          className={cn(
            'pointer-events-auto absolute touch-none cursor-ew-resize whitespace-nowrap rounded border px-1.5 py-1 text-[10px] font-semibold shadow-sm backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isCarga ? 'border-emerald-600 bg-card/95 text-emerald-700 dark:text-emerald-300' : isDescarga ? 'border-amber-600 bg-card/95 text-amber-700 dark:text-amber-300' : 'border-border bg-card/90'
          )}
          onPointerDown={event => begin(event, range)}
          onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) onRangeChange(index, adjustCurveRange(range, edge, indexAt(event) - (endAtBinBoundary && edge === 'endIndex' ? 1 : 0), length)); }}
          onPointerUp={end}
          onPointerCancel={event => { if (originalValue && typeof originalValue !== 'number') onRangeChange(index, originalValue); end(event); }}
          onKeyDown={event => {
            const step = rangeStep * (event.shiftKey ? 4 : 1);
            const next = event.key === 'ArrowLeft' ? value - step : event.key === 'ArrowRight' ? value + step : event.key === 'Home' ? 0 : event.key === 'End' ? length - 1 : null;
            if (next !== null) { event.preventDefault(); event.stopPropagation(); onRangeChange(index, adjustCurveRange(range, edge, next, length)); }
          }}
        >{edge === 'startIndex' ? '⟨' : ''} {label.replace(/^período\s+/i, '')} {edge === 'endIndex' ? '⟩' : ''}</button>
      </div>;
    }))}
    {referenceKw !== undefined && onReferenceChange && <div className="absolute inset-x-0 border-t border-dashed border-primary" style={{ top: (g.yMax - referenceKw) / (g.yMax - g.yMin) * g.height }}>
      <button type="button" role="slider" aria-label="Linha de referência" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={toKva(g.yMax)} aria-valuenow={toKva(referenceKw)} aria-valuetext={`${toKva(referenceKw).toFixed(2)} kVA`}
        style={referenceOnLeft ? { left: 4 } : { right: 4 }} className="pointer-events-auto absolute -translate-y-1/2 touch-none cursor-ns-resize rounded border border-primary/40 bg-card/85 px-2 py-1 text-[10px] font-semibold text-primary shadow-sm backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerDown={event => { begin(event, referenceKw); onReferenceDragChange?.(true); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) onReferenceChange(powerAt(event)); }}
        onPointerUp={event => { end(event); onReferenceDragChange?.(false); }}
        onLostPointerCapture={() => onReferenceDragChange?.(false)}
        onPointerCancel={event => { if (typeof originalValue === 'number') onReferenceChange(originalValue); end(event); onReferenceDragChange?.(false); }}
        onKeyDown={event => {
          const step = fromKva(event.shiftKey ? 5 : 1);
          const next = event.key === 'ArrowUp' ? referenceKw + step : event.key === 'ArrowDown' ? referenceKw - step : null;
          if (next !== null) { event.preventDefault(); onReferenceChange(Math.max(0, next)); }
        }}
      >Referência · {toKva(referenceKw).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kVA ↕</button>
    </div>}
  </div>;
}

export function CurveReferenceReadout({ values, referenceKw, resolutionMinutes, selected }: {
  values: number[]; referenceKw?: number; resolutionMinutes: number; selected: boolean;
}) {
  const { toKva } = useCiAcPower();
  if (referenceKw === undefined) return null;
  const result = measureAboveReference(values, referenceKw, resolutionMinutes);
  const format = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return <div role="status" aria-label="Medições acima da referência" className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 px-3 py-2 text-xs tabular-nums text-muted-foreground">
    <span className="font-medium text-foreground">{selected ? 'Seleção' : 'Curva inteira'} · acima da referência</span>
    <span>{format(result.minutes)} min</span><span>Excedente máximo {format(toKva(result.peakKw))} kVA</span><span>Energia excedente {format(result.energyKwh)} kWh</span>
  </div>;
}
