'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ClipboardList,
  FileText,
  Flag,
  Gauge,
  Grid3X3,
  Layers3,
  Package,
  PanelTop,
  ReceiptText,
  Settings2,
  Sun,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { desiredFeatureLabel } from '@/lib/desired-features';
import type { Client, DesiredFeatureId, ProjectInfo, ResidentialOptions, Solution } from '@/lib/types';
import { desiredFeatureHasPendingIssue } from '../tabs/sizing/feature-status';
import type { InverterCatalogOption } from '../types';
import { gridLabels } from '../types';
import { cn } from '@/lib/utils';
import { totalPowerByPhase } from '@/lib/store/wizard-store';
import { Metric } from '../shared-ui';
import { PageSummary } from '../shell/slots';
import { LoadSelector } from '@/components/wizard/LoadSelector';

export type WorkspaceSection = 'overview' | 'loads' | 'resources' | 'solution' | 'budget' | 'report';

const navigation: Array<{ id: WorkspaceSection; label: string; icon: typeof PanelTop }> = [
  { id: 'overview', label: 'Visão geral', icon: PanelTop },
  { id: 'loads', label: 'Cargas', icon: ClipboardList },
  { id: 'resources', label: 'Recursos', icon: Layers3 },
  { id: 'solution', label: 'Solução', icon: Zap },
  { id: 'budget', label: 'Orçamento', icon: ReceiptText },
  { id: 'report', label: 'Relatório', icon: FileText },
];

type ResourceState = 'configured' | 'attention' | 'inactive';

interface ResourceItem {
  id: DesiredFeatureId;
  label: string;
  icon: typeof BatteryCharging;
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

function SummaryRow({ label, value, state }: { label: string; value: string; state?: ResourceState }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0">
      <span className="min-w-0 truncate text-sm text-muted-foreground">{label}</span>
      {state ? <StateBadge state={state} /> : <span className="text-right text-sm font-medium">{value}</span>}
    </div>
  );
}

export function ProjectWorkspace({
  enabled = true,
  projectInfo,
  client,
  residentialOptions,
  solution,
  nominalW,
  peakW,
  dailyKwh,
  solutionIsStale,
  inverterCatalog,
  availableInverterModels,
  onBackToProjects,
  onOpenResource,
  onOpenTechnical,
  children,
}: {
  enabled?: boolean;
  projectInfo: ProjectInfo;
  client: Client | undefined;
  residentialOptions: ResidentialOptions;
  solution: Solution | null;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
  solutionIsStale: boolean;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  onBackToProjects?: () => void;
  onOpenResource?: (id: DesiredFeatureId) => void;
  onOpenTechnical?: () => void;
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
    const value = new URLSearchParams(window.location.search).get('workspace');
    // The URL is external state; this one-time synchronization intentionally
    // updates the section after mount so SSR and the first client paint agree.
    if (value && navigation.some((item) => item.id === value)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectionState(value as WorkspaceSection);
    }
    setUrlReady(true);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', section);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [section, urlReady]);
  const resources: ResourceItem[] = [
    {
      id: 'backup', label: 'Backup', icon: BatteryCharging,
      state: enabledFeatures.includes('backup') ? hasFeatureIssue('backup') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('backup') ? `${residentialOptions.loads.length} cargas · ${residentialOptions.operationHours} h` : 'Não utilizado neste projeto',
    },
    {
      id: 'white_tariff', label: desiredFeatureLabel('white_tariff'), icon: Gauge,
      state: enabledFeatures.includes('white_tariff') ? hasFeatureIssue('white_tariff') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('white_tariff') ? residentialOptions.whiteTariff ? 'Configuração preenchida' : 'Faltam dados' : 'Não utilizado neste projeto',
    },
    {
      id: 'pv', label: desiredFeatureLabel('pv'), icon: Sun,
      state: enabledFeatures.includes('pv') ? hasFeatureIssue('pv') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('pv') ? residentialOptions.pv ? 'Parâmetros preenchidos' : 'Faltam dados' : 'Não configurado',
    },
    {
      id: 'external_generator', label: desiredFeatureLabel('external_generator'), icon: Zap,
      state: enabledFeatures.includes('external_generator') ? hasFeatureIssue('external_generator') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('external_generator') ? residentialOptions.generator ? 'Configuração preenchida' : 'Faltam dados' : 'Não configurado',
    },
    {
      id: 'microgrid', label: desiredFeatureLabel('microgrid'), icon: Grid3X3,
      state: enabledFeatures.includes('microgrid') ? hasFeatureIssue('microgrid') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('microgrid') ? residentialOptions.microgrid ? 'Configuração preenchida' : 'Faltam dados' : 'Não configurado',
    },
    {
      id: 'external_ats', label: desiredFeatureLabel('external_ats'), icon: Settings2,
      state: enabledFeatures.includes('external_ats') ? hasFeatureIssue('external_ats') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('external_ats') ? residentialOptions.atsBackupAcknowledged ? 'ATS confirmado' : 'Confirmação pendente' : 'Não configurado',
    },
  ];
  const configuredCount = resources.filter((item) => item.state === 'configured').length;
  const attentionCount = resources.filter((item) => item.state === 'attention').length;
  const staleSolution = Boolean(solution) && solutionIsStale;

  if (!enabled) return <>{children}</>;

  function openSizingSection(nextSection: WorkspaceSection) {
    setSectionState(nextSection);
  }

  return (
    <div className="space-y-4">
      <PageSummary>
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
              {resources.slice(0, 5).map((item) => <SummaryRow key={item.id} label={item.label} value="" state={item.state} />)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><h2 className="text-sm font-semibold">Solução</h2></CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              {solution ? <><p className="font-medium">{solution.inverterModel}</p><p className="text-muted-foreground">{solution.batteryModel}</p><StateBadge state={staleSolution ? 'attention' : 'configured'} /></> : <p className="text-muted-foreground">Ainda não calculada</p>}
            </CardContent>
          </Card>
        </div>
      </PageSummary>
      <div className="border-b pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {onBackToProjects && <button type="button" onClick={onBackToProjects} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Projetos</button>}
            <p className="text-xs font-medium text-muted-foreground">Workspace do projeto</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{projectInfo.name || 'Projeto sem nome'}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>{client?.name || 'Cliente não informado'}</span>
              <span aria-hidden="true">·</span>
              <span>{residentialOptions.gridType ? gridLabels[residentialOptions.gridType] : 'Rede não configurada'}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-primary"><Flag className="h-3.5 w-3.5" aria-hidden="true" /> Em andamento</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => openSizingSection('resources')}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Ações do projeto
          </Button>
        </div>
        <nav className="mt-5 -mb-3 flex gap-1 overflow-x-auto" aria-label="Seções do projeto">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => openSizingSection(id)}
              className={cn(
                'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                section === id ? 'border-primary text-primary' : 'border-transparent'
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
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Nominal" value={formatKva(nominalW)} icon={Zap} />
            <MetricCard label="Máxima" value={formatKva(peakW)} icon={Gauge} />
            <MetricCard label="Energia" value={formatKwh(dailyKwh)} icon={BatteryCharging} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Card>
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <CardIcon icon={ClipboardList} />
                <h2 className="text-base font-semibold">Projeto</h2>
              </CardHeader>
              <CardContent className="pt-0">
                <SummaryRow label="Cliente" value={client?.name || 'Não informado'} state={client ? 'configured' : 'attention'} />
                <SummaryRow label="Rede elétrica" value={residentialOptions.gridType ? gridLabels[residentialOptions.gridType] : 'Não configurada'} state={residentialOptions.gridType ? 'configured' : 'attention'} />
                <SummaryRow label="Cargas" value={`${residentialOptions.loads.length} cadastradas`} state={residentialOptions.loads.length > 0 ? 'configured' : 'attention'} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <CardIcon icon={Layers3} />
                <div><h2 className="text-base font-semibold">Recursos</h2><p className="text-xs text-muted-foreground">{configuredCount} configurados{attentionCount ? ` · ${attentionCount} requer atenção` : ''}</p></div>
              </CardHeader>
              <CardContent className="grid gap-2 pt-0 sm:grid-cols-2">
                {resources.slice(0, 5).map((item) => <ResourceCard key={item.id} item={item} onOpen={() => openSizingSection('resources')} />)}
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
              {attentionCount > 0 && <ActionCard label="Revisar configurações pendentes" detail={`${attentionCount} recurso(s) requerem atenção`} onClick={() => openSizingSection('resources')} icon={AlertTriangle} />}
              <ActionCard label="Revisar cargas" detail={`${residentialOptions.loads.length} carga(s) cadastrada(s)`} onClick={() => openSizingSection('loads')} icon={ClipboardList} />
              <ActionCard label="Gerar orçamento" detail="Acessar fornecedores e serviços" onClick={() => openSizingSection('budget')} icon={ReceiptText} />
            </CardContent>
          </Card>
        </>
      ) : section === 'loads' ? (
        <>
          <LoadsSection residentialOptions={residentialOptions} nominalW={nominalW} peakW={peakW} dailyKwh={dailyKwh} />
        </>
      ) : section === 'resources' ? (
        <>
          <ResourcesSection resources={resources} configuredCount={configuredCount} attentionCount={attentionCount} onOpenResource={onOpenResource} />
          <TechnicalFlowNote>{children}</TechnicalFlowNote>
        </>
      ) : section === 'solution' ? (
        <>
          <SolutionSection solution={solution} stale={staleSolution} onOpenTechnical={onOpenTechnical} />
          <TechnicalFlowNote>{children}</TechnicalFlowNote>
        </>
      ) : (
        <div className="space-y-3">
          <TechnicalFlowNote>{children}</TechnicalFlowNote>
        </div>
      )}
    </div>
  );
}

function CardIcon({ icon: Icon }: { icon: typeof PanelTop }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span>;
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Zap }) {
  return <Card className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" aria-hidden="true" />{label}</div><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></Card>;
}

function SolutionValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-medium">{value}</p></div>;
}

function ActionCard({ label, detail, onClick, icon: Icon }: { label: string; detail: string; onClick: () => void; icon: typeof AlertTriangle }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></button>;
}

function TechnicalFlowNote({ children }: { children: ReactNode }) {
  return <div className="space-y-3"><div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">A edição continua usando os controles técnicos atuais. Nenhuma regra de cálculo foi duplicada nesta visão.</div>{children}</div>;
}

function LoadsSection({ residentialOptions, nominalW, peakW, dailyKwh }: { residentialOptions: ResidentialOptions; nominalW: number; peakW: number; dailyKwh: number }) {
  const phaseTotals = totalPowerByPhase(residentialOptions.loads);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-semibold">Cargas</h2><p className="text-sm text-muted-foreground">{residentialOptions.loads.length} carga(s) cadastrada(s)</p></div><span className="text-sm text-muted-foreground">{residentialOptions.operationHours} h de operação</span></div>
    <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Potência nominal" value={formatKva(nominalW)} icon={Zap} /><MetricCard label="Pico considerado" value={formatKva(peakW)} icon={Gauge} /><MetricCard label="Energia diária" value={formatKwh(dailyKwh)} icon={BatteryCharging} /></div>
    <Card><CardHeader className="pb-2"><h3 className="text-sm font-semibold">Distribuição de fases</h3></CardHeader><CardContent className="grid gap-2 pt-0 sm:grid-cols-3">{(['L1', 'L2', 'L3'] as const).map((phase) => <div key={phase} className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{phase}</p><p className="mt-1 font-semibold">{formatKva(phaseTotals[phase])}</p></div>)}</CardContent></Card>
    <LoadSelector defaultToMine />
  </div>;
}

function ResourcesSection({ resources, configuredCount, attentionCount, onOpenResource }: { resources: ResourceItem[]; configuredCount: number; attentionCount: number; onOpenResource?: (id: DesiredFeatureId) => void }) {
  return <div className="space-y-4"><div><h2 className="text-lg font-semibold">Recursos</h2><p className="text-sm text-muted-foreground">{configuredCount} configurados{attentionCount ? ` · ${attentionCount} requer atenção` : ''}</p></div><div className="grid gap-3 sm:grid-cols-2">{resources.map((item) => <ResourceCard key={item.id} item={item} onOpen={onOpenResource ? () => onOpenResource(item.id) : undefined} />)}</div></div>;
}

function SolutionSection({ solution, stale, onOpenTechnical }: { solution: Solution | null; stale: boolean; onOpenTechnical?: () => void }) {
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Solução</h2><p className="text-sm text-muted-foreground">Equipamentos e capacidades calculadas</p></div>{solution && <StateBadge state={stale ? 'attention' : 'configured'} />}</div>{solution ? <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4"><SolutionValue label="Inversor" value={solution.inverterModel} /><SolutionValue label="Baterias" value={`${solution.batteryModel} · ${solution.batteryQty} un.`} /><SolutionValue label="Potência do inversor" value={solution.inverterRatedPowerW ? formatKva(solution.inverterRatedPowerW) : 'Não informado'} /><SolutionValue label="Energia disponível" value={solution.availableEnergyWh ? formatKwh(solution.availableEnergyWh / 1000) : 'Não informado'} /></CardContent></Card> : <Card><CardContent className="p-4 text-sm text-muted-foreground">Solução ainda não calculada.</CardContent></Card>}{onOpenTechnical && <Button onClick={onOpenTechnical}>{solution ? 'Abrir dimensionamento e recalcular' : 'Configurar e dimensionar'}</Button>}</div>;
}
