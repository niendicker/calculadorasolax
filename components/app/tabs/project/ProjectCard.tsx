'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Clock,
  Download,
  FolderOpen,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteModalButton } from '@/components/ui/confirm-delete-button';
import { Tooltip } from '@/components/ui/tooltip';
import { desiredFeatureLabel } from '@/lib/desired-features';
import type { Client, MarginSettings, ProjectStatus, SavedProject, UserServiceItem, UserStockItem } from '@/lib/types';
import { totalDailyKwh, totalNominalW, totalPeakW } from '@/lib/store/wizard-store';
import { cn } from '@/lib/utils';
import { calculateSystemCost, formatCurrencyBRL, solutionHasInsufficientMargin } from '../../helpers';
import { featureIcons } from '../sizing/DesiredFeaturesPicker';
import type { BatteryCatalogOption } from '../../types';
import { gridLabels, topologyLabels } from '../../types';
import { ProjectStatusSelect } from './ProjectStatusSelect';

const STALE_AFTER_DAYS = 7;

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

function ProjectActionsMenu({
  projectName,
  hasSolution,
  hasSolutionAlert,
  refreshing,
  downloading,
  onRefreshSolution,
  onDownloadPdf,
  onRemove,
}: {
  projectName: string;
  hasSolution: boolean;
  hasSolutionAlert: boolean;
  refreshing: boolean;
  downloading: boolean;
  onRefreshSolution: () => void;
  onDownloadPdf: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const firstItemRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    // ConfirmDeleteModalButton portals its confirmation dialog to
    // document.body, outside menuRef's DOM subtree — without the
    // role="dialog" check, mousedown on its "Excluir projeto" button (which
    // fires before the click that would actually confirm) reads as an
    // outside click and closes/unmounts this menu first, so the confirm
    // click never lands.
    function closeOnOutside(event: MouseEvent) {
      const target = event.target;
      const isInsideMenu = menuRef.current?.contains(target as Node);
      const isInsideDialog = target instanceof Element && target.closest('[role="dialog"]');
      if (!isInsideMenu && !isInsideDialog) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    firstItemRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function toggle(event: React.MouseEvent) {
    event.stopPropagation();
    setOpen((value) => !value);
  }

  function run(event: React.MouseEvent, action: () => void) {
    event.stopPropagation();
    setOpen(false);
    action();
  }

  return (
    <div ref={menuRef} className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Mais ações para ${projectName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mais ações"
        onClick={toggle}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={`Ações de ${projectName}`}
          className="absolute right-0 top-full z-20 mt-1 min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
          }}
        >
          {hasSolution && (
            <button
              ref={firstItemRef}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              disabled={refreshing}
              title={hasSolutionAlert ? 'A solução salva não atende 100% aos requisitos. Recalcule para atualizar.' : undefined}
              onClick={(event) => run(event, onRefreshSolution)}
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </button>
          )}
          <button
            ref={!hasSolution ? firstItemRef : undefined}
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            disabled={!hasSolution || downloading}
            title={hasSolution ? undefined : 'Calcule uma solução para este projeto antes de baixar o relatório.'}
            onClick={(event) => run(event, onDownloadPdf)}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? 'Gerando relatório...' : 'Baixar relatório'}
          </button>
          <div className="my-1 border-t" />
          <ConfirmDeleteModalButton
            ariaLabel={`Excluir projeto ${projectName}`}
            itemName={projectName}
            itemType="projeto"
            label="Excluir"
            onConfirm={onRemove}
          />
        </div>
      )}
    </div>
  );
}

export function ProjectCard({
  project,
  client,
  userStockItems,
  userServices,
  marginSettings,
  batteryCatalog,
  selected,
  onSelect,
  onOpenWorkspace,
  onRefreshSolution,
  refreshing,
  onUpdateStatus,
  onDownloadPdf,
  onRemove,
  downloading,
}: {
  project: SavedProject;
  client: Client | undefined;
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  marginSettings: MarginSettings;
  batteryCatalog: BatteryCatalogOption[];
  selected: boolean;
  onSelect: () => void;
  onOpenWorkspace: () => void;
  onRefreshSolution: () => void;
  refreshing: boolean;
  onUpdateStatus: (status: ProjectStatus) => void;
  onDownloadPdf: () => void;
  onRemove: () => void;
  /** True while this project's PDF is being generated — the report can take
   * a moment to render (react-pdf isn't instant), so the button needs its
   * own feedback instead of looking unresponsive until the download fires. */
  downloading: boolean;
}) {
  const hasSolution = Boolean(project.solution);
  const idleDays = daysSince(project.updatedAt);
  const isStale = !hasSolution && idleDays >= STALE_AFTER_DAYS;
  const systemCost =
    project.solution || project.services.length > 0
      ? calculateSystemCost(project.solution, userStockItems, project.services, userServices, marginSettings, batteryCatalog, project.residentialOptions)
      : null;

  // "Atualizar" recalculates the solution from the project's own saved loads
  // — only makes sense once a solution already exists. The alert badge
  // reuses the same margin check the Dimensionamento tab itself relies on,
  // read straight from the project's stored solution/loads (no need to
  // recalculate just to know whether it's already insufficient).
  const hasSolutionAlert =
    project.solution && !project.solution.microgridAlternative
      ? solutionHasInsufficientMargin(project.solution, {
          desiredFeatures: project.residentialOptions.desiredFeatures,
          whiteTariff: project.residentialOptions.whiteTariff,
          microgrid: project.residentialOptions.microgrid,
          pv: project.residentialOptions.pv,
          nominalW: totalNominalW(project.residentialOptions.loads),
          peakW: totalPeakW(project.residentialOptions.loads, project.residentialOptions.peakCalcMode ?? 'sum'),
          dailyKwh: totalDailyKwh(project.residentialOptions.loads, project.residentialOptions.operationHours),
        })
      : false;

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
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">{client?.name || 'Cliente não informado'}</span>
            </p>
            {client?.phone && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                <span className="truncate">{client.phone}</span>
              </p>
            )}
            {client?.email && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{client.email}</span>
              </p>
            )}
          </div>
        </div>
        <ProjectActionsMenu
          projectName={project.name}
          hasSolution={hasSolution}
          hasSolutionAlert={hasSolutionAlert}
          refreshing={refreshing}
          downloading={downloading}
          onRefreshSolution={onRefreshSolution}
          onDownloadPdf={onDownloadPdf}
          onRemove={onRemove}
        />
      </div>

      <div className="space-y-3 border-t pt-3">
        {systemCost && systemCost.pricedItemsCount > 0 && (
          <p className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Valor do sistema</span>
            <span className="text-right font-medium text-foreground">
              {formatCurrencyBRL(systemCost.totalCost)}
              {!systemCost.isComplete && <span className="font-normal text-muted-foreground"> (parcial)</span>}
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {hasSolution ? (
            <Badge variant="secondary">Dimensionamento concluído</Badge>
          ) : (
            <Badge className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              Sem solução calculada
            </Badge>
          )}
          {isStale && (
            <Badge className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <Clock className="h-3 w-3" />
              Parado há {idleDays} dia{idleDays !== 1 ? 's' : ''}
            </Badge>
          )}
          <Badge variant="outline">
            {project.residentialOptions.topology
              ? topologyLabels[project.residentialOptions.topology]
              : 'Sem topologia'}
          </Badge>
          <Badge variant="outline">
            {project.residentialOptions.gridType ? gridLabels[project.residentialOptions.gridType] : 'Sem rede'}
          </Badge>
        </div>
        {project.residentialOptions.desiredFeatures.length > 0 && (
          <div className="flex items-center gap-2 border-t pt-2.5">
            {project.residentialOptions.desiredFeatures.map((feature) => {
              const Icon = featureIcons[feature];
              return (
                <Tooltip key={feature} content={desiredFeatureLabel(feature)}>
                  <Icon className="h-4 w-4 text-muted-foreground" aria-label={desiredFeatureLabel(feature)} />
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto space-y-2 border-t pt-3">
        <Button size="sm" variant="outline" className="w-full" onClick={stopAnd(onOpenWorkspace)}>
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
