'use client';

import { cn } from '@/lib/utils';

export function PeakModeButton({
  label,
  tip,
  active,
  onClick,
}: {
  label: string;
  tip: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'relative flex min-h-24 items-start gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active
          ? 'border-primary bg-primary/[0.06] text-foreground shadow-sm ring-1 ring-primary/20'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/40 hover:text-foreground'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
      </span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{tip}</span>
      </span>
    </button>
  );
}
