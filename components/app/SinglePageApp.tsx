'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Battery,
  Boxes,
  Cable,
  Calculator,
  FileText,
  FolderOpen,
  Gauge,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Save,
  Settings,
  ShieldUser,
  Sun,
  Trash2,
  UserRound,
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
import { Skeleton } from '@/components/ui/skeleton';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { createClient } from '@/lib/supabase/client';
import { useWizardStore, totalDailyKwh, totalPeakW } from '@/lib/store/wizard-store';
import type {
  BatteryTopology,
  CatalogItem,
  Client,
  ProductDocument,
  ProjectInfo,
  ResidentialGridType,
  SavedProject,
  Solution,
  UserLoadCatalogItem,
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

function parseAccessoryLabel(raw: string) {
  const optional = /\s*\(opcional\)\s*$/.test(raw);
  const withoutOptional = optional ? raw.replace(/\s*\(opcional\)\s*$/, '') : raw;
  const qtyMatch = withoutOptional.match(/^(.*)\s+x(\d+)$/);
  return {
    model: qtyMatch ? qtyMatch[1] : withoutOptional,
    qty: qtyMatch ? Number(qtyMatch[2]) : 1,
    optional,
  };
}

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
  standardPowerKw: number | null;
  peakPowerKw: number | null;
  minSocPercent: number;
  imageUrl: string | null;
  documents: ProductDocument[];
}

interface InverterCatalogOption {
  id: string;
  model: string;
  topology: 'HV' | 'LV' | 'BOTH';
  phases: number;
  standardPowerKva: number | null;
  peakPowerKva: number | null;
  imageUrl: string | null;
  documents: ProductDocument[];
}

interface AccessoryCatalogOption {
  id: string;
  model: string;
  description: string | null;
  imageUrl: string | null;
  documents: ProductDocument[];
}

interface ApprovedInverterCombo {
  gridTopology: string;
  batteryTopology: 'HV' | 'LV';
  inverterModel: string;
}

const gridTypeToApprovedTopology: Record<ResidentialGridType, '1p_220V' | '3p_220V' | '3p_380V'> = {
  singlePhase_220: '1p_220V',
  splitPhase_220: '1p_220V',
  threePhase_220: '3p_220V',
  threePhase_380: '3p_380V',
};

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
    addClient,
    updateClient,
    removeClient,
    saveManualLoadToCatalog,
    updateUserLoadCatalogItem,
    removeUserLoadCatalogItem,
    clearUserData,
    setTopology,
    setBatteryModel,
    setInverterModel,
    setGridType,
    setSolution,
    setLoadCatalog,
    resetResidential,
  } = useWizardStore();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<InlineProfile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'project' | 'sizing' | 'catalog' | 'clients'>('project');
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [productMedia, setProductMedia] = useState<Record<string, ProductMedia>>({});
  const [batteryCatalog, setBatteryCatalog] = useState<BatteryCatalogOption[]>([]);
  const [inverterCatalog, setInverterCatalog] = useState<InverterCatalogOption[]>([]);
  const [accessoryCatalog, setAccessoryCatalog] = useState<AccessoryCatalogOption[]>([]);
  const [approvedInverterCombos, setApprovedInverterCombos] = useState<ApprovedInverterCombo[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInitialData() {
      setInitialLoading(true);
      const [
        { data: userData },
        { data: catalogData },
        { data: batteryData },
        { data: inverterData },
        { data: accessoryData },
        { data: approvedSolutionsData },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('load_catalog')
          .select('id, name_pt, name_en, name_zh, power_w, category, ip_in_ratio')
          .eq('active', true)
          .order('category'),
        supabase
          .from('batteries')
          .select('id, model, capacity_kwh, topology, standard_power_kw, peak_power_kw, min_soc_percent, image_url, documents')
          .order('model'),
        supabase
          .from('inverters')
          .select('id, model, topology, phases, standard_power_kva, peak_power_kva, image_url, documents')
          .order('model'),
        supabase
          .from('accessories')
          .select('id, model, description, image_url, documents')
          .eq('active', true)
          .order('model'),
        supabase
          .from('approved_solutions')
          .select('grid_topology, battery_topology, inverter_model')
          .eq('active', true),
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

        await Promise.all([fetchClients(), fetchProjects(), fetchUserLoadCatalog()]);
      }

      if (catalogData) {
        const catalog: CatalogItem[] = catalogData.map((row) => ({
          id: row.id,
          namePt: row.name_pt,
          nameEn: row.name_en,
          nameZh: row.name_zh,
          powerW: row.power_w,
          category: row.category,
          ipInRatio: row.ip_in_ratio ?? 1,
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
            standardPowerKw: row.standard_power_kw === null ? null : Number(row.standard_power_kw),
            peakPowerKw: row.peak_power_kw === null ? null : Number(row.peak_power_kw),
            minSocPercent: Number(row.min_soc_percent ?? 10),
            imageUrl: row.image_url,
            documents: (row.documents ?? []) as ProductDocument[],
          }))
        );
      }

      if (inverterData) {
        setInverterCatalog(
          inverterData.map((row) => ({
            id: row.id,
            model: row.model,
            topology: row.topology as 'HV' | 'LV' | 'BOTH',
            phases: Number(row.phases),
            standardPowerKva: row.standard_power_kva === null ? null : Number(row.standard_power_kva),
            peakPowerKva: row.peak_power_kva === null ? null : Number(row.peak_power_kva),
            imageUrl: row.image_url,
            documents: (row.documents ?? []) as ProductDocument[],
          }))
        );
      }

      if (accessoryData) {
        setAccessoryCatalog(
          accessoryData.map((row) => ({
            id: row.id,
            model: row.model,
            description: row.description,
            imageUrl: row.image_url,
            documents: (row.documents ?? []) as ProductDocument[],
          }))
        );
      }

      if (approvedSolutionsData) {
        setApprovedInverterCombos(
          approvedSolutionsData.map((row) => ({
            gridTopology: row.grid_topology,
            batteryTopology: row.battery_topology as 'HV' | 'LV',
            inverterModel: row.inverter_model,
          }))
        );
      }
      setInitialLoading(false);
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
          ...solution.accessories.map((accessory) => parseAccessoryLabel(accessory).model),
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
  const peakW = totalPeakW(residentialOptions.loads, residentialOptions.peakCalcMode ?? 'sum');

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

  const canCalculate =
    residentialOptions.topology &&
    residentialOptions.batteryModel &&
    residentialOptions.gridType &&
    residentialOptions.loads.length > 0;

  async function calculate() {
    if (!canCalculate) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'calculate-residential',
        { body: residentialOptions }
      );

      if (functionError || !data) {
        setSolution(null);
        setError('Não foi possível encontrar uma solução compatível.');
        return;
      }

      const nextSolution = data as Solution;
      setSolution(nextSolution);

      const { data: userData } = await supabase.auth.getUser();
      const { error: simulationError } = await supabase.from('app_simulations').insert({
        user_id: userData.user?.id ?? null,
        project_name: projectInfo.name || null,
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

      if (simulationError) console.error(simulationError);
    } catch (err) {
      console.error(err);
      setSolution(null);
      setError('Não foi possível encontrar uma solução compatível.');
    } finally {
      setLoading(false);
    }
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

  function openClientsManager() {
    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }
    setActiveTab('clients');
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
    setMobileMenuOpen(false);
    clearUserData();
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      const response = await fetch('/api/account/delete', { method: 'POST' });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDeleteAccountError(result.error ?? 'Não foi possível excluir a conta. Tente novamente.');
        setDeletingAccount(false);
        return;
      }

      await supabase.auth.signOut();
      clearUserData();
      router.replace(`/${locale}/login`);
      router.refresh();
    } catch {
      setDeleteAccountError('Não foi possível excluir a conta. Tente novamente.');
      setDeletingAccount(false);
    }
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

  async function saveProject() {
    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }
    try {
      const project = await saveCurrentProject();
      setProjectStatus(`Projeto "${project.name}" salvo com configuração, rede, bateria e cargas.`);
    } catch {
      setProjectStatus('Não foi possível salvar o projeto. Tente novamente.');
    }
  }

  function startNewProject() {
    newProjectDraft();
    setProjectStatus('Novo projeto iniciado.');
  }

  function openProject(id: string) {
    loadProject(id);
    setActiveTab('sizing');
    setProjectStatus('Projeto carregado.');
  }

  async function deleteProject(id: string) {
    try {
      await removeProject(id);
      setProjectStatus('Projeto removido.');
    } catch {
      setProjectStatus('Não foi possível remover o projeto.');
    }
  }

  function openMobileTab(tab: 'project' | 'sizing' | 'catalog' | 'clients') {
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
              userLoadCatalog={userLoadCatalog}
              onAddUserLoad={saveManualLoadToCatalog}
              onUpdateUserLoad={updateUserLoadCatalogItem}
              onRemoveUserLoad={removeUserLoadCatalogItem}
            />
          ) : activeTab === 'clients' ? (
            <ClientsTab
              clients={clients}
              onAdd={addClient}
              onUpdate={updateClient}
              onRemove={removeClient}
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
              resetResidential={resetResidential}
              calculate={calculate}
              exportPdf={exportPdf}
              saveProject={saveProject}
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
        />
      )}
    </main>
  );
}

function ProjectTab({
  projectInfo,
  savedProjects,
  clients,
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
  onOpen,
  onRemove,
  onGoSizing,
  onManageClients,
}: {
  projectInfo: ProjectInfo;
  savedProjects: SavedProject[];
  clients: Client[];
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
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onGoSizing: () => void;
  onManageClients: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:flex-row lg:items-end lg:justify-between lg:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projeto</h1>
          <p className="text-sm text-muted-foreground">
            Escolha um cliente cadastrado e salve a configuração para reutilizar depois.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onNew}>
            <FolderOpen className="h-4 w-4" />
            Novo projeto
          </Button>
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
              <CardTitle>Dados do projeto</CardTitle>
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
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="clientId">Cliente</Label>
                  <button
                    type="button"
                    onClick={onManageClients}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Gerenciar clientes
                  </button>
                </div>
                <select
                  id="clientId"
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              {initialLoading ? (
                <ProjectListSkeleton />
              ) : savedProjects.length === 0 ? (
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
                          {clients.find((client) => client.id === project.clientId)?.name || 'Cliente não informado'} · Atualizado em{' '}
                          {new Intl.DateTimeFormat('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(project.updatedAt))}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="outline">
                            {project.residentialOptions.topology
                              ? topologyLabels[project.residentialOptions.topology]
                              : 'Sem topologia'}
                          </Badge>
                          <Badge variant="outline">
                            {project.residentialOptions.batteryModel || 'Sem bateria'}
                          </Badge>
                          <Badge variant="outline">
                            {project.residentialOptions.gridType
                              ? gridLabels[project.residentialOptions.gridType]
                              : 'Sem rede'}
                          </Badge>
                          <Badge variant="outline">
                            {project.residentialOptions.loads.length} carga(s)
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpen(project.id)}>
                          <FolderOpen className="h-4 w-4" />
                          Abrir
                        </Button>
                        <ConfirmDeleteButton
                          ariaLabel={`Remover projeto ${project.name}`}
                          title="Remover projeto?"
                          description="O projeto salvo e sua configuração serão removidos deste navegador."
                          confirmLabel="Remover"
                          onConfirm={() => onRemove(project.id)}
                        />
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

function emptyClientForm() {
  return { name: '', email: '', phone: '', document: '', notes: '' };
}

function ClientsTab({
  clients,
  onAdd,
  onUpdate,
  onRemove,
}: {
  clients: Client[];
  onAdd: (input: { name: string; email: string; phone: string; document: string; notes: string }) => Promise<Client>;
  onUpdate: (
    id: string,
    partial: Partial<{ name: string; email: string; phone: string; document: string; notes: string }>
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyClientForm());
  const [saving, setSaving] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  function openNew() {
    setEditingId(null);
    setForm(emptyClientForm());
    setFormOpen(true);
  }

  function openEdit(client: Client) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      email: client.email,
      phone: client.phone,
      document: client.document,
      notes: client.notes,
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await onUpdate(editingId, form);
      } else {
        await onAdd(form);
      }
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingIds((current) => new Set(current).add(id));
    try {
      await onRemove(id);
    } finally {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie os clientes usados nos projetos.</p>
        </div>
        {!formOpen && (
          <Button onClick={openNew}>
            <UserRound className="h-4 w-4" />
            Novo cliente
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {!formOpen ? (
            clients.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum cliente cadastrado ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className={cn(
                      'flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between',
                      removingIds.has(client.id) && 'opacity-60'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[client.email, client.phone, client.document].filter(Boolean).join(' · ') || 'Sem dados de contato'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(client)} disabled={removingIds.has(client.id)}>
                        Editar
                      </Button>
                      <ConfirmDeleteButton
                        ariaLabel={`Remover cliente ${client.name}`}
                        title="Remover cliente?"
                        description="Os projetos que usam esse cliente ficarão sem cliente associado."
                        confirmLabel="Remover"
                        disabled={removingIds.has(client.id)}
                        onConfirm={() => handleRemove(client.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="clientFormName">Nome</Label>
                <Input
                  id="clientFormName"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="clientFormEmail">Email</Label>
                  <Input
                    id="clientFormEmail"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="cliente@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clientFormPhone">Telefone</Label>
                  <Input
                    id="clientFormPhone"
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clientFormDocument">CPF/CNPJ</Label>
                <Input
                  id="clientFormDocument"
                  value={form.document}
                  onChange={(event) => setForm({ ...form, document: event.target.value })}
                  placeholder="Documento do cliente"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clientFormNotes">Observações</Label>
                <textarea
                  id="clientFormNotes"
                  className="min-h-20 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
                  <Save className="h-4 w-4" />
                  {saving ? 'Salvando...' : 'Salvar cliente'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="space-y-2" aria-label="Carregando projetos">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-lg border bg-background p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-64 max-w-full" />
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>
      ))}
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
  inverterCatalog,
  availableInverterModels,
  solution,
  peakW,
  dailyKwh,
  canCalculate,
  loading,
  initialLoading,
  error,
  setTopology,
  setBatteryModel,
  setInverterModel,
  setGridType,
  resetResidential,
  calculate,
  exportPdf,
  saveProject,
  productMedia,
}: {
  title: string;
  subtitle: string;
  loadingLabel: string;
  calculateLabel: string;
  residentialOptions: {
    topology: BatteryTopology | null;
    batteryModel: string | null;
    inverterModel: string | null;
    gridType: ResidentialGridType | null;
    loads: unknown[];
  };
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  solution: Solution | null;
  peakW: number;
  dailyKwh: number;
  canCalculate: boolean;
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setInverterModel: (inverterModel: string | null) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  resetResidential: () => void;
  calculate: () => void;
  exportPdf: () => void;
  saveProject: () => void;
  productMedia: Record<string, ProductMedia>;
}) {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="sticky top-0 z-20 flex flex-col gap-3 border-b bg-background/95 py-3 backdrop-blur lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={saveProject}>
                <Save className="h-4 w-4" />
                Salvar projeto
              </Button>
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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4" />
                Configuração
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <BatteryModelPicker
                batteries={batteryCatalog}
                topology={residentialOptions.topology}
                selectedModel={residentialOptions.batteryModel}
                loading={initialLoading}
                setTopology={setTopology}
                setBatteryModel={setBatteryModel}
              />

              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-medium">Tipo de rede</p>
                <div
                  className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4"
                  role="radiogroup"
                  aria-label="Tipo de rede"
                >
                  {gridOptions.map((option) => {
                    const active = residentialOptions.gridType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setGridType(option.value)}
                        className={cn(
                          'flex h-14 flex-col items-center justify-center gap-1 rounded-md px-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                          active
                            ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                            : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                        )}
                      >
                        {option.label}
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[0.7rem]',
                            active ? 'bg-primary/10 text-primary' : 'bg-background'
                          )}
                        >
                          {option.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <InverterModelPicker
                  inverters={inverterCatalog}
                  availableModels={availableInverterModels}
                  selectedModel={residentialOptions.inverterModel}
                  loading={initialLoading}
                  setInverterModel={setInverterModel}
                />
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

        <div className="xl:sticky xl:top-0 xl:h-[calc(100vh_-_1.25rem)]">
          <Card className="xl:flex xl:h-full xl:flex-col">
            <CardHeader className="pb-3 xl:shrink-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4" />
                Resumo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
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
              {loading ? (
                <SolutionSkeleton />
              ) : !solution ? (
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

function BatteryCardsSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-2" aria-label="Carregando baterias">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[72px_1fr]">
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
            <Skeleton className="h-3 w-28" />
            <div className="flex gap-1">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SolutionSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4" aria-label="Calculando solução">
      <Skeleton className="h-4 w-48" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

function DocPreviewModal({ doc, onClose }: { doc: ProductDocument | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!doc) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [doc, onClose]);

  if (!doc || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={doc.name || 'Documento'}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium">{doc.name || 'Documento'}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Abrir em nova aba
            </a>
            <Button variant="ghost" size="icon-sm" aria-label="Fechar pré-visualização" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <iframe src={doc.url} className="h-full w-full" title={doc.name || 'Documento'} />
        </div>
      </div>
    </div>,
    document.body
  );
}

function ImagePreviewModal({
  image,
  onClose,
}: {
  image: { url: string; alt: string } | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!image) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [image, onClose]);

  if (!image || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium">{image.alt}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Abrir em nova aba
            </a>
            <Button variant="ghost" size="icon-sm" aria-label="Fechar pré-visualização" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt} className="max-h-full max-w-full object-contain" />
        </div>
      </div>
    </div>,
    document.body
  );
}

function ProductAttachments({
  media,
  onPreview,
  onPreviewImage,
  inline = false,
}: {
  media: ProductMedia | undefined;
  onPreview: (doc: ProductDocument) => void;
  onPreviewImage: (image: { url: string; alt: string }) => void;
  inline?: boolean;
}) {
  if (!media || (!media.imageUrl && media.documents.length === 0)) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', inline ? '' : 'mt-2')}>
      {media.imageUrl && (
        <button
          type="button"
          onClick={() => onPreviewImage({ url: media.imageUrl as string, alt: media.model })}
          className="shrink-0 rounded border bg-background transition hover:border-primary/50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media.imageUrl}
            alt={media.model}
            className="h-14 w-20 object-contain p-1"
          />
        </button>
      )}
      {media.documents.map((document) => (
        <button
          key={`${media.model}-${document.url}`}
          type="button"
          onClick={() => onPreview(document)}
          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
        >
          {document.name || 'Documento'}
        </button>
      ))}
    </div>
  );
}

function CatalogTab({
  initialLoading,
  inverterCatalog,
  batteryCatalog,
  accessoryCatalog,
  userLoadCatalog,
  onAddUserLoad,
  onUpdateUserLoad,
  onRemoveUserLoad,
}: {
  initialLoading: boolean;
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  userLoadCatalog: UserLoadCatalogItem[];
  onAddUserLoad: (input: { name: string; powerW: number; ipInRatio: number }) => Promise<void>;
  onUpdateUserLoad: (id: string, partial: Partial<{ name: string; powerW: number; ipInRatio: number }>) => Promise<void>;
  onRemoveUserLoad: (id: string) => Promise<void>;
}) {
  const [section, setSection] = useState<'inverters' | 'batteries' | 'accessories' | 'loads'>('inverters');
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);

  const sectionOptions = [
    { value: 'inverters' as const, label: 'Inversores', count: inverterCatalog.length },
    { value: 'batteries' as const, label: 'Baterias', count: batteryCatalog.length },
    { value: 'accessories' as const, label: 'Acessórios', count: accessoryCatalog.length },
    { value: 'loads' as const, label: 'Minhas Cargas', count: userLoadCatalog.length },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Produtos cadastrados disponíveis para dimensionamento.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:inline-grid sm:w-fit sm:grid-cols-4">
        {sectionOptions.map((tab) => {
          const active = section === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={active}
              onClick={() => setSection(tab.value)}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition',
                active
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.7rem]',
                  active ? 'bg-primary/10 text-primary' : 'bg-background'
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {initialLoading ? (
        <BatteryCardsSkeleton />
      ) : section === 'inverters' ? (
        inverterCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhum inversor cadastrado." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {inverterCatalog.map((inverter) => (
              <CatalogProductCard
                key={inverter.id}
                fallbackIcon={<Zap className="h-8 w-8 text-muted-foreground" />}
                model={inverter.model}
                imageUrl={inverter.imageUrl}
                documents={inverter.documents}
                badges={[inverter.topology, `${inverter.phases} fase${inverter.phases === 1 ? '' : 's'}`]}
                specs={[
                  ['Potência', `${inverter.standardPowerKva ?? '-'} kVA · pico ${inverter.peakPowerKva ?? '-'} kVA`],
                ]}
                onPreviewImage={setPreviewImage}
                onPreviewDoc={setPreviewDoc}
              />
            ))}
          </div>
        )
      ) : section === 'batteries' ? (
        batteryCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhuma bateria cadastrada." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {batteryCatalog.map((battery) => {
              const usefulEnergyKwh = battery.capacityKwh * (1 - battery.minSocPercent / 100);
              return (
                <CatalogProductCard
                  key={battery.id}
                  fallbackIcon={<Battery className="h-8 w-8 text-muted-foreground" />}
                  model={battery.model}
                  imageUrl={battery.imageUrl}
                  documents={battery.documents}
                  badges={[battery.topology]}
                  specs={[
                    ['Capacidade', `${battery.capacityKwh} kWh · útil ${usefulEnergyKwh.toFixed(2)} kWh`],
                    ['Potência', `${battery.standardPowerKw ?? '-'} kW · pico ${battery.peakPowerKw ?? '-'} kW`],
                  ]}
                  onPreviewImage={setPreviewImage}
                  onPreviewDoc={setPreviewDoc}
                />
              );
            })}
          </div>
        )
      ) : section === 'accessories' ? (
        accessoryCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhum acessório cadastrado." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {accessoryCatalog.map((accessory) => (
              <CatalogProductCard
                key={accessory.id}
                fallbackIcon={<Boxes className="h-8 w-8 text-muted-foreground" />}
                model={accessory.model}
                imageUrl={accessory.imageUrl}
                documents={accessory.documents}
                description={accessory.description}
                onPreviewImage={setPreviewImage}
                onPreviewDoc={setPreviewDoc}
              />
            ))}
          </div>
        )
      ) : (
        <UserLoadCatalogSection
          items={userLoadCatalog}
          onAdd={onAddUserLoad}
          onUpdate={onUpdateUserLoad}
          onRemove={onRemoveUserLoad}
        />
      )}

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function UserLoadCatalogSection({
  items,
  onAdd,
  onUpdate,
  onRemove,
}: {
  items: UserLoadCatalogItem[];
  onAdd: (input: { name: string; powerW: number; ipInRatio: number }) => Promise<void>;
  onUpdate: (id: string, partial: Partial<{ name: string; powerW: number; ipInRatio: number }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [powerW, setPowerW] = useState('');
  const [ipInRatio, setIpInRatio] = useState('1');
  const [saving, setSaving] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  function openAdd() {
    setEditingId(null);
    setName('');
    setPowerW('');
    setIpInRatio('1');
    setAddOpen(true);
  }

  function openEdit(item: UserLoadCatalogItem) {
    setAddOpen(false);
    setEditingId(item.id);
    setName(item.name);
    setPowerW(String(item.powerW));
    setIpInRatio(String(item.ipInRatio));
  }

  function closeForm() {
    setAddOpen(false);
    setEditingId(null);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await onUpdate(editingId, {
          name,
          powerW: Number(powerW) || 0,
          ipInRatio: Number(ipInRatio) || 1,
        });
      } else {
        await onAdd({
          name,
          powerW: Number(powerW) || 0,
          ipInRatio: Number(ipInRatio) || 1,
        });
      }
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingIds((current) => new Set(current).add(id));
    try {
      await onRemove(id);
    } finally {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  const formCard = (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="space-y-1.5">
        <Label htmlFor="new-load-name">Nome</Label>
        <Input id="new-load-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do equipamento" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-load-power">Potência (W)</Label>
          <Input
            id="new-load-power"
            type="number"
            min={1}
            value={powerW}
            onChange={(event) => setPowerW(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-load-ipin">IP/IN</Label>
          <Input
            id="new-load-ipin"
            type="number"
            min={1}
            step={0.1}
            value={ipInRatio}
            onChange={(event) => setIpInRatio(event.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={closeForm}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cargas que você cadastrou manualmente no Dimensionamento, disponíveis para reutilizar.
        </p>
        {!addOpen && !editingId && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Adicionar carga
          </Button>
        )}
      </div>

      {addOpen && formCard}

      {items.length === 0 && !addOpen ? (
        <CatalogEmptyState label="Nenhuma carga cadastrada ainda. Clique em “Adicionar carga” ou crie uma na aba Manual do Dimensionamento." />
      ) : (
        <div className="space-y-2">
          {items.map((item) =>
            editingId === item.id ? (
              <div key={item.id}>{formCard}</div>
            ) : (
              <div key={item.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.powerW} W nominal · IP/IN {item.ipInRatio}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(item)} disabled={removingIds.has(item.id)}>
                      Editar
                    </Button>
                    <ConfirmDeleteButton
                      ariaLabel={`Remover carga ${item.name}`}
                      title="Remover carga?"
                      description="Essa carga sai do seu catálogo pessoal. Não afeta projetos que já a usam."
                      confirmLabel="Remover"
                      disabled={removingIds.has(item.id)}
                      onConfirm={() => handleRemove(item.id)}
                    />
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function CatalogEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function CatalogProductCard({
  fallbackIcon,
  model,
  imageUrl,
  documents,
  badges,
  specs,
  description,
  onPreviewImage,
  onPreviewDoc,
}: {
  fallbackIcon: React.ReactNode;
  model: string;
  imageUrl: string | null;
  documents: ProductDocument[];
  badges?: string[];
  specs?: [string, string][];
  description?: string | null;
  onPreviewImage: (image: { url: string; alt: string }) => void;
  onPreviewDoc: (doc: ProductDocument) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3 text-left sm:grid-cols-[72px_1fr]">
      <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-background">
        {imageUrl ? (
          <button
            type="button"
            className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
            onClick={() => onPreviewImage({ url: imageUrl, alt: model })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={model} className="h-full w-full object-contain p-2" />
          </button>
        ) : (
          fallbackIcon
        )}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-semibold leading-snug">{model}</p>
          {badges && badges.length > 0 && (
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {badges.map((badge) => (
                <Badge key={badge} variant="secondary">
                  {badge}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {specs && specs.length > 0 && (
          <div className="grid gap-1 text-xs text-muted-foreground">
            {specs.map(([label, value]) => (
              <span key={label}>
                {label}: {value}
              </span>
            ))}
          </div>
        )}
        <div className="flex min-w-0 flex-wrap gap-1">
          {documents.length > 0 ? (
            documents.map((document) => (
              <button
                key={`${model}-${document.url}`}
                type="button"
                className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                onClick={() => onPreviewDoc(document)}
              >
                {document.name || 'Documento'}
              </button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Sem anexos</span>
          )}
        </div>
      </div>
    </div>
  );
}

function BatteryModelPicker({
  batteries,
  topology,
  selectedModel,
  loading,
  setTopology,
  setBatteryModel,
}: {
  batteries: BatteryCatalogOption[];
  topology: BatteryTopology | null;
  selectedModel: string | null;
  loading: boolean;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const activeTopology = topology === 'LowVoltage' ? 'LV' : 'HV';
  const visibleBatteries = batteries.filter((battery) => battery.topology === activeTopology);
  const counts = {
    HV: batteries.filter((battery) => battery.topology === 'HV').length,
    LV: batteries.filter((battery) => battery.topology === 'LV').length,
  };

  function selectTab(nextTopology: 'HV' | 'LV') {
    setTopology(nextTopology === 'HV' ? 'HighVoltage' : 'LowVoltage');
  }

  function selectBattery(battery: BatteryCatalogOption) {
    if (battery.topology !== activeTopology) {
      setTopology(battery.topology === 'HV' ? 'HighVoltage' : 'LowVoltage');
    } else if (!topology) {
      setTopology(battery.topology === 'HV' ? 'HighVoltage' : 'LowVoltage');
    }
    setBatteryModel(battery.model);
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Modelo da bateria</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Selecione um modelo cadastrado pelo admin.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(['HV', 'LV'] as const).map((tab) => {
            const active = activeTopology === tab;
            return (
              <button
                key={tab}
                type="button"
                className={cn(
                  'flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition',
                  active
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
                aria-pressed={active}
                onClick={() => selectTab(tab)}
              >
                {tab}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[0.7rem]', active ? 'bg-primary/10 text-primary' : 'bg-background')}>
                  {counts[tab]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <BatteryCardsSkeleton />
      ) : visibleBatteries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma bateria {activeTopology} cadastrada.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleBatteries.map((battery) => {
            const selected = selectedModel === battery.model;
            const usefulEnergyKwh = battery.capacityKwh * (1 - battery.minSocPercent / 100);
            return (
              <div
                key={battery.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => selectBattery(battery)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectBattery(battery);
                  }
                }}
                className={cn(
                  'grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[72px_1fr]',
                  selected ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-background">
                  {battery.imageUrl ? (
                    <button
                      type="button"
                      className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewImage({ url: battery.imageUrl as string, alt: battery.model });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={battery.imageUrl} alt={battery.model} className="h-full w-full object-contain p-2" />
                    </button>
                  ) : (
                    <Battery className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug">{battery.model}</p>
                    <Badge variant="secondary">{battery.topology}</Badge>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Capacidade: {battery.capacityKwh} kWh</span>
                    <span>
                      Energia útil: {usefulEnergyKwh.toFixed(2)} kWh · SOC mín. {battery.minSocPercent}%
                    </span>
                    <span>
                      Potência: {battery.standardPowerKw ?? '-'} kW · pico {battery.peakPowerKw ?? '-'} kW
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {battery.documents.length > 0 ? (
                      battery.documents.map((document) => (
                        <button
                          key={`${battery.id}-${document.url}`}
                          type="button"
                          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          onClick={(event) => { event.stopPropagation(); setPreviewDoc(document); }}
                        >
                          {document.name || 'Documento'}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem anexos</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function InverterModelPicker({
  inverters,
  availableModels,
  selectedModel,
  loading,
  setInverterModel,
}: {
  inverters: InverterCatalogOption[];
  availableModels: Set<string> | null;
  selectedModel: string | null;
  loading: boolean;
  setInverterModel: (inverterModel: string | null) => void;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const visibleInverters = availableModels
    ? inverters.filter((inverter) => availableModels.has(inverter.model))
    : inverters;

  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <p className="text-sm font-medium">Modelo do inversor</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha um modelo específico ou deixe em &quot;Todos&quot; para o sistema escolher automaticamente.
        </p>
      </div>

      {loading ? (
        <BatteryCardsSkeleton />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div
            role="button"
            tabIndex={0}
            aria-pressed={selectedModel === null}
            onClick={() => setInverterModel(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setInverterModel(null);
              }
            }}
            className={cn(
              'grid cursor-pointer place-items-center gap-2 rounded-lg border bg-card p-3 text-center transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              selectedModel === null ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
            )}
          >
            <Zap className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Todos</p>
              <p className="text-xs text-muted-foreground">O sistema escolhe o melhor inversor</p>
            </div>
          </div>

          {visibleInverters.map((inverter) => {
            const selected = selectedModel === inverter.model;
            return (
              <div
                key={inverter.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => setInverterModel(inverter.model)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setInverterModel(inverter.model);
                  }
                }}
                className={cn(
                  'grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[72px_1fr]',
                  selected ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-background">
                  {inverter.imageUrl ? (
                    <button
                      type="button"
                      className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewImage({ url: inverter.imageUrl as string, alt: inverter.model });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={inverter.imageUrl} alt={inverter.model} className="h-full w-full object-contain p-2" />
                    </button>
                  ) : (
                    <Zap className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug">{inverter.model}</p>
                    <Badge variant="secondary">{inverter.topology}</Badge>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Fases: {inverter.phases}</span>
                    <span>
                      Potência: {inverter.standardPowerKva ?? '-'} kVA · pico {inverter.peakPowerKva ?? '-'} kVA
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {inverter.documents.length > 0 ? (
                      inverter.documents.map((document) => (
                        <button
                          key={`${inverter.id}-${document.url}`}
                          type="button"
                          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          onClick={(event) => { event.stopPropagation(); setPreviewDoc(document); }}
                        >
                          {document.name || 'Documento'}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem anexos</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {visibleInverters.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhum inversor com solução aprovada para este tipo de rede.
            </div>
          )}
        </div>
      )}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
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
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const inverterMedia = productMedia[solution.inverterModel];
  const batteryMedia = productMedia[solution.batteryModel];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-accent" />
          Inversor
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.inverterModel}</p>
        <p className="text-sm text-muted-foreground">Quantidade: x{solution.inverterQty ?? 1}</p>
        <ProductAttachments media={inverterMedia} onPreview={setPreviewDoc} onPreviewImage={setPreviewImage} />
      </div>

      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Battery className="h-4 w-4 text-primary" />
          Bateria
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.batteryModel}</p>
        <p className="text-sm text-muted-foreground">Quantidade: x{solution.batteryQty}</p>
        <ProductAttachments media={batteryMedia} onPreview={setPreviewDoc} onPreviewImage={setPreviewImage} />
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
          <div className="mt-2 space-y-2">
            {solution.accessories.map((accessory) => {
              const { model, qty, optional } = parseAccessoryLabel(accessory);
              return (
                <div key={accessory}>
                  <Badge variant="secondary">
                    {model}
                    {optional ? ' (opcional)' : ''}
                  </Badge>
                  <p className="mt-1 text-sm text-muted-foreground">Quantidade: x{qty}</p>
                  <ProductAttachments
                    media={productMedia[model]}
                    onPreview={setPreviewDoc}
                    onPreviewImage={setPreviewImage}
                    inline
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Button className="w-full" variant="outline" onClick={onExport}>
        <FileText className="h-4 w-4" />
        Exportar relatório em PDF
      </Button>

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function PrintableReport({
  projectInfo,
  client,
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
  client: Client | null;
  profile: InlineProfile | null;
  solution: Solution;
  loads: { id: string; name: string; powerW: number; hoursPerDay: number; qty: number }[];
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
            <ReportInfoRow label="Cliente" value={client?.name || '-'} />
            <ReportInfoRow label="Email" value={client?.email || '-'} />
            <ReportInfoRow label="Telefone" value={client?.phone || '-'} />
            <ReportInfoRow label="CPF/CNPJ" value={client?.document || '-'} />
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
              <tr key={load.id}>
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
            {solution.comments.map((comment, index) => (
              <li key={`${index}-${comment}`}>{comment}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-8 border-t pt-3 text-right text-xs text-muted-foreground">
        {solution.solutionCode ? `Código: ${solution.solutionCode}` : 'Calculadora SolaX'}
      </footer>
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
