'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmDeleteButtonProps {
  ariaLabel: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  disabled?: boolean;
  onConfirm: () => void;
}

export function ConfirmDeleteButton({
  ariaLabel,
  title = 'Confirmar exclusão',
  description = 'Essa ação não pode ser desfeita.',
  confirmLabel = 'Excluir',
  disabled,
  onConfirm,
}: ConfirmDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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
    timerRef.current = setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const width = 256;
        const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
        setPosition({ top: rect.bottom + 8, left });
      }
      setOpen(true);
    }, 300);
  }

  function closeWithDelay() {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(false), 300);
  }

  function confirm() {
    clearTimer();
    setOpen(false);
    onConfirm();
  }

  function closeOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      closeWithDelay();
    }
  }

  useEffect(() => {
    setMounted(true);
    return clearTimer;
  }, []);

  return (
    <div className="relative inline-flex">
      <Button
        ref={triggerRef}
        type="button"
        variant="destructive"
        size="icon-sm"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onMouseEnter={openWithDelay}
        onMouseLeave={closeWithDelay}
        onFocus={openWithDelay}
        onBlur={closeWithDelay}
        onClick={openWithDelay}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {open && mounted && createPortal(
        <div
          role="dialog"
          aria-label={title}
          className="fixed z-[1000] w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
          style={{ top: position.top, left: position.left }}
          onMouseEnter={openWithDelay}
          onMouseLeave={closeWithDelay}
          onBlur={closeOnBlur}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Fechar confirmação" onClick={closeWithDelay}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeWithDelay}>
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
