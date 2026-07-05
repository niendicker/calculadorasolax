'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Boxes,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  Save,
  ShieldUser,
  Sun,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';
import { useWizardStore, totalDailyKwh, totalPeakW, gridTypePhaseCount } from '@/lib/store/wizard-store';
import { cn } from '@/lib/utils';
import { useCalculation } from './hooks/useCalculation';
import { useInitialData } from './hooks/useInitialData';
import { useProfileActions } from './hooks/useProfileActions';
import { useProjectActions } from './hooks/useProjectActions';
import { PrintableReport } from './PrintableReport';
import { CatalogTab } from './tabs/CatalogTab';
import { ClientsTab } from './tabs/ClientsTab';
import { MyLoadsTab } from './tabs/MyLoadsTab';
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
    savedProjects,
    clients,
    userLoadCatalog,
    userStockItems,
    residentialOptions,
    solution,
    setProjectInfo,
    newProjectDraft,
    saveCurrentProject,
    loadProject,
    removeProject,
    fetchProjects,
    fetchClients,
    fetchUserLoadCatalog,
    fetchUserStockItems,
    addClient,
    updateClient,
    removeClient,
    saveManualLoadToCatalog,
    updateUserLoadCatalogItem,
    removeUserLoadCatalogItem,
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
    setSolution,
    setLoadCatalog,
    resetResidential,
  } = useWizardStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'project' | 'sizing' | 'myLoads' | 'catalog' | 'clients'>('project');

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
  } = useInitialData({ supabase, fetchClients, fetchProjects, fetchUserLoadCatalog, fetchUserStockItems, setLoadCatalog });

  const {
    profileOpen,
    setProfileOpen,
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
  } = useProfileActions({ supabase, profile, setProfile, router, locale, clearUserData });

  const { projectStatus, saveProject, startNewProject, openProject, deleteProject } = useProjectActions({
    profile,
    router,
    locale,
    saveCurrentProject,
    newProjectDraft,
    loadProject,
    removeProject,
    setActiveTab,
  });

  const dailyKwh = totalDailyKwh(residentialOptions.loads);
  const peakW = totalPeakW(residentialOptions.loads, residentialOptions.peakCalcMode ?? 'sum');

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
    setProfileOpen(false);
    setMobileMenuOpen(false);
    clearUserData();
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  function exportPdf() {
    if (!solution) return;
    window.print();
  }

  function openMobileTab(tab: 'project' | 'sizing' | 'myLoads' | 'catalog' | 'clients') {
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
      <div className="mx-auto grid h-full w-full max-w-[1920px] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[1fr]">
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
              aria-current={activeTab === 'myLoads' ? 'page' : undefined}
              onClick={() => setActiveTab('myLoads')}
              className={cn(
                'flex h-8 w-full items-center gap-2 rounded-lg py-0 pl-9 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                activeTab === 'myLoads' &&
                  'border border-primary/20 bg-primary/10 font-medium text-foreground'
              )}
            >
              <Plug className="h-3.5 w-3.5" />
              Minhas Cargas
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
              onClick={openProfile}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
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

        <section className="min-h-0 min-w-0 overflow-y-auto px-4 pb-4 lg:px-6 lg:pb-5">
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
              onOpen={openProject}
              onRemove={deleteProject}
              onGoSizing={() => setActiveTab('sizing')}
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
              onUpdateStockValue={updateStockItemValue}
              onRemoveFromStock={removeFromStock}
            />
          ) : activeTab === 'clients' ? (
            <ClientsTab
              clients={clients}
              onAdd={addClient}
              onUpdate={updateClient}
              onRemove={removeClient}
            />
          ) : activeTab === 'myLoads' ? (
            <MyLoadsTab
              userLoadCatalog={userLoadCatalog}
              onAdd={saveManualLoadToCatalog}
              onUpdate={updateUserLoadCatalogItem}
              onRemove={removeUserLoadCatalogItem}
            />
          ) : (
            <SizingTab
              title={t('title')}
              subtitle={t('subtitle')}
              loadingLabel={tc('loading')}
              calculateLabel={tc('calculate')}
              residentialOptions={residentialOptions}
              batteryCatalog={batteryCatalog}
              inverterCatalog={inverterCatalog}
              availableInverterModels={availableInverterModels}
              solution={solution}
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
              resetResidential={resetResidential}
              calculate={calculate}
              exportPdf={exportPdf}
              saveProject={saveProject}
              productMedia={productMedia}
              userStockItems={userStockItems}
            />
          )}
        </section>

        <Button
          type="button"
          size="icon-lg"
          className="fixed bottom-4 left-4 z-30 shadow-lg lg:hidden"
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

            <nav className="mt-8 space-y-1">
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
                aria-current={activeTab === 'myLoads' ? 'page' : undefined}
                onClick={() => openMobileTab('myLoads')}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-lg py-0 pl-9 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  activeTab === 'myLoads' && 'border border-primary/20 bg-primary/10 font-medium text-foreground'
                )}
              >
                <Plug className="h-3.5 w-3.5" />
                Minhas Cargas
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
                onClick={openMobileProfile}
                className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
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
        </div>
      )}

      {profileOpen && profile && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-foreground/20 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inline-profile-title"
        >
          <div className="flex max-h-[calc(100vh-2.5rem)] w-full flex-col rounded-t-lg border bg-card shadow-lg sm:max-w-lg sm:rounded-lg">
            <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5">
              <div>
                <h2 id="inline-profile-title" className="text-xl font-semibold tracking-tight">
                  Meu perfil
                </h2>
                <p className="text-sm text-muted-foreground">Edite seus dados sem sair do dimensionamento.</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Fechar perfil"
                onClick={() => setProfileOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={saveProfile} className="space-y-4 overflow-y-auto p-4 sm:p-5">
              <div>
                <p className="mb-3 text-sm font-medium">Dados pessoais</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inlineProfileEmail">Email</Label>
                  <Input id="inlineProfileEmail" value={profile.email} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inlineProfileRole">Tipo de acesso</Label>
                  <Input
                    id="inlineProfileRole"
                    value={profile.role === 'admin' ? 'Administrador' : 'Usuário comum'}
                    disabled
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inlineProfileName">Nome</Label>
                <Input
                  id="inlineProfileName"
                  value={profile.fullName}
                  onChange={(event) => setProfile({ ...profile, fullName: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inlineProfilePhone">Telefone</Label>
                <Input
                  id="inlineProfilePhone"
                  value={profile.phone}
                  onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  required
                />
              </div>

              <Separator />

              <div>
                <p className="mb-3 text-sm font-medium">Empresa no relatório</p>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="inlineCompanyName">Nome da empresa</Label>
                    <Input
                      id="inlineCompanyName"
                      value={profile.companyName}
                      onChange={(event) => setProfile({ ...profile, companyName: event.target.value })}
                      placeholder="Nome que aparecerá no relatório"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inlineCompanyAddress">Endereço da empresa</Label>
                    <Input
                      id="inlineCompanyAddress"
                      value={profile.companyAddress}
                      onChange={(event) => setProfile({ ...profile, companyAddress: event.target.value })}
                      placeholder="Endereço comercial"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inlineCompanyLogo">Logomarca</Label>
                    <Input
                      id="inlineCompanyLogo"
                      value={profile.companyLogoUrl}
                      onChange={(event) => setProfile({ ...profile, companyLogoUrl: event.target.value })}
                      placeholder="URL da logomarca"
                    />
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(event) => uploadCompanyLogo(event.target.files?.[0])}
                    />
                    {profile.companyLogoUrl && (
                      <div className="rounded-lg border bg-background p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={profile.companyLogoUrl}
                          alt="Logomarca da empresa"
                          className="h-16 max-w-48 object-contain"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {profileMessage && (
                <p role="status" className="rounded-lg border border-primary/30 px-3 py-2 text-sm text-primary">
                  {profileMessage}
                </p>
              )}
              {profileError && (
                <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
                  {profileError}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                  Sair
                </Button>
                <Button type="submit" disabled={profileSaving}>
                  <Save className="h-4 w-4" />
                  {profileSaving ? 'Salvando...' : 'Salvar perfil'}
                </Button>
              </div>

              <Separator />

              <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div>
                  <p className="text-sm font-medium text-destructive">Excluir conta</p>
                  <p className="text-xs text-muted-foreground">
                    Remove definitivamente sua conta e os dados vinculados a ela (clientes, projetos e cargas
                    pessoais cadastradas). Essa ação não pode ser desfeita.
                  </p>
                </div>

                {!deleteAccountOpen ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteAccountOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir minha conta
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="deleteConfirmText">
                      Digite <span className="font-semibold">EXCLUIR</span> para confirmar
                    </Label>
                    <Input
                      id="deleteConfirmText"
                      value={deleteConfirmText}
                      onChange={(event) => setDeleteConfirmText(event.target.value)}
                      placeholder="EXCLUIR"
                    />
                    {deleteAccountError && (
                      <p role="alert" className="text-xs text-destructive">
                        {deleteAccountError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteAccountOpen(false);
                          setDeleteConfirmText('');
                          setDeleteAccountError(null);
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deleteConfirmText !== 'EXCLUIR' || deletingAccount}
                        onClick={deleteAccount}
                      >
                        {deletingAccount ? 'Excluindo...' : 'Confirmar exclusão definitiva'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
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
        />
      )}
    </main>
  );
}
