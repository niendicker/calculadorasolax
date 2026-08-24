'use client';

import { cn } from '@/lib/utils';
import { CircleHelp } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';

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
        'relative flex min-h-16 items-center gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active
          ? 'border-primary bg-primary/[0.06] text-foreground shadow-sm ring-1 ring-primary/20'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/40 hover:text-foreground'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
        )}
      >
        {active && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{label}</span>
          <Tooltip content={tip}>
            <CircleHelp
              className="h-4 w-4 shrink-0 text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary"
              tabIndex={0}
              aria-label={`Explicação: ${label}`}
            />
          </Tooltip>
        </span>
      </span>
    </button>
  );
}
