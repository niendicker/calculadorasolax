'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Battery,
  Calculator,
  FileText,
  FolderOpen,
  Gauge,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Save,
  Settings,
  ShieldUser,
  Sun,
  Trash2,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { createClient } from '@/lib/supabase/client';
import { useWizardStore, totalDailyKwh, totalPeakW } from '@/lib/store/wizard-store';
import type {
  BatteryTopology,
  CatalogItem,
  ProductDocument,
  ProjectInfo,
  ResidentialGridType,
  SavedProject,
  Solution,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const topologyOptions: { value: BatteryTopology; label: string; badge: string }[] = [
  { value: 'HighVoltage', label: 'Alta tensão', badge: 'HV' },
  { value: 'LowVoltage', label: 'Baixa tensão', badge: 'LV' },
];

const gridOptions: { value: ResidentialGridType; label: string; detail: string }[] = [
  { value: 'singlePhase_220', label: 'Monofásico', detail: '220V' },
  { value: 'splitPhase_220', label: 'Bifásico', detail: '220V' },
  { value: 'threePhase_220', label: 'Trifásico', detail: '220V' },
  { value: 'threePhase_380', label: 'Trifásico', detail: '380V' },
];

const topologyLabels: Record<BatteryTopology, string> = {
  HighVoltage: 'Alta tensão (HV)',
  LowVoltage: 'Baixa tensão (LV)',
};

const gridLabels: Record<ResidentialGridType, string> = {
  singlePhase_220: 'Monofásico 220V',
  splitPhase_220: 'Bifásico 220V',
  threePhase_220: 'Trifásico 220V',
  threePhase_380: 'Trifásico 380V',
};

interface InlineProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: 'user' | 'admin';
  companyName: string;
  companyAddress: string;
  companyLogoUrl: string;
}

interface ProductMedia {
  model: string;
  imageUrl: string | null;
  documents: ProductDocument[];
}

interface BatteryCatalogOption {
  id: string;
  model: string;
  capacityKwh: number;
  topology: 'HV' | 'LV';
}

export function SinglePageApp() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);
  const {
    projectInfo,
    savedProjects,
    residentialOptions,
    solution,
    setProjectInfo,
    saveCurrentProject,
    loadProject,
    removeProject,
    setTopology,
    setBatteryModel,
    setGridType,
    setSolution,
    setLoadCatalog,
    resetResidential,
  } = useWizardStore();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<InlineProfile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'project' | 'sizing'>('project');
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [productMedia, setProductMedia] = useState<Record<string, ProductMedia>>({});
  const [batteryCatalog, setBatteryCatalog] = useState<BatteryCatalogOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInitialData() {
      const [{ data: userData }, { data: catalogData }, { data: batteryData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('load_catalog')
          .select('id, name_pt, name_en, name_zh, power_w, category')
          .order('category'),
        supabase
          .from('batteries')
          .select('id, model, capacity_kwh, topology')
          .order('model'),
      ]);

      setUserEmail(userData.user?.email ?? null);
      setProfile(null);

      if (userData.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, email, full_name, phone, role, company_name, company_address, company_logo_url')
          .eq('id', userData.user.id)
          .maybeSingle();

        setProfile({
          id: userData.user.id,
          email: profileData?.email ?? userData.user.email ?? '',
          fullName: profileData?.full_name ?? userData.user.user_metadata?.full_name ?? '',
          phone: profileData?.phone ?? userData.user.user_metadata?.phone ?? '',
          role: profileData?.role === 'admin' ? 'admin' : 'user',
          companyName: profileData?.company_name ?? '',
          companyAddress: profileData?.company_address ?? '',
          companyLogoUrl: profileData?.company_logo_url ?? '',
        });
      }

      if (catalogData) {
        const catalog: CatalogItem[] = catalogData.map((row) => ({
          id: row.id,
          namePt: row.name_pt,
          nameEn: row.name_en,
          nameZh: row.name_zh,
          powerW: row.power_w,
          category: row.category,
        }));
        setLoadCatalog(catalog);
      }

      if (batteryData) {
        setBatteryCatalog(
          batteryData.map((row) => ({
            id: row.id,
            model: row.model,
            capacityKwh: Number(row.capacity_kwh),
            topology: row.topology as 'HV' | 'LV',
          }))
        );
      }
    }

    loadInitialData();
  }, [setLoadCatalog, supabase]);

  useEffect(() => {
    async function loadProductMedia() {
      if (!solution) {
        setProductMedia({});
        return;
      }

      const models = Array.from(
        new Set([
          solution.inverterModel,
          solution.batteryModel,
          ...solution.accessories,
        ].filter(Boolean))
      );

      if (models.length === 0) {
        setProductMedia({});
        return;
      }

      const [inverterResult, batteryResult, accessoryResult] = await Promise.all([
        supabase.from('inverters').select('model, image_url, documents').in('model', models),
        supabase.from('batteries').select('model, image_url, documents').in('model', models),
        supabase.from('accessories').select('model, image_url, documents').in('model', models),
      ]);

      const rows = [
        ...(inverterResult.data ?? []),
        ...(batteryResult.data ?? []),
        ...(accessoryResult.data ?? []),
      ] as { model: string; image_url: string | null; documents: ProductDocument[] | null }[];

      setProductMedia(
        rows.reduce<Record<string, ProductMedia>>((acc, row) => {
          acc[row.model] = {
            model: row.model,
            imageUrl: row.image_url,
            documents: row.documents ?? [],
          };
          return acc;
        }, {})
      );
    }

    loadProductMedia();
  }, [solution, supabase]);

  const dailyKwh = totalDailyKwh(residentialOptions.loads);
  const peakW = totalPeakW(residentialOptions.loads);
  const canCalculate =
    residentialOptions.topology &&
    residentialOptions.batteryModel &&
    residentialOptions.gridType &&
    residentialOptions.loads.length > 0;

  async function calculate() {
    if (!canCalculate) return;

    setLoading(true);
    setError(null);

    const { data, error: functionError } = await supabase.functions.invoke(
      'calculate-residential',
      { body: residentialOptions }
    );

    setLoading(false);

    if (functionError || !data) {
      setSolution(null);
      setError('Não foi possível encontrar uma solução compatível.');
      return;
    }

    const nextSolution = data as Solution;
    setSolution(nextSolution);

    const { data: userData } = await supabase.auth.getUser();
    await supabase.from('app_simulations').insert({
      user_id: userData.user?.id ?? null,
      project_name: projectInfo.name || null,
      client_name: projectInfo.clientName || null,
      topology: residentialOptions.topology,
      grid_type: residentialOptions.gridType,
      peak_w: peakW,
      daily_kwh: dailyKwh,
      loads: residentialOptions.loads,
      inverter_model: nextSolution.inverterModel,
      battery_model: nextSolution.batteryModel,
      accessories: nextSolution.accessories,
      solution_code: nextSolution.solutionCode ?? null,
    });
  }

  function openProfile() {
    setProfileMessage(null);
    setProfileError(null);

    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }

    setProfileOpen(true);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    setProfileSaving(true);
    setProfileMessage(null);
    setProfileError(null);

    const { error: saveError } = await supabase.from('profiles').upsert({
      id: profile.id,
      email: profile.email,
      full_name: profile.fullName.trim(),
      phone: profile.phone.trim(),
      role: profile.role,
      company_name: profile.companyName.trim(),
      company_address: profile.companyAddress.trim(),
      company_logo_url: profile.companyLogoUrl.trim(),
      updated_at: new Date().toISOString(),
    });

    setProfileSaving(false);

    if (saveError) {
      setProfileError(saveError.message);
      return;
    }

    setProfileMessage('Perfil atualizado.');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setUserEmail(null);
    setProfileOpen(false);
    router.refresh();
  }

  async function uploadCompanyLogo(file: File | undefined) {
    if (!file || !profile) return;

    setProfileSaving(true);
    setProfileError(null);

    const extension = file.name.split('.').pop();
    const path = `${profile.id}/logo/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
    const { error: uploadError } = await supabase.storage
      .from('profile-assets')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    setProfileSaving(false);

    if (uploadError) {
      setProfileError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from('profile-assets').getPublicUrl(path);
    setProfile({ ...profile, companyLogoUrl: data.publicUrl });
    setProfileMessage('Logomarca carregada. Salve o perfil para manter a alteração.');
  }

  function exportPdf() {
    if (!solution) return;
    window.print();
  }

  function saveProject() {
    const project = saveCurrentProject();
    setProjectStatus(`Projeto "${project.name}" salvo.`);
  }

  function openProject(id: string) {
    loadProject(id);
    setActiveTab('sizing');
    setProjectStatus('Projeto carregado.');
  }

  function openMobileTab(tab: 'project' | 'sizing') {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  }

  function openMobileProfile() {
    setMobileMenuOpen(false);
    openProfile();
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-rows-[auto_1fr_auto] lg:grid-cols-[240px_1fr] lg:grid-rows-[1fr]">
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

          <div className="mt-auto rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
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
        </aside>

        <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
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

        <section className="min-w-0 px-4 py-4 lg:px-6 lg:py-5">
          {activeTab === 'project' ? (
            <ProjectTab
              projectInfo={projectInfo}
              savedProjects={savedProjects}
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
              onOpen={openProject}
              onRemove={removeProject}
              onGoSizing={() => setActiveTab('sizing')}
            />
          ) : (
            <SizingTab
              title={t('title')}
              subtitle={t('subtitle')}
              loadingLabel={tc('loading')}
              calculateLabel={tc('calculate')}
              residentialOptions={residentialOptions}
              batteryCatalog={batteryCatalog}
              solution={solution}
              peakW={peakW}
              dailyKwh={dailyKwh}
              canCalculate={Boolean(canCalculate)}
              loading={loading}
              error={error}
              setTopology={setTopology}
              setBatteryModel={setBatteryModel}
              setGridType={setGridType}
              resetResidential={resetResidential}
              calculate={calculate}
              exportPdf={exportPdf}
              productMedia={productMedia}
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

            <div className="mt-auto rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
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
          <div className="w-full rounded-t-lg border bg-card p-4 shadow-lg sm:max-w-lg sm:rounded-lg sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
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

            <form onSubmit={saveProfile} className="space-y-4">
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
            </form>
          </div>
        </div>
      )}

      {solution && (
        <PrintableReport
          projectInfo={projectInfo}
          profile={profile}
          solution={solution}
          loads={residentialOptions.loads}
          topology={residentialOptions.topology}
          selectedBatteryModel={residentialOptions.batteryModel}
          gridType={residentialOptions.gridType}
          peakW={peakW}
          dailyKwh={dailyKwh}
        />
      )}
    </main>
  );
}

function ProjectTab({
  projectInfo,
  savedProjects,
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
  onOpen,
  onRemove,
  onGoSizing,
}: {
  projectInfo: ProjectInfo;
  savedProjects: SavedProject[];
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
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onGoSizing: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projeto</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre o cliente e salve a configuração para reutilizar depois.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onGoSizing}>
            <Calculator className="h-4 w-4" />
            Dimensionar
          </Button>
          <Button onClick={onSave}>
            <Save className="h-4 w-4" />
            Salvar projeto
          </Button>
        </div>
      </div>

      {projectStatus && (
        <p role="status" className="rounded-lg border border-primary/30 px-3 py-2 text-sm text-primary">
          {projectStatus}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados do cliente</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <ProjectField label="Nome do projeto" id="projectName">
                <Input
                  id="projectName"
                  value={projectInfo.name}
                  onChange={(event) => setProjectInfo({ name: event.target.value })}
                  placeholder="Ex: Residência Silva"
                />
              </ProjectField>
              <ProjectField label="Cliente" id="clientName">
                <Input
                  id="clientName"
                  value={projectInfo.clientName}
                  onChange={(event) => setProjectInfo({ clientName: event.target.value })}
                  placeholder="Nome do cliente"
                />
              </ProjectField>
              <ProjectField label="Email" id="clientEmail">
                <Input
                  id="clientEmail"
                  type="email"
                  value={projectInfo.clientEmail}
                  onChange={(event) => setProjectInfo({ clientEmail: event.target.value })}
                  placeholder="cliente@email.com"
                />
              </ProjectField>
              <ProjectField label="Telefone" id="clientPhone">
                <Input
                  id="clientPhone"
                  value={projectInfo.clientPhone}
                  onChange={(event) => setProjectInfo({ clientPhone: event.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </ProjectField>
              <ProjectField label="CPF/CNPJ" id="clientDocument">
                <Input
                  id="clientDocument"
                  value={projectInfo.clientDocument}
                  onChange={(event) => setProjectInfo({ clientDocument: event.target.value })}
                  placeholder="Documento do cliente"
                />
              </ProjectField>
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
                    className="min-h-24 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={projectInfo.notes}
                    onChange={(event) => setProjectInfo({ notes: event.target.value })}
                    placeholder="Informações comerciais, restrições da instalação ou preferências do cliente."
                  />
                </ProjectField>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Projetos salvos</CardTitle>
            </CardHeader>
            <CardContent>
              {savedProjects.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhum projeto salvo ainda. Preencha os dados, configure o dimensionamento e clique em salvar.
                </div>
              ) : (
                <div className="space-y-2">
                  {savedProjects.map((project) => (
                    <div
                      key={project.id}
                      className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {project.clientName || 'Cliente não informado'} · Atualizado em{' '}
                          {new Intl.DateTimeFormat('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(project.updatedAt))}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpen(project.id)}>
                          <FolderOpen className="h-4 w-4" />
                          Abrir
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          aria-label={`Remover projeto ${project.name}`}
                          onClick={() => onRemove(project.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-5 xl:self-start">
          <CardHeader>
            <CardTitle>Configuração salva junto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Pico" value={`${(peakW / 1000).toFixed(2)} kW`} />
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
          </CardContent>
        </Card>
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

function SizingTab({
  title,
  subtitle,
  loadingLabel,
  calculateLabel,
  residentialOptions,
  batteryCatalog,
  solution,
  peakW,
  dailyKwh,
  canCalculate,
  loading,
  error,
  setTopology,
  setBatteryModel,
  setGridType,
  resetResidential,
  calculate,
  exportPdf,
  productMedia,
}: {
  title: string;
  subtitle: string;
  loadingLabel: string;
  calculateLabel: string;
  residentialOptions: {
    topology: BatteryTopology | null;
    batteryModel: string | null;
    gridType: ResidentialGridType | null;
    loads: unknown[];
  };
  batteryCatalog: BatteryCatalogOption[];
  solution: Solution | null;
  peakW: number;
  dailyKwh: number;
  canCalculate: boolean;
  loading: boolean;
  error: string | null;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  resetResidential: () => void;
  calculate: () => void;
  exportPdf: () => void;
  productMedia: Record<string, ProductMedia>;
}) {
  const selectedBatteryTopology =
    residentialOptions.topology === 'HighVoltage'
      ? 'HV'
      : residentialOptions.topology === 'LowVoltage'
        ? 'LV'
        : null;
  const filteredBatteries = selectedBatteryTopology
    ? batteryCatalog.filter((battery) => battery.topology === selectedBatteryTopology)
    : batteryCatalog;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => resetResidential()}>
            Limpar
          </Button>
          {solution && (
            <Button variant="outline" onClick={exportPdf}>
              <FileText className="h-4 w-4" />
              Exportar PDF
            </Button>
          )}
          <Button onClick={calculate} disabled={!canCalculate || loading}>
            <Calculator className="h-4 w-4" />
            {loading ? loadingLabel : calculateLabel}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4" />
                Configuração
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">Topologia da bateria</p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Topologia da bateria">
                  {topologyOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={residentialOptions.topology === option.value}
                      onClick={() => setTopology(option.value)}
                      className={cn(
                        'flex h-16 items-center gap-3 rounded-lg border bg-card px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        residentialOptions.topology === option.value
                          ? 'border-accent bg-primary/10 shadow-sm'
                          : 'hover:border-primary/50 hover:bg-muted/70'
                      )}
                    >
                      <Badge variant="secondary">{option.badge}</Badge>
                      <span className="font-medium">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="battery-model">Modelo da bateria</Label>
                <select
                  id="battery-model"
                  className="h-16 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={residentialOptions.batteryModel ?? ''}
                  onChange={(event) => setBatteryModel(event.target.value || null)}
                  disabled={!residentialOptions.topology}
                >
                  <option value="">
                    {residentialOptions.topology ? 'Selecione o modelo' : 'Escolha HV/LV primeiro'}
                  </option>
                  {filteredBatteries.map((battery) => (
                    <option key={battery.id} value={battery.model}>
                      {battery.model} · {battery.capacityKwh} kWh · {battery.topology}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  A recomendação será limitada às combinações aprovadas com este modelo.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Tipo de rede</p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de rede">
                  {gridOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={residentialOptions.gridType === option.value}
                      onClick={() => setGridType(option.value)}
                      className={cn(
                        'flex h-16 flex-col justify-center rounded-lg border bg-card px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        residentialOptions.gridType === option.value
                          ? 'border-accent bg-primary/10 shadow-sm'
                          : 'hover:border-primary/50 hover:bg-muted/70'
                      )}
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="h-4 w-4" />
                Cargas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LoadSelector />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4" />
                Resumo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Pico" value={`${(peakW / 1000).toFixed(2)} kW`} />
                <Metric label="Consumo" value={`${dailyKwh.toFixed(2)} kWh/dia`} />
              </div>
              <Separator />
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              {!solution ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <p>Configure os dados para ver a solução recomendada.</p>
                  <ul className="mt-3 space-y-1">
                    <Requirement done={Boolean(residentialOptions.topology)} label="Topologia da bateria" />
                    <Requirement done={Boolean(residentialOptions.batteryModel)} label="Modelo da bateria" />
                    <Requirement done={Boolean(residentialOptions.gridType)} label="Tipo de rede" />
                    <Requirement done={residentialOptions.loads.length > 0} label="Cargas da instalação" />
                  </ul>
                </div>
              ) : (
                <ResultSummary solution={solution} onExport={exportPdf} productMedia={productMedia} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Requirement({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={cn('flex items-center gap-2', done && 'text-foreground')}>
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 rounded-full bg-muted-foreground/50',
          done && 'bg-accent'
        )}
      />
      <span>{label}</span>
    </li>
  );
}

function ResultSummary({
  solution,
  onExport,
  productMedia,
}: {
  solution: Solution;
  onExport: () => void;
  productMedia: Record<string, ProductMedia>;
}) {
  const mediaItems = [
    productMedia[solution.inverterModel],
    productMedia[solution.batteryModel],
    ...solution.accessories.map((accessory) => productMedia[accessory]),
  ].filter(Boolean) as ProductMedia[];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-accent" />
          Inversor
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.inverterModel}</p>
        {solution.inverterQty && solution.inverterQty > 1 && (
          <p className="text-sm text-muted-foreground">Quantidade: x{solution.inverterQty}</p>
        )}
      </div>

      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Battery className="h-4 w-4 text-primary" />
          Bateria
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.batteryModel}</p>
        <p className="text-sm text-muted-foreground">Quantidade: x{solution.batteryQty}</p>
      </div>

      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sun className="h-4 w-4 text-primary" />
          FV recomendado
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.pvPowerKw.toFixed(2)} kWp</p>
      </div>

      {solution.accessories.length > 0 && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Acessórios</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {solution.accessories.map((accessory) => (
              <Badge key={accessory} variant="secondary">
                {accessory}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {mediaItems.length > 0 && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Materiais técnicos</p>
          <div className="mt-3 space-y-3">
            {mediaItems.map((item) => (
              <div key={item.model} className="grid gap-2 rounded-lg border p-2">
                <div className="flex items-center gap-3">
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.model} className="h-12 w-16 rounded border object-contain p-1" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.model}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.documents.length} documento(s)
                    </p>
                  </div>
                </div>
                {item.documents.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {item.documents.map((document) => (
                      <a
                        key={`${item.model}-${document.url}`}
                        href={document.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border px-2 py-1 text-xs text-primary hover:bg-primary/10"
                      >
                        {document.name || 'Documento'}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Button className="w-full" variant="outline" onClick={onExport}>
        <FileText className="h-4 w-4" />
        Exportar relatório em PDF
      </Button>
    </div>
  );
}

function PrintableReport({
  projectInfo,
  profile,
  solution,
  loads,
  topology,
  selectedBatteryModel,
  gridType,
  peakW,
  dailyKwh,
}: {
  projectInfo: ProjectInfo;
  profile: InlineProfile | null;
  solution: Solution;
  loads: { name: string; powerW: number; hoursPerDay: number; qty: number }[];
  topology: BatteryTopology | null;
  selectedBatteryModel: string | null;
  gridType: ResidentialGridType | null;
  peakW: number;
  dailyKwh: number;
}) {
  const generatedAt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

  const loadEnergyKwh = (load: { powerW: number; hoursPerDay: number; qty: number }) =>
    (load.powerW * load.hoursPerDay * load.qty) / 1000;

  return (
    <div className="print-report">
      <header className="mb-8 flex items-start justify-between border-b pb-4">
        <div className="flex items-start gap-4">
          {profile?.companyLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.companyLogoUrl}
              alt={profile.companyName || 'Logomarca da empresa'}
              className="h-16 w-28 object-contain"
            />
          )}
          <div>
            <p className="text-sm font-semibold text-primary">
              {profile?.companyName || 'SolaX Power Brasil'}
            </p>
            {profile?.companyAddress && (
              <p className="mt-1 max-w-md text-xs text-muted-foreground">{profile.companyAddress}</p>
            )}
            <h1 className="mt-2 text-2xl font-bold text-foreground">Relatório de dimensionamento</h1>
            <p className="mt-1 text-sm text-muted-foreground">Gerado em {generatedAt}</p>
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>Calculadora SolaX</p>
          {solution.solutionCode && <p>Código: {solution.solutionCode}</p>}
        </div>
      </header>

      <section className="mb-6 grid grid-cols-4 gap-3">
        <ReportMetric label="Pico de carga" value={`${(peakW / 1000).toFixed(2)} kW`} />
        <ReportMetric label="Consumo diário" value={`${dailyKwh.toFixed(2)} kWh/dia`} />
        <ReportMetric label="Topologia" value={topology ? topologyLabels[topology] : '-'} />
        <ReportMetric label="Bateria selecionada" value={selectedBatteryModel || '-'} />
        <ReportMetric label="Rede" value={gridType ? gridLabels[gridType] : '-'} />
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-lg font-semibold">Dados do projeto</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <ReportInfoRow label="Projeto" value={projectInfo.name || '-'} />
            <ReportInfoRow label="Cliente" value={projectInfo.clientName || '-'} />
            <ReportInfoRow label="Email" value={projectInfo.clientEmail || '-'} />
            <ReportInfoRow label="Telefone" value={projectInfo.clientPhone || '-'} />
            <ReportInfoRow label="CPF/CNPJ" value={projectInfo.clientDocument || '-'} />
            <ReportInfoRow label="Endereço" value={projectInfo.address || '-'} />
            {projectInfo.notes && <ReportInfoRow label="Observações" value={projectInfo.notes} />}
          </tbody>
        </table>
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-lg font-semibold">Produtos recomendados</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-left">
              <th className="border px-3 py-2">Item</th>
              <th className="border px-3 py-2">Modelo</th>
              <th className="border px-3 py-2">Quantidade</th>
              <th className="border px-3 py-2">Observação</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border px-3 py-2">Inversor</td>
              <td className="border px-3 py-2">{solution.inverterModel}</td>
              <td className="border px-3 py-2">{solution.inverterQty ?? 1}</td>
              <td className="border px-3 py-2">
                {solution.inverterRatedPowerW ? `${solution.inverterRatedPowerW} W nominal` : '-'}
              </td>
            </tr>
            <tr>
              <td className="border px-3 py-2">Bateria</td>
              <td className="border px-3 py-2">{solution.batteryModel}</td>
              <td className="border px-3 py-2">{solution.batteryQty}</td>
              <td className="border px-3 py-2">
                {solution.availableEnergyWh ? `${(solution.availableEnergyWh / 1000).toFixed(2)} kWh disponíveis` : '-'}
              </td>
            </tr>
            <tr>
              <td className="border px-3 py-2">Potência FV recomendada</td>
              <td className="border px-3 py-2">Arranjo fotovoltaico</td>
              <td className="border px-3 py-2">-</td>
              <td className="border px-3 py-2">{solution.pvPowerKw.toFixed(2)} kWp</td>
            </tr>
            {solution.accessories.map((accessory) => (
              <tr key={accessory}>
                <td className="border px-3 py-2">Acessório</td>
                <td className="border px-3 py-2">{accessory}</td>
                <td className="border px-3 py-2">1</td>
                <td className="border px-3 py-2">Conforme regra/catálogo aprovado</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-lg font-semibold">Cargas informadas</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-left">
              <th className="border px-3 py-2">Carga</th>
              <th className="border px-3 py-2">Potência unitária</th>
              <th className="border px-3 py-2">Quantidade</th>
              <th className="border px-3 py-2">Uso diário</th>
              <th className="border px-3 py-2">Pico</th>
              <th className="border px-3 py-2">Consumo</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((load) => (
              <tr key={`${load.name}-${load.powerW}-${load.hoursPerDay}-${load.qty}`}>
                <td className="border px-3 py-2">{load.name}</td>
                <td className="border px-3 py-2">{load.powerW} W</td>
                <td className="border px-3 py-2">{load.qty}</td>
                <td className="border px-3 py-2">{load.hoursPerDay} h/dia</td>
                <td className="border px-3 py-2">{load.powerW * load.qty} W</td>
                <td className="border px-3 py-2">{loadEnergyKwh(load).toFixed(2)} kWh/dia</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {solution.comments && solution.comments.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Observações</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {solution.comments.map((comment) => (
              <li key={comment}>{comment}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function ReportInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="w-36 border bg-muted px-3 py-2 text-left font-medium">{label}</th>
      <td className="border px-3 py-2">{value}</td>
    </tr>
  );
}
