'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
  /** Visual weight of the trigger button. Defaults to "destructive" (red) —
   * pass "outline" for actions that need a confirm step but shouldn't draw
   * as much attention as a delete (e.g. a header "Limpar" reset). */
  triggerVariant?: 'destructive' | 'outline';
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
  triggerVariant = 'destructive',
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
        variant={triggerVariant}
        size={label ? 'sm' : 'icon-sm'}
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
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

interface ConfirmDeleteModalButtonProps {
  ariaLabel: string;
  itemName: string;
  itemType?: string;
  label?: string;
  title?: string;
  confirmLabel?: string;
  triggerVariant?: 'destructive' | 'outline';
  icon?: React.ReactNode;
  disabled?: boolean;
  showIcon?: boolean;
  description?: string;
  onConfirm: () => Promise<void> | void;
}

/** Modal confirmation variant for destructive actions that need a deliberate
 * decision. The legacy ConfirmDeleteButton above remains a popover because
 * other screens still use that interaction pattern. */
export function ConfirmDeleteModalButton({
  ariaLabel,
  itemName,
  itemType = 'produto',
  label = 'Excluir',
  title,
  confirmLabel,
  triggerVariant = 'destructive',
  icon,
  disabled = false,
  showIcon = true,
  description,
  onConfirm,
}: ConfirmDeleteModalButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const close = useCallback(() => {
    if (saving) return;
    setOpen(false);
    setError(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [saving]);

  useEffect(() => {
    if (!open) return;

    function getFocusableElements() {
      return Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => cancelRef.current?.focus());
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, open, saving]);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    } catch (caughtError) {
      setSaving(false);
      setError(caughtError instanceof Error ? caughtError.message : `Não foi possível excluir ${itemType}. Tente novamente.`);
    }
  }

  return (
    <div className="relative inline-flex">
      <Button
        ref={triggerRef}
        type="button"
        variant={triggerVariant}
        size="sm"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => { setError(null); setOpen(true); }}
      >
        {showIcon && (icon ?? <Trash2 className="h-4 w-4" aria-hidden="true" />)}
        {label}
      </Button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4"
          aria-hidden={false}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="w-full max-w-md rounded-xl border bg-card p-5 text-card-foreground shadow-2xl"
          >
            <h2 id={titleId} className="text-base font-semibold">{title ?? `Excluir ${itemType}?`}</h2>
            <p id={descriptionId} className="mt-2 text-sm leading-5 text-muted-foreground">
              {description ?? `O ${itemType} “${itemName}” será removido do seu portfólio. Esta ação não poderá ser desfeita.`}
            </p>
            {error && <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button ref={cancelRef} type="button" variant="ghost" disabled={saving} onClick={close}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" disabled={saving} onClick={() => void confirm()}>
                {saving ? `Excluindo ${itemType}...` : (confirmLabel ?? `Excluir ${itemType}`)}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
