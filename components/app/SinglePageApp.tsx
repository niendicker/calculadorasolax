'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Boxes,
  ClipboardList,
  FolderOpen,
  Loader2,
  LogOut,
  Menu,
  ShieldUser,
  ShoppingCart,
  Sun,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useWizardStore, totalDailyKwh, totalNominalW, totalPeakW } from '@/lib/store/wizard-store';
import { cn } from '@/lib/utils';
import { buildClientQuoteText, buildPdfFileName, buildWhatsAppShareUrl, calculateSystemCost } from './helpers';
import { useAutosave } from './hooks/useAutosave';
import { useCalculation } from './hooks/useCalculation';
import { useInitialData } from './hooks/useInitialData';
import { useProfileActions } from './hooks/useProfileActions';
import { useProjectActions } from './hooks/useProjectActions';
import { useSizingController } from './hooks/useSizingController';
import { AppFooter } from './shell/AppFooter';
import { useAppShellState } from './shell/useAppShellState';
import { useTabNavigation } from './shell/useTabNavigation';
import { useAuthenticatedNavigation } from './shell/useAuthenticatedNavigation';
import { SetSummaryActiveProvider, SummaryPortalProvider, TitleBarPortalProvider } from './shell/slots';
import { ProjectStatusToast } from './tabs/project/ProjectStatusToast';
import { DemoBanner } from './demo/DemoBanner';
import { DemoPickerDialog } from './demo/DemoPickerDialog';
import { useDemoController } from './demo/useDemoController';
import { ProjectTab } from './tabs/ProjectTab';

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
    isDemo,
    loadPresets,
    loadDemoSimulation,
    exitDemoMode,
    convertDemoToSimulation,
  } = useWizardStore();

  const [pendingSupplyImport, setPendingSupplyImport] = useState(false);
  // Feedback while exportPdf() is generating the (non-instant) PDF blob —
  // exportingPdf covers every "Baixar relatório" trigger (Dimensionamento's
  // own buttons), downloadingProjectId additionally pins which saved
  // project's card button to spin, since several can be on screen at once.
  const [exportingPdf, setExportingPdf] = useState(false);
  const [downloadingProjectId, setDownloadingProjectId] = useState<string | null>(null);
  const [sendingQuote, setSendingQuote] = useState(false);
  const [activeTab, setActiveTab] = useState<'project' | 'sizing' | 'catalog' | 'purchases' | 'myStock' | 'clients' | 'profile'>(
    'project'
  );

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
    authenticated: Boolean(profile),
    onRequireAuthentication: () => router.push(`/${locale}/login?redirect=/${locale}`),
    changeTab,
    setPendingSupplyImport,
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
    setActiveTab: changeTab,
    isDemo,
  });

  // Autosave replaces the sizing tab's old manual "Salvar projeto" button —
  // only while actually viewing that tab, logged in, and once something is
  // worth persisting (an empty draft loading its defaults shouldn't create a
  // project). See useAutosave for why enabling it re-baselines instead of
  // saving immediately (a project just finishing its load looks like a
  // "change" too, but isn't an edit).
  const { status: autosaveStatus, lastSavedAt: autosaveLastSavedAt } = useAutosave({
    enabled: !isDemo && Boolean(profile) && activeTab === 'sizing' && Boolean(residentialOptions.gridType || residentialOptions.loads.length > 0),
    data: { projectInfo, residentialOptions, solution },
    saveCurrentProject,
  });

  const {
    examples: demoExamples,
    demoPickerOpen,
    setDemoPickerOpen,
    unavailableDemoIds,
    openDemoPicker,
    selectDemo,
    leaveDemo,
    convertDemo,
  } = useDemoController({
    activeTab,
    loadPresets,
    batteryCatalog,
    approvedInverterCombos,
    inverterCatalog,
    loadDemoSimulation,
    exitDemoMode,
    convertDemoToSimulation,
    changeTab,
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
  });

  const {
    availableInverterModels,
    availableInverterModelsByTopology,
    setBatteryModelAndRecalc,
    setSecondaryBatteryModelAndRecalc,
    setInverterModelAndRecalc,
    setMinInverterQtyAndRecalc,
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
    canCalculate: Boolean(canCalculate),
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

  // Reached from a client's own project list (Clientes tab) — loads the
  // project into the wizard and jumps to Projeto, same as opening it from
  // there directly.
  function openProjectFromClient(id: string) {
    loadProject(id);
    changeTab('project');
  }

  // Project-name link in Dimensionamento's header — the wizard state already
  // holds whichever project got us here (currentProjectId), so this is just
  // a tab switch; ProjectTab picks currentProjectId up on mount to select
  // that project's card instead of landing on the plain list.
  function backToProject() {
    changeTab('project');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setUserEmail(null);
    setMobileMenuOpen(false);
    clearUserData();
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // @react-pdf/renderer is a sizable library only needed once the user
  // actually exports — dynamically imported here instead of joining the
  // rest of this already-static-imported component's bundle. Only for the
  // live Dimensionamento state (the "Baixar relatório" buttons there); a
  // saved project's own card downloads independently via downloadProjectPdf
  // below, straight from its stored data.
  async function exportPdf() {
    if (!solution || !canCalculate) return;
    setExportingPdf(true);
    try {
      const { buildProjectQuotePdfBlob } = await import('./project-quote-pdf');
      const blob = await buildProjectQuotePdfBlob({
        projectInfo,
        client: clients.find((c) => c.id === projectInfo.clientId) ?? null,
        profile,
        solution,
        secondarySolution,
        secondaryBatteryModel: residentialOptions.secondaryBatteryModel,
        loads: residentialOptions.loads,
        operationHours: residentialOptions.operationHours,
        topology: residentialOptions.topology,
        selectedBatteryModel: residentialOptions.batteryModel,
        gridType: residentialOptions.gridType,
        nominalW,
        peakW,
        dailyKwh,
        userStockItems,
        marginSettings,
        services,
        userServices,
        whiteTariff: residentialOptions.whiteTariff,
        pv: residentialOptions.pv,
        desiredFeatures: residentialOptions.desiredFeatures,
        microgrid: residentialOptions.microgrid,
        generator: residentialOptions.generator,
        atsPhotoUrl: residentialOptions.atsPhotoUrl,
        atsBackupAcknowledged: residentialOptions.atsBackupAcknowledged,
        batteryCatalog,
        inverterCatalog,
        accessoryCatalog,
        productMedia,
      });
      triggerBlobDownload(blob, `${buildPdfFileName(projectInfo.name)}.pdf`);
    } catch {
      reportStatus('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  }

  const quoteClient = clients.find((c) => c.id === projectInfo.clientId) ?? null;
  const canSendQuoteByWhatsApp = Boolean(quoteClient?.phone);

  // Client-facing counterpart to exportPdf() above, for the live wizard
  // state's own "Compartilhar cotação" (Dimensionamento's Resumo tab)
  // — same handleSendQuote approach as SelectedProjectSummary (try sharing
  // the actual PDF file via the OS share sheet, fall back to a plain wa.me
  // text link), just built straight from live state instead of a
  // SavedProject, since this quote may not even be saved as a project yet.
  async function sendQuoteByWhatsApp() {
    if (!quoteClient?.phone) return;
    const shareableProject = {
      name: projectInfo.name,
      address: projectInfo.address,
      topology: residentialOptions.topology,
      gridType: residentialOptions.gridType,
      loadsCount: residentialOptions.loads.length,
      peakW,
      dailyKwh,
      solution,
    };
    const systemCost =
      solution || services.length > 0
        ? calculateSystemCost(solution, userStockItems, services, userServices, marginSettings, batteryCatalog, residentialOptions)
        : null;
    const quoteText = buildClientQuoteText(shareableProject, quoteClient.name, batteryCatalog, services, systemCost);
    const whatsAppUrl = buildWhatsAppShareUrl(quoteClient.phone, quoteText);
    if (!whatsAppUrl) return;

    // Sharing the quote is the real-world signal that it left "Rascunho" —
    // only advances from 'draft' (no-op if this live state isn't a saved
    // project at all yet) so a re-share after the client already responded
    // doesn't quietly undo an 'accepted'/'rejected' status.
    function markSent() {
      if (!currentProjectId) return;
      const current = savedProjects.find((p) => p.id === currentProjectId);
      if (current?.status === 'draft') void updateProjectStatusAction(currentProjectId, 'sent');
    }

    if (solution && typeof navigator.canShare === 'function') {
      try {
        setSendingQuote(true);
        const { buildProjectQuotePdfBlob } = await import('./project-quote-pdf');
        const blob = await buildProjectQuotePdfBlob({
          projectInfo,
          client: quoteClient,
          profile,
          solution,
          secondarySolution,
          secondaryBatteryModel: residentialOptions.secondaryBatteryModel,
          loads: residentialOptions.loads,
          operationHours: residentialOptions.operationHours,
          topology: residentialOptions.topology,
          selectedBatteryModel: residentialOptions.batteryModel,
          gridType: residentialOptions.gridType,
          nominalW,
          peakW,
          dailyKwh,
          userStockItems,
          marginSettings,
          services,
          userServices,
          whiteTariff: residentialOptions.whiteTariff,
          pv: residentialOptions.pv,
          desiredFeatures: residentialOptions.desiredFeatures,
          microgrid: residentialOptions.microgrid,
          generator: residentialOptions.generator,
          atsPhotoUrl: residentialOptions.atsPhotoUrl,
          atsBackupAcknowledged: residentialOptions.atsBackupAcknowledged,
          batteryCatalog,
          inverterCatalog,
          accessoryCatalog,
          productMedia,
        });
        const file = new File([blob], `${buildPdfFileName(projectInfo.name)}.pdf`, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: quoteText });
          markSent();
          return;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      } finally {
        setSendingQuote(false);
      }
    }

    window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
    markSent();
  }

  // "Baixar Relatório" on a project card in the list — builds the PDF
  // straight from that project's own saved data instead of first loading it
  // into the live wizard state (which the old implementation did, reusing
  // exportPdf() above via an effect keyed off currentProjectId). That
  // indirection broke down as soon as two downloads landed close together,
  // or the target project already happened to be loaded: the effect only
  // fires on an actual *change* of currentProjectId, so a second click could
  // silently never call exportPdf() again (stuck "Gerando relatório...") or
  // end up exporting whichever project's data was loaded last instead of the
  // one actually clicked. Being self-contained per call sidesteps all of it.
  async function downloadProjectPdf(id: string) {
    const project = savedProjects.find((p) => p.id === id);
    if (!project) return;
    setDownloadingProjectId(id);
    try {
      const { buildProjectQuotePdfBlob, buildProjectQuotePdfInputFromSavedProject } = await import(
        './project-quote-pdf'
      );
      const input = buildProjectQuotePdfInputFromSavedProject(project, {
        client: clients.find((c) => c.id === project.clientId) ?? null,
        profile,
        userStockItems,
        marginSettings,
        userServices,
        batteryCatalog,
        inverterCatalog,
        accessoryCatalog,
      });
      if (!input) return;
      const blob = await buildProjectQuotePdfBlob(input);
      triggerBlobDownload(blob, `${buildPdfFileName(project.name)}.pdf`);
    } catch {
      reportStatus('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setDownloadingProjectId(null);
    }
  }

  function openMobilePurchasesTab() {
    setMobileMenuOpen(false);
    openPurchasesTab();
  }

  function openMobileProfile() {
    setMobileMenuOpen(false);
    openProfile();
  }

  function openMobileClientsManager() {
    setMobileMenuOpen(false);
    openClientsManager();
  }

  return (
    <main className="app-shell h-screen overflow-hidden bg-background">
      {projectStatus && (
        <ProjectStatusToast key={statusId} message={projectStatus} onDismiss={dismissProjectStatus} />
      )}
      <div
        className={cn(
          'mx-auto grid h-full w-full max-w-[1920px] grid-rows-[minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[1fr]',
          summaryActive ? 'xl:grid-cols-[240px_minmax(0,1fr)_460px]' : 'xl:grid-cols-[240px_minmax(0,1fr)]'
        )}
      >
        <aside className="hidden border-r bg-card px-4 py-5 lg:flex lg:flex-col">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sun className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold leading-tight">SolaX</p>
              <p className="text-xs text-muted-foreground">Calculator</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1" aria-label="Navegação principal">
            <button
              type="button"
              aria-current={activeTab === 'project' ? 'page' : undefined}
              onClick={() => changeTab('project')}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                activeTab === 'project' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <FolderOpen className="h-4 w-4" />
              Projetos
            </button>
            <button
              type="button"
              aria-current={activeTab === 'catalog' ? 'page' : undefined}
              onClick={() => changeTab('catalog')}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                activeTab === 'catalog' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <Boxes className="h-4 w-4" />
              Catálogo
            </button>
            <button
              type="button"
              aria-current={activeTab === 'myStock' ? 'page' : undefined}
              onClick={() => changeTab('myStock')}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                activeTab === 'myStock' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <Wallet className="h-4 w-4" />
              Portfólio
            </button>
            <button
              type="button"
              aria-current={activeTab === 'purchases' ? 'page' : undefined}
              onClick={openPurchasesTab}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                activeTab === 'purchases' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <ShoppingCart className="h-4 w-4" />
              Fornecedores
            </button>
            <button
              type="button"
              aria-current={activeTab === 'clients' ? 'page' : undefined}
              onClick={openClientsManager}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                activeTab === 'clients' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <Users className="h-4 w-4" />
              Clientes
            </button>
            <button
              type="button"
              aria-current={activeTab === 'profile' ? 'page' : undefined}
              onClick={openProfile}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                activeTab === 'profile' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <UserRound className="h-4 w-4" />
              Perfil
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
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              {userEmail ? (
                <>
                  <p className="font-medium text-foreground">Sessão ativa</p>
                  <p className="mt-1 truncate">{userEmail}</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">Acesso restrito</p>
                  <p className="mt-1">Entre para editar perfil e catálogo.</p>
                </>
              )}
            </div>
            {userEmail && (
              <Button variant="outline" className="w-full justify-start" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            )}
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
              'z-20 flex shrink-0 items-start gap-2 border-b bg-background/95 backdrop-blur transition-[padding,box-shadow] duration-200',
              scrolled ? 'px-4 py-2 shadow-sm lg:px-6' : 'px-4 py-4 lg:px-6'
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground lg:hidden">
              <Sun className="h-4 w-4" />
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
                  {isDemo && <DemoBanner onExit={leaveDemo} onConvert={convertDemo} />}
                  {demoPickerOpen && (
                    <DemoPickerDialog
                      examples={demoExamples}
                      unavailable={unavailableDemoIds}
                      onSelect={selectDemo}
                      onClose={() => setDemoPickerOpen(false)}
                    />
                  )}
                  {activeTab === 'project' ? (
            <ProjectTab
              profile={profile}
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
              onDemo={openDemoPicker}
              demoDisabled={isDemo || initialLoading || loadPresets.length === 0 || batteryCatalog.length === 0}
              onCancelNew={cancelNewProject}
              onOpen={openProject}
              onOpenSizing={openProjectSizing}
              onRemove={deleteProject}
              onRefreshSolution={refreshProjectSolution}
              refreshingProjectId={refreshingProjectId}
              onUpdateStatus={updateProjectStatusAction}
              onDownloadPdf={downloadProjectPdf}
              downloadingProjectId={downloadingProjectId}
              onManageSuppliers={openPurchasesTab}
              onManagePortfolio={openPortfolioTab}
              onShowSummary={() => setSummaryDrawerOpen(true)}
              onHideSummary={() => setSummaryDrawerOpen(false)}
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
          ) : (
            <SizingTab
              projectName={projectInfo.name}
              currentProjectId={currentProjectId}
              onBackToProject={backToProject}
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
              setBatteryModel={setBatteryModelAndRecalc}
              setSecondaryBatteryModel={setSecondaryBatteryModelAndRecalc}
              setInverterModel={setInverterModelAndRecalc}
              setMinInverterQty={setMinInverterQtyAndRecalc}
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
            />
          )}
                </SetSummaryActiveProvider>
              </SummaryPortalProvider>
            </TitleBarPortalProvider>
          </section>

          <AppFooter />
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
            aria-current={activeTab === 'project' ? 'page' : undefined}
            onClick={() =>
              activeTab === 'project' && summaryActive ? setSummaryDrawerOpen(true) : openMobileTab('project')
            }
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              activeTab === 'project' && 'font-medium text-primary'
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
            aria-current={activeTab === 'catalog' ? 'page' : undefined}
            onClick={() =>
              activeTab === 'catalog' && summaryActive ? setSummaryDrawerOpen(true) : openMobileTab('catalog')
            }
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              activeTab === 'catalog' && 'font-medium text-primary'
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
            aria-current={activeTab === 'myStock' ? 'page' : undefined}
            onClick={() =>
              activeTab === 'myStock' && summaryActive ? setSummaryDrawerOpen(true) : openMobileTab('myStock')
            }
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              activeTab === 'myStock' && 'font-medium text-primary'
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
              (activeTab === 'purchases' || activeTab === 'clients' || activeTab === 'profile') && 'font-medium text-primary'
            )}
          >
            <Menu className="h-5 w-5" />
            {moreNavTabLabels[activeTab as keyof typeof moreNavTabLabels] ?? 'Mais'}
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
                aria-current={activeTab === 'purchases' ? 'page' : undefined}
                onClick={openMobilePurchasesTab}
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'purchases' && 'bg-primary/10 font-medium text-foreground'
                )}
              >
                <ShoppingCart className="h-4 w-4" />
                Fornecedores
              </button>
              <button
                type="button"
                aria-current={activeTab === 'clients' ? 'page' : undefined}
                onClick={openMobileClientsManager}
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'clients' && 'bg-primary/10 font-medium text-foreground'
                )}
              >
                <Users className="h-4 w-4" />
                Clientes
              </button>
              <button
                type="button"
                aria-current={activeTab === 'profile' ? 'page' : undefined}
                onClick={openMobileProfile}
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'profile' && 'bg-primary/10 font-medium text-foreground'
                )}
              >
                <UserRound className="h-4 w-4" />
                Perfil
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
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                {userEmail ? (
                  <>
                    <p className="font-medium text-foreground">Sessão ativa</p>
                    <p className="mt-1 truncate">{userEmail}</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-foreground">Acesso restrito</p>
                    <p className="mt-1">Entre para editar perfil e catálogo.</p>
                  </>
                )}
              </div>
              {userEmail && (
                <Button variant="outline" className="w-full justify-start" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                  Sair
                </Button>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
