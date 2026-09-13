'use client';

// C&I equivalent of ProjectCard — deliberately smaller: no solution/cost
// badges (the calculation engine isn't wired to any UI yet, docs/CI-MODULE-PLAN.md
// Fase 6 "fatia estreita"), just enough to identify, reopen and delete a
// saved C&I project. Mirrors ProjectCard's visual language rather than its
// residential-specific logic. The card selects the project for the shell's
// quick-view summary; its secondary action opens the workspace.

import { FolderOpen, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteModalButton } from '@/components/ui/confirm-delete-button';
import type { Client, ProjectStatus, SavedCiProject } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ProjectStatusSelect } from './ProjectStatusSelect';

export function CiProjectCard({
  project,
  client,
  selected,
  onSelect,
  onOpen,
  onUpdateStatus,
  onRemove,
}: {
  project: SavedCiProject;
  client: Client | undefined;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onUpdateStatus: (status: ProjectStatus) => void;
  onRemove: () => void;
}) {
  function stopAnd(handler: () => void) {
    return (event: React.MouseEvent) => {
      event.stopPropagation();
      handler();
    };
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'relative flex h-full min-h-60 cursor-pointer flex-col gap-4 rounded-lg border bg-card p-4 text-left transition hover:shadow-sm active:translate-y-px focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        selected ? 'border-foreground/30 bg-muted/40 shadow-sm ring-1 ring-border' : 'hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 truncate font-semibold leading-5">{project.name}</p>
            <ProjectStatusSelect status={project.status} onChange={onUpdateStatus} />
          </div>
          <div className="mt-2.5 space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">{client?.name || 'Cliente não informado'}</span>
            </p>
          </div>
        </div>
        <div onClick={(event) => event.stopPropagation()}>
          <ConfirmDeleteModalButton
            ariaLabel={`Excluir projeto ${project.name}`}
            itemName={project.name}
            itemType="projeto"
            label="Excluir"
            onConfirm={onRemove}
          />
        </div>
      </div>
      <div className="mt-auto space-y-2 border-t pt-3">
        <Button size="sm" variant="outline" className="w-full" onClick={stopAnd(onOpen)}>
          <FolderOpen className="h-4 w-4" />
          Abrir workspace
        </Button>
        <p className="pt-0.5 text-center text-[0.7rem] text-muted-foreground/70">
          Atualizado em{' '}
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(project.updatedAt)
          )}
        </p>
      </div>
    </div>
  );
}
