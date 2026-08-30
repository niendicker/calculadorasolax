'use client';

// Generic project-workspace chrome — name/status/autosave header, action
// slot, and the tab bar (with its URL <-> section sync) — extracted out of
// ProjectWorkspace.tsx so a future C&I workspace (docs/CI-MODULE-PLAN.md
// Fase 6) can reuse it with its own navigation list and content, instead of
// duplicating this markup. Pure refactor: every class name and DOM node
// here is byte-for-byte what ProjectWorkspace.tsx used to render inline —
// see its test suite, which this change must leave passing unmodified.
//
// Deliberately controlled, not self-contained: `activeSection` is owned by
// the caller (not this component) because residential code needs to jump
// to sections that aren't in the tab bar at all (e.g. 'resource',
// 'configuration', opened by clicking a resource card, not a tab).

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Flag, Loader2, Save, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutosaveStatus } from '../hooks/useAutosave';

function WorkspaceAutosaveStatus({ status, lastSavedAt }: { status: AutosaveStatus; lastSavedAt: Date | null }) {
  if (status === 'idle') return null;
  const label = status === 'saving'
    ? 'Salvando...'
    : status === 'error'
      ? 'Falha ao salvar'
      : status === 'pending'
        ? 'Alterações pendentes'
        : `Salvo${lastSavedAt ? ` às ${lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`;
  const Icon = status === 'saving' ? Loader2 : status === 'saved' ? CheckCircle2 : status === 'error' ? AlertTriangle : Save;
  return <span role="status" className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', status === 'error' && 'text-destructive')}><Icon className={cn('h-3.5 w-3.5', status === 'saving' && 'animate-spin')} aria-hidden="true" />{label}</span>;
}

export interface WorkspaceNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface ProjectWorkspaceShellProps {
  title: string;
  /** Defaults to "Em andamento" — the only value ProjectWorkspace.tsx ever
   * passed before this extraction. */
  statusLabel?: string;
  autosaveStatus: AutosaveStatus;
  autosaveLastSavedAt: Date | null;
  /** The client/grid-type line under the title — content-specific, so the
   * shell takes it as a slot rather than knowing about ResidentialOptions. */
  subtitle?: ReactNode;
  /** "Recalcular solução"/"Limpar dimensionamento" today; a future C&I
   * shell instance passes its own. */
  actions?: ReactNode;
  navigation: WorkspaceNavItem[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  children: ReactNode;
}

export function ProjectWorkspaceShell({
  title,
  statusLabel = 'Em andamento',
  autosaveStatus,
  autosaveLastSavedAt,
  subtitle,
  actions,
  navigation,
  activeSection,
  onSectionChange,
  children,
}: ProjectWorkspaceShellProps) {
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const setSectionFromValue = (value: string | null) => {
      if (value === 'resource' || value === 'project' || value === 'configuration' || (value && navigation.some((item) => item.id === value))) {
        onSectionChange(value);
      }
    };
    const value = new URLSearchParams(window.location.search).get('workspace');
    // The URL is external state; this one-time synchronization intentionally
    // updates the section after mount so SSR and the first client paint agree.
    setSectionFromValue(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrlReady(true);

    const handleWorkspaceSectionChange = (event: Event) => {
      setSectionFromValue((event as CustomEvent<string>).detail);
    };
    window.addEventListener('workspace-section-change', handleWorkspaceSectionChange);
    return () => window.removeEventListener('workspace-section-change', handleWorkspaceSectionChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', activeSection);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [activeSection, urlReady]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 bg-background pb-3 lg:pt-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-1 text-xs font-medium text-muted-foreground"><Flag className="h-3 w-3" aria-hidden="true" /> {statusLabel}</span>
            <WorkspaceAutosaveStatus status={autosaveStatus} lastSavedAt={autosaveLastSavedAt} />
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            {subtitle}
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
        </div>
        <nav className="mt-4 flex items-stretch overflow-x-auto rounded-xl border border-border/70 bg-card/70 p-1" aria-label="Seções do projeto">
          {navigation.map(({ id, label, icon: Icon }, index) => (
            <div key={id} className="flex min-w-[8.5rem] flex-1 items-stretch">
              {index > 0 && <ChevronRight className="my-auto h-5 w-5 shrink-0 text-muted-foreground/50" aria-hidden="true" />}
              <button
                type="button"
                aria-current={activeSection === id ? 'page' : undefined}
                onClick={() => onSectionChange(id)}
                className={cn(
                  'relative flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium transition-colors after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  activeSection === id ? 'text-primary after:bg-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            </div>
          ))}
        </nav>
      </div>

      {children}
    </div>
  );
}
