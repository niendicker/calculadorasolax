'use client';

import { Plus } from 'lucide-react';

/** Trigger for starting a new project — the first tile in the grid instead
 * of a small header button, so it reads as the primary call-to-action on an
 * otherwise list-only page (and doesn't fight for space with the title on
 * narrow screens). Replaced in place by ProjectDraftCard once clicked. */
export function NewProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/[0.03] p-6 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Plus className="h-6 w-6" />
      </span>
      <span className="text-base font-semibold text-foreground">Novo projeto</span>
      <span className="max-w-[220px] text-sm text-muted-foreground">
        Cadastre um cliente e comece um novo dimensionamento
      </span>
    </button>
  );
}
