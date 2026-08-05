'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { isAddressEmpty } from '@/lib/address';
import type {
  BatteryTopology,
  ProjectStatus,
  ResidentialGridType,
} from '@/lib/types';
import { useWizardStore } from '@/lib/store/wizard-store';
import { cn } from '@/lib/utils';
import { calculateSystemCost, formatCurrencyBRL } from '../helpers';
import { PageHeader, PageSummary } from '../shell/slots';
import { Metric, ProjectListSkeleton, Requirement, SearchInput } from '../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';
import { gridLabels, projectStatusLabels, topologyLabels } from '../types';
import { NewProjectCard } from './project/NewProjectCard';
import { ProjectCard } from './project/ProjectCard';
import { ProjectDraftCard } from './project/ProjectDraftCard';
import { ProjectStatusToast } from './project/ProjectStatusToast';
import { SelectedProjectSummary } from './project/SelectedProjectSummary';

export function ProjectTab({
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
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
  onSave,
  onNew,
  onCancelNew,
  onOpen,
  onOpenSizing,
  onRemove,
  onDuplicate,
  onRefreshSolution,
  refreshingProjectId,
  onUpdateStatus,
  onDownloadPdf,
  onManageClients,
  onShowSummary,
  onHideSummary,
}: {
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
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
  onUpdateStatus: (id: string, status: ProjectStatus) => void;
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
}) {
  const {
    projectInfo,
    projectDetailsVisible,
    currentProjectId,
    savedProjects,
    clients,
    addClient,
    userStockItems,
    userServices,
    marginSettings,
    services,
    setProjectInfo,
    addServiceToProject: onAddService,
    removeServiceFromProject: onRemoveService,
    updateProjectServiceQty: onUpdateServiceQty,
  } = useWizardStore();
  const [search, setSearch] = useState('');
  const [nameSubmitAttempted, setNameSubmitAttempted] = useState(false);
  const nameError = nameSubmitAttempted && !projectInfo.name.trim();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'with' | 'without'>('all');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'client'>('recent');

  const selectedProject =
    !projectDetailsVisible && selectedProjectId
      ? savedProjects.find((project) => project.id === selectedProjectId) ?? null
      : null;

  const projectsWithSolutionCount = savedProjects.filter((project) => project.solution).length;
  const solutionsValue = savedProjects.reduce((total, project) => {
    if (!project.solution && project.services.length === 0) return total;
    const cost = calculateSystemCost(
      project.solution,
      userStockItems,
      project.services,
      userServices,
      marginSettings,
      batteryCatalog
    );
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
      const matchesQuoteStatus = quoteStatusFilter === 'all' || project.status === quoteStatusFilter;
      return matchesSearch && matchesStatus && matchesQuoteStatus;
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

  const editingProject = currentProjectId ? savedProjects.find((project) => project.id === currentProjectId) : null;
  const isDraftDirty = editingProject
    ? projectInfo.name !== editingProject.name ||
      projectInfo.clientId !== editingProject.clientId ||
      JSON.stringify(projectInfo.address) !== JSON.stringify(editingProject.address) ||
      projectInfo.notes !== editingProject.notes ||
      JSON.stringify(services) !== JSON.stringify(editingProject.services ?? [])
    : Boolean(
        projectInfo.name.trim() ||
          projectInfo.clientId ||
          !isAddressEmpty(projectInfo.address) ||
          projectInfo.notes.trim() ||
          services.length > 0
      );

  return (
    <div className="space-y-4">
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projeto</h1>
          <p className="text-sm text-muted-foreground">
            Escolha um cliente cadastrado e salve a configuração para reutilizar depois.
          </p>
        </div>
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
            onUpdateStatus={(status) => onUpdateStatus(selectedProject.id, status)}
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
                  aria-label="Filtrar por status da cotação"
                  value={quoteStatusFilter}
                  onChange={(event) => setQuoteStatusFilter(event.target.value as typeof quoteStatusFilter)}
                  className="h-10 shrink-0 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8"
                >
                  <option value="all">Todos os status</option>
                  {(Object.keys(projectStatusLabels) as ProjectStatus[]).map((value) => (
                    <option key={value} value={value}>
                      {projectStatusLabels[value]}
                    </option>
                  ))}
                </select>
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
            {savedProjects.length === 0 && !projectDetailsVisible && (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Novo por aqui?</p>
                <p className="mt-1">
                  Um fluxo comum: cadastre seus produtos e preços em <strong>Portfólio</strong>, adicione um{' '}
                  <strong>Cliente</strong>, depois crie um <strong>Novo projeto</strong> e finalize no{' '}
                  <strong>Dimensionamento</strong>. Você também pode só clicar em &quot;Novo projeto&quot; agora e
                  ajustar tudo depois.
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {!projectDetailsVisible && <NewProjectCard onClick={onNew} />}
              {projectDetailsVisible && !currentProjectId && (
                <ProjectDraftCard
                  projectInfo={projectInfo}
                  clients={clients}
                  isNew
                  isDirty={isDraftDirty}
                  setProjectInfo={setProjectInfo}
                  onManageClients={onManageClients}
                  onAddClient={addClient}
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
                    isDirty={isDraftDirty}
                    setProjectInfo={setProjectInfo}
                    onManageClients={onManageClients}
                    onAddClient={addClient}
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
                    batteryCatalog={batteryCatalog}
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
                    onUpdateStatus={(status) => onUpdateStatus(project.id, status)}
                    onDownloadPdf={() => onDownloadPdf(project.id)}
                  />
                )
              )}
            </div>
            {!projectDetailsVisible && savedProjects.length > 0 && filteredProjects.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum projeto encontrado para essa pesquisa.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
