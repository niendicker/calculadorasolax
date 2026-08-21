'use client';

import { Play, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Trigger for starting a new project — the first tile in the grid instead
 * of a small header button, so it reads as the primary call-to-action on an
 * otherwise list-only page (and doesn't fight for space with the title on
 * narrow screens). Replaced in place by ProjectDraftCard once clicked. */
export function NewProjectCard({ onClick, onDemo, demoDisabled = false }: { onClick: () => void; onDemo: () => void; demoDisabled?: boolean }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-6 text-center">
      <button type="button" onClick={onClick} className="flex flex-col items-center gap-3 rounded-md p-2 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Plus className="h-6 w-6" /></span>
        <span className="text-base font-semibold text-foreground">Novo projeto</span>
        <span className="max-w-[220px] text-sm text-muted-foreground">Cadastre um cliente e comece um novo dimensionamento</span>
      </button>
      <button
        type="button"
        onClick={onDemo}
        disabled={demoDisabled}
        className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50', demoDisabled && 'cursor-not-allowed opacity-50')}
      >
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
        Ver exemplo preenchido
      </button>
    </div>
  );
}
