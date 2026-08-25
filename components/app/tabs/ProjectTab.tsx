'use client';

import { useEffect, useState } from 'react';
import { Banknote, Calculator, ClipboardList, FolderOpen } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { isAddressEmpty } from '@/lib/address';
import type {
  BatteryTopology,
  ProjectServiceLine,
  ProjectStatus,
  ResidentialGridType,
} from '@/lib/types';
import { useWizardStore } from '@/lib/store/wizard-store';
import { calculateSystemCost, formatCurrencyBRL } from '../helpers';
import { PageHeader, PageSummary } from '../shell/slots';
import { Metric, ProjectListSkeleton, Requirement, SearchInput } from '../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InlineProfile, InverterCatalogOption } from '../types';
import { gridLabels, topologyLabels } from '../types';
import { NewProjectCard } from './project/NewProjectCard';
import { ProjectCard } from './project/ProjectCard';
import { ProjectDraftCard } from './project/ProjectDraftCard';
import { SelectedProjectSummary } from './project/SelectedProjectSummary';

/** Field-by-field comparison instead of `JSON.stringify` equality — Postgres'
 * jsonb column doesn't preserve each service line's key order on read, so a
 * project fresh out of the DB (e.g. right after saving) can carry
 * `{ qty, name, serviceId }` where the live draft still has
 * `{ serviceId, name, qty }`. `JSON.stringify` would call that "different"
 * and leave the draft stuck looking dirty (discard-confirmation on "Fechar")
 * even with nothing actually unsaved. */
function sameServiceLines(a: ProjectServiceLine[], b: ProjectServiceLine[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((line, index) => {
    const other = b[index];
    return line.serviceId === other.serviceId && line.name === other.name && line.qty === other.qty;
  });
}

export function ProjectTab({
  profile,
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
  initialLoading,
  topology,
  batteryModel,
  gridType,
  loadsCount,
  peakW,
  dailyKwh,
  hasSolution,
  onSave,
  onNew,
  onDemo = () => {},
  demoDisabled = false,
  onCancelNew,
  onOpen,
  onOpenSizing,
  onOpenWorkspace,
  onRemove,
  onRefreshSolution,
  refreshingProjectId,
  onUpdateStatus,
  onDownloadPdf,
  downloadingProjectId,
  onManageSuppliers,
  onOpenProfile = () => {},
  onManagePortfolio,
  onShowSummary,
  onHideSummary,
}: {
  profile: InlineProfile | null;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  initialLoading: boolean;
  topology: BatteryTopology | null;
  batteryModel: string | null;
  gridType: ResidentialGridType | null;
  loadsCount: number;
  peakW: number;
  dailyKwh: number;
  hasSolution: boolean;
  onSave: () => void;
  onNew: () => void;
  onDemo?: () => void;
  demoDisabled?: boolean;
  onCancelNew: () => void;
  onOpen: (id: string) => void;
  onOpenSizing: (id: string) => void;
  onOpenWorkspace?: (id: string) => void;
  onRemove: (id: string) => void;
  onRefreshSolution: (id: string) => void;
  /** Id of the project currently being recalculated, if any — used to show a
   * loading state on that project's "Atualizar" button specifically. */
  refreshingProjectId: string | null;
  onUpdateStatus: (id: string, status: ProjectStatus) => void;
  onDownloadPdf: (id: string) => void;
  /** Id of the project currently generating its PDF, if any — used to show a
   * loading state on that project's "Baixar Relatório" button specifically. */
  downloadingProjectId: string | null;
  /** Sends the seller to Fornecedores — used by the supplier quote-request modal
   *  when they haven't picked any suppliers there yet. */
  onManageSuppliers: () => void;
  onOpenProfile?: () => void;
  /** Sends the seller to Portfólio — used by the draft card's services empty
   *  state, so "Portfólio" can be a clickable jump instead of just naming
   *  the tab. */
  onManagePortfolio: () => void;
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
  // Landing here via the project-name link in Dimensionamento (or anywhere
  // else that leaves currentProjectId set without reopening the edit form)
  // pre-selects that project's card instead of the plain list — mirrors
  // clicking the card directly. Only matters on mount: this tab fully
  // unmounts on every switch away (see SinglePageApp's tab ternary), so a
  // later change to currentProjectId elsewhere shouldn't reach back in here.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() =>
    projectDetailsVisible ? null : currentProjectId
  );
  useEffect(() => {
    if (selectedProjectId) onShowSummary();
    // Mount-only, matching the state initializer above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      batteryCatalog,
      project.residentialOptions
    );
    return cost.pricedItemsCount > 0 ? total + cost.totalCost : total;
  }, 0);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProjects = savedProjects
    .filter((project) => {
      const clientName = clients.find((client) => client.id === project.clientId)?.name ?? '';
      return (
        project.name.toLowerCase().includes(normalizedSearch) || clientName.toLowerCase().includes(normalizedSearch)
      );
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

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
      !sameServiceLines(services, editingProject.services ?? [])
    : Boolean(
        projectInfo.name.trim() ||
          projectInfo.clientId ||
          !isAddressEmpty(projectInfo.address) ||
          projectInfo.notes.trim() ||
          services.length > 0
      );

  // Whichever saved project the summary panel should show: one picked from
  // the list, or — while editing — the one currently open, so the sidebar
  // stays the exact same rich summary (and its delete action)
  // instead of switching to a different, live-editing-only widget. Reflects
  // the last-saved snapshot, not the live in-progress draft (see
  // SelectedProjectSummary's own docstring) — that's intentional, matching
  // what a plain click on the card already shows.
  const summaryProject = selectedProject ?? (projectDetailsVisible ? editingProject ?? null : null);

  return (
    <div className="space-y-4">
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Escolha um cliente cadastrado e salve a configuração para reutilizar depois.
          </p>
        </div>
      </PageHeader>

      <PageSummary>
        {summaryProject ? (
          <SelectedProjectSummary
            project={summaryProject}
            client={clients.find((client) => client.id === summaryProject.clientId)}
            profile={profile}
            batteryCatalog={batteryCatalog}
            inverterCatalog={inverterCatalog}
            accessoryCatalog={accessoryCatalog}
            userStockItems={userStockItems}
            userServices={userServices}
            marginSettings={marginSettings}
            onClose={
              selectedProject
                ? () => {
                    setSelectedProjectId(null);
                    onHideSummary();
                  }
                : undefined
            }
            onOpenSizing={() => onOpenSizing(summaryProject.id)}
            onOpenWorkspace={() => onOpenWorkspace?.(summaryProject.id)}
            onUpdateStatus={(status) => onUpdateStatus(summaryProject.id, status)}
            onManageSuppliers={onManageSuppliers}
            onOpenProfile={onOpenProfile}
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
              <Requirement done={hasSolution} label={hasSolution ? 'Dimensionamento concluído' : 'Dimensionamento ainda não concluído'} />
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
            <p>Selecione um projeto na lista para ver o resumo, ou clique em &quot;Novo projeto&quot; para começar.</p>
          </div>
        )}
      </PageSummary>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Projetos salvos</h2>
          {savedProjects.length > 0 && !projectDetailsVisible && (
            <SearchInput value={search} onChange={setSearch} placeholder="Pesquisar projeto..." />
          )}
        </div>

        {savedProjects.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-background px-3 py-2 text-sm"
            role="group"
            aria-label="Resumo dos projetos"
          >
            <span className="flex items-baseline gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
              <strong className="tabular-nums">{savedProjects.length}</strong>
              <span className="text-xs text-muted-foreground">projeto{savedProjects.length !== 1 ? 's' : ''}</span>
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="flex items-baseline gap-1.5">
              <Calculator className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
              <strong className="tabular-nums">{projectsWithSolutionCount}</strong>
              <span className="text-xs text-muted-foreground">com solução</span>
            </span>
            {solutionsValue > 0 && (
              <>
                <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
                <span className="flex items-baseline gap-1.5">
                  <Banknote className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
                  <strong className="tabular-nums">{formatCurrencyBRL(solutionsValue)}</strong>
                  <span className="text-xs text-muted-foreground">valor total</span>
                </span>
              </>
            )}
          </div>
        )}

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
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {!projectDetailsVisible && <NewProjectCard onClick={onNew} onDemo={onDemo} demoDisabled={demoDisabled} />}
              {projectDetailsVisible && !currentProjectId && (
                <ProjectDraftCard
                  projectInfo={projectInfo}
                  clients={clients}
                  isNew
                  isDirty={isDraftDirty}
                  setProjectInfo={setProjectInfo}
                  onManagePortfolio={onManagePortfolio}
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
                    onManagePortfolio={onManagePortfolio}
                    onAddClient={addClient}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    onOpenSizing={() => onOpenSizing(project.id)}
                    nameError={nameError}
                    userServices={userServices}
                    services={services}
                    onAddService={onAddService}
                    onRemoveService={onRemoveService}
                    onUpdateServiceQty={onUpdateServiceQty}
                  />
                ) : projectDetailsVisible ? null : (
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
                    onOpenWorkspace={() => onOpenWorkspace?.(project.id)}
                    onRemove={() => onRemove(project.id)}
                    onRefreshSolution={() => onRefreshSolution(project.id)}
                    refreshing={refreshingProjectId === project.id}
                    onUpdateStatus={(status) => onUpdateStatus(project.id, status)}
                    onDownloadPdf={() => onDownloadPdf(project.id)}
                    downloading={downloadingProjectId === project.id}
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
