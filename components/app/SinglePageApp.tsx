'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Boxes,
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
    residentialOptions,
    solution,
    setProjectInfo,
    newProjectDraft,
    cancelProjectDraft,
    saveCurrentProject,
    loadProject,
    removeProject,
    fetchProjects,
    fetchClients,
    fetchUserLoadCatalog,
    fetchUserStockItems,
    fetchUserLoadPresets,
    addClient,
    updateClient,
    removeClient,
    addToStock,
    updateStockItemValue,
    removeFromStock,
    clearUserData,
    setTopology,
    setBatteryModel,
    setInverterModel,
    setGridType,
    setMaxPowerPerPhaseW,
    setDesiredFeatures,
    setWhiteTariffConfig,
    setMicrogridConfig,
    setGeneratorConfig,
    setAtsPhotoUrl,
    setSolution,
    setLoadCatalog,
    setLoadPresets,
    resetResidential,
  } = useWizardStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const { projectStatus, saveProject, startNewProject, cancelNewProject, openProject, openProjectSizing, deleteProject } =
    useProjectActions({
      profile,
      router,
      locale,
      saveCurrentProject,
      newProjectDraft,
      cancelProjectDraft,
      loadProject,
      removeProject,
      setActiveTab,
    });

  const dailyKwh = totalDailyKwh(residentialOptions.loads);
  const peakW = totalPeakW(residentialOptions.loads, residentialOptions.peakCalcMode ?? 'sum');
  const nominalW = totalNominalW(residentialOptions.loads);

  const { loading, error, canCalculate, calculate, productMedia } = useCalculation({
    supabase,
    residentialOptions,
    projectInfo,
    peakW,
    dailyKwh,
    solution,
    setSolution,
    inverterCatalog,
    batteryCatalog,
    accessoryCatalog,
  });

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
    if (!solution) return;
    window.print();
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
      <div className="mx-auto grid h-full w-full max-w-[1920px] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[1fr] xl:grid-cols-[240px_minmax(0,1fr)_384px]">
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

          <nav className="mt-8 space-y-1">
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

        <header className="z-20 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sun className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold leading-tight">SolaX</p>
                <p className="text-xs text-muted-foreground">Web app</p>
              </div>
            </div>
            <Button variant="outline" size="icon" aria-label="Abrir perfil" onClick={openProfile}>
              <UserRound className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div
            ref={setTitleBarEl}
            className={cn(
              'z-20 flex shrink-0 flex-col gap-3 border-b bg-background/95 backdrop-blur transition-[padding,box-shadow] duration-200 lg:flex-row lg:items-end lg:justify-between',
              scrolled ? 'px-4 py-2 shadow-sm lg:px-6' : 'px-4 py-4 lg:px-6'
            )}
          />

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
              initialLoading={initialLoading}
              projectStatus={projectStatus}
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
              onManageClients={openClientsManager}
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
              subtitle={t('subtitle')}
              projectName={projectInfo.name}
              loadingLabel={tc('loading')}
              calculateLabel={tc('calculate')}
              residentialOptions={residentialOptions}
              batteryCatalog={batteryCatalog}
              inverterCatalog={inverterCatalog}
              availableInverterModels={availableInverterModels}
              solution={solution}
              nominalW={nominalW}
              peakW={peakW}
              dailyKwh={dailyKwh}
              canCalculate={Boolean(canCalculate)}
              loading={loading}
              initialLoading={initialLoading}
              error={error}
              setTopology={setTopology}
              setBatteryModel={setBatteryModel}
              setInverterModel={setInverterModel}
              setGridType={setGridType}
              setDesiredFeatures={setDesiredFeatures}
              setWhiteTariffConfig={setWhiteTariffConfig}
              setMicrogridConfig={setMicrogridConfig}
              setGeneratorConfig={setGeneratorConfig}
              setAtsPhotoUrl={setAtsPhotoUrl}
              onUploadFeaturePhoto={uploadFeaturePhoto}
              resetResidential={resetResidential}
              calculate={calculate}
              exportPdf={exportPdf}
              saveProject={saveProject}
              productMedia={productMedia}
              userStockItems={userStockItems}
              onChooseMicrogridVariant={chooseMicrogridVariant}
            />
          )}
                </SetSummaryActiveProvider>
              </SummaryPortalProvider>
            </TitleBarPortalProvider>
          </section>

          <AppFooter />
        </div>

        {/* No padding here on purpose: this is the scrolling ancestor sticky
         * children (see SizingTab's summary header) measure `top` against —
         * padding on the scroller itself creates a gap those children can't
         * cleanly cancel. Padding instead lives on each child below. */}
        <aside className="hidden xl:flex xl:min-h-0 xl:flex-col xl:overflow-y-auto xl:border-l xl:bg-card">
          <div ref={setSummaryEl} className="space-y-4 px-4 py-5" />
          {!summaryActive && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
              <p>Nenhum resumo disponível para esta seção.</p>
            </div>
          )}
        </aside>

        <Button
          type="button"
          size="icon-lg"
          className="fixed z-30 shadow-lg lg:hidden"
          style={{
            bottom: 'calc(1rem + env(safe-area-inset-bottom))',
            left: 'calc(1rem + env(safe-area-inset-left))',
          }}
          aria-label="Abrir menu"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r bg-card px-4 py-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sun className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold leading-tight">SolaX</p>
                  <p className="text-xs text-muted-foreground">Calculator</p>
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <nav className="my-auto space-y-1">
              <button
                type="button"
                aria-current={activeTab === 'project' ? 'page' : undefined}
                onClick={() => openMobileTab('project')}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'project' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
                )}
              >
                <FolderOpen className="h-4 w-4" />
                Projeto
              </button>
              <button
                type="button"
                aria-current={activeTab === 'sizing' ? 'page' : undefined}
                onClick={() => openMobileTab('sizing')}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'sizing' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dimensionamento
              </button>
              <button
                type="button"
                aria-current={activeTab === 'catalog' ? 'page' : undefined}
                onClick={() => openMobileTab('catalog')}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'catalog' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
                )}
              >
                <Boxes className="h-4 w-4" />
                Catálogo
              </button>
              <button
                type="button"
                aria-current={activeTab === 'myStock' ? 'page' : undefined}
                onClick={() => openMobileTab('myStock')}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-lg py-0 pl-9 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'myStock' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
                )}
              >
                <Wallet className="h-3.5 w-3.5" />
                Meu Catálogo
              </button>
              <button
                type="button"
                aria-current={activeTab === 'clients' ? 'page' : undefined}
                onClick={openMobileClientsManager}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'clients' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
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
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <ShieldUser className="h-4 w-4" />
                  Administração
                </Link>
              )}
            </nav>

            <div className="space-y-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
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
          loads={residentialOptions.loads}
          topology={residentialOptions.topology}
          selectedBatteryModel={residentialOptions.batteryModel}
          gridType={residentialOptions.gridType}
          peakW={peakW}
          dailyKwh={dailyKwh}
          userStockItems={userStockItems}
          whiteTariff={residentialOptions.whiteTariff}
          batteryCatalog={batteryCatalog}
        />
      )}
    </main>
  );
}
