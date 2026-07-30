import type { DragEvent } from 'react';
import type { LoadPhase, SingleLoad } from '@/lib/types';

export const MINE_FILTER = '__mine__';

/** Backup's shared operation-time field is capped at half a day — long
 * enough for any realistic outage window this app sizes for. */
export const MAX_OPERATION_HOURS = 12;

/** A trifásica load draws from all three phases, so it's always "related" to
 * every phase; a mono load is related only to the phase(s) it's wired to. */
export function loadMatchesPhase(load: SingleLoad, phase: LoadPhase): boolean {
  if ((load.phaseType ?? 'mono') === 'trifasica') return true;
  return (load.phase ?? 'L1') === phase || load.phase2 === phase;
}

export function newLoad(partial: Omit<SingleLoad, 'id' | 'ipInRatio'> & { ipInRatio?: number }): SingleLoad {
  return { ipInRatio: 1, usageFactor: 1, voltageV: 220, phaseType: 'mono', phase: 'L1', ...partial, id: crypto.randomUUID() };
}

/** Native HTML5 drag renders a full screenshot of the dragged element by
 * default, which is a lot of visual noise for a small drag-to-reconnect
 * gesture. This swaps it for a small pill (move icon + load name) instead —
 * built as a plain DOM node since `setDragImage` needs a rendered element at
 * the moment `dragstart` fires, not a React node. */
export function setDragPreview(event: DragEvent, label: string) {
  const preview = document.createElement('div');
  preview.style.cssText = [
    'position:fixed',
    'top:-1000px',
    'left:-1000px',
    'display:flex',
    'align-items:center',
    'gap:6px',
    'padding:6px 10px',
    'border-radius:var(--radius-lg)',
    'border:1px solid var(--border)',
    'background:var(--popover)',
    'color:var(--popover-foreground)',
    'box-shadow:0 1px 3px rgb(0 0 0 / 0.2)',
    'font-family:var(--font-geist, sans-serif)',
    'font-size:12px',
    'font-weight:600',
    'white-space:nowrap',
  ].join(';');
  preview.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/></svg>';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  preview.appendChild(labelEl);
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 12, 12);
  requestAnimationFrame(() => preview.remove());
}
