'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  triggerSize?: 'sm' | 'default' | 'lg';
  icon?: React.ReactNode;
  disabled?: boolean;
  showIcon?: boolean;
  description?: string;
  affectedItems?: string[];
  pendingLabel?: string;
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
  triggerSize = 'sm',
  icon,
  disabled = false,
  showIcon = true,
  description,
  affectedItems,
  pendingLabel,
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
  const warningId = useId();
  const detailed = Boolean(affectedItems?.length);

  useEffect(() => {
    if (!open || !detailed) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open, detailed]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const close = useCallback(() => {
    if (saving) return;
    setOpen(false);
    setError(null);
    // The trigger remains mounted while the portal closes, so focusing it
    // synchronously avoids a race with test cleanup and environments without
    // a reliable animation-frame scheduler.
    triggerRef.current?.focus();
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
      setSaving(false);
      setOpen(false);
      triggerRef.current?.focus();
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
        size={triggerSize}
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
            aria-describedby={detailed ? `${descriptionId} ${warningId}` : descriptionId}
            aria-busy={saving}
            className={cn('w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-2xl', detailed ? 'max-h-[calc(100dvh-2rem)] overflow-y-auto' : 'p-5')}
          >
            {detailed ? (
              <>
                <div className="flex items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive" aria-hidden="true">
                    <Trash2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id={titleId} className="text-lg font-semibold leading-6">{title ?? `Excluir ${itemType}?`}</h2>
                    <p id={descriptionId} className="mt-1.5 text-sm leading-5 text-muted-foreground">{description ?? `Confirme a exclusão de ${itemName}.`}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar confirmação" disabled={saving} onClick={close}>
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                <div className="space-y-4 px-5 py-5 sm:px-6">
                  <div className="rounded-lg border bg-muted/30 p-3.5">
                    <p className="text-xs font-semibold text-muted-foreground">Esta ação afeta</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-5 marker:text-muted-foreground">
                      {affectedItems?.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <p id={warningId} className="flex items-start gap-2 text-sm leading-5">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                    <span>Essa ação não pode ser desfeita.</span>
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 id={titleId} className="text-base font-semibold">{title ?? `Excluir ${itemType}?`}</h2>
                <p id={descriptionId} className="mt-2 text-sm leading-5 text-muted-foreground">
                  {description ?? `O ${itemType} “${itemName}” será removido do seu portfólio. Esta ação não poderá ser desfeita.`}
                </p>
              </>
            )}
            {error && <p role="alert" className={cn('rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive', detailed ? 'mx-5 mb-5 sm:mx-6' : 'mt-3')}>{error}</p>}
            <div className={cn('flex gap-2', detailed ? 'flex-col-reverse border-t bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end sm:px-6' : 'mt-5 justify-end')}>
              <Button ref={cancelRef} type="button" variant={detailed ? 'outline' : 'ghost'} className={detailed ? 'h-10 md:h-10' : undefined} disabled={saving} onClick={close}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" className={detailed ? 'h-10 border-destructive/30 md:h-10' : undefined} disabled={saving} onClick={() => void confirm()}>
                {saving ? (pendingLabel ?? `Excluindo ${itemType}...`) : (confirmLabel ?? `Excluir ${itemType}`)}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
