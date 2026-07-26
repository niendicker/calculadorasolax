'use client';

import { useState } from 'react';
import {
  BatteryCharging,
  Calculator,
  Check,
  ClipboardCopy,
  ClipboardList,
  Clock,
  Copy,
  Gauge,
  Mail,
  Pencil,
  Phone,
  Plus,
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
  ProjectInfo,
  ProjectServiceLine,
  ResidentialGridType,
  SavedProject,
  UserServiceItem,
  UserStockItem,
} from '@/lib/types';
import { totalDailyKwh, totalPeakW } from '@/lib/store/wizard-store';
import { cn } from '@/lib/utils';
import {
  batteryQuantityBreakdown,
  buildProjectShareText,
  calculateSystemCost,
  formatCurrencyBRL,
  normalizeAccessoryLine,
  solutionMetrics,
} from '../helpers';
import { PageHeader, PageSummary } from '../shell/slots';
import { Metric, ProjectListSkeleton, Requirement, SearchInput } from '../shared-ui';
import type { BatteryCatalogOption } from '../types';
import { gridLabels, topologyLabels } from '../types';

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

const STALE_AFTER_DAYS = 7;

export function ProjectTab({
  projectInfo,
  projectDetailsVisible,
  currentProjectId,
  savedProjects,
  clients,
  batteryCatalog,
  userStockItems,
  userServices,
  services,
  initialLoading,
  projectStatus,
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
  onDownloadPdf,
  onManageClients,
  onShowSummary,
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
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  services: ProjectServiceLine[];
  initialLoading: boolean;
  projectStatus: string | null;
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
  onDownloadPdf: (id: string) => void;
  onManageClients: () => void;
  /** Brings the shell's summary panel into view (a slide-in drawer on
   * mobile/tablet) — selecting a project should surface its rich summary
   * immediately instead of waiting for the user to tap the nav badge. */
  onShowSummary: () => void;
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
    const cost = calculateSystemCost(project.solution, userStockItems, project.services, userServices);
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
            userStockItems={userStockItems}
            userServices={userServices}
            onClose={() => setSelectedProjectId(null)}
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
        <p role="status" className="rounded-lg border border-primary/30 px-3 py-2 text-sm text-primary">
          {projectStatus}
        </p>
      )}

      <div className="space-y-3">
        <div
          className={cn(
            'flex flex-col gap-3 rounded-lg border bg-card p-3',
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
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <div className="w-full shrink-0 sm:w-52">
                <SearchInput value={search} onChange={setSearch} placeholder="Pesquisar projeto..." />
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                      selected={project.id === selectedProjectId}
                      onSelect={() => {
                        const willSelect = selectedProjectId !== project.id;
                        setSelectedProjectId(willSelect ? project.id : null);
                        if (willSelect) onShowSummary();
                      }}
                      onOpen={() => onOpen(project.id)}
                      onOpenSizing={() => onOpenSizing(project.id)}
                      onRemove={() => onRemove(project.id)}
                      onDuplicate={() => onDuplicate(project.id)}
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
  selected,
  onSelect,
  onOpen,
  onOpenSizing,
  onRemove,
  onDuplicate,
  onDownloadPdf,
}: {
  project: SavedProject;
  client: Client | undefined;
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onOpenSizing: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onDownloadPdf: () => void;
}) {
  const hasSolution = Boolean(project.solution);
  const idleDays = daysSince(project.updatedAt);
  const isStale = !hasSolution && idleDays >= STALE_AFTER_DAYS;
  const systemCost =
    project.solution || project.services.length > 0
      ? calculateSystemCost(project.solution, userStockItems, project.services, userServices)
      : null;

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
          <Badge variant={hasSolution ? 'secondary' : 'outline'}>
            {hasSolution ? 'Solução calculada' : 'Sem solução calculada'}
          </Badge>
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={stopAnd(onOpen)}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={stopAnd(onOpenSizing)}>
            <Calculator className="h-4 w-4" />
            Dimensionamento
          </Button>
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
  userStockItems,
  userServices,
  onClose,
  onOpenSizing,
}: {
  project: SavedProject;
  client: Client | undefined;
  batteryCatalog: BatteryCatalogOption[];
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  onClose: () => void;
  onOpenSizing: () => void;
}) {
  const metrics = project.solution ? solutionMetrics(project.solution, batteryCatalog) : null;
  const systemCost =
    project.solution || project.services.length > 0
      ? calculateSystemCost(project.solution, userStockItems, project.services, userServices)
      : null;
  const { batteryModel, gridType, loads } = project.residentialOptions;
  const batteryParts = project.solution
    ? batteryQuantityBreakdown(
        project.solution.batteryModel,
        project.solution.batteryQty,
        batteryCatalog,
        (project.solution.inverterQty ?? 1) * (project.solution.batteryPortsUsed ?? 1)
      )
    : [];
  const [copied, setCopied] = useState(false);

  async function copyProjectData() {
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
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

      {project.address && <p className="text-xs text-muted-foreground">{project.address}</p>}

      <Separator />

      <ul className="space-y-2 text-sm">
        <Requirement done={Boolean(batteryModel)} label={batteryModel || 'Modelo da bateria'} />
        <Requirement done={Boolean(gridType)} label={gridType ? gridLabels[gridType] : 'Tipo de rede'} />
        <Requirement done={loads.length > 0} label={`${loads.length} carga(s) cadastrada(s)`} />
      </ul>

      {systemCost && systemCost.pricedItemsCount > 0 && (
        <>
          <Separator />
          <div className="rounded-lg border bg-background p-2.5">
            <p className="text-xs text-muted-foreground">Valor da solução</p>
            <p className="text-lg font-semibold">{formatCurrencyBRL(systemCost.totalCost)}</p>
            {!systemCost.isComplete && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Preço parcial: {systemCost.pricedItemsCount} de {systemCost.totalItemsCount} itens com valor no
                estoque.
              </p>
            )}
          </div>
        </>
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
            <div className="space-y-1">
              <p>
                Inversor <span className="font-medium text-foreground">{project.solution.inverterModel}</span>
              </p>
              {batteryParts.map((part, index) => (
                <p key={part.model}>
                  {index === 0 ? 'Bateria' : 'Bateria (expansão)'}{' '}
                  <span className="font-medium text-foreground">
                    {part.model} × {part.qty}
                  </span>
                </p>
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
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Acessórios</p>
                  {project.solution.accessories.map((accessory) => {
                    const { model, qty, optional, bundled, appliesTo } = normalizeAccessoryLine(accessory);
                    return (
                      <div key={model} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {model}
                          {qty !== 1 ? ` × ${qty}` : ''}
                        </span>
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

      {project.services.length > 0 && (
        <div className="space-y-1 rounded-lg border bg-background p-2.5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Serviços</p>
          {project.services.map((line) => {
            const unitValue = userServices.find((service) => service.id === line.serviceId)?.unitValue;
            return (
              <div key={line.serviceId} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {line.name}
                  {line.qty !== 1 ? ` × ${line.qty}` : ''}
                </span>
                <span className="shrink-0">{unitValue != null ? formatCurrencyBRL(unitValue * line.qty) : 'sem preço'}</span>
              </div>
            );
          })}
        </div>
      )}

      <Separator />

      <Button size="sm" className="w-full" onClick={onOpenSizing}>
        <Calculator className="h-4 w-4" />
        Ir para Dimensionamento
      </Button>

      <Button variant="outline" size="sm" className="w-full" onClick={copyProjectData}>
        {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
        {copied ? 'Dados copiados!' : 'Copiar dados'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Copia um resumo do projeto para colar no WhatsApp e pedir um orçamento ao vendedor.
      </p>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Atualizado em{' '}
        {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(project.updatedAt))}
      </p>
    </>
  );
}
