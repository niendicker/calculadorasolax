'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useWizardStore, totalDailyKwh, totalNominalW, totalPeakW, gridTypePhaseCount } from '@/lib/store/wizard-store';
import { cn } from '@/lib/utils';
import { buildClientQuoteText, buildPdfFileName, buildWhatsAppShareUrl, calculateSystemCost, expansionModelSet } from './helpers';
import { useAutosave } from './hooks/useAutosave';
import { useCalculation } from './hooks/useCalculation';
import { useInitialData } from './hooks/useInitialData';
import { useProfileActions } from './hooks/useProfileActions';
import { useProjectActions } from './hooks/useProjectActions';
import { AppFooter } from './shell/AppFooter';
import { SetSummaryActiveProvider, SummaryPortalProvider, TitleBarPortalProvider } from './shell/slots';
import { ProjectStatusToast } from './tabs/project/ProjectStatusToast';
import { ProjectTab } from './tabs/ProjectTab';
import { batteryTopologyToCatalog } from '@/lib/types';
import { gridTypeToApprovedTopology } from './types';

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
const moreNavTabLabels: Partial<Record<'purchases' | 'myStock' | 'clients' | 'profile', string>> = {
  purchases: 'Compras',
  myStock: 'Portfólio',
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
    duplicateProject,
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
  } = useWizardStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [summaryDrawerOpen, setSummaryDrawerOpen] = useState(false);
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

  // App shell: title bar and summary panel are persistent chrome around the
  // scrollable content; tabs portal their header/summary into these targets
  // (see components/app/shell/slots.tsx) instead of rendering their own.
  const [titleBarEl, setTitleBarEl] = useState<HTMLDivElement | null>(null);
  const [summaryEl, setSummaryEl] = useState<HTMLDivElement | null>(null);
  const [summaryActive, setSummaryActive] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLElement | null>(null);

  // wizard-store persists to localStorage with skipHydration (see
  // lib/store/wizard-store.ts) so the server-rendered first paint always
  // matches the client's un-hydrated defaults; this pulls the saved state in
  // right after mount instead.
  useEffect(() => {
    void useWizardStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      setScrolled((el as HTMLElement).scrollTop > 8);
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

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
    duplicateProject: duplicateExistingProject,
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
    duplicateProject,
    refreshProjectSolution: refreshProjectSolutionAction,
    updateProjectStatus,
    setActiveTab: changeTab,
  });

  // Autosave replaces the sizing tab's old manual "Salvar projeto" button —
  // only while actually viewing that tab, logged in, and once something is
  // worth persisting (an empty draft loading its defaults shouldn't create a
  // project). See useAutosave for why enabling it re-baselines instead of
  // saving immediately (a project just finishing its load looks like a
  // "change" too, but isn't an edit).
  const { status: autosaveStatus, lastSavedAt: autosaveLastSavedAt } = useAutosave({
    enabled: Boolean(profile) && activeTab === 'sizing' && Boolean(residentialOptions.gridType || residentialOptions.loads.length > 0),
    data: { projectInfo, residentialOptions, solution },
    saveCurrentProject,
  });

  const dailyKwh = totalDailyKwh(residentialOptions.loads, residentialOptions.operationHours);
  const peakW = totalPeakW(residentialOptions.loads, residentialOptions.peakCalcMode ?? 'sum');
  const nominalW = totalNominalW(residentialOptions.loads);

  const { loading, error, secondaryError, canCalculate, calculate, productMedia } = useCalculation({
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

  // Selecting/clearing a battery (primary or secondary) or the inverter
  // should refresh the solution without making the user press "Calcular"
  // again — but this must stay opt-in per change (via the ref below), not a
  // plain effect on these fields: they also change when a saved project
  // loads, and re-calculating there would clobber the project's own saved
  // solution. `canCalculate` already reflects whether every other tab
  // (loads, grid type, features, etc.) is currently valid, so a change made
  // while something else is broken elsewhere just updates the selection
  // without forcing a doomed recalculation.
  const pendingAutoCalcRef = useRef(false);

  function setBatteryModelAndRecalc(model: string | null) {
    pendingAutoCalcRef.current = true;
    setBatteryModel(model);
  }

  function setSecondaryBatteryModelAndRecalc(model: string | null) {
    pendingAutoCalcRef.current = true;
    setSecondaryBatteryModel(model);
  }

  function setInverterModelAndRecalc(model: string | null) {
    pendingAutoCalcRef.current = true;
    setInverterModel(model);
  }

  function setMinInverterQtyAndRecalc(qty: number | null) {
    pendingAutoCalcRef.current = true;
    setMinInverterQty(qty);
  }

  useEffect(() => {
    if (!pendingAutoCalcRef.current) return;
    pendingAutoCalcRef.current = false;
    if (canCalculate) calculate();
  }, [
    residentialOptions.batteryModel,
    residentialOptions.secondaryBatteryModel,
    residentialOptions.inverterModel,
    residentialOptions.minInverterQty,
    canCalculate,
    calculate,
  ]);

  // Split by battery topology (not just the currently-selected one) so the
  // HV/LV tabs in InverterModelPicker can each show their own accurate count
  // and model list — computing both from a single combo set already scoped
  // to "whichever topology happens to be active" would make the inactive
  // tab's numbers wrong (see availableInverterModels below, kept for every
  // other consumer that only cares about the current selection's validity).
  const availableInverterModelsByTopology = useMemo(() => {
    if (!residentialOptions.gridType) return null;
    const approvedTopology = gridTypeToApprovedTopology[residentialOptions.gridType];
    const modelsFor = (batteryTopology: 'HV' | 'LV') =>
      new Set(
        approvedInverterCombos
          .filter((combo) => combo.gridTopology === approvedTopology && combo.batteryTopology === batteryTopology)
          .map((combo) => combo.inverterModel)
      );
    return { HV: modelsFor('HV'), LV: modelsFor('LV') };
  }, [approvedInverterCombos, residentialOptions.gridType]);

  const availableInverterModels = useMemo(() => {
    if (!availableInverterModelsByTopology) return null;
    const batteryTopology = residentialOptions.topology ? batteryTopologyToCatalog[residentialOptions.topology] : 'HV';
    return availableInverterModelsByTopology[batteryTopology];
  }, [availableInverterModelsByTopology, residentialOptions.topology]);

  useEffect(() => {
    const phaseCount = residentialOptions.gridType ? gridTypePhaseCount[residentialOptions.gridType] : 1;
    if (!residentialOptions.gridType || phaseCount <= 1) {
      if (residentialOptions.maxPowerPerPhaseW !== null) setMaxPowerPerPhaseW(null);
      return;
    }
    const inverter = inverterCatalog.find((item) => item.model === residentialOptions.inverterModel);
    const computed =
      inverter?.maxPowerPerPhaseW ??
      (inverter?.standardPowerKva ? (inverter.standardPowerKva * 1000) / phaseCount : null);
    if (computed !== residentialOptions.maxPowerPerPhaseW) setMaxPowerPerPhaseW(computed);
  }, [
    residentialOptions.gridType,
    residentialOptions.inverterModel,
    residentialOptions.maxPowerPerPhaseW,
    inverterCatalog,
    setMaxPowerPerPhaseW,
  ]);

  // Single gate for every navigation away from Perfil: that tab has no
  // autosave, so leaving it via any of the shell's several nav paths
  // (sidebar, bottom nav, "Mais" sheet) would otherwise discard edits
  // silently — see profileDirty in useProfileActions.
  function changeTab(tab: typeof activeTab) {
    if (activeTab === 'profile' && tab !== 'profile' && profileDirty) {
      if (!window.confirm('Você tem alterações não salvas no perfil. Sair sem salvar?')) return;
    }
    setActiveTab(tab);
  }

  function openClientsManager() {
    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }
    changeTab('clients');
  }

  // Reached from a client's own project list (Clientes tab) — loads the
  // project into the wizard and jumps to Projeto, same as opening it from
  // there directly.
  function openProjectFromClient(id: string) {
    loadProject(id);
    changeTab('project');
  }

  function openPurchasesTab() {
    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }
    changeTab('purchases');
  }

  // "Cotar solução" (Dimensionamento) jumps straight to Compras with the
  // current solution's items already in the cart — pendingSupplyImport tells
  // SupplyTab to run its own "Importar itens da solução atual" once its
  // offers have loaded, then clear itself via onAutoImportHandled.
  function quoteSolution() {
    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }
    setPendingSupplyImport(true);
    changeTab('purchases');
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
        ? calculateSystemCost(solution, userStockItems, services, userServices, marginSettings, batteryCatalog)
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

  // resetResidential() already brings topology/gridType back to the store's
  // HV/monofásico 220V defaults — this just goes one step further and also
  // pre-selects a battery, so "Limpar" leaves a ready-to-calculate starting
  // point instead of an empty battery picker (the catalog isn't known to the
  // store, so it can't be part of the static defaults there).
  function resetResidentialToDefaults() {
    resetResidential();
    const expansionModels = expansionModelSet(batteryCatalog);
    const defaultBattery = batteryCatalog.find((battery) => battery.topology === 'HV' && !expansionModels.has(battery.model));
    if (defaultBattery) setBatteryModel(defaultBattery.model);
  }

  function chooseMicrogridVariant(variant: 'economic' | 'microgrid') {
    if (!solution?.microgridAlternative) return;
    if (variant === 'economic') {
      setSolution({ ...solution, microgridAlternative: undefined });
    } else {
      setSolution({ ...solution.microgridAlternative, microgridAlternative: undefined });
    }
  }

  async function uploadFeaturePhoto(file: File, slot: 'ats' | 'microgrid' | 'generator') {
    if (!profile) throw new Error('Não foi possível identificar o usuário.');

    const extension = file.name.split('.').pop();
    const path = `${profile.id}/feature-photos/${slot}/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
    const { error: uploadError } = await supabase.storage
      .from('profile-assets')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('profile-assets').getPublicUrl(path);
    return data.publicUrl;
  }

  // Opening the summary drawer here is a no-op on desktop (xl:static already
  // shows it as a fixed column regardless of this state) but on mobile/tablet
  // it means the result surfaces immediately instead of staying hidden behind
  // a tap-the-active-tab-again gesture the user has to already know about.
  function calculateAndShowSummary() {
    calculate();
    setSummaryDrawerOpen(true);
  }

  function openMobileTab(tab: 'project' | 'catalog' | 'myStock' | 'clients') {
    changeTab(tab);
    setMobileMenuOpen(false);
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
              Projeto
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
              Compras
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
              onCancelNew={cancelNewProject}
              onOpen={openProject}
              onOpenSizing={openProjectSizing}
              onRemove={deleteProject}
              onDuplicate={duplicateExistingProject}
              onRefreshSolution={refreshProjectSolution}
              refreshingProjectId={refreshingProjectId}
              onUpdateStatus={updateProjectStatusAction}
              onDownloadPdf={downloadProjectPdf}
              downloadingProjectId={downloadingProjectId}
              onManageClients={openClientsManager}
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
            Projeto
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
            aria-label="Mais opções"
            onClick={() => setMobileMenuOpen(true)}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              (activeTab === 'purchases' || activeTab === 'myStock' || activeTab === 'clients' || activeTab === 'profile') && 'font-medium text-primary'
            )}
          >
            <Menu className="h-5 w-5" />
            {moreNavTabLabels[activeTab as keyof typeof moreNavTabLabels] ?? 'Mais'}
          </button>
        </nav>

        {summaryActive && (
          <Button
            type="button"
            size="icon-lg"
            className="fixed z-30 hidden shadow-lg lg:inline-flex xl:hidden"
            style={{
              bottom: 'calc(1rem + env(safe-area-inset-bottom))',
              right: 'calc(1rem + env(safe-area-inset-right))',
            }}
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
                Compras
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
                aria-current={activeTab === 'myStock' ? 'page' : undefined}
                onClick={() => openMobileTab('myStock')}
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'myStock' && 'bg-primary/10 font-medium text-foreground'
                )}
              >
                <Wallet className="h-4 w-4" />
                Portfólio
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
