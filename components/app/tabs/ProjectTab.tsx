'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BatteryCharging,
  Calculator,
  ClipboardCopy,
  ClipboardList,
  Clock,
  Copy,
  Gauge,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type {
  BatteryTopology,
  Client,
  MarginSettings,
  ProjectInfo,
  ProjectServiceLine,
  ResidentialGridType,
  SavedProject,
  UserServiceItem,
  UserStockItem,
} from '@/lib/types';
import { totalDailyKwh, totalNominalW, totalPeakW } from '@/lib/store/wizard-store';
import { cn } from '@/lib/utils';
import {
  batteryQuantityBreakdown,
  buildProjectShareText,
  calculateSystemCost,
  formatCurrencyBRL,
  normalizeAccessoryLine,
  solutionHasInsufficientMargin,
  solutionMetrics,
} from '../helpers';
import { PageHeader, PageSummary } from '../shell/slots';
import { Metric, ProjectListSkeleton, Requirement, SearchInput, SharePreviewModal } from '../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';
import { gridLabels, topologyLabels } from '../types';

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

/** A product's category label, its nickname/model (with quantity, if any),
 * and — only when a nickname is set — the bare model code as a small
 * caption underneath, so a long nickname + model pair doesn't get crammed
 * onto one line next to the category label. */
function ProductNameLine({
  category,
  model,
  nickname,
  suffix,
}: {
  category: string;
  model: string;
  nickname?: string | null;
  suffix?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{category}</p>
      <p className="font-medium text-foreground">
        {nickname || model}
        {suffix}
      </p>
      {nickname && <p className="text-[0.7rem] text-muted-foreground">{model}</p>}
    </div>
  );
}

const STALE_AFTER_DAYS = 7;
const STATUS_TOAST_DURATION_MS = 5000;

/** Feedback for save/load/remove/duplicate actions, as a popup pinned to the
 * top of the page instead of an inline banner — it needs to be seen even
 * when the action happened lower on a long "Projetos salvos" list. The
 * progress bar shrinks over STATUS_TOAST_DURATION_MS and auto-dismisses;
 * `statusId` (bumped on every new message, even repeats) is used as the
 * React key so the countdown restarts cleanly for each new status. */
function ProjectStatusToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const [shrink, setShrink] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShrink(true));
    const timer = setTimeout(onDismiss, STATUS_TOAST_DURATION_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount; the parent remounts this via `key` for each new message.
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-lg border border-primary/30 bg-card shadow-xl"
      >
        <div className="flex items-start gap-3 p-3">
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{message}</p>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onDismiss}
            className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary ease-linear"
            style={{
              width: shrink ? '0%' : '100%',
              transitionProperty: 'width',
              transitionDuration: `${STATUS_TOAST_DURATION_MS}ms`,
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ProjectTab({
  projectInfo,
  projectDetailsVisible,
  currentProjectId,
  savedProjects,
  clients,
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
  userStockItems,
  userServices,
  marginSettings,
  services,
  initialLoading,
  projectStatus,
  statusId,
  onDismissStatus,
  topology,
  batteryModel,
  gridType,
  loadsCount,
  peakW,
  dailyKwh,
  hasSolution,
  setProjectInfo,
  onSave,
  onNew,
  onCancelNew,
  onOpen,
  onOpenSizing,
  onRemove,
  onDuplicate,
  onRefreshSolution,
  refreshingProjectId,
  onDownloadPdf,
  onManageClients,
  onShowSummary,
  onHideSummary,
  onAddService,
  onRemoveService,
  onUpdateServiceQty,
}: {
  projectInfo: ProjectInfo;
  projectDetailsVisible: boolean;
  currentProjectId: string | null;
  savedProjects: SavedProject[];
  clients: Client[];
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  marginSettings: MarginSettings;
  services: ProjectServiceLine[];
  initialLoading: boolean;
  projectStatus: string | null;
  statusId: number;
  onDismissStatus: () => void;
  topology: BatteryTopology | null;
  batteryModel: string | null;
  gridType: ResidentialGridType | null;
  loadsCount: number;
  peakW: number;
  dailyKwh: number;
  hasSolution: boolean;
  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  onSave: () => void;
  onNew: () => void;
  onCancelNew: () => void;
  onOpen: (id: string) => void;
  onOpenSizing: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRefreshSolution: (id: string) => void;
  /** Id of the project currently being recalculated, if any — used to show a
   * loading state on that project's "Atualizar" button specifically. */
  refreshingProjectId: string | null;
  onDownloadPdf: (id: string) => void;
  onManageClients: () => void;
  /** Brings the shell's summary panel into view (a slide-in drawer on
   * mobile/tablet) — selecting a project should surface its rich summary
   * immediately instead of waiting for the user to tap the nav badge. */
  onShowSummary: () => void;
  /** Closes the shell's mobile summary drawer — used when the user explicitly
   * dismisses the selected project's summary, so they land back on the list
   * instead of an empty "select a project" drawer still open. */
  onHideSummary: () => void;
  onAddService: (serviceId: string) => void;
  onRemoveService: (serviceId: string) => void;
  onUpdateServiceQty: (serviceId: string, qty: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [nameSubmitAttempted, setNameSubmitAttempted] = useState(false);
  const nameError = nameSubmitAttempted && !projectInfo.name.trim();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'with' | 'without'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'client'>('recent');

  const selectedProject =
    !projectDetailsVisible && selectedProjectId
      ? savedProjects.find((project) => project.id === selectedProjectId) ?? null
      : null;

  const projectsWithSolutionCount = savedProjects.filter((project) => project.solution).length;
  const solutionsValue = savedProjects.reduce((total, project) => {
    if (!project.solution && project.services.length === 0) return total;
    const cost = calculateSystemCost(project.solution, userStockItems, project.services, userServices, marginSettings);
    return cost.pricedItemsCount > 0 ? total + cost.totalCost : total;
  }, 0);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProjects = savedProjects
    .filter((project) => {
      const clientName = clients.find((client) => client.id === project.clientId)?.name ?? '';
      const matchesSearch =
        project.name.toLowerCase().includes(normalizedSearch) || clientName.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'with' && project.solution) ||
        (statusFilter === 'without' && !project.solution);
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'pt-BR');
      if (sortBy === 'client') {
        const clientA = clients.find((client) => client.id === a.clientId)?.name ?? '';
        const clientB = clients.find((client) => client.id === b.clientId)?.name ?? '';
        return clientA.localeCompare(clientB, 'pt-BR');
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  function handleSave() {
    if (!projectInfo.name.trim()) {
      setNameSubmitAttempted(true);
      return;
    }
    setNameSubmitAttempted(false);
    onSave();
  }

  function handleCancel() {
    setNameSubmitAttempted(false);
    onCancelNew();
  }

  return (
    <div className="space-y-4">
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projeto</h1>
          <p className="text-sm text-muted-foreground">
            Escolha um cliente cadastrado e salve a configuração para reutilizar depois.
          </p>
        </div>
        {!projectDetailsVisible && (
          <Button variant="outline" size="sm" onClick={onNew}>
            <Plus className="h-4 w-4" />
            Novo projeto
          </Button>
        )}
      </PageHeader>

      <PageSummary>
        {selectedProject ? (
          <SelectedProjectSummary
            project={selectedProject}
            client={clients.find((client) => client.id === selectedProject.clientId)}
            batteryCatalog={batteryCatalog}
            inverterCatalog={inverterCatalog}
            accessoryCatalog={accessoryCatalog}
            userStockItems={userStockItems}
            userServices={userServices}
            marginSettings={marginSettings}
            onClose={() => {
              setSelectedProjectId(null);
              onHideSummary();
            }}
            onOpenSizing={() => onOpenSizing(selectedProject.id)}
          />
        ) : projectDetailsVisible ? (
          <>
            <div>
              <h2 className="text-sm font-semibold">Configuração salva junto</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Pico" value={`${(peakW / 1000).toFixed(2)} kVA`} />
              <Metric label="Consumo" value={`${dailyKwh.toFixed(2)} kWh/dia`} />
            </div>
            <Separator />
            <ul className="space-y-2 text-sm">
              <Requirement done={Boolean(topology)} label={topology ? topologyLabels[topology] : 'Topologia da bateria'} />
              <Requirement done={Boolean(batteryModel)} label={batteryModel || 'Modelo da bateria'} />
              <Requirement done={Boolean(gridType)} label={gridType ? gridLabels[gridType] : 'Tipo de rede'} />
              <Requirement done={loadsCount > 0} label={`${loadsCount} carga(s) cadastrada(s)`} />
              <Requirement done={hasSolution} label={hasSolution ? 'Solução calculada' : 'Solução ainda não calculada'} />
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
            <p>Selecione um projeto na lista para ver o resumo, ou clique em &quot;Novo projeto&quot; para começar.</p>
          </div>
        )}
      </PageSummary>

      {projectStatus && (
        <ProjectStatusToast key={statusId} message={projectStatus} onDismiss={onDismissStatus} />
      )}

      <div className="space-y-3">
        <div
          className={cn(
            'flex flex-col gap-3',
            savedProjects.length > 0 && 'lg:flex-row lg:items-center lg:justify-between'
          )}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-sm font-semibold">Projetos salvos</h2>
            {savedProjects.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {savedProjects.length} projeto{savedProjects.length !== 1 ? 's' : ''} · {projectsWithSolutionCount} com
                solução calculada
                {solutionsValue > 0 && (
                  <>
                    {' · '}Valor total:{' '}
                    <span className="font-medium text-foreground">{formatCurrencyBRL(solutionsValue)}</span>
                  </>
                )}
              </span>
            )}
          </div>

          {savedProjects.length > 0 && (
            <div className="flex flex-col items-end gap-2">
              <div className="w-full shrink-0 sm:w-52">
                <SearchInput value={search} onChange={setSearch} placeholder="Pesquisar projeto..." />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex h-10 items-center gap-1 rounded-lg bg-muted p-1 md:h-8" role="tablist" aria-label="Filtrar por solução">
                  {(
                    [
                      { value: 'all', label: 'Todos' },
                      { value: 'with', label: 'Com solução' },
                      { value: 'without', label: 'Sem solução' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={statusFilter === option.value}
                      onClick={() => setStatusFilter(option.value)}
                      className={cn(
                        'flex h-full items-center rounded-md px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        statusFilter === option.value
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Ordenar projetos"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                  className="h-10 shrink-0 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8"
                >
                  <option value="recent">Mais recentes</option>
                  <option value="name">Nome (A-Z)</option>
                  <option value="client">Cliente (A-Z)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {initialLoading ? (
          <ProjectListSkeleton />
        ) : (
          <>
            {!projectDetailsVisible && savedProjects.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum projeto salvo ainda. Clique em &quot;Novo projeto&quot; para começar.
              </div>
            ) : !projectDetailsVisible && filteredProjects.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum projeto encontrado para essa pesquisa.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {projectDetailsVisible && !currentProjectId && (
                  <ProjectDraftCard
                    projectInfo={projectInfo}
                    clients={clients}
                    isNew
                    setProjectInfo={setProjectInfo}
                    onManageClients={onManageClients}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    nameError={nameError}
                    userServices={userServices}
                    services={services}
                    onAddService={onAddService}
                    onRemoveService={onRemoveService}
                    onUpdateServiceQty={onUpdateServiceQty}
                  />
                )}
                {filteredProjects.map((project) =>
                  projectDetailsVisible && project.id === currentProjectId ? (
                    <ProjectDraftCard
                      key={project.id}
                      projectInfo={projectInfo}
                      clients={clients}
                      isNew={false}
                      setProjectInfo={setProjectInfo}
                      onManageClients={onManageClients}
                      onSave={handleSave}
                      onCancel={handleCancel}
                      nameError={nameError}
                      userServices={userServices}
                      services={services}
                      onAddService={onAddService}
                      onRemoveService={onRemoveService}
                      onUpdateServiceQty={onUpdateServiceQty}
                    />
                  ) : (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      client={clients.find((client) => client.id === project.clientId)}
                      userStockItems={userStockItems}
                      userServices={userServices}
                      marginSettings={marginSettings}
                      selected={project.id === selectedProjectId}
                      onSelect={() => {
                        const willSelect = selectedProjectId !== project.id;
                        setSelectedProjectId(willSelect ? project.id : null);
                        if (willSelect) onShowSummary();
                      }}
                      onOpen={() => {
                        setSelectedProjectId(project.id);
                        onShowSummary();
                        onOpen(project.id);
                      }}
                      onOpenSizing={() => onOpenSizing(project.id)}
                      onRemove={() => onRemove(project.id)}
                      onDuplicate={() => onDuplicate(project.id)}
                      onRefreshSolution={() => onRefreshSolution(project.id)}
                      refreshing={refreshingProjectId === project.id}
                      onDownloadPdf={() => onDownloadPdf(project.id)}
                    />
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProjectField({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ProjectDraftCard({
  projectInfo,
  clients,
  isNew,
  setProjectInfo,
  onManageClients,
  onSave,
  onCancel,
  nameError,
  userServices,
  services,
  onAddService,
  onRemoveService,
  onUpdateServiceQty,
}: {
  projectInfo: ProjectInfo;
  clients: Client[];
  isNew: boolean;
  setProjectInfo: (partial: Partial<ProjectInfo>) => void;
  onManageClients: () => void;
  onSave: () => void;
  onCancel: () => void;
  nameError: boolean;
  userServices: UserServiceItem[];
  services: ProjectServiceLine[];
  onAddService: (serviceId: string) => void;
  onRemoveService: (serviceId: string) => void;
  onUpdateServiceQty: (serviceId: string, qty: number) => void;
}) {
  return (
    <Card className="border-primary/40 bg-primary/5 sm:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">{isNew ? 'Novo projeto' : 'Editando projeto'}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <ProjectField label="Nome do projeto" id="projectName">
          <Input
            id="projectName"
            value={projectInfo.name}
            onChange={(event) => setProjectInfo({ name: event.target.value })}
            placeholder="Ex: Residência Silva"
            autoFocus
            aria-invalid={nameError}
            aria-describedby={nameError ? 'projectName-error' : undefined}
          />
          {nameError && (
            <p id="projectName-error" role="alert" className="text-sm text-destructive">
              Informe um nome para o projeto.
            </p>
          )}
        </ProjectField>
        <div className="space-y-1.5">
          <Label htmlFor="clientId">Cliente</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id="clientId"
              className="flex h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:px-2.5 md:text-sm"
              value={projectInfo.clientId ?? ''}
              onChange={(event) => setProjectInfo({ clientId: event.target.value || null })}
            >
              <option value="">Sem cliente selecionado</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" className="shrink-0" onClick={onManageClients}>
              <Users className="h-4 w-4" />
              Gerenciar clientes
            </Button>
          </div>
        </div>
        <ProjectField label="Endereço" id="clientAddress">
          <Input
            id="clientAddress"
            value={projectInfo.address}
            onChange={(event) => setProjectInfo({ address: event.target.value })}
            placeholder="Endereço da instalação"
          />
        </ProjectField>
        <div className="md:col-span-2">
          <ProjectField label="Observações" id="projectNotes">
            <textarea
              id="projectNotes"
              className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:px-2.5 md:text-sm"
              value={projectInfo.notes}
              onChange={(event) => setProjectInfo({ notes: event.target.value })}
              placeholder="Informações comerciais, restrições da instalação ou preferências do cliente."
            />
          </ProjectField>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Serviços</Label>
          {userServices.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Cadastre serviços (instalação, frete...) em Meu Catálogo para adicioná-los ao projeto.
            </p>
          ) : (
            <div className="space-y-2">
              {services.length > 0 && (
                <div className="space-y-1.5">
                  {services.map((line) => (
                    <div key={line.serviceId} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{line.name}</span>
                      <Input
                        type="number"
                        min={1}
                        value={line.qty}
                        aria-label={`Quantidade de ${line.name}`}
                        onChange={(event) => onUpdateServiceQty(line.serviceId, Number(event.target.value) || 1)}
                        className="h-8 w-16 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover serviço ${line.name}`}
                        onClick={() => onRemoveService(line.serviceId)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {userServices
                  .filter((service) => !services.some((line) => line.serviceId === service.id))
                  .map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => onAddService(service.id)}
                      className="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      {service.name} · {formatCurrencyBRL(service.unitValue)}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="h-4 w-4" />
            Fechar
          </Button>
          <Button type="button" onClick={onSave}>
            <Save className="h-4 w-4" />
            Salvar projeto
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectCard({
  project,
  client,
  userStockItems,
  userServices,
  marginSettings,
  selected,
  onSelect,
  onOpen,
  onOpenSizing,
  onRemove,
  onDuplicate,
  onRefreshSolution,
  refreshing,
  onDownloadPdf,
}: {
  project: SavedProject;
  client: Client | undefined;
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  marginSettings: MarginSettings;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onOpenSizing: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onRefreshSolution: () => void;
  refreshing: boolean;
  onDownloadPdf: () => void;
}) {
  const hasSolution = Boolean(project.solution);
  const idleDays = daysSince(project.updatedAt);
  const isStale = !hasSolution && idleDays >= STALE_AFTER_DAYS;
  const systemCost =
    project.solution || project.services.length > 0
      ? calculateSystemCost(project.solution, userStockItems, project.services, userServices, marginSettings)
      : null;

  // "Atualizar" recalculates the solution from the project's own saved loads
  // — only makes sense once a solution already exists. The alert badge
  // reuses the same margin check the Dimensionamento tab itself relies on,
  // read straight from the project's stored solution/loads (no need to
  // recalculate just to know whether it's already insufficient).
  const isBackupEnabled = project.residentialOptions.desiredFeatures.includes('backup');
  const nominalW = isBackupEnabled ? totalNominalW(project.residentialOptions.loads) : 0;
  const projectPeakW = isBackupEnabled
    ? totalPeakW(project.residentialOptions.loads, project.residentialOptions.peakCalcMode ?? 'sum')
    : 0;
  const projectDailyKwh = isBackupEnabled
    ? totalDailyKwh(project.residentialOptions.loads, project.residentialOptions.operationHours)
    : 0;
  const hasSolutionAlert =
    project.solution && !project.solution.microgridAlternative
      ? solutionHasInsufficientMargin(project.solution, {
          desiredFeatures: project.residentialOptions.desiredFeatures,
          whiteTariff: project.residentialOptions.whiteTariff,
          microgrid: project.residentialOptions.microgrid,
          pv: project.residentialOptions.pv,
          nominalW,
          peakW: projectPeakW,
          dailyKwh: projectDailyKwh,
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
        selected ? 'border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/30' : 'hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      <div className="absolute right-2 top-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Duplicar projeto ${project.name}`}
          onClick={stopAnd(onDuplicate)}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <span onClick={(event) => event.stopPropagation()}>
          <ConfirmDeleteButton
            ariaLabel={`Remover projeto ${project.name}`}
            title="Remover projeto?"
            description="O projeto salvo e sua configuração serão removidos deste navegador."
            confirmLabel="Remover"
            onConfirm={onRemove}
          />
        </span>
      </div>
      <div className="min-w-0 pr-16">
        <p className="font-semibold">{project.name}</p>
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
        <p className="mt-0.5 text-xs text-muted-foreground">
          Atualizado em{' '}
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(project.updatedAt)
          )}
        </p>
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
          <Badge variant="outline">{project.residentialOptions.batteryModel || 'Sem bateria'}</Badge>
          <Badge variant="outline">
            {project.residentialOptions.gridType ? gridLabels[project.residentialOptions.gridType] : 'Sem rede'}
          </Badge>
          <Badge variant="outline">{project.residentialOptions.loads.length} carga(s)</Badge>
        </div>
      </div>
      <div className="mt-auto space-y-2 pt-1">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="min-w-[100px] flex-1" onClick={stopAnd(onOpen)}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline" size="sm" className="min-w-[100px] flex-1" onClick={stopAnd(onOpenSizing)}>
            <Calculator className="h-4 w-4" />
            Dimensionamento
          </Button>
          {hasSolution && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'min-w-[100px] flex-1',
                hasSolutionAlert && 'border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40'
              )}
              disabled={refreshing}
              title={hasSolutionAlert ? 'A solução salva não atende 100% aos requisitos — recalcule para atualizar.' : undefined}
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
          disabled={!hasSolution}
          title={hasSolution ? undefined : 'Calcule uma solução para este projeto antes de compartilhar o relatório.'}
          onClick={stopAnd(onDownloadPdf)}
        >
          <Share2 className="h-4 w-4" />
          Compartilhar Relatório
        </Button>
      </div>
    </div>
  );
}

/** Rich, read-only summary of a saved project selected from the list —
 * lets the user inspect a project's own solution without loading it into
 * the editor (which "Abrir" already does). Rendered in the shell's summary
 * panel in place of the live "Configuração salva junto" summary. */
function SelectedProjectSummary({
  project,
  client,
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
  userStockItems,
  userServices,
  marginSettings,
  onClose,
  onOpenSizing,
}: {
  project: SavedProject;
  client: Client | undefined;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  marginSettings: MarginSettings;
  onClose: () => void;
  onOpenSizing: () => void;
}) {
  const metrics = project.solution ? solutionMetrics(project.solution, batteryCatalog) : null;
  const systemCost =
    project.solution || project.services.length > 0
      ? calculateSystemCost(project.solution, userStockItems, project.services, userServices, marginSettings)
      : null;
  const batteryParts = project.solution
    ? batteryQuantityBreakdown(
        project.solution.batteryModel,
        project.solution.batteryQty,
        batteryCatalog,
        (project.solution.inverterQty ?? 1) * (project.solution.batteryPortsUsed ?? 1)
      )
    : [];
  const [previewText, setPreviewText] = useState<string | null>(null);

  function openProjectDataPreview() {
    const text = buildProjectShareText(
      {
        name: project.name,
        address: project.address,
        topology: project.residentialOptions.topology,
        gridType: project.residentialOptions.gridType,
        loadsCount: project.residentialOptions.loads.length,
        peakW: totalPeakW(project.residentialOptions.loads, project.residentialOptions.peakCalcMode ?? 'sum'),
        dailyKwh: totalDailyKwh(project.residentialOptions.loads, project.residentialOptions.operationHours),
        solution: project.solution,
      },
      client?.name,
      batteryCatalog
    );
    setPreviewText(text);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{project.name}</h2>
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
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Fechar resumo do projeto" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {project.address && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{project.address}</span>
        </p>
      )}

      {metrics && project.solution && (
        <>
          <Separator />
          <div className="grid grid-cols-3 gap-2">
            <Metric
              icon={Gauge}
              label="Nominal"
              value={metrics.nominalW != null ? (metrics.nominalW / 1000).toFixed(2) : '-'}
              unit="kVA"
            />
            <Metric
              icon={Zap}
              label="Máxima"
              value={metrics.peakW != null ? (metrics.peakW / 1000).toFixed(2) : '-'}
              unit="kVA"
            />
            <Metric icon={BatteryCharging} label="Energia" value={metrics.energyKwh.toFixed(2)} unit="kWh" />
          </div>
          <div className="space-y-2.5 rounded-lg border bg-background p-2.5 text-xs text-muted-foreground">
            <div className="space-y-2.5">
              <ProductNameLine
                category="Inversor"
                model={project.solution.inverterModel}
                nickname={inverterCatalog.find((item) => item.model === project.solution?.inverterModel)?.nickname}
              />
              {batteryParts.map((part, index) => (
                <ProductNameLine
                  key={part.model}
                  category={index === 0 ? 'Bateria' : 'Bateria (expansão)'}
                  model={part.model}
                  nickname={batteryCatalog.find((item) => item.model === part.model)?.nickname}
                  suffix={` × ${part.qty}`}
                />
              ))}
              {project.solution.pvPowerKw ? (
                <p>
                  Fotovoltaico <span className="font-medium text-foreground">{project.solution.pvPowerKw.toFixed(2)} kWp</span>
                </p>
              ) : null}
            </div>

            {project.solution.accessories.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2.5">
                  <p className="font-medium text-foreground">Acessórios</p>
                  {project.solution.accessories.map((accessory) => {
                    const { model, qty, optional, bundled, appliesTo } = normalizeAccessoryLine(accessory);
                    const nickname = accessoryCatalog.find((item) => item.model === model)?.nickname;
                    return (
                      <div key={model} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-foreground">
                            {nickname || model}
                            {qty !== 1 ? ` × ${qty}` : ''}
                          </p>
                          {nickname && <p className="truncate text-[0.7rem]">{model}</p>}
                        </div>
                        <span className="shrink-0 text-[0.7rem]">
                          {bundled
                            ? appliesTo === 'inverter'
                              ? 'Incluso no inversor'
                              : appliesTo === 'battery'
                                ? 'Incluso na bateria'
                                : 'Incluso'
                            : optional
                              ? 'Opcional'
                              : 'Obrigatório'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {!project.solution && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Este projeto ainda não tem uma solução calculada.
        </p>
      )}

      {((systemCost && systemCost.pricedItemsCount > 0) || project.services.length > 0) && (
        <>
          <Separator />
          <div className="space-y-2.5 rounded-lg border bg-background p-2.5">
            {systemCost && systemCost.pricedItemsCount > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Valor da solução</p>
                <p className="text-lg font-semibold">{formatCurrencyBRL(systemCost.totalCost)}</p>
                {!systemCost.isComplete && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Preço parcial: {systemCost.pricedItemsCount} de {systemCost.totalItemsCount} itens com valor no
                    estoque.
                  </p>
                )}
              </div>
            )}

            {project.services.length > 0 && (
              <>
                {systemCost && systemCost.pricedItemsCount > 0 && <Separator />}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Serviços</p>
                  {project.services.map((line) => {
                    const unitValue = userServices.find((service) => service.id === line.serviceId)?.unitValue;
                    return (
                      <div key={line.serviceId} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {line.name}
                          {line.qty !== 1 ? ` × ${line.qty}` : ''}
                        </span>
                        <span className="shrink-0">
                          {unitValue != null ? formatCurrencyBRL(unitValue * line.qty) : 'sem preço'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      <Separator />

      <Button size="sm" className="w-full" onClick={onOpenSizing}>
        <Calculator className="h-4 w-4" />
        Ir para Dimensionamento
      </Button>

      <Button variant="outline" size="sm" className="w-full" onClick={openProjectDataPreview}>
        <ClipboardCopy className="h-4 w-4" />
        Copiar dados
      </Button>
      <SharePreviewModal text={previewText} onClose={() => setPreviewText(null)} />

      <Separator />
      <p className="text-xs text-muted-foreground">
        Atualizado em{' '}
        {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(project.updatedAt))}
      </p>
    </>
  );
}
