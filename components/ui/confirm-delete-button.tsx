'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmDeleteButtonProps {
  ariaLabel: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  icon?: React.ReactNode;
  /** When set, the trigger renders as a labeled button instead of an icon-only one. */
  label?: string;
  disabled?: boolean;
  onConfirm: () => void;
}

export function ConfirmDeleteButton({
  ariaLabel,
  title = 'Confirmar exclusão',
  description = 'Essa ação não pode ser desfeita.',
  confirmLabel = 'Excluir',
  icon,
  label,
  disabled,
  onConfirm,
}: ConfirmDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function openWithDelay() {
    if (disabled) return;
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), 300);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    const popRect = popoverRef.current?.getBoundingClientRect();
    if (!rect || !popRect) return;

    const gap = 8;
    const margin = 12;

    let left = rect.right - popRect.width;
    left = Math.min(Math.max(margin, left), window.innerWidth - popRect.width - margin);

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let top = spaceBelow >= popRect.height || spaceBelow >= spaceAbove
      ? rect.bottom + gap
      : rect.top - gap - popRect.height;
    top = Math.min(Math.max(margin, top), window.innerHeight - popRect.height - margin);

    setPosition({ top, left });
  }, [open]);

  function closeWithDelay() {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(false), 300);
  }

  function closeNow() {
    clearTimer();
    setOpen(false);
  }

  function confirm() {
    closeNow();
    onConfirm();
  }

  function closeOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      closeWithDelay();
    }
  }

  useEffect(() => {
    // Gates the createPortal call below until after client mount — document
    // doesn't exist during SSR, so this can't be a lazy useState initializer
    // without causing a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    return clearTimer;
  }, []);

  return (
    <div className="relative inline-flex">
      <Button
        ref={triggerRef}
        type="button"
        variant="destructive"
        size={label ? 'sm' : 'icon-sm'}
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onMouseEnter={openWithDelay}
        onMouseLeave={closeWithDelay}
        onFocus={openWithDelay}
        onBlur={closeWithDelay}
        onClick={openWithDelay}
      >
        {icon ?? <Trash2 className="h-4 w-4" />}
        {label}
      </Button>

      {open && mounted && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={title}
          className="fixed z-[1000] w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
          style={{ top: position.top, left: position.left, visibility: position.top === 0 && position.left === 0 ? 'hidden' : 'visible' }}
          onMouseEnter={openWithDelay}
          onMouseLeave={closeWithDelay}
          onBlur={closeOnBlur}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Fechar confirmação" onClick={closeNow}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeNow}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={confirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
