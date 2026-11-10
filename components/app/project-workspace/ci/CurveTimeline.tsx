'use client';

import { useRef } from 'react';
import type { CiCurveDay } from './ci-curve-days';
import type { CurveRangeSelection } from './LoadCurveChart';

export function curveDayLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function CurveTimeline({ days, length, range, onChange }: {
  days: CiCurveDay[]; length: number; range: CurveRangeSelection; onChange: (range: CurveRangeSelection) => void;
}) {
  const drag = useRef<{ x: number; range: CurveRangeSelection; kind: 'move' | 'start' | 'end' } | null>(null);
  const maximum = Math.max(1, length - 1);
  const update = (startIndex: number, endIndex: number) => onChange({ startIndex: Math.max(0, startIndex), endIndex: Math.min(maximum, endIndex) });
  return <div className="space-y-1.5" aria-label="Linha do tempo da curva">
    <div className="relative h-12 touch-none overflow-hidden rounded-lg border border-border bg-muted/30"
      onPointerMove={event => {
        const gesture = drag.current;
        if (!gesture) return;
        const delta = (event.clientX - gesture.x) / event.currentTarget.getBoundingClientRect().width * maximum;
        const { startIndex: start, endIndex: end } = gesture.range;
        if (gesture.kind === 'move') { const offset = Math.max(-start, Math.min(maximum - end, delta)); update(start + offset, end + offset); }
        else if (gesture.kind === 'start') update(Math.min(end - 1, Math.max(0, start + delta)), end);
        else update(start, Math.max(start + 1, Math.min(maximum, end + delta)));
      }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { if (drag.current) onChange(drag.current.range); drag.current = null; }}
    >
      <div className="absolute inset-0 flex" aria-hidden="true">{days.map(day => <div key={day.date} className="flex min-w-0 items-center justify-center border-r border-border/60 px-0.5 text-[10px] text-muted-foreground last:border-0" style={{ width: `${day.indices.length / length * 100}%` }}><span className="truncate">{curveDayLabel(day.date)}</span></div>)}</div>
      <div className="absolute inset-y-0 rounded border border-primary/60 bg-primary/10" style={{ left: `${range.startIndex / maximum * 100}%`, width: `${(range.endIndex - range.startIndex) / maximum * 100}%` }}>
        {(['move', 'start', 'end'] as const).map(kind => <button key={kind} type="button" role="slider" aria-label={kind === 'move' ? 'Mover janela do tempo' : kind === 'start' ? 'Início da janela do tempo' : 'Fim da janela do tempo'} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={kind === 'end' ? range.endIndex : range.startIndex}
          className={kind === 'move' ? 'absolute inset-0 cursor-grab focus-visible:ring-2 focus-visible:ring-ring' : `absolute inset-y-0 w-3 cursor-ew-resize rounded bg-primary/60 focus-visible:ring-2 focus-visible:ring-ring ${kind === 'start' ? 'left-0' : 'right-0'}`}
          onPointerDown={event => { event.preventDefault(); drag.current = { x: event.clientX, range, kind }; event.currentTarget.parentElement!.parentElement!.setPointerCapture(event.pointerId); }}
          onKeyDown={event => {
            const step = event.shiftKey ? Math.max(1, Math.round(length / days.length)) : 1;
            const delta = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
            if (!delta) return;
            event.preventDefault();
            if (kind === 'move') { const offset = Math.max(-range.startIndex, Math.min(maximum - range.endIndex, delta)); update(range.startIndex + offset, range.endIndex + offset); }
            else if (kind === 'start') update(Math.min(range.endIndex - 1, Math.max(0, range.startIndex + delta)), range.endIndex);
            else update(range.startIndex, Math.max(range.startIndex + 1, range.endIndex + delta));
          }} />)}
      </div>
    </div>
    <p className="text-[11px] text-muted-foreground">Arraste a janela para navegar e as bordas para ajustar o zoom.</p>
  </div>;
}
