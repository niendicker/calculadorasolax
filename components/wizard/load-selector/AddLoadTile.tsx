'use client';

import { Plus } from 'lucide-react';

export function AddLoadTile({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className="flex min-h-[88px] flex-col items-center justify-center gap-1 self-start rounded-lg border border-dashed p-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="h-5 w-5" />
      Adicionar carga
    </button>
  );
}
