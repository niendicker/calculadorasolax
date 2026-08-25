'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  Battery,
  BatteryCharging,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ClipboardList,
  FileText,
  Flag,
  Gauge,
  Layers3,
  MoreVertical,
  Package,
  PanelTop,
  ReceiptText,
  Settings2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { desiredFeatureLabel } from '@/lib/desired-features';
import type { Client, DesiredFeatureId, ProjectInfo, ResidentialOptions, Solution } from '@/lib/types';
import { desiredFeatureHasPendingIssue } from '../tabs/sizing/feature-status';
import { featureIcons } from '../tabs/sizing/DesiredFeaturesPicker';
import type { BatteryCatalogOption, InverterCatalogOption, ProductMedia } from '../types';
import { gridLabels, topologyLabels } from '../types';
import { cn } from '@/lib/utils';
import { buildMarginSummary, solutionMetrics } from '../helpers';
import { Metric, ProductImage } from '../shared-ui';
import { PageSummary } from '../shell/slots';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { batteryQuantityBreakdown } from '@/lib/battery-quantity-breakdown';
import { AddressFields } from '../address-fields';
import { formatAddress } from '@/lib/address';

export type WorkspaceSection = 'overview' | 'loads' | 'resource' | 'project' | 'configuration' | 'solution' | 'budget' | 'report';

const navigation: Array<{ id: WorkspaceSection; label: string; icon: typeof PanelTop }> = [
  { id: 'overview', label: 'Visão geral', icon: PanelTop },
  { id: 'loads', label: 'Cargas', icon: ClipboardList },
  { id: 'solution', label: 'Solução', icon: Zap },
  { id: 'budget', label: 'Orçamento', icon: ReceiptText },
  { id: 'report', label: 'Relatório', icon: FileText },
];

type ResourceState = 'configured' | 'attention' | 'inactive';

interface ResourceItem {
  id: DesiredFeatureId;
  label: string;
  icon: LucideIcon;
  state: ResourceState;
  summary: string;
}

function StateBadge({ state }: { state: ResourceState }) {
  const content = {
    configured: { label: 'Configurado', icon: CheckCircle2, className: 'text-emerald-600' },
    attention: { label: 'Requer atenção', icon: AlertTriangle, className: 'text-amber-600' },
    inactive: { label: 'Não configurado', icon: null, className: 'text-muted-foreground' },
  }[state];
  const Icon = content.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', content.className)}>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : <span className="h-2 w-2 rounded-full border border-current" aria-hidden="true" />}
      {content.label}
    </span>
  );
}

function formatKva(valueW: number) {
  return `${(valueW / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kVA`;
}

function formatKw(valueW: number) {
  return `${(valueW / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW`;
}

function formatKwh(valueKwh: number) {
  return `${valueKwh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`;
}

function ResourceCard({ item, onOpen }: { item: ResourceItem; onOpen?: () => void }) {
  const Icon = item.icon;
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{item.label}</span>
        <span className="mt-1 block"><StateBadge state={item.state} /></span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{item.summary}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );
  return onOpen ? <button type="button" onClick={onOpen} className="flex min-h-24 items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{content}</button> : <div className="flex min-h-24 items-center gap-3 rounded-xl border bg-background p-3 text-left">{content}</div>;
}

function SummaryRow({ label, value, state, icon: Icon, showValue = false }: { label: string; value: string; state?: ResourceState; icon?: LucideIcon; showValue?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 truncate text-sm text-muted-foreground">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 items-center justify-end gap-2">
        {showValue && <span className="truncate text-right text-sm font-medium">{value}</span>}
        {state ? <StateBadge state={state} /> : !showValue && <span className="text-right text-sm font-medium">{value}</span>}
      </span>
    </div>
  );
}

export function ProjectWorkspace({
  enabled = true,
  projectInfo,
  client,
  clients = [],
  residentialOptions,
  solution,
  nominalW,
  peakW,
  dailyKwh,
  solutionIsStale,
  inverterCatalog,
  batteryCatalog = [],
  productMedia = {},
  availableInverterModels,
  onBackToProjects,
  onUpdateProjectInfo,
  onSaveProject,
  onCancelProjectEdit,
  activeResourceId,
  onOpenResource,
  onOpenTechnical,
  onOpenConfiguration,
  technicalEditorOpen,
  onOpenBudget,
  onGenerateReport,
  generatingReport,
  children,
}: {
  enabled?: boolean;
  projectInfo: ProjectInfo;
  client: Client | undefined;
  clients?: Client[];
  residentialOptions: ResidentialOptions;
  solution: Solution | null;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
  solutionIsStale: boolean;
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog?: BatteryCatalogOption[];
  productMedia?: Record<string, ProductMedia>;
  availableInverterModels: Set<string> | null;
  onBackToProjects?: () => void;
  onUpdateProjectInfo?: (partial: Partial<ProjectInfo>) => void;
  onSaveProject?: () => void;
  onCancelProjectEdit?: () => void;
  activeResourceId?: DesiredFeatureId | null;
  onOpenResource?: (id: DesiredFeatureId) => void;
  onOpenTechnical?: () => void;
  onOpenConfiguration?: () => void;
  technicalEditorOpen?: boolean;
  onOpenBudget?: () => void;
  onGenerateReport?: () => void;
  generatingReport?: boolean;
  children: ReactNode;
}) {
  const [section, setSectionState] = useState<WorkspaceSection>('overview');
  const [urlReady, setUrlReady] = useState(false);
  const enabledFeatures = residentialOptions.desiredFeatures;
  const hasFeatureIssue = (id: DesiredFeatureId) => desiredFeatureHasPendingIssue(id, enabledFeatures, {
    microgrid: residentialOptions.microgrid,
    generator: residentialOptions.generator,
    pv: residentialOptions.pv,
    whiteTariff: residentialOptions.whiteTariff,
    atsBackupAcknowledged: residentialOptions.atsBackupAcknowledged,
    gridType: residentialOptions.gridType,
    peakW,
    loadsCount: residentialOptions.loads.length,
    operationHours: residentialOptions.operationHours,
    inverterCatalog,
    availableInverterModels,
    selectedInverterModel: residentialOptions.inverterModel,
  });
  useEffect(() => {
    const setSectionFromValue = (value: string | null) => {
    if (value === 'resource' || value === 'project' || value === 'configuration' || (value && navigation.some((item) => item.id === value))) {
        setSectionState(value as WorkspaceSection);
      }
    };
    const value = new URLSearchParams(window.location.search).get('workspace');
    // The URL is external state; this one-time synchronization intentionally
    // updates the section after mount so SSR and the first client paint agree.
    setSectionFromValue(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrlReady(true);

    const handleWorkspaceSectionChange = (event: Event) => {
      setSectionFromValue((event as CustomEvent<string>).detail);
    };
    window.addEventListener('workspace-section-change', handleWorkspaceSectionChange);
    return () => window.removeEventListener('workspace-section-change', handleWorkspaceSectionChange);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', section);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [section, urlReady]);
  const resources: ResourceItem[] = [
    {
      id: 'backup', label: 'Backup', icon: featureIcons.backup,
      state: enabledFeatures.includes('backup') ? hasFeatureIssue('backup') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('backup') ? `${residentialOptions.loads.length} cargas · ${residentialOptions.operationHours} h` : 'Não utilizado neste projeto',
    },
    {
      id: 'white_tariff', label: desiredFeatureLabel('white_tariff'), icon: featureIcons.white_tariff,
      state: enabledFeatures.includes('white_tariff') ? hasFeatureIssue('white_tariff') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('white_tariff') ? residentialOptions.whiteTariff ? 'Configuração preenchida' : 'Faltam dados' : 'Não utilizado neste projeto',
    },
    {
      id: 'pv', label: desiredFeatureLabel('pv'), icon: featureIcons.pv,
      state: enabledFeatures.includes('pv') ? hasFeatureIssue('pv') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('pv') ? residentialOptions.pv ? 'Parâmetros preenchidos' : 'Faltam dados' : 'Não configurado',
    },
    {
      id: 'external_generator', label: desiredFeatureLabel('external_generator'), icon: featureIcons.external_generator,
      state: enabledFeatures.includes('external_generator') ? hasFeatureIssue('external_generator') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('external_generator') ? residentialOptions.generator ? 'Configuração preenchida' : 'Faltam dados' : 'Não configurado',
    },
    {
      id: 'microgrid', label: desiredFeatureLabel('microgrid'), icon: featureIcons.microgrid,
      state: enabledFeatures.includes('microgrid') ? hasFeatureIssue('microgrid') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('microgrid') ? residentialOptions.microgrid ? 'Configuração preenchida' : 'Faltam dados' : 'Não configurado',
    },
    {
      id: 'external_ats', label: desiredFeatureLabel('external_ats'), icon: featureIcons.external_ats,
      state: enabledFeatures.includes('external_ats') ? hasFeatureIssue('external_ats') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('external_ats') ? residentialOptions.atsBackupAcknowledged ? 'ATS confirmado' : 'Confirmação pendente' : 'Não configurado',
    },
  ];
  const configuredCount = resources.filter((item) => item.state === 'configured').length;
  const attentionCount = resources.filter((item) => item.state === 'attention').length;
  const staleSolution = Boolean(solution) && solutionIsStale;
  const technicalConfigurationState: ResourceState = residentialOptions.gridType && residentialOptions.topology && residentialOptions.batteryModel
    ? 'configured'
    : 'attention';

  function openResourceEditor(id: DesiredFeatureId) {
    setSectionState('resource');
    onOpenResource?.(id);
  }

  function openFirstPendingResource() {
    const pending = resources.find((item) => item.state === 'attention');
    if (pending) openResourceEditor(pending.id);
  }

  if (!enabled) return <>{children}</>;

  function openSizingSection(nextSection: WorkspaceSection) {
    setSectionState(nextSection);
  }

  return (
    <div className="space-y-4">
      {section !== 'overview' && section !== 'loads' && section !== 'configuration' && <PageSummary>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Nominal" value={(nominalW / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} unit="kVA" />
            <Metric label="Máxima" value={(peakW / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} unit="kVA" />
            <Metric label="Energia" value={dailyKwh.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} unit="kWh" />
          </div>
          <Card>
            <CardHeader className="pb-2"><h2 className="text-sm font-semibold">Resumo técnico</h2></CardHeader>
            <CardContent className="pt-0">
              <SummaryRow label="Cargas" value={`${residentialOptions.loads.length}`} state={residentialOptions.loads.length > 0 ? 'configured' : 'attention'} />
              {resources.map((item) => <SummaryRow key={item.id} label={item.label} value="" state={item.state} />)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><h2 className="text-sm font-semibold">Solução</h2></CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              {solution ? <><p className="font-medium">{solution.inverterModel}</p><p className="text-muted-foreground">{solution.batteryModel}</p><StateBadge state={staleSolution ? 'attention' : 'configured'} /></> : <p className="text-muted-foreground">Ainda não calculada</p>}
            </CardContent>
          </Card>
        </div>
      </PageSummary>}
      <div className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {onBackToProjects && <Button type="button" variant="outline" size="icon-sm" aria-label="Voltar para Projetos" title="Voltar para Projetos" onClick={onBackToProjects} className="mt-0.5 shrink-0"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>}
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Workspace do projeto</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{projectInfo.name || 'Projeto sem nome'}</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"><Flag className="h-3.5 w-3.5" aria-hidden="true" /> Em andamento</span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>Cliente: {client?.name || 'Não informado'}</span>
                <span aria-hidden="true">·</span>
                <span>{residentialOptions.gridType ? gridLabels[residentialOptions.gridType] : 'Rede não configurada'}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => openSizingSection('project')}>
              Editar projeto
            </Button>
            <Button variant="outline" size="sm" onClick={openFirstPendingResource} disabled={attentionCount === 0}>
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Revisar pendências
            </Button>
            <WorkspaceActionsMenu />
          </div>
        </div>
        <nav className="mt-5 flex gap-1 overflow-x-auto" aria-label="Seções do projeto">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => openSizingSection(id)}
              className={cn(
                'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                section === id ? 'border-primary text-primary' : ''
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {section === 'overview' ? (
        <>
          <div className="grid grid-cols-3 divide-x overflow-hidden rounded-lg border bg-card">
            <MetricCard compact label="Nominal" value={formatKva(nominalW)} icon={Zap} />
            <MetricCard compact label="Máxima" value={formatKva(peakW)} icon={Gauge} />
            <MetricCard compact label="Energia" value={formatKwh(dailyKwh)} icon={BatteryCharging} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Card>
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <CardIcon icon={ClipboardList} />
                <div className="min-w-0"><h2 className="text-base font-semibold">Instalação</h2><p className="mt-0.5 truncate text-xs text-muted-foreground">{formatAddress(projectInfo.address) || 'Endereço não informado'}</p></div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <SummaryRow label="Cliente" value={client?.name || 'Não informado'} state={client ? 'configured' : 'attention'} showValue />
                <SummaryRow label="Cargas" value={`${residentialOptions.loads.length} cadastradas`} state={residentialOptions.loads.length > 0 ? 'configured' : 'attention'} showValue />
                <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Settings2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Configuração técnica</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Rede, inversor e banco de baterias</p>
                      </div>
                    </div>
                    <StateBadge state={technicalConfigurationState} />
                  </div>
                  <SummaryRow
                    label="Rede elétrica"
                    value={residentialOptions.gridType ? gridLabels[residentialOptions.gridType] : 'Não configurada'}
                    state={residentialOptions.gridType ? 'configured' : 'attention'}
                    icon={Zap}
                    showValue
                  />
                  <SummaryRow
                    label="Inversor"
                    value={residentialOptions.inverterModel || 'Automático'}
                    state="configured"
                    icon={Zap}
                    showValue
                  />
                  <SummaryRow
                    label="Bateria"
                    value={residentialOptions.batteryModel
                      ? `${residentialOptions.batteryModel}${residentialOptions.topology ? ` · ${topologyLabels[residentialOptions.topology]}` : ''}`
                      : 'Não selecionada'}
                    state={residentialOptions.batteryModel && residentialOptions.topology ? 'configured' : 'attention'}
                    icon={Battery}
                    showValue
                  />
                  {onOpenConfiguration && <Button
                    type="button"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={onOpenConfiguration}
                  >
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    Configurar inversores e baterias
                  </Button>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <CardIcon icon={Layers3} />
                <div><h2 className="text-base font-semibold">Recursos</h2><p className="text-xs text-muted-foreground">{configuredCount} configurados{attentionCount ? ` · ${attentionCount} requer atenção` : ''}</p></div>
              </CardHeader>
              <CardContent className="grid gap-2 pt-0 sm:grid-cols-2">
                {resources.map((item) => <ResourceCard key={item.id} item={item} onOpen={onOpenResource ? () => openResourceEditor(item.id) : undefined} />)}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div className="flex items-center gap-3"><CardIcon icon={Package} /><h2 className="text-base font-semibold">Solução atual</h2></div>
              {solution && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{staleSolution ? 'Solução desatualizada' : 'Solução atualizada'}</span>}
            </CardHeader>
            <CardContent className="pt-0">
              {solution ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <SolutionValue label="Inversor" value={`${solution.inverterModel}${solution.inverterQty && solution.inverterQty > 1 ? ` · ${solution.inverterQty} un.` : ''}`} />
                  <SolutionValue label="Bateria" value={`${solution.batteryModel}${solution.batteryQty > 1 ? ` · ${solution.batteryQty} un.` : ''}`} />
                  <SolutionValue label="Energia disponível" value={solution.availableEnergyWh ? formatKwh(solution.availableEnergyWh / 1000) : 'Não informado'} />
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
                  <div><p className="font-medium">Solução ainda não calculada</p><p className="mt-1 text-sm text-muted-foreground">Configure os dados técnicos para gerar uma recomendação.</p></div>
                  <Button onClick={() => openSizingSection('solution')}>Dimensionar solução</Button>
                </div>
              )}
              {solution && <Button variant="outline" className="mt-4" onClick={() => openSizingSection('solution')}>Ver detalhes e recalcular</Button>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-3"><CardIcon icon={Flag} /><h2 className="text-base font-semibold">Próximos passos</h2></CardHeader>
            <CardContent className="grid gap-2 pt-0 sm:grid-cols-3">
              {attentionCount > 0 && <ActionCard label="Revisar configurações pendentes" detail={`${attentionCount} recurso(s) requerem atenção`} onClick={openFirstPendingResource} icon={AlertTriangle} />}
              <ActionCard label="Revisar cargas" detail={`${residentialOptions.loads.length} carga(s) cadastrada(s)`} onClick={() => openSizingSection('loads')} icon={ClipboardList} />
              <ActionCard label="Gerar orçamento" detail="Acessar fornecedores e serviços" onClick={() => openSizingSection('budget')} icon={ReceiptText} />
            </CardContent>
          </Card>
        </>
      ) : section === 'project' ? (
        <ProjectInfoEditor
          projectInfo={projectInfo}
          clients={clients}
          onChange={onUpdateProjectInfo}
          onSave={onSaveProject}
          onCancel={onCancelProjectEdit}
        />
      ) : section === 'loads' ? (
        <>
          <LoadsSection residentialOptions={residentialOptions} nominalW={nominalW} peakW={peakW} dailyKwh={dailyKwh} />
        </>
      ) : section === 'configuration' ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Configuração técnica</h2>
              <p className="text-sm text-muted-foreground">Selecione a rede, o inversor e as baterias desta instalação.</p>
            </div>
          </div>
          {technicalEditorOpen && children}
        </>
      ) : section === 'resource' ? (
        <>
          {activeResourceId !== 'backup' && activeResourceId !== 'microgrid' && <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Recursos — {resources.find((item) => item.id === activeResourceId)?.label || 'Editar recurso'}</h2>{activeResourceId && <StateBadge state={resources.find((item) => item.id === activeResourceId)?.state || 'attention'} />}</div>
              <p className="text-sm text-muted-foreground">Configure este recurso sem sair do Workspace. As alterações afetam a solução técnica.</p>
            </div>
          </div>}
          {technicalEditorOpen && children}
        </>
      ) : section === 'solution' ? (
        <>
          <SolutionSection
            solution={solution}
            stale={staleSolution}
            onOpenTechnical={onOpenTechnical}
            batteryCatalog={batteryCatalog}
            productMedia={productMedia}
            residentialOptions={residentialOptions}
            nominalW={nominalW}
            peakW={peakW}
            dailyKwh={dailyKwh}
          />
          {technicalEditorOpen && children}
        </>
      ) : section === 'budget' ? (
        <BudgetSection solution={solution} onOpenBudget={onOpenBudget} />
      ) : section === 'report' ? (
        <ReportSection solution={solution} stale={staleSolution} onGenerateReport={onGenerateReport} generatingReport={generatingReport} />
      ) : (
        <div className="space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function CardIcon({ icon: Icon }: { icon: typeof PanelTop }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span>;
}

function WorkspaceActionsMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleDocumentMouseDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <Button type="button" variant="outline" size="icon-sm" aria-label="Mais opções do projeto" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open && (
        <div role="menu" aria-label="Mais opções do projeto" className="absolute right-0 top-full z-20 mt-1 min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          <button type="button" role="menuitem" disabled className="w-full cursor-not-allowed rounded-md px-3 py-2 text-left text-sm text-muted-foreground/60">Mais opções em breve</button>
        </div>
      )}
    </div>
  );
}

function ProjectInfoEditor({
  projectInfo,
  clients,
  onChange,
  onSave,
  onCancel,
}: {
  projectInfo: ProjectInfo;
  clients: Client[];
  onChange?: (partial: Partial<ProjectInfo>) => void;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const nameError = !projectInfo.name.trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Editar projeto</h2>
          <p className="text-sm text-muted-foreground">Atualize as informações gerais sem sair do Workspace.</p>
        </div>
        {onCancel && <Button type="button" variant="outline" size="sm" onClick={onCancel}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Voltar para Visão geral</Button>}
      </div>
      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="workspaceProjectName">Nome do projeto</Label>
            <Input id="workspaceProjectName" value={projectInfo.name} onChange={(event) => onChange?.({ name: event.target.value })} aria-invalid={nameError} />
            {nameError && <p className="text-xs text-destructive" role="alert">Informe um nome para o projeto.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workspaceProjectClient">Cliente</Label>
            <Select id="workspaceProjectClient" value={projectInfo.clientId ?? ''} onChange={(event) => onChange?.({ clientId: event.target.value || null })}>
              <option value="">Sem cliente selecionado</option>
              {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Endereço da instalação</Label>
            <div className="mt-1.5"><AddressFields address={projectInfo.address} onChange={(partial) => onChange?.({ address: { ...projectInfo.address, ...partial } })} idPrefix="workspaceProjectAddress" /></div>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="workspaceProjectNotes">Observações</Label>
            <textarea id="workspaceProjectNotes" className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm" value={projectInfo.notes} onChange={(event) => onChange?.({ notes: event.target.value })} placeholder="Informações comerciais ou restrições da instalação." />
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
            {onSave && <Button type="button" onClick={onSave} disabled={nameError}>Salvar alterações</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, compact = false }: { label: string; value: string; icon: typeof Zap; compact?: boolean }) {
  if (compact) {
    return <div className="min-w-0 px-2.5 py-2 sm:px-3"><div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{label}</span></div><p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p></div>;
  }

  return <Card className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" aria-hidden="true" />{label}</div><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></Card>;
}

function SolutionValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-medium">{value}</p></div>;
}

function ActionCard({ label, detail, onClick, icon: Icon }: { label: string; detail: string; onClick: () => void; icon: typeof AlertTriangle }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></button>;
}

function LoadsSection({ residentialOptions, nominalW, peakW, dailyKwh }: { residentialOptions: ResidentialOptions; nominalW: number; peakW: number; dailyKwh: number }) {
  return <div className="space-y-4">
    <div><h2 className="text-lg font-semibold">Cargas</h2><p className="text-sm text-muted-foreground">{residentialOptions.loads.length} carga(s) cadastrada(s)</p></div>
    <div className="grid grid-cols-3 divide-x overflow-hidden rounded-lg border bg-card"><MetricCard compact label="Potência nominal" value={formatKva(nominalW)} icon={Zap} /><MetricCard compact label="Pico considerado" value={formatKva(peakW)} icon={Gauge} /><MetricCard compact label="Energia diária" value={formatKwh(dailyKwh)} icon={BatteryCharging} /></div>
    <LoadSelector defaultToMine showOperationHours={false} collapsedByDefault />
  </div>;
}

function SolutionSection({
  solution,
  stale,
  onOpenTechnical,
  batteryCatalog,
  productMedia,
  residentialOptions,
  nominalW,
  peakW,
  dailyKwh,
}: {
  solution: Solution | null;
  stale: boolean;
  onOpenTechnical?: () => void;
  batteryCatalog: BatteryCatalogOption[];
  productMedia: Record<string, ProductMedia>;
  residentialOptions: ResidentialOptions;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
}) {
  const [view, setView] = useState<'summary' | 'equipment' | 'margins' | 'criteria'>('summary');
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const metrics = solution ? solutionMetrics(solution, batteryCatalog) : null;
  const marginRows = solution && !solution.microgridAlternative
    ? buildMarginSummary({
        desiredFeatures: residentialOptions.desiredFeatures,
        whiteTariff: residentialOptions.whiteTariff,
        microgrid: residentialOptions.microgrid,
        pv: residentialOptions.pv,
        nominalW,
        peakW,
        dailyKwh,
        solution,
      })
    : [];
  const batteryParts = solution
    ? batteryQuantityBreakdown(
        solution.batteryModel,
        solution.batteryQty,
        batteryCatalog,
        (solution.inverterQty ?? 1) * (solution.batteryPortsUsed ?? 1)
      )
    : [];
  const inverterMedia = solution ? productMedia[solution.inverterModel] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Solução</h2>
          <p className="text-sm text-muted-foreground">Equipamentos, margens e critérios do dimensionamento.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {solution && <StateBadge state={stale ? 'attention' : 'configured'} />}
          {onOpenTechnical && <Button onClick={onOpenTechnical}>{solution ? 'Configurar inversores e baterias' : 'Configurar e dimensionar'}</Button>}
        </div>
      </div>

      {!solution ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div><p className="font-medium">Solução ainda não calculada</p><p className="mt-1 text-sm text-muted-foreground">Configure os dados técnicos para gerar uma recomendação usando o botão acima.</p></div>
          </CardContent>
        </Card>
      ) : (
        <>
          {stale && <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>As configurações do Workspace foram alteradas após o último cálculo. Recalcule para atualizar esta solução.</span></div>}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1 sm:grid-cols-4" role="group" aria-label="Detalhes da solução">
            {([
              ['summary', 'Resumo'],
              ['equipment', 'Equipamentos'],
              ['margins', 'Margens'],
              ['criteria', 'Critérios'],
            ] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={cn('rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50', view === id ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground')}>{label}</button>)}
          </div>

          {view === 'summary' && metrics && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Potência do inversor" value={solution.inverterRatedPowerW ? formatKva(solution.inverterRatedPowerW) : 'Não informado'} icon={Zap} />
                <MetricCard label="Potência disponível pela bateria" value={solution.batteryPowerW ? formatKw(solution.batteryPowerW) : 'Não informado'} icon={Battery} />
                <MetricCard label="Potência máxima" value={metrics.peakW != null ? formatKva(metrics.peakW) : 'Não informado'} icon={Gauge} />
                <MetricCard label="Energia útil" value={formatKwh(metrics.energyKwh)} icon={BatteryCharging} />
              </div>
              <Card><CardHeader className="pb-3"><h3 className="text-sm font-semibold">Equipamentos principais</h3></CardHeader><CardContent className="space-y-3 pt-0"><EquipmentRow label="Inversor" model={solution.inverterModel} quantity={solution.inverterQty ?? 1} detail={solution.inverterRatedPowerW ? formatKva(solution.inverterRatedPowerW) : undefined} media={inverterMedia} onPreviewImage={setPreviewImage} /><EquipmentRow label="Bateria" model={productMedia[solution.batteryModel]?.nickname || solution.batteryModel} quantity={solution.batteryQty} detail={formatKwh(solution.availableEnergyWh ? solution.availableEnergyWh / 1000 : 0)} media={productMedia[solution.batteryModel]} onPreviewImage={setPreviewImage} />{solution.pvPowerKw != null && <SolutionValue label="Fotovoltaico recomendado" value={`${solution.pvPowerKw.toFixed(2)} kWp${solution.pvMonthlyGenerationKwh ? ` · ${solution.pvMonthlyGenerationKwh.toFixed(0)} kWh/mês` : ''}`} />}</CardContent></Card>
              {solution.accessories.length > 0 && <Card><CardHeader className="pb-3"><h3 className="text-sm font-semibold">Acessórios</h3></CardHeader><CardContent className="space-y-2 pt-0">{solution.accessories.map((item) => <div key={item.model} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-sm"><span className="min-w-0 truncate">{productMedia[item.model]?.nickname || item.model}</span><span className="shrink-0 text-muted-foreground">{item.qty} un. {item.bundled ? '· Incluso' : item.optional ? '· Opcional' : ''}</span></div>)}</CardContent></Card>}
            </div>
          )}
          {view === 'equipment' && <div className="space-y-3"><Card><CardHeader className="pb-3"><h3 className="text-sm font-semibold">Equipamentos selecionados</h3></CardHeader><CardContent className="space-y-3 pt-0"><EquipmentRow label="Inversor" model={productMedia[solution.inverterModel]?.nickname || solution.inverterModel} quantity={solution.inverterQty ?? 1} detail={solution.inverterRatedPowerW ? formatKva(solution.inverterRatedPowerW) : undefined} media={inverterMedia} onPreviewImage={setPreviewImage} />{batteryParts.map((part) => <EquipmentRow key={part.model} label="Bateria" model={productMedia[part.model]?.nickname || part.model} quantity={part.qty} detail={part.model === solution.batteryModel && solution.availableEnergyWh ? formatKwh(solution.availableEnergyWh / 1000) : undefined} media={productMedia[part.model]} onPreviewImage={setPreviewImage} />)}</CardContent></Card>{solution.accessories.length > 0 && <Card><CardHeader className="pb-3"><h3 className="text-sm font-semibold">Acessórios incluídos</h3></CardHeader><CardContent className="space-y-2 pt-0">{solution.accessories.map((item) => <div key={item.model} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0 text-sm"><span>{productMedia[item.model]?.nickname || item.model}</span><span className="text-muted-foreground">{item.qty} un.</span></div>)}</CardContent></Card>}</div>}
          {view === 'margins' && <div className="grid gap-3 sm:grid-cols-3">{marginRows.map((row) => { const delta = row.providedValue - row.requiredValue; const insufficient = delta < 0; return <Card key={row.key} className={cn(insufficient && 'border-destructive/50')}><CardContent className="p-4"><p className="text-sm font-medium">{row.label}</p><p className={cn('mt-2 text-xl font-semibold tabular-nums', insufficient ? 'text-destructive' : 'text-primary')}>{delta >= 0 ? '+' : '-'}{row.unit === 'W' ? formatKva(Math.abs(delta)) : formatKwh(Math.abs(delta))}</p><p className="mt-2 text-xs text-muted-foreground">Necessário {row.unit === 'W' ? formatKva(row.requiredValue) : formatKwh(row.requiredValue)} · Solução {row.unit === 'W' ? formatKva(row.providedValue) : formatKwh(row.providedValue)}</p><StateBadge state={insufficient ? 'attention' : 'configured'} /></CardContent></Card>; })}</div>}
          {view === 'criteria' && <Card><CardHeader className="pb-3"><h3 className="text-sm font-semibold">Critérios considerados</h3></CardHeader><CardContent className="space-y-2 pt-0">{[
            ['Rede elétrica', residentialOptions.gridType ? gridLabels[residentialOptions.gridType] : 'Não configurada'],
            ['Cargas consideradas', `${residentialOptions.loads.length} cadastradas`],
            ['Recursos ativos', residentialOptions.desiredFeatures.map((id) => desiredFeatureLabel(id)).join(', ') || 'Nenhum'],
            ['Topologia da bateria', residentialOptions.topology || 'Não configurada'],
            ['Autonomia de referência', `${residentialOptions.operationHours} h de operação`],
          ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>)}</CardContent></Card>}
        </>
      )}
      {previewImage && <div role="dialog" aria-label="Pré-visualização do produto" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewImage(null)}><div className="relative h-[min(80vh,32rem)] w-full max-w-lg rounded-lg bg-background p-4" onClick={(event) => event.stopPropagation()}><Image src={previewImage.url} alt={previewImage.alt} fill sizes="90vw" className="object-contain p-6" /></div></div>}
    </div>
  );
}

function EquipmentRow({ label, model, quantity, detail, media, onPreviewImage }: { label: string; model: string; quantity: number; detail?: string; media?: ProductMedia; onPreviewImage: (image: { url: string; alt: string }) => void }) {
  return <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background p-3"><ProductImage media={media} onPreviewImage={onPreviewImage} className="h-16 w-16 shrink-0" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate font-medium">{model}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div><span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{quantity} un.</span></div>;
}

function BudgetSection({ solution, onOpenBudget }: { solution: Solution | null; onOpenBudget?: () => void }) {
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">Orçamento</h2><p className="text-sm text-muted-foreground">Monte a cotação a partir da solução e dos serviços do projeto.</p></div>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0"><p className="font-medium">{solution ? 'Solução disponível para cotação' : 'Calcule uma solução antes de cotar'}</p><p className="mt-1 text-sm text-muted-foreground">Produtos, serviços e fornecedores continuam sendo gerenciados no fluxo atual.</p></div>
          <Button disabled={!solution || !onOpenBudget} onClick={onOpenBudget}><ReceiptText className="h-4 w-4" />Abrir orçamento</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportSection({ solution, stale, onGenerateReport, generatingReport }: { solution: Solution | null; stale: boolean; onGenerateReport?: () => void; generatingReport?: boolean }) {
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">Relatório</h2><p className="text-sm text-muted-foreground">Gere o relatório usando os dados atuais do projeto.</p></div>
      {stale && solution && <div className="flex gap-2 rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>A solução está desatualizada. Recalcule antes de gerar um relatório atualizado.</span></div>}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div><p className="font-medium">{solution ? 'Relatório de dimensionamento' : 'Nenhuma solução disponível'}</p><p className="mt-1 text-sm text-muted-foreground">O PDF reutiliza os cálculos, equipamentos e cargas do projeto.</p></div>
          <Button disabled={!solution || !onGenerateReport || Boolean(stale) || generatingReport} onClick={onGenerateReport}>{generatingReport ? 'Gerando relatório...' : 'Gerar relatório'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
