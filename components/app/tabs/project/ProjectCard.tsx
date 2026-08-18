'use client';

import {
  AlertTriangle,
  Calculator,
  Clock,
  Download,
  Loader2,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

export function ProjectCard({
  project,
  client,
  userStockItems,
  userServices,
  marginSettings,
  batteryCatalog,
  selected,
  onSelect,
  onOpen,
  onOpenSizing,
  onRefreshSolution,
  refreshing,
  onUpdateStatus,
  onDownloadPdf,
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
  onOpen: () => void;
  onOpenSizing: () => void;
  onRefreshSolution: () => void;
  refreshing: boolean;
  onUpdateStatus: (status: ProjectStatus) => void;
  onDownloadPdf: () => void;
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
      ? calculateSystemCost(project.solution, userStockItems, project.services, userServices, marginSettings, batteryCatalog)
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
        'relative flex h-full cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        selected ? 'border-foreground/30 bg-muted/40 shadow-sm ring-1 ring-border' : 'hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate font-semibold">{project.name}</p>
          <ProjectStatusSelect status={project.status} onChange={onUpdateStatus} />
        </div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3 shrink-0" />
          <span className="truncate">{client?.name || 'Cliente não informado'}</span>
        </p>
        {client?.phone && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{client.phone}</span>
          </p>
        )}
        {client?.email && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{client.email}</span>
          </p>
        )}
        {systemCost && systemCost.pricedItemsCount > 0 && (
          <p className="mt-0.5 text-xs">
            <span className="text-muted-foreground">Valor: </span>
            <span className="font-medium text-foreground">{formatCurrencyBRL(systemCost.totalCost)}</span>
            {!systemCost.isComplete && <span className="text-muted-foreground"> (parcial)</span>}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {hasSolution ? (
            <Badge variant="secondary">Solução calculada</Badge>
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
          <div className="mt-1.5 flex items-center gap-2">
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
      <div className="mt-auto space-y-2 pt-1">
        {/* grid, not flex-wrap: three buttons squeezed onto one flex-wrap row
         * left barely 100px each, cramping "Dimensionamento" into a
         * multi-line/overflowing label on narrow phones. Two even columns
         * give each button real width, with "Atualizar" (only sometimes
         * present) spanning its own full-width row below instead of
         * fighting the other two for space. */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={stopAnd(onOpen)}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline" size="sm" onClick={stopAnd(onOpenSizing)}>
            <Calculator className="h-4 w-4" />
            Dimensionamento
          </Button>
          {hasSolution && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'col-span-2',
                hasSolutionAlert && 'border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40'
              )}
              disabled={refreshing}
              title={hasSolutionAlert ? 'A solução salva não atende 100% aos requisitos. Recalcule para atualizar.' : undefined}
              onClick={stopAnd(onRefreshSolution)}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : hasSolutionAlert ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={!hasSolution || downloading}
          title={hasSolution ? undefined : 'Calcule uma solução para este projeto antes de baixar o relatório.'}
          onClick={stopAnd(onDownloadPdf)}
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {downloading ? 'Gerando relatório...' : 'Baixar Relatório'}
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
