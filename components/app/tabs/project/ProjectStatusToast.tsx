'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const STATUS_TOAST_DURATION_MS = 5000;

/** Feedback for save/load/remove actions, as a popup pinned to the
 * top of the page instead of an inline banner — it needs to be seen even
 * when the action happened lower on a long "Projetos salvos" list. The
 * progress bar shrinks over STATUS_TOAST_DURATION_MS and auto-dismisses;
 * `statusId` (bumped on every new message, even repeats) is used as the
 * React key so the countdown restarts cleanly for each new status. */
export function ProjectStatusToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const [shrink, setShrink] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShrink(true));
    const timer = setTimeout(onDismiss, STATUS_TOAST_DURATION_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount; the parent remounts this via `key` for each new message.
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-lg border border-primary/30 bg-card shadow-xl"
      >
        <div className="flex items-start gap-3 p-3">
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{message}</p>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onDismiss}
            className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary ease-linear"
            style={{
              width: shrink ? '0%' : '100%',
              transitionProperty: 'width',
              transitionDuration: `${STATUS_TOAST_DURATION_MS}ms`,
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
