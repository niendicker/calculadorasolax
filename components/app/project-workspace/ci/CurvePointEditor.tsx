'use client';

import { useRef, useState } from 'react';
import { useCiAcPower } from './ci-ac-power';
import type { CurvePlotGeometry } from './CurveAnalysisOverlay';
import type { CurvePointEdit } from './weekly-curve-editing';
import type { LoadCurvePoint } from '@/supabase/functions/_shared/commercial-industrial/types';
import { cn } from '@/lib/utils';

export function CurvePointEditor({ geometry: g, points, onEdit, label, timezone, draw = false, selecting = false, onComplete }: {
  geometry: CurvePlotGeometry; points: LoadCurvePoint[]; onEdit: (edits: CurvePointEdit[]) => void; label: string; timezone?: string; draw?: boolean; selecting?: boolean; onComplete?: () => void;
}) {
  const { toKva, fromKva } = useCiAcPower();
  const gesture = useRef<{ edits: Map<number, number>; last: CurvePointEdit; single: number | null } | null>(null);
  const [preview, setPreview] = useState<CurvePointEdit[]>([]);
  if (g.width <= 0 || g.height <= 0 || g.yMax <= g.yMin || g.xMax <= g.xMin) return null;
  const visible = points.map((point, index) => ({ point, index })).filter(({ index }) => index >= Math.ceil(g.xMin) && index <= Math.floor(g.xMax));
  const markerStep = Math.max(1, Math.ceil(visible.length / Math.max(1, Math.floor(g.width / 16))));
  const at = (event: React.PointerEvent<HTMLDivElement>): CurvePointEdit => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      index: Math.max(0, Math.min(points.length - 1, Math.round(g.xMin + (event.clientX - rect.left) / rect.width * (g.xMax - g.xMin)))),
      powerKw: Math.round(Math.max(0, Math.min(g.yMax, g.yMax - (event.clientY - rect.top) / rect.height * (g.yMax - g.yMin))) * 100) / 100,
    };
  };
  const paint = (next: CurvePointEdit) => {
    const current = gesture.current;
    if (!current) return;
    if (current.single !== null) current.edits.set(current.single, next.powerKw);
    else {
      const start = current.last;
      const span = Math.abs(next.index - start.index);
      for (let offset = 0; offset <= span; offset++) {
        const index = start.index + Math.sign(next.index - start.index) * offset;
        current.edits.set(index, Math.round((span ? start.powerKw + (next.powerKw - start.powerKw) * offset / span : next.powerKw) * 100) / 100);
      }
    }
    current.last = next;
    setPreview([...current.edits].map(([index, powerKw]) => ({ index, powerKw })));
  };
  return <div role="group" aria-label={`Edição de ${label}`} className={cn('absolute z-10 touch-none', draw ? 'cursor-crosshair' : 'pointer-events-none')} style={{ left: g.left, top: g.top, width: g.width, height: g.height }}
    onPointerDown={event => {
      if (event.button !== 0 || selecting || (event.shiftKey && !event.ctrlKey)) return;
      event.preventDefault();
      const target = event.target instanceof Element ? event.target.closest('[data-point-index]') : null;
      if (!target && !draw && !(event.ctrlKey && event.shiftKey)) return;
      const next = at(event);
      const single = target && !draw && !(event.ctrlKey && event.shiftKey) ? Number(target.getAttribute('data-point-index')) : null;
      gesture.current = { edits: new Map(), last: next, single };
      event.currentTarget.setPointerCapture(event.pointerId);
      paint(next);
    }}
    onPointerMove={event => { if (gesture.current) paint(at(event)); }}
    onPointerUp={event => {
      if (!gesture.current) return;
      paint(at(event));
      const edits = [...gesture.current.edits].map(([index, powerKw]) => ({ index, powerKw }));
      gesture.current = null; setPreview([]);
      event.currentTarget.releasePointerCapture(event.pointerId);
      onEdit(edits);
      onComplete?.();
    }}
    onPointerCancel={() => { gesture.current = null; setPreview([]); }}
  >
    {visible.map(({ point, index }, position) => {
      const value = preview.find(edit => edit.index === index)?.powerKw ?? point.powerKw;
      const time = new Date(point.timestamp).toLocaleString('pt-BR', { timeZone: timezone, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      return <button key={point.timestamp} type="button" role="slider" data-point-index={index} aria-label={`${label} · ${time}`} aria-valuemin={0} aria-valuemax={toKva(g.yMax)} aria-valuenow={toKva(value)} aria-valuetext={`${toKva(value).toFixed(2)} kVA`} title={`${time} · ${toKva(value).toFixed(2)} kVA`}
        className={cn('pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border-2 border-primary bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', position % markerStep !== 0 && position !== visible.length - 1 && !preview.some(edit=>edit.index===index) && 'pointer-events-none opacity-0 focus:opacity-100', selecting && 'pointer-events-none')}
        style={{ left: (index - g.xMin) / (g.xMax - g.xMin) * g.width, top: (g.yMax - value) / (g.yMax - g.yMin) * g.height }}
        onKeyDown={event => {
          const next = event.key === 'ArrowUp' ? value + fromKva(event.shiftKey ? 5 : 1) : event.key === 'ArrowDown' ? Math.max(0, value - fromKva(event.shiftKey ? 5 : 1)) : null;
          if (next !== null) { event.preventDefault(); onEdit([{ index, powerKw: next }]); }
        }} />;
    })}
  </div>;
}
