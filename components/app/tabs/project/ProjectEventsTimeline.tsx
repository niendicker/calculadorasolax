'use client';

import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Eye, Mail, RefreshCw, Send, X, XCircle, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { listProjectEvents } from '@/lib/data/project-events-repository';
import { projectEventFromRow } from '@/lib/store/row-mappers';
import type { ProjectEvent, ProjectStatus } from '@/lib/types';
import { projectStatusLabels } from '../../types';

function statusLabel(status: string | null): string {
  if (!status) return '-';
  return projectStatusLabels[status as ProjectStatus] ?? status;
}

/** Icon + human-readable label per event_type — event_type has no DB-side
 *  CHECK constraint (see the migration), so an unrecognized value (a future
 *  event type this component predates) falls back to a generic entry instead
 *  of crashing or rendering nothing. */
const eventTypeMeta: Record<string, { icon: LucideIcon; label: (event: ProjectEvent) => string }> = {
  quote_shared: { icon: Send, label: () => 'Cotação compartilhada por WhatsApp' },
  quote_link_viewed: { icon: Eye, label: () => 'Cliente visualizou o orçamento' },
  quote_accepted: { icon: CheckCircle2, label: () => 'Cliente aceitou o orçamento' },
  quote_rejected: { icon: XCircle, label: () => 'Cliente recusou o orçamento' },
  supplier_quote_requested: {
    icon: Mail,
    label: (event) => event.message ?? 'Solicitação de orçamento enviada ao fornecedor',
  },
  status_changed: {
    icon: RefreshCw,
    label: (event) => `Status alterado: ${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`,
  },
};

const fallbackMeta = { icon: Activity, label: (event: ProjectEvent) => event.message ?? event.eventType };

function EventRow({ event }: { event: ProjectEvent }) {
  const meta = eventTypeMeta[event.eventType] ?? fallbackMeta;
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-foreground">{meta.label(event)}</p>
        <p className="text-muted-foreground">
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.createdAt))}
        </p>
      </div>
    </div>
  );
}

/** Chronological "Histórico" of a project's communication/negotiation
 *  milestones (project_events table) — quote shared, link viewed, accepted/
 *  rejected, manual status changes. Fetches its own data (keyed by
 *  `projectId`/`refreshKey`) instead of taking events as a prop, so it stays
 *  a self-contained drop-in: the parent only needs to bump `refreshKey`
 *  after an action it knows just created a new event (see
 *  SelectedProjectSummary's handleShareQuote), and project.updatedAt
 *  changing (e.g. a manual status edit) already covers the rest. Renders
 *  nothing for a project with no history yet, rather than an empty-state
 *  message — most projects start with none and that's not noteworthy. */
export function ProjectEventsTimeline({ projectId, refreshKey }: { projectId: string; refreshKey: string }) {
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listProjectEvents(createClient(), projectId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(true);
          return;
        }
        setLoadError(false);
        setEvents(data.map(projectEventFromRow));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  if (loadError && events.length === 0) {
    return <p className="text-xs text-muted-foreground">Não foi possível carregar o histórico.</p>;
  }
  if (events.length === 0) return null;

  return (
    <>
      <div className="space-y-2 rounded-lg border bg-background p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-foreground">Histórico</p>
            <p className="text-[0.7rem] text-muted-foreground">{events.length} evento{events.length !== 1 ? 's' : ''}</p>
          </div>
          <Button type="button" variant="link" size="xs" onClick={() => setHistoryOpen(true)}>
            Ver histórico
          </Button>
        </div>
        <EventRow event={events[0]} />
      </div>
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-history-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setHistoryOpen(false);
          }}
        >
          <div className="max-h-[min(34rem,calc(100vh-2rem))] w-full max-w-md overflow-y-auto rounded-lg border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="project-history-title" className="font-semibold">Histórico do projeto</h2>
                <p className="mt-1 text-sm text-muted-foreground">{events.length} evento{events.length !== 1 ? 's' : ''}</p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar histórico" onClick={() => setHistoryOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-5 space-y-3">
              {events.map((event) => <EventRow key={event.id} event={event} />)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
