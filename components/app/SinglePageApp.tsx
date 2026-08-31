'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  BatteryCharging,
  Boxes,
  BookOpen,
  ChevronDown,
  ClipboardList,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  Menu,
  ShieldUser,
  ShoppingCart,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { isLimitError } from '@/lib/limits';
import { useWizardStore, totalDailyKwh, totalNominalW, totalPeakW } from '@/lib/store/wizard-store';
import { cn } from '@/lib/utils';
import { useAutosave } from './hooks/useAutosave';
import { useCalculation } from './hooks/useCalculation';
import { useInitialData } from './hooks/useInitialData';
import { useProfileActions } from './hooks/useProfileActions';
import { useProjectActions } from './hooks/useProjectActions';
import { useSizingController } from './hooks/useSizingController';
import { useProjectPdfDownload } from './hooks/useProjectPdfDownload';
import { useLivePdfExport } from './hooks/useLivePdfExport';
import { useQuoteSharing } from './hooks/useQuoteSharing';
import { AppFooter } from './shell/AppFooter';
import { AboutDialog } from './shell/AboutDialog';
import { SessionCard } from './shell/SessionCard';
import { useAppShellState } from './shell/useAppShellState';
import { useTabNavigation, type AppTab } from './shell/useTabNavigation';
import { useAuthenticatedNavigation } from './shell/useAuthenticatedNavigation';
import { useAppNavigationActions } from './shell/useAppNavigationActions';
import { SetSummaryActiveProvider, SummaryPortalProvider, TitleBarPortalProvider } from './shell/slots';
import { ProjectStatusToast } from './tabs/project/ProjectStatusToast';
import { ProjectTab } from './tabs/ProjectTab';
import { ProjectWorkspace } from './project-workspace/ProjectWorkspace';
import { CommercialIndustrialWorkspace } from './project-workspace/CommercialIndustrialWorkspace';
import type { PickerItemId } from './tabs/SizingTab';
import { GuidePage } from '../guide/GuidePage';
import { getGuideContent } from '@/content/guide';

/** Centered spinner shown while a tab's own chunk is still downloading —
 * only the initial tab (Projeto) is a static import, so every other tab
 * below is fetched on first visit instead of bloating the app's initial
 * bundle with code most sessions never touch (Catálogo, Fornecedores,
 * Clientes, Perfil) or with SizingTab's own large feature-picker tree. */
function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
    </div>
  );
}

const CatalogTab = dynamic(() => import('./tabs/CatalogTab').then((m) => m.CatalogTab), { loading: TabLoadingFallback });
const ClientsTab = dynamic(() => import('./tabs/ClientsTab').then((m) => m.ClientsTab), { loading: TabLoadingFallback });
const MyStockTab = dynamic(() => import('./tabs/MyStockTab').then((m) => m.MyStockTab), { loading: TabLoadingFallback });
const ProfileTab = dynamic(() => import('./tabs/ProfileTab').then((m) => m.ProfileTab), { loading: TabLoadingFallback });
const SupplyTab = dynamic(() => import('./tabs/SupplyTab').then((m) => m.SupplyTab), { loading: TabLoadingFallback });
const SizingTab = dynamic(() => import('./tabs/SizingTab').then((m) => m.SizingTab), { loading: TabLoadingFallback });

/** Marks the active bottom-nav tab as having a summary — purely decorative
 * (not its own button, since a <button> can't nest inside the tab's <button>);
 * tapping the already-active tab opens the summary instead of re-selecting it. */
// Labels the "Mais" bottom-nav button with whichever of its sub-sections is
// currently open, instead of always showing the generic "Mais" — otherwise a
// user has to reopen the sheet just to remember where they are.
const moreNavTabLabels: Partial<Record<'purchases' | 'clients' | 'profile', string>> = {
  purchases: 'Fornecedores',
  clients: 'Clientes',
  profile: 'Perfil',
};

const workspaceEditorIds: PickerItemId[] = [
  'gridType',
  'battery',
  'backup',
  'external_ats',
  'microgrid',
  'external_generator',
  'pv',
  'white_tariff',
];

type WorkspaceNavigationState = {
  open: boolean;
  resource: PickerItemId | null;
  technicalEditorOpen: boolean;
  configurationOpen: boolean;
  returnAvailable: boolean;
};

const closedWorkspaceNavigation: WorkspaceNavigationState = {
  open: false,
  resource: null,
  technicalEditorOpen: false,
  configurationOpen: false,
  returnAvailable: false,
};

function BottomNavSummaryBadge() {
  return (
    <span className="absolute -right-1.5 -top-1 flex h-3 w-3 items-center justify-center rounded-full border border-background bg-primary">
      <ClipboardList className="h-2 w-2 text-primary-foreground" />
    </span>
  );
}

export function SinglePageApp() {
  const router = useRouter();
  const locale = useLocale();
  const tc = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);
  const {
    projectInfo,
    currentProjectId,
    clients,
    savedProjects,
    userStockItems,
    userServices,
    marginSettings,
    services,
    setProjectInfo,
    residentialOptions,
    solution,
    secondarySolution,
    newProjectDraft,
    cancelProjectDraft,
    saveCurrentProject,
    loadProject,
    removeProject,
    refreshProjectSolution: refreshProjectSolutionAction,
    updateProjectStatus,
    fetchProjects,
    fetchClients,
    fetchUserLoadCatalog,
    fetchUserStockItems,
    fetchUserLoadPresets,
    fetchUserServices,
    fetchMarginSettings,
    updateMarginPercent,
    addClient,
    updateClient,
    removeClient,
    addToStock,
    updateStockItemValue,
    removeFromStock,
    addService,
    updateServiceName,
    updateServiceValue,
    updateServicePricingUnit,
    removeService,
    addServiceToProject,
    removeServiceFromProject,
    clearProjectServices,
    clearUserData,
    setTopology,
    setBatteryModel,
    setSecondaryBatteryModel,
    setInverterModel,
    setMinInverterQty,
    setGridType,
    setMaxPowerPerPhaseW,
    setDesiredFeatures,
    setWhiteTariffConfig,
    setMicrogridConfig,
    setGeneratorConfig,
    setPvConfig,
    setAtsPhotoUrl,
    setAtsBackupAcknowledged,
    setSolution,
    setSecondarySolution,
    setLoadCatalog,
    setLoadPresets,
    resetResidential,
    ciProjectInfo,
    currentCiProjectId,
    savedCiProjects,
    ciOptions,
    setCiProjectInfo,
    setCiOptions,
    newCiProjectDraft,
    cancelCiProjectDraft,
    saveCiProject,
    loadCiProject,
    removeCiProject,
    updateCiProjectStatus,
    fetchCiProjects,
  } = useWizardStore();

  const [pendingSupplyImport, setPendingSupplyImport] = useState(false);
  // Feedback while exportPdf() is generating the (non-instant) PDF blob —
  // exportingPdf covers every "Baixar relatório" trigger (Dimensionamento's
  // own buttons), downloadingProjectId additionally pins which saved
  // project's card button to spin, since several can be on screen at once.
  const [activeTab, setActiveTab] = useState<AppTab>('project');
  const [workspaceNavigation, setWorkspaceNavigation] = useState<WorkspaceNavigationState>(closedWorkspaceNavigation);
  const [initialNavigationReady, setInitialNavigationReady] = useState(false);
  const restoredWorkspaceIdRef = useRef<string | null>(null);
  const restoredCiWorkspaceIdRef = useRef<string | null>(null);
  const { open: workspaceOpen, resource: workspaceResource, technicalEditorOpen: workspaceTechnicalEditorOpen, configurationOpen: workspaceConfigurationOpen, returnAvailable: workspaceReturnAvailable } = workspaceNavigation;
  // workspaceOpen intentionally stays true while the user is off browsing
  // Fornecedores/Perfil/etc. mid-workspace (that's what lets "voltar ao
  // workspace" return them to the same spot) — so it alone can't drive the
  // sidebar's "Projetos" highlight, or that item would look permanently
  // selected. Only count it once the workspace/sizing view is what's
  // actually on screen.
  const viewingWorkspace = activeTab === 'sizing' && workspaceOpen;
  const hasAnySavedProjects = savedProjects.length > 0 || savedCiProjects.length > 0;
  const [guideOpen, setGuideOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [projectsMenuOpen, setProjectsMenuOpen] = useState(true);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0';
  const guideContent = useMemo(() => getGuideContent(locale), [locale]);

  const {
    mobileMenuOpen,
    setMobileMenuOpen,
    summaryDrawerOpen,
    setSummaryDrawerOpen,
    titleBarEl,
    setTitleBarEl,
    summaryEl,
    setSummaryEl,
    summaryActive,
    setSummaryActive,
    scrolled,
    scrollRef,
  } = useAppShellState(activeTab);

  // wizard-store persists to localStorage with skipHydration (see
  // lib/store/wizard-store.ts) so the server-rendered first paint always
  // matches the client's un-hydrated defaults; this pulls the saved state in
  // right after mount instead.
  useEffect(() => {
    void useWizardStore.persist.rehydrate();
  }, []);

  const {
    userEmail,
    setUserEmail,
    profile,
    setProfile,
    batteryCatalog,
    inverterCatalog,
    accessoryCatalog,
    approvedInverterCombos,
    initialLoading,
    userDataError,
    retryUserData,
  } = useInitialData({
    supabase,
    fetchClients,
    fetchProjects,
    fetchCiProjects,
    fetchUserLoadCatalog,
    fetchUserStockItems,
    fetchUserLoadPresets,
    fetchUserServices,
    fetchMarginSettings,
    setLoadCatalog,
    setLoadPresets,
  });

  const {
    profileSaving,
    profileMessage,
    profileError,
    profileDirty,
    openProfile,
    saveProfile,
    uploadCompanyLogo,
    deleteAccountOpen,
    setDeleteAccountOpen,
    deleteConfirmText,
    setDeleteConfirmText,
    deletingAccount,
    deleteAccountError,
    setDeleteAccountError,
    deleteAccount,
  } = useProfileActions({ supabase, profile, setProfile, router, locale, clearUserData, setActiveTab });

  const { changeTab, openMobileTab } = useTabNavigation({
    activeTab,
    setActiveTab,
    profileDirty,
    setMobileMenuOpen,
  });

  const { openClientsManager, openPurchasesTab, openPortfolioTab, quoteSolution } = useAuthenticatedNavigation({
    authenticated: Boolean(userEmail),
    onRequireAuthentication: () => router.push(`/${locale}/login?redirect=/${locale}`),
    changeTab,
    setPendingSupplyImport,
  });

  const {
    openProjectFromClient,
    backToProject,
    signOut,
    signOutError,
    signingOut,
    openMobilePurchasesTab,
    openMobileProfile,
    openMobileClientsManager,
  } = useAppNavigationActions({
    supabase,
    router,
    locale,
    loadProject,
    openWorkspace: openProjectWorkspace,
    changeTab,
    setProfile,
    setUserEmail,
    clearUserData,
    setMobileMenuOpen,
    openPurchasesTab,
    openProfile,
    openClientsManager,
    profileDirty,
  });

  const {
    projectStatus,
    statusId,
    dismissProjectStatus,
    reportStatus,
    saveProject,
    startNewProject,
    cancelNewProject,
    openProject,
    openProjectSizing,
    deleteProject,
    refreshProjectSolution,
    updateProjectStatus: updateProjectStatusAction,
    refreshingProjectId,
  } = useProjectActions({
    profile,
    router,
    locale,
    saveCurrentProject,
    newProjectDraft,
    cancelProjectDraft,
    loadProject,
    removeProject,
    refreshProjectSolution: refreshProjectSolutionAction,
    updateProjectStatus,
    onProjectSaved: (project) => openProjectWorkspace(project.id),
    setActiveTab: changeTab,
  });

  // C&I actions reuse the same toast (reportStatus, above) instead of a
  // parallel status mechanism — it's already generic (just a message
  // setter), see useProjectActions.ts's own docstring on reportStatus.
  function startNewCiProject() {
    newCiProjectDraft();
    changeTab('ciWorkspace');
    reportStatus(null);
  }

  async function saveCiProject_() {
    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }
    try {
      const project = await saveCiProject();
      openCiProjectWorkspace(project.id);
      reportStatus(`Projeto "${project.name}" salvo.`);
    } catch (error) {
      reportStatus(isLimitError(error) ? error.message : 'Não foi possível salvar o projeto. Tente novamente.');
    }
  }

  async function deleteCiProject(id: string) {
    try {
      await removeCiProject(id);
      reportStatus('Projeto removido.');
    } catch {
      reportStatus('Não foi possível remover o projeto.');
    }
  }

  async function updateCiProjectStatusAction(id: string, status: Parameters<typeof updateCiProjectStatus>[1]) {
    try {
      await updateCiProjectStatus(id, status);
    } catch {
      reportStatus('Não foi possível atualizar o status do projeto. Tente novamente.');
    }
  }

  function openProjectWorkspace(id: string) {
    loadProject(id, { showDetails: false });
    setWorkspaceNavigation({ open: true, resource: null, technicalEditorOpen: false, configurationOpen: false, returnAvailable: false });
    setSummaryDrawerOpen(false);
    changeTab('sizing');
    const url = new URL(window.location.href);
    url.searchParams.set('workspaceId', id);
    url.searchParams.set('workspace', 'overview');
    url.searchParams.delete('workspaceResource');
    window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  // C&I has no resource/configuration sub-editors yet (docs/CI-MODULE-PLAN.md
  // Fase 6 "fatia estreita" — just create/identify/save), so unlike
  // openProjectWorkspace this doesn't need a workspaceNavigation state; the
  // dedicated 'ciWorkspace' tab is enough.
  function openCiProjectWorkspace(id: string) {
    loadCiProject(id, { showDetails: false });
    setSummaryDrawerOpen(false);
    changeTab('ciWorkspace');
    const url = new URL(window.location.href);
    url.searchParams.set('ciWorkspaceId', id);
    window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function openWorkspaceResource(id: PickerItemId) {
    setWorkspaceNavigation({ open: true, resource: id, technicalEditorOpen: true, configurationOpen: false, returnAvailable: true });
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', 'resource');
    url.searchParams.set('workspaceResource', id);
    window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function openWorkspaceBudget() {
    setWorkspaceNavigation({ open: false, resource: null, technicalEditorOpen: false, configurationOpen: false, returnAvailable: true });
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', 'budget');
    url.searchParams.delete('workspaceResource');
    window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    quoteSolution();
  }

  function returnToWorkspace() {
    setWorkspaceNavigation({ open: true, resource: null, technicalEditorOpen: false, configurationOpen: false, returnAvailable: false });
    changeTab('sizing');
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', 'overview');
    url.searchParams.delete('workspaceResource');
    window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function openWorkspaceLoads() {
    setWorkspaceNavigation({ open: true, resource: null, technicalEditorOpen: false, configurationOpen: false, returnAvailable: false });
    changeTab('sizing');
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', 'loads');
    url.searchParams.delete('workspaceResource');
    window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new CustomEvent('workspace-section-change', { detail: 'loads' }));
  }

  function openWorkspaceConfiguration(initialItem: 'gridType' | 'battery' = 'gridType') {
    const batteryConfiguration = initialItem === 'battery';
    setWorkspaceNavigation({ open: true, resource: batteryConfiguration ? initialItem : null, technicalEditorOpen: true, configurationOpen: true, returnAvailable: true });
    changeTab('sizing');
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', 'configuration');
    if (batteryConfiguration) url.searchParams.set('workspaceResource', initialItem);
    else url.searchParams.delete('workspaceResource');
    window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new CustomEvent('workspace-section-change', { detail: 'configuration' }));
  }

  function clearWorkspaceUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('workspace');
    url.searchParams.delete('workspaceId');
    url.searchParams.delete('workspaceResource');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function clearCiWorkspaceUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('ciWorkspaceId');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  // A workspace URL is durable across refreshes without introducing a new
  // persistence model. Projects are loaded from the existing store once the
  // initial project fetch completes, then the current workspace is restored.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workspaceId = params.get('workspaceId');
    const ciWorkspaceId = params.get('ciWorkspaceId');

    if (ciWorkspaceId) {
      if (restoredCiWorkspaceIdRef.current === ciWorkspaceId) {
        setInitialNavigationReady(true);
        return;
      }
      if (!savedCiProjects.some((project) => project.id === ciWorkspaceId)) {
        if (!initialLoading) {
          // An invalid or unavailable ciWorkspaceId should fall back to the
          // normal project screen once the initial C&I project fetch completes.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setInitialNavigationReady(true);
        }
        return;
      }
      restoredCiWorkspaceIdRef.current = ciWorkspaceId;
      loadCiProject(ciWorkspaceId, { showDetails: false });
      startTransition(() => {
        setInitialNavigationReady(true);
        changeTab('ciWorkspace');
      });
      return;
    }

    if (!workspaceId) {
      restoredWorkspaceIdRef.current = null;
      // The first client render must match the server render; reveal the
      // regular app only after the initial URL has been checked.
      setInitialNavigationReady(true);
      return;
    }
    if (workspaceOpen || restoredWorkspaceIdRef.current === workspaceId) {
      setInitialNavigationReady(true);
      return;
    }
    if (!savedProjects.some((project) => project.id === workspaceId)) {
      if (!initialLoading) {
        // An invalid or unavailable workspace URL should fall back to the
        // normal project screen once the initial project fetch is complete.
        setInitialNavigationReady(true);
      }
      return;
    }

    restoredWorkspaceIdRef.current = workspaceId;
    loadProject(workspaceId, { showDetails: false });
    const requestedEditor = params.get('workspaceResource');
    const editor = workspaceEditorIds.find((id) => id === requestedEditor) ?? null;
    const configurationOpen = params.get('workspace') === 'configuration';
    startTransition(() => {
      setWorkspaceNavigation({ open: true, resource: editor, technicalEditorOpen: Boolean(editor) || configurationOpen, configurationOpen, returnAvailable: false });
      setInitialNavigationReady(true);
      changeTab('sizing');
    });
  }, [changeTab, initialLoading, loadProject, loadCiProject, savedProjects, savedCiProjects, workspaceOpen]);

  // Autosave replaces the sizing tab's old manual "Salvar projeto" button —
  // only while actually viewing that tab, logged in, and once something is
  // worth persisting (an empty draft loading its defaults shouldn't create a
  // project). See useAutosave for why enabling it re-baselines instead of
  // saving immediately (a project just finishing its load looks like a
  // "change" too, but isn't an edit).
  const autosaveData = useMemo(() => ({ projectInfo, residentialOptions, solution }), [projectInfo, residentialOptions, solution]);
  const { status: autosaveStatus, lastSavedAt: autosaveLastSavedAt } = useAutosave({
    enabled: Boolean(profile) && activeTab === 'sizing' && Boolean(residentialOptions.gridType || residentialOptions.loads.length > 0),
    data: autosaveData,
    saveCurrentProject,
  });

  const dailyKwh = totalDailyKwh(residentialOptions.loads, residentialOptions.operationHours);
  const peakW = totalPeakW(residentialOptions.loads, residentialOptions.peakCalcMode ?? 'sum');
  const nominalW = totalNominalW(residentialOptions.loads);

  const { loading, error, secondaryError, canCalculate, hasUncalculatedChanges, calculate, productMedia } = useCalculation({
    supabase,
    residentialOptions,
    projectInfo,
    peakW,
    dailyKwh,
    solution,
    setSolution,
    secondarySolution,
    setSecondarySolution,
    inverterCatalog,
    batteryCatalog,
    accessoryCatalog,
    approvedInverterCombos,
  });

  const {
    availableInverterModels,
    availableInverterModelsByTopology,
    setBatteryModel: setSizingBatteryModel,
    setSecondaryBatteryModel: setSizingSecondaryBatteryModel,
    setInverterModel: setSizingInverterModel,
    setMinInverterQty: setSizingMinInverterQty,
    resetResidentialToDefaults,
    chooseMicrogridVariant,
    uploadFeaturePhoto,
    calculateAndShowSummary,
  } = useSizingController({
    supabase,
    profile,
    residentialOptions,
    batteryCatalog,
    inverterCatalog,
    approvedInverterCombos,
    calculate,
    solution,
    setSolution,
    setSummaryDrawerOpen,
    setBatteryModel,
    setSecondaryBatteryModel,
    setInverterModel,
    setMinInverterQty,
    setMaxPowerPerPhaseW,
    resetResidential,
  });

  // Recalculates the currently open project from the live residentialOptions
  // being edited on screen, not the last-autosaved snapshot in savedProjects
  // (that's what refreshProjectSolution below reads, which is meant for
  // recalculating a project from the projects list, outside of editing).
  // Reusing that action here made "Recalcular solução" replay whatever error
  // was present before the user's most recent edit, until autosave's 12s
  // debounce caught up — even after the user had already fixed the problem.
  async function recalculateCurrentProjectSolution() {
    if (!canCalculate) {
      reportStatus('Complete a configuração de rede, bateria e cargas antes de recalcular.');
      return;
    }
    const resultError = await calculate();
    reportStatus(resultError ?? 'Solução recalculada.');
  }

  function resetWorkspaceProject() {
    resetResidentialToDefaults();
    clearProjectServices();
    useWizardStore.setState((state) => {
      if (!state.currentProjectId) return {};
      return {
        savedProjects: state.savedProjects.map((project) =>
          project.id === state.currentProjectId
            ? { ...project, residentialOptions: state.residentialOptions, solution: null, services: [] }
            : project
        ),
      };
    });
  }

  const { downloadingProjectId, downloadProjectPdf } = useProjectPdfDownload({
    savedProjects,
    clients,
    profile,
    userStockItems,
    marginSettings,
    userServices,
    batteryCatalog,
    inverterCatalog,
    accessoryCatalog,
    reportStatus,
  });

  const { exportingPdf, exportPdf, lastReport, downloadLastReport, clearLastReport } = useLivePdfExport({
    projectInfo,
    projectId: currentProjectId,
    residentialOptions,
    solution,
    secondarySolution,
    client: clients.find((client) => client.id === projectInfo.clientId) ?? null,
    profile,
    batteryCatalog,
    inverterCatalog,
    accessoryCatalog,
    productMedia,
    userStockItems,
    marginSettings,
    services,
    userServices,
    nominalW,
    peakW,
    dailyKwh,
    canCalculate: Boolean(canCalculate),
    reportStatus,
  });

  const { sendingQuote, canSendQuoteByWhatsApp, sendQuoteByWhatsApp } = useQuoteSharing({
    projectInfo,
    residentialOptions,
    solution,
    secondarySolution,
    clients,
    profile,
    savedProjects,
    currentProjectId,
    batteryCatalog,
    inverterCatalog,
    accessoryCatalog,
    productMedia,
    userStockItems,
    marginSettings,
    services,
    userServices,
    nominalW,
    peakW,
    dailyKwh,
    updateProjectStatus: updateProjectStatusAction,
  });

  return (
    <main className="app-shell h-screen overflow-hidden bg-background">
      {projectStatus && (
        <ProjectStatusToast key={statusId} message={projectStatus} onDismiss={dismissProjectStatus} />
      )}
      <div
        className={cn(
          'mx-auto grid h-full w-full max-w-[1920px] grid-rows-[minmax(0,1fr)] lg:grid-cols-[264px_minmax(0,1fr)] lg:grid-rows-[1fr]',
          summaryActive ? 'xl:grid-cols-[264px_minmax(0,1fr)_380px]' : 'xl:grid-cols-[264px_minmax(0,1fr)]'
        )}
      >
        <aside className="hidden border-r bg-card px-4 py-5 lg:flex lg:flex-col">
          <div className="flex items-center gap-2">
            <Image
              src="/images/login/solax-logo.png"
              alt="SolaX"
              width={116}
              height={40}
              priority
              className="h-8 w-auto object-contain"
            />
            <div className="border-l pl-3">
              <p className="font-semibold leading-tight">Calculator</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1" aria-label="Navegação principal">
            <button
              type="button"
              aria-current={!guideOpen && (activeTab === 'project' || activeTab === 'ciWorkspace' || viewingWorkspace) ? 'page' : undefined}
              aria-expanded={hasAnySavedProjects ? projectsMenuOpen : undefined}
              onClick={() => {
                setGuideOpen(false);
                changeTab('project');
                if (hasAnySavedProjects) setProjectsMenuOpen((open) => !open);
              }}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                !guideOpen && (activeTab === 'project' || activeTab === 'ciWorkspace' || viewingWorkspace) &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <FolderOpen className="h-4 w-4" />
              <span className="flex-1">Projetos</span>
              {hasAnySavedProjects && (
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 transition-transform', !projectsMenuOpen && '-rotate-90')}
                  aria-hidden="true"
                />
              )}
            </button>
            {hasAnySavedProjects && projectsMenuOpen && (
              <div role="group" aria-label="Workspaces" className="ml-4 space-y-0.5 border-l pl-2">
                {savedProjects.map((project) => {
                  const active = viewingWorkspace && currentProjectId === project.id;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      aria-label={`Abrir workspace ${project.name}`}
                      aria-current={active ? 'page' : undefined}
                      title={project.name}
                      onClick={() => {
                        setGuideOpen(false);
                        openProjectWorkspace(project.id);
                      }}
                      className={cn(
                        'flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                        active && 'bg-primary/10 font-medium text-foreground'
                      )}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{project.name}</span>
                    </button>
                  );
                })}
                {savedCiProjects.length > 0 && (
                  <>
                    <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      C&amp;I
                    </p>
                    {savedCiProjects.map((project) => {
                      const active = activeTab === 'ciWorkspace' && currentCiProjectId === project.id;
                      return (
                        <button
                          key={project.id}
                          type="button"
                          aria-label={`Abrir workspace ${project.name}`}
                          aria-current={active ? 'page' : undefined}
                          title={project.name}
                          onClick={() => {
                            setGuideOpen(false);
                            openCiProjectWorkspace(project.id);
                          }}
                          className={cn(
                            'flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                            active && 'bg-primary/10 font-medium text-foreground'
                          )}
                        >
                          <BatteryCharging className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{project.name}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              aria-current={!guideOpen && activeTab === 'catalog' ? 'page' : undefined}
              onClick={() => { setGuideOpen(false); changeTab('catalog'); }}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                !guideOpen && activeTab === 'catalog' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <Boxes className="h-4 w-4" />
              Catálogo
            </button>
            <button
              type="button"
              aria-current={!guideOpen && activeTab === 'myStock' ? 'page' : undefined}
              onClick={() => { setGuideOpen(false); changeTab('myStock'); }}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                !guideOpen && activeTab === 'myStock' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <Wallet className="h-4 w-4" />
              Portfólio
            </button>
            <button
              type="button"
              aria-current={!guideOpen && activeTab === 'purchases' ? 'page' : undefined}
              onClick={() => { setGuideOpen(false); openPurchasesTab(); }}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                !guideOpen && activeTab === 'purchases' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <ShoppingCart className="h-4 w-4" />
              Fornecedores
            </button>
            <button
              type="button"
              aria-current={!guideOpen && activeTab === 'clients' ? 'page' : undefined}
              onClick={() => { setGuideOpen(false); openClientsManager(); }}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                !guideOpen && activeTab === 'clients' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <Users className="h-4 w-4" />
              Clientes
            </button>
            <button
              type="button"
              aria-current={!guideOpen && activeTab === 'profile' ? 'page' : undefined}
              onClick={() => { setGuideOpen(false); openProfile(); }}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                !guideOpen && activeTab === 'profile' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <UserRound className="h-4 w-4" />
              Perfil
            </button>
            <button
              type="button"
              aria-current={guideOpen ? 'page' : undefined}
              onClick={() => setGuideOpen(true)}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                guideOpen && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <BookOpen className="h-4 w-4" />
              Guia básico
            </button>
            {profile?.role === 'admin' && (
              <Link
                href={`/${locale}/admin`}
                className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ShieldUser className="h-4 w-4" />
                Administração
              </Link>
            )}
          </nav>

          <div className="mt-auto space-y-2">
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Info className="h-4 w-4" />
              Sobre e contribuir
            </button>
            <SessionCard
              profile={profile}
              userEmail={userEmail}
              onOpenProfile={openProfile}
              onSignOut={signOut}
              signingOut={signingOut}
              signOutError={signOutError}
            />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col pb-16 lg:pb-0">
          {/* Mobile only: the page title (portaled in per-tab via PageHeader)
           * doubles as the app's top bar, with a small brand mark and quick
           * profile action framing it — this used to be a separate bar
           * stacked above the title bar, which wasted vertical space and
           * duplicated the SolaX brand mark already shown in the sidebar/nav. */}
          <div
            className={cn(
              // items-start (not -center): the portaled title block below is
              // usually 2+ lines on mobile (title + description, sometimes
              // also a button row) — centering the icon/button beside it made
              // them float around its vertical middle instead of lining up
              // with the title. Only matters on mobile: both side elements
              // are lg:hidden, so desktop's single remaining flex child makes
              // this a no-op there.
              'z-20 flex shrink-0 items-start gap-2 bg-background/95 backdrop-blur transition-[padding,box-shadow] duration-200',
              viewingWorkspace && 'lg:hidden',
              scrolled ? 'px-4 py-2 shadow-sm lg:px-6' : 'px-4 py-4 lg:px-6'
            )}
          >
            <div className="flex h-8 w-[4.75rem] shrink-0 items-center lg:hidden">
              <Image
                src="/images/login/solax-logo.png"
                alt="SolaX"
                width={96}
                height={33}
                className="h-auto w-full object-contain"
              />
            </div>
            <div
              ref={setTitleBarEl}
              className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
            />
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Abrir perfil"
              onClick={openProfile}
              className="shrink-0 lg:hidden"
            >
              <UserRound className="h-4 w-4" />
            </Button>
          </div>

          <section ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-4 lg:px-6 lg:pb-5">
            <TitleBarPortalProvider value={titleBarEl}>
              <SummaryPortalProvider value={summaryEl}>
                <SetSummaryActiveProvider value={setSummaryActive}>
                  {userDataError && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      <span>{userDataError}</span>
                      <Button variant="outline" size="sm" onClick={retryUserData}>
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                  {!initialNavigationReady ? (
                    <TabLoadingFallback />
                  ) : guideOpen ? (
                    <GuidePage content={guideContent} embedded />
                  ) : activeTab === 'project' ? (
            <ProjectTab
              batteryCatalog={batteryCatalog}
              inverterCatalog={inverterCatalog}
              accessoryCatalog={accessoryCatalog}
              initialLoading={initialLoading}
              topology={residentialOptions.topology}
              batteryModel={residentialOptions.batteryModel}
              gridType={residentialOptions.gridType}
              loadsCount={residentialOptions.loads.length}
              peakW={peakW}
              dailyKwh={dailyKwh}
              hasSolution={Boolean(solution)}
              onSave={saveProject}
              onNew={startNewProject}
              onCancelNew={cancelNewProject}
              onOpen={openProject}
              onOpenSizing={(id) => { clearWorkspaceUrl(); setWorkspaceNavigation(closedWorkspaceNavigation); openProjectSizing(id); }}
              onOpenWorkspace={openProjectWorkspace}
              onRemove={deleteProject}
              onRefreshSolution={refreshProjectSolution}
              refreshingProjectId={refreshingProjectId}
              onUpdateStatus={updateProjectStatusAction}
              onDownloadPdf={downloadProjectPdf}
              downloadingProjectId={downloadingProjectId}
              onManagePortfolio={openPortfolioTab}
              onShowSummary={() => setSummaryDrawerOpen(true)}
              onHideSummary={() => setSummaryDrawerOpen(false)}
              savedCiProjects={savedCiProjects}
              onNewCi={startNewCiProject}
              onOpenCi={openCiProjectWorkspace}
              onRemoveCi={deleteCiProject}
              onUpdateCiStatus={updateCiProjectStatusAction}
            />
          ) : activeTab === 'catalog' ? (
            <CatalogTab
              initialLoading={initialLoading}
              inverterCatalog={inverterCatalog}
              batteryCatalog={batteryCatalog}
              accessoryCatalog={accessoryCatalog}
              userStockItems={userStockItems}
              onAddToStock={addToStock}
            />
          ) : activeTab === 'myStock' ? (
            <MyStockTab
              userStockItems={userStockItems}
              inverterCatalog={inverterCatalog}
              batteryCatalog={batteryCatalog}
              accessoryCatalog={accessoryCatalog}
              onAddToStock={addToStock}
              onUpdateValue={updateStockItemValue}
              onRemove={removeFromStock}
              userServices={userServices}
              onAddService={addService}
              onUpdateServiceName={updateServiceName}
              onUpdateServiceValue={updateServiceValue}
              onUpdateServicePricingUnit={updateServicePricingUnit}
              onRemoveService={removeService}
              marginSettings={marginSettings}
              onUpdateMarginPercent={updateMarginPercent}
            />
          ) : activeTab === 'purchases' ? (
            <SupplyTab
              onShowSummary={() => setSummaryDrawerOpen(true)}
              onBackToWorkspace={workspaceReturnAvailable ? returnToWorkspace : undefined}
              batteryCatalog={batteryCatalog}
              autoImportFromSolution={pendingSupplyImport}
              onAutoImportHandled={() => setPendingSupplyImport(false)}
              profile={profile}
            />
          ) : activeTab === 'clients' ? (
            <ClientsTab
              clients={clients}
              savedProjects={savedProjects}
              onAdd={addClient}
              onUpdate={updateClient}
              onRemove={removeClient}
              onOpenProject={openProjectFromClient}
            />
          ) : activeTab === 'profile' ? (
            profile && (
              <ProfileTab
                profile={profile}
                setProfile={setProfile}
                profileSaving={profileSaving}
                profileMessage={profileMessage}
                profileError={profileError}
                saveProfile={saveProfile}
                uploadCompanyLogo={uploadCompanyLogo}
                signOut={signOut}
                deleteAccountOpen={deleteAccountOpen}
                setDeleteAccountOpen={setDeleteAccountOpen}
                deleteConfirmText={deleteConfirmText}
                setDeleteConfirmText={setDeleteConfirmText}
                deletingAccount={deletingAccount}
                deleteAccountError={deleteAccountError}
                setDeleteAccountError={setDeleteAccountError}
                deleteAccount={deleteAccount}
              />
            )
          ) : activeTab === 'ciWorkspace' ? (
            <CommercialIndustrialWorkspace
              projectInfo={ciProjectInfo}
              clients={clients}
              profile={profile}
              onUpdateProjectInfo={setCiProjectInfo}
              onSaveProject={() => { void saveCiProject_(); }}
              onBackToProjects={() => { clearCiWorkspaceUrl(); cancelCiProjectDraft(); changeTab('project'); }}
              ciOptions={ciOptions}
              onUpdateCiOptions={setCiOptions}
              currentCiProjectId={currentCiProjectId}
              autosaveStatus="idle"
              autosaveLastSavedAt={null}
            />
          ) : (
            <ProjectWorkspace
              enabled={workspaceOpen && Boolean(currentProjectId)}
              projectInfo={projectInfo}
              client={clients.find((item) => item.id === projectInfo.clientId)}
              clients={clients}
              residentialOptions={residentialOptions}
              solution={solution}
              nominalW={nominalW}
              peakW={peakW}
              dailyKwh={dailyKwh}
              solutionIsStale={hasUncalculatedChanges}
              inverterCatalog={inverterCatalog}
              batteryCatalog={batteryCatalog}
              productMedia={productMedia}
              availableInverterModels={availableInverterModels}
              onBackToProjects={() => { clearWorkspaceUrl(); backToProject(); }}
              onUpdateProjectInfo={setProjectInfo}
              onSaveProject={() => { void saveProject(); }}
              onCancelProjectEdit={() => { cancelProjectDraft(); returnToWorkspace(); }}
              activeResourceId={workspaceResource && workspaceResource !== 'gridType' && workspaceResource !== 'battery' ? workspaceResource : null}
              onOpenResource={openWorkspaceResource}
              onOpenTechnical={openWorkspaceConfiguration}
              onRefreshSolution={currentProjectId ? () => { void recalculateCurrentProjectSolution(); } : undefined}
              recalculatingSolution={loading}
              onOpenConfiguration={openWorkspaceConfiguration}
              technicalEditorOpen={workspaceTechnicalEditorOpen}
              onResetSizing={resetWorkspaceProject}
              services={services}
              userServices={userServices}
              onAddService={addServiceToProject}
              onRemoveService={removeServiceFromProject}
              onAddToStock={addToStock}
              onUpdateStockItemValue={updateStockItemValue}
              onUpdateServiceValue={updateServiceValue}
              quoteProject={currentProjectId ? savedProjects.find((project) => project.id === currentProjectId) : undefined}
              profile={profile}
              userStockItems={userStockItems}
              marginSettings={marginSettings}
              onUpdateStatus={currentProjectId ? (status) => { void updateProjectStatusAction(currentProjectId, status); } : undefined}
              onManageSuppliers={openPurchasesTab}
              onOpenProfile={openProfile}
              onManagePortfolio={openPortfolioTab}
              onOpenBudget={openWorkspaceBudget}
              onChooseMicrogridVariant={chooseMicrogridVariant}
              onGenerateReport={exportPdf}
              generatingReport={exportingPdf}
              lastReport={lastReport}
              onDownloadLastReport={downloadLastReport}
              onClearLastReport={clearLastReport}
              autosaveStatus={autosaveStatus}
              autosaveLastSavedAt={autosaveLastSavedAt}
            >
              <SizingTab
                projectName={projectInfo.name}
                currentProjectId={currentProjectId}
                onBackToProject={() => { clearWorkspaceUrl(); backToProject(); }}
                loadingLabel={tc('loading')}
                calculateLabel={tc('calculate')}
                residentialOptions={residentialOptions}
                batteryCatalog={batteryCatalog}
                inverterCatalog={inverterCatalog}
                availableInverterModels={availableInverterModels}
                availableInverterModelsByTopology={availableInverterModelsByTopology}
                solution={solution}
                secondarySolution={secondarySolution}
                secondaryError={secondaryError}
                nominalW={nominalW}
                peakW={peakW}
                dailyKwh={dailyKwh}
                canCalculate={Boolean(canCalculate)}
                hasUncalculatedChanges={hasUncalculatedChanges}
                loading={loading}
                initialLoading={initialLoading}
                error={error}
                setTopology={setTopology}
                setBatteryModel={setSizingBatteryModel}
                setSecondaryBatteryModel={setSizingSecondaryBatteryModel}
                setInverterModel={setSizingInverterModel}
                setMinInverterQty={setSizingMinInverterQty}
                setGridType={setGridType}
                setDesiredFeatures={setDesiredFeatures}
                setWhiteTariffConfig={setWhiteTariffConfig}
                setMicrogridConfig={setMicrogridConfig}
                setGeneratorConfig={setGeneratorConfig}
                setPvConfig={setPvConfig}
                setAtsPhotoUrl={setAtsPhotoUrl}
                setAtsBackupAcknowledged={setAtsBackupAcknowledged}
                onUploadFeaturePhoto={uploadFeaturePhoto}
                resetResidential={resetResidentialToDefaults}
                calculate={calculateAndShowSummary}
                exportPdf={exportPdf}
                exportingPdf={exportingPdf}
                onSendQuote={sendQuoteByWhatsApp}
                sendingQuote={sendingQuote}
                canSendQuoteByWhatsApp={canSendQuoteByWhatsApp}
                onQuoteSolution={quoteSolution}
                autosaveStatus={autosaveStatus}
                autosaveLastSavedAt={autosaveLastSavedAt}
                productMedia={productMedia}
                userStockItems={userStockItems}
                services={services}
                userServices={userServices}
                marginSettings={marginSettings}
                onChooseMicrogridVariant={chooseMicrogridVariant}
                summaryDrawerOpen={summaryDrawerOpen}
                initialActiveItem={workspaceResource}
                onBackToWorkspace={workspaceReturnAvailable ? returnToWorkspace : undefined}
                onOpenWorkspaceLoads={openWorkspaceLoads}
                workspaceMode={workspaceOpen}
                workspaceConfigurationMode={workspaceConfigurationOpen}
                workspaceResourceMode={workspaceTechnicalEditorOpen && Boolean(workspaceResource) && !workspaceConfigurationOpen}
              />
            </ProjectWorkspace>
          )}
                </SetSummaryActiveProvider>
              </SummaryPortalProvider>
            </TitleBarPortalProvider>
          </section>

          <AppFooter version={appVersion} onOpenAbout={() => setAboutOpen(true)} />
        </div>

        {/* Below xl this becomes a slide-in drawer (same pattern as the nav
         * drawer further down) instead of the fixed right column, so the
         * summary content portaled in via PageSummary stays reachable on
         * mobile/tablet instead of just being display:none'd away.
         * No padding on the scroll wrapper on purpose: this is the scrolling
         * ancestor sticky children (see SizingTab's summary header) measure
         * `top` against — padding on the scroller itself creates a gap those
         * children can't cleanly cancel. Padding instead lives on each child
         * below. */}
        <aside
          role={summaryDrawerOpen && summaryActive ? 'dialog' : undefined}
          aria-modal={summaryDrawerOpen && summaryActive ? true : undefined}
          aria-label={summaryDrawerOpen && summaryActive ? 'Resumo' : undefined}
          className={cn(
            'xl:z-auto xl:min-h-0 xl:w-auto xl:max-w-none xl:flex-col xl:overflow-y-auto xl:border-l xl:bg-card xl:shadow-none',
            // Tabs that never call PageSummary (Catálogo, Portfólio, Perfil)
            // shouldn't reserve a permanently empty 460px column on desktop —
            // the grid template above drops that column too when inactive.
            summaryActive ? 'xl:static xl:flex' : 'xl:hidden',
            summaryDrawerOpen && summaryActive
              ? 'fixed inset-y-0 right-0 z-50 flex w-[88vw] max-w-sm flex-col overflow-y-auto border-l bg-card shadow-xl'
              : 'hidden'
          )}
        >
          {/* The Projeto tab's own summary content has its own close button
           * (see SelectedProjectSummary) once a project is selected, so this
           * shared header would be a second, redundant close affordance there
           * — only render it for tabs whose summary has no close button of
           * its own. */}
          {activeTab !== 'project' && (
            <div className="flex items-center justify-end px-4 pt-1 xl:hidden">
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Fechar resumo"
                onClick={() => setSummaryDrawerOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div ref={setSummaryEl} className="space-y-4 px-4 pt-6 pb-5" />
        </aside>
        {summaryDrawerOpen && summaryActive && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/35 xl:hidden"
            aria-label="Fechar resumo"
            onClick={() => setSummaryDrawerOpen(false)}
          />
        )}

        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t bg-background/95 shadow-lg backdrop-blur lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Navegação"
        >
          <button
            type="button"
            aria-current={!guideOpen && activeTab === 'project' ? 'page' : undefined}
            onClick={() =>
              activeTab === 'project' && summaryActive ? setSummaryDrawerOpen(true) : openMobileTab('project')
            }
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              !guideOpen && activeTab === 'project' && 'font-medium text-primary'
            )}
          >
            <span className="relative inline-flex">
              <FolderOpen className="h-5 w-5" />
              {activeTab === 'project' && summaryActive && <BottomNavSummaryBadge />}
            </span>
            Projetos
          </button>
          <button
            type="button"
            aria-current={!guideOpen && activeTab === 'catalog' ? 'page' : undefined}
            onClick={() =>
              activeTab === 'catalog' && summaryActive ? setSummaryDrawerOpen(true) : openMobileTab('catalog')
            }
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              !guideOpen && activeTab === 'catalog' && 'font-medium text-primary'
            )}
          >
            <span className="relative inline-flex">
              <Boxes className="h-5 w-5" />
              {activeTab === 'catalog' && summaryActive && <BottomNavSummaryBadge />}
            </span>
            Catálogo
          </button>
          <button
            type="button"
            aria-current={!guideOpen && activeTab === 'myStock' ? 'page' : undefined}
            onClick={() =>
              activeTab === 'myStock' && summaryActive ? setSummaryDrawerOpen(true) : openMobileTab('myStock')
            }
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              !guideOpen && activeTab === 'myStock' && 'font-medium text-primary'
            )}
          >
            <span className="relative inline-flex">
              <Wallet className="h-5 w-5" />
              {activeTab === 'myStock' && summaryActive && <BottomNavSummaryBadge />}
            </span>
            Portfólio
          </button>
          <button
            type="button"
            aria-label="Mais opções"
            onClick={() => setMobileMenuOpen(true)}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              (guideOpen || activeTab === 'purchases' || activeTab === 'clients' || activeTab === 'profile') &&
                'font-medium text-primary'
            )}
          >
            <Menu className="h-5 w-5" />
            {guideOpen ? 'Guia básico' : moreNavTabLabels[activeTab as keyof typeof moreNavTabLabels] ?? 'Mais'}
          </button>
        </nav>

        {/* "Projeto"/"Catálogo" already have their own toggle built into their
         * bottom-nav icon (tap again to reopen the summary) — every other tab
         * with a summary (Dimensionamento, Fornecedores) is only reachable through
         * "Mais", whose entries are plain single-click links with no such
         * toggle, so they need this floating fallback instead. On mobile it's
         * lifted above the bottom nav bar; from lg up that bar is gone, so it
         * settles back down near the corner (still needed up to xl, where the
         * summary becomes a permanent column instead of a drawer). */}
        {summaryActive && activeTab !== 'project' && activeTab !== 'catalog' && (
          <Button
            type="button"
            size="icon-lg"
            className="fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 inline-flex shadow-lg lg:bottom-[calc(1rem+env(safe-area-inset-bottom))] xl:hidden"
            aria-label="Ver resumo"
            onClick={() => setSummaryDrawerOpen(true)}
          >
            <ClipboardList className="h-5 w-5" />
          </Button>
        )}
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mais opções">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col rounded-t-2xl border-t bg-card px-4 pt-2 shadow-xl">
            <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-muted" />
            <div className="flex shrink-0 items-center justify-between gap-3 py-3">
              <p className="font-semibold">Mais opções</p>
              <Button variant="ghost" size="icon-lg" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <nav className="space-y-1 overflow-y-auto border-t pt-2">
              <button
                type="button"
                aria-current={!guideOpen && activeTab === 'purchases' ? 'page' : undefined}
              onClick={() => { setGuideOpen(false); openMobilePurchasesTab(); }}
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  !guideOpen && activeTab === 'purchases' && 'bg-primary/10 font-medium text-foreground'
                )}
              >
                <ShoppingCart className="h-4 w-4" />
                Fornecedores
              </button>
              <button
                type="button"
                aria-current={!guideOpen && activeTab === 'clients' ? 'page' : undefined}
                onClick={() => { setGuideOpen(false); openMobileClientsManager(); }}
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  !guideOpen && activeTab === 'clients' && 'bg-primary/10 font-medium text-foreground'
                )}
              >
                <Users className="h-4 w-4" />
                Clientes
              </button>
              <button
                type="button"
                aria-current={!guideOpen && activeTab === 'profile' ? 'page' : undefined}
                onClick={() => { setGuideOpen(false); openMobileProfile(); }}
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  !guideOpen && activeTab === 'profile' && 'bg-primary/10 font-medium text-foreground'
                )}
              >
                <UserRound className="h-4 w-4" />
                Perfil
              </button>
              <button
                type="button"
                aria-current={guideOpen ? 'page' : undefined}
                onClick={() => {
                  setMobileMenuOpen(false);
                  setGuideOpen(true);
                }}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  guideOpen && 'bg-primary/10 font-medium text-foreground'
                )}
              >
                <BookOpen className="h-4 w-4" />
                Guia básico
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAboutOpen(true);
                }}
                className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Info className="h-4 w-4" />
                Sobre e contribuir
              </button>
              {profile?.role === 'admin' && (
                <Link
                  href={`/${locale}/admin`}
                  className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <ShieldUser className="h-4 w-4" />
                  Administração
                </Link>
              )}
            </nav>

            <div
              className="shrink-0 space-y-2 border-t pt-3 pb-3"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <SessionCard
                profile={profile}
                userEmail={userEmail}
                onOpenProfile={() => {
                  setMobileMenuOpen(false);
                  openProfile();
                }}
                onSignOut={signOut}
                signingOut={signingOut}
                signOutError={signOutError}
              />
            </div>
          </aside>
        </div>
      )}

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        version={appVersion}
      />
    </main>
  );
}
