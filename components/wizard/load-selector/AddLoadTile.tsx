'use client';

import { Plus } from 'lucide-react';

export function AddLoadTile({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      aria-label="Adicionar carga"
      onClick={onAdd}
      disabled={disabled}
      className="group flex h-full min-h-0 w-full items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] p-3 text-left text-primary transition-colors hover:border-primary/70 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/20 disabled:text-muted-foreground disabled:opacity-60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/15 group-disabled:bg-muted">
        <Plus className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Adicionar carga</span>
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Crie uma carga personalizada para este projeto.
        </span>
      </span>
    </button>
  );
}
