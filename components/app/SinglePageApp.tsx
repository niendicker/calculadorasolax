'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Boxes,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldUser,
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
import { buildPdfFileName, expansionModelSet } from './helpers';
import { useAutosave } from './hooks/useAutosave';
import { useCalculation } from './hooks/useCalculation';
import { useInitialData } from './hooks/useInitialData';
import { useProfileActions } from './hooks/useProfileActions';
import { useProjectActions } from './hooks/useProjectActions';
import { PrintableReport } from './PrintableReport';
import { AppFooter } from './shell/AppFooter';
import { SetSummaryActiveProvider, SummaryPortalProvider, TitleBarPortalProvider } from './shell/slots';
import { CatalogTab } from './tabs/CatalogTab';
import { ClientsTab } from './tabs/ClientsTab';
import { MyStockTab } from './tabs/MyStockTab';
import { ProfileTab } from './tabs/ProfileTab';
import { ProjectTab } from './tabs/ProjectTab';
import { SizingTab } from './tabs/SizingTab';
import { gridTypeToApprovedTopology } from './types';

/** Marks the active bottom-nav tab as having a summary — purely decorative
 * (not its own button, since a <button> can't nest inside the tab's <button>);
 * tapping the already-active tab opens the summary instead of re-selecting it. */
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
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);
  const {
    projectInfo,
    projectDetailsVisible,
    currentProjectId,
    savedProjects,
    clients,
    userStockItems,
    userServices,
    marginSettings,
    services,
    residentialOptions,
    solution,
    secondarySolution,
    setProjectInfo,
    newProjectDraft,
    cancelProjectDraft,
    saveCurrentProject,
    loadProject,
    removeProject,
    duplicateProject,
    refreshProjectSolution: refreshProjectSolutionAction,
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
    addServiceToProject,
    removeServiceFromProject,
    updateProjectServiceQty,
    clearUserData,
    setTopology,
    setBatteryModel,
    setSecondaryBatteryModel,
    setInverterModel,
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
  const [activeTab, setActiveTab] = useState<'project' | 'sizing' | 'catalog' | 'myStock' | 'clients' | 'profile'>(
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
    saveProject,
    startNewProject,
    cancelNewProject,
    openProject,
    openProjectSizing,
    deleteProject,
    duplicateProject: duplicateExistingProject,
    refreshProjectSolution,
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
    setActiveTab,
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

  useEffect(() => {
    if (!pendingAutoCalcRef.current) return;
    pendingAutoCalcRef.current = false;
    if (canCalculate) calculate();
  }, [
    residentialOptions.batteryModel,
    residentialOptions.secondaryBatteryModel,
    residentialOptions.inverterModel,
    canCalculate,
    calculate,
  ]);

  const availableInverterModels = useMemo(() => {
    if (!residentialOptions.gridType) return null;
    const approvedTopology = gridTypeToApprovedTopology[residentialOptions.gridType];
    const batteryTopology = residentialOptions.topology === 'LowVoltage' ? 'LV' : 'HV';
    return new Set(
      approvedInverterCombos
        .filter(
          (combo) => combo.gridTopology === approvedTopology && combo.batteryTopology === batteryTopology
        )
        .map((combo) => combo.inverterModel)
    );
  }, [approvedInverterCombos, residentialOptions.gridType, residentialOptions.topology]);

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

  function openClientsManager() {
    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }
    setActiveTab('clients');
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

  function exportPdf() {
    if (!solution || !canCalculate) return;
    const previousTitle = document.title;
    document.title = buildPdfFileName(projectInfo.name);
    window.addEventListener('afterprint', () => { document.title = previousTitle; }, { once: true });
    window.print();
  }

  // "Compartilhar Relatório" on a not-yet-open project card: quietly loads
  // it into the wizard state (loadProject sets solution/canCalculate
  // synchronously from the saved project, no recalculation involved — see
  // loadProject in wizard-store.ts) WITHOUT opening the edit draft card
  // (showDetails: false — unlike "Editar", this shouldn't switch the
  // Projeto tab into edit mode), then the effect below fires exportPdf()
  // once that project's data has landed in state.
  const pendingPdfProjectIdRef = useRef<string | null>(null);

  function downloadProjectPdf(id: string) {
    pendingPdfProjectIdRef.current = id;
    loadProject(id, { showDetails: false });
  }

  useEffect(() => {
    if (!pendingPdfProjectIdRef.current || pendingPdfProjectIdRef.current !== currentProjectId) return;
    pendingPdfProjectIdRef.current = null;
    if (!solution || !canCalculate) return;
    const previousTitle = document.title;
    document.title = buildPdfFileName(projectInfo.name);
    window.addEventListener('afterprint', () => { document.title = previousTitle; }, { once: true });
    window.print();
  }, [currentProjectId, solution, canCalculate, projectInfo.name]);

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

  function openMobileTab(tab: 'project' | 'sizing' | 'catalog' | 'myStock' | 'clients') {
    setActiveTab(tab);
    setMobileMenuOpen(false);
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
      <div className="mx-auto grid h-full w-full max-w-[1920px] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[1fr] xl:grid-cols-[240px_minmax(0,1fr)_460px]">
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
              onClick={() => setActiveTab('project')}
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
              aria-current={activeTab === 'sizing' ? 'page' : undefined}
              onClick={() => setActiveTab('sizing')}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                activeTab === 'sizing' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dimensionamento
            </button>
            <button
              type="button"
              aria-current={activeTab === 'catalog' ? 'page' : undefined}
              onClick={() => setActiveTab('catalog')}
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
              onClick={() => setActiveTab('myStock')}
              className={cn(
                'flex h-8 w-full items-center gap-2 rounded-lg py-0 pl-9 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                activeTab === 'myStock' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <Wallet className="h-3.5 w-3.5" />
              Meu Catálogo
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
              'z-20 flex shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur transition-[padding,box-shadow] duration-200',
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
              projectInfo={projectInfo}
              projectDetailsVisible={projectDetailsVisible}
              currentProjectId={currentProjectId}
              savedProjects={savedProjects}
              clients={clients}
              batteryCatalog={batteryCatalog}
              inverterCatalog={inverterCatalog}
              accessoryCatalog={accessoryCatalog}
              userStockItems={userStockItems}
              userServices={userServices}
              marginSettings={marginSettings}
              services={services}
              initialLoading={initialLoading}
              projectStatus={projectStatus}
              statusId={statusId}
              onDismissStatus={dismissProjectStatus}
              topology={residentialOptions.topology}
              batteryModel={residentialOptions.batteryModel}
              gridType={residentialOptions.gridType}
              loadsCount={residentialOptions.loads.length}
              peakW={peakW}
              dailyKwh={dailyKwh}
              hasSolution={Boolean(solution)}
              setProjectInfo={setProjectInfo}
              onSave={saveProject}
              onNew={startNewProject}
              onCancelNew={cancelNewProject}
              onOpen={openProject}
              onOpenSizing={openProjectSizing}
              onRemove={deleteProject}
              onDuplicate={duplicateExistingProject}
              onRefreshSolution={refreshProjectSolution}
              refreshingProjectId={refreshingProjectId}
              onDownloadPdf={downloadProjectPdf}
              onManageClients={openClientsManager}
              onShowSummary={() => setSummaryDrawerOpen(true)}
              onHideSummary={() => setSummaryDrawerOpen(false)}
              onAddService={addServiceToProject}
              onRemoveService={removeServiceFromProject}
              onUpdateServiceQty={updateProjectServiceQty}
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
          ) : activeTab === 'clients' ? (
            <ClientsTab
              clients={clients}
              onAdd={addClient}
              onUpdate={updateClient}
              onRemove={removeClient}
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
              title={t('title')}
              projectName={projectInfo.name}
              loadingLabel={tc('loading')}
              calculateLabel={tc('calculate')}
              residentialOptions={residentialOptions}
              batteryCatalog={batteryCatalog}
              inverterCatalog={inverterCatalog}
              availableInverterModels={availableInverterModels}
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
              autosaveStatus={autosaveStatus}
              autosaveLastSavedAt={autosaveLastSavedAt}
              productMedia={productMedia}
              userStockItems={userStockItems}
              marginSettings={marginSettings}
              onChooseMicrogridVariant={chooseMicrogridVariant}
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
            'xl:static xl:z-auto xl:flex xl:min-h-0 xl:w-auto xl:max-w-none xl:flex-col xl:overflow-y-auto xl:border-l xl:bg-card xl:shadow-none',
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
          <div ref={setSummaryEl} className="space-y-4 px-4 pt-4 pb-5" />
          {!summaryActive && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
              <p>Nenhum resumo disponível para esta seção.</p>
            </div>
          )}
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
            aria-current={activeTab === 'sizing' ? 'page' : undefined}
            onClick={() =>
              activeTab === 'sizing' && summaryActive ? setSummaryDrawerOpen(true) : openMobileTab('sizing')
            }
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              activeTab === 'sizing' && 'font-medium text-primary'
            )}
          >
            <span className="relative inline-flex">
              <LayoutDashboard className="h-5 w-5" />
              {activeTab === 'sizing' && summaryActive && <BottomNavSummaryBadge />}
            </span>
            Dimensionamento
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
              (activeTab === 'myStock' || activeTab === 'clients' || activeTab === 'profile') && 'font-medium text-primary'
            )}
          >
            <Menu className="h-5 w-5" />
            Mais
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
                Meu Catálogo
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

      {solution && (
        <PrintableReport
          projectInfo={projectInfo}
          client={clients.find((c) => c.id === projectInfo.clientId) ?? null}
          profile={profile}
          solution={solution}
          secondarySolution={secondarySolution}
          secondaryBatteryModel={residentialOptions.secondaryBatteryModel}
          loads={residentialOptions.loads}
          operationHours={residentialOptions.operationHours}
          topology={residentialOptions.topology}
          selectedBatteryModel={residentialOptions.batteryModel}
          gridType={residentialOptions.gridType}
          nominalW={nominalW}
          peakW={peakW}
          dailyKwh={dailyKwh}
          userStockItems={userStockItems}
          marginSettings={marginSettings}
          whiteTariff={residentialOptions.whiteTariff}
          pv={residentialOptions.pv}
          desiredFeatures={residentialOptions.desiredFeatures}
          microgrid={residentialOptions.microgrid}
          generator={residentialOptions.generator}
          atsPhotoUrl={residentialOptions.atsPhotoUrl}
          atsBackupAcknowledged={residentialOptions.atsBackupAcknowledged}
          batteryCatalog={batteryCatalog}
          accessoryCatalog={accessoryCatalog}
          productMedia={productMedia}
        />
      )}
    </main>
  );
}
