'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronRight, Circle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ChartPopupAction {
  id: string;
  label: string;
  icon?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  submenu?: boolean;
  onSelect: () => void;
}

export function ChartPopupMenu({ x, y, level, title, actions, onBack, onClose, returnFocus }: {
  x: number; y: number; level: string; title: string; actions: ChartPopupAction[];
  onBack?: () => void; onClose: () => void; returnFocus: RefObject<HTMLElement | null>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const width = Math.min(264, window.innerWidth - 16);
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, x));

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, y))}px`;
  }, [y, level, actions.length]);

  useLayoutEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[data-popup-action]:not(:disabled)')?.focus({ preventScroll: true });
  }, [level]);

  useEffect(() => {
    const close = (event: Event) => {
      // Scrolling long menus should keep them open.
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  useEffect(() => {
    const trigger = returnFocus.current;
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [returnFocus]);

  return createPortal(<div className="fixed inset-0 z-[100]" onPointerDown={event => {
    if (event.target === event.currentTarget) { event.preventDefault(); onClose(); }
  }} onContextMenu={event => event.preventDefault()}>
    <div ref={menuRef} role="dialog" aria-modal="true" aria-label={title}
      className="fixed overflow-hidden rounded-xl border border-border bg-card/95 text-foreground shadow-xl backdrop-blur-md"
      style={{ left, top: 8, width, maxHeight: 'calc(100dvh - 16px)' }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = ['ArrowRight', 'ArrowDown'].includes(event.key) || (event.key === 'Tab' && !event.shiftKey)
          ? (index + 1) % buttons.length
          : ['ArrowLeft', 'ArrowUp'].includes(event.key) || (event.key === 'Tab' && event.shiftKey)
            ? (index - 1 + buttons.length) % buttons.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
        if (next !== null) { event.preventDefault(); buttons[next]?.focus(); }
      }}>
      <div className="flex h-11 items-center gap-1 border-b border-border/60 px-2">
        {onBack && <Button type="button" size="icon-sm" variant="ghost" aria-label="Voltar ao menu do gráfico" onClick={onBack}><ArrowLeft aria-hidden="true" /></Button>}
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-semibold">{title}</span>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Fechar menu do gráfico" onClick={onClose}><X aria-hidden="true" /></Button>
      </div>
      <div className="max-h-[calc(100dvh-64px)] overflow-y-auto overscroll-contain p-1">
        {actions.map(action => <button key={action.id} data-popup-action type="button" aria-pressed={action.selected} disabled={action.disabled} aria-haspopup={action.submenu ? 'dialog' : undefined} onClick={action.onSelect}
          className={cn('flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45', action.selected && 'bg-primary/10 text-primary')}>
          <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">{action.icon ?? <Circle />}</span>
          <span className="flex-1">{action.label}</span>
          {action.selected && <Check aria-hidden="true" className="size-4 shrink-0" />}
          {action.submenu && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
        </button>)}
      </div>
    </div>
  </div>, document.body);
}
