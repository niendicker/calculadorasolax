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
  Clock3,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Flag,
  Gauge,
  HelpCircle,
  Link2,
  Layers3,
  Loader2,
  Package,
  PanelTop,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  SolarPanel,
  Trash2,
  UserRound,
  UsersRound,
  Wallet,
  Wrench,
  Zap,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConfirmDeleteModalButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { desiredFeatureLabel } from '@/lib/desired-features';
import type { Client, DesiredFeatureId, MarginSettings, ProductDocument, ProjectInfo, ProjectServiceLine, ProjectStatus, ResidentialOptions, SavedProject, Solution, StockProductType, UserServiceItem, UserStockItem } from '@/lib/types';
import { desiredFeatureHasPendingIssue } from '../tabs/sizing/feature-status';
import { featureIcons } from '../tabs/sizing/DesiredFeaturesPicker';
import type { BatteryCatalogOption, InlineProfile, InverterCatalogOption, ProductMedia } from '../types';
import { gridLabels, topologyLabels } from '../types';
import { cn } from '@/lib/utils';
import { buildMarginSummary, calculateSystemCost, formatCurrencyBRL, normalizeAccessoryLine, servicePricingUnitLabel, solutionMetrics, type MissingCostItem } from '../helpers';
import { CatalogProductCard, DocPreviewModal, MicrogridGuideDialog } from '../shared-ui';
import { MicrogridVariantChoice } from '../tabs/sizing/ResultSummary';
import { PageSummary } from '../shell/slots';
import { ProjectWorkspaceShell } from './ProjectWorkspaceShell';
import { QuoteShareButton } from '../tabs/project/QuoteShareButton';
import { SupplierQuoteAction } from '../tabs/project/SupplierQuoteAction';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { batteryQuantityBreakdown } from '@/lib/battery-quantity-breakdown';
import { AddressFields } from '../address-fields';
import { formatAddress } from '@/lib/address';
import type { AutosaveStatus } from '../hooks/useAutosave';
import type { LivePdfReport } from '../hooks/useLivePdfExport';

export type WorkspaceSection = 'overview' | 'loads' | 'resource' | 'project' | 'configuration' | 'solution' | 'budget' | 'report';
type ProjectInfoEditField = 'name' | 'client' | 'address' | null;

const navigation: Array<{ id: WorkspaceSection; label: string; icon: typeof PanelTop }> = [
  { id: 'overview', label: 'Visão geral', icon: PanelTop },
  { id: 'loads', label: 'Cargas', icon: ClipboardList },
  { id: 'solution', label: 'Solução', icon: Zap },
  { id: 'budget', label: 'Financeiro', icon: Wallet },
  { id: 'report', label: 'Relatório', icon: FileText },
];

type ResourceState = 'configured' | 'attention' | 'inactive';

interface ResourceItem {
  id: DesiredFeatureId | 'loads';
  label: string;
  icon: LucideIcon;
  state: ResourceState;
  summary: string;
}

function StateBadge({ state }: { state: ResourceState }) {
  const content = {
    configured: { label: 'Configurado', icon: CheckCircle2, className: 'text-emerald-600' },
    attention: { label: 'Requer atenção', icon: AlertTriangle, className: 'text-amber-600' },
    inactive: { label: 'Desabilitado', icon: null, className: 'text-muted-foreground' },
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
  return `${(valueW / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kVA`;
}

function formatKw(valueW: number) {
  return `${(valueW / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kW`;
}

function formatKwh(valueKwh: number) {
  return `${valueKwh.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kWh`;
}

function formatAddressSummary(address: ProjectInfo['address']) {
  return [address.city, address.state].filter(Boolean).join(' · ') || 'Dados da instalação';
}

function formatPtValue(value: number, unit: string, maximumFractionDigits = 2) {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits })} ${unit}`;
}

function ResourceCard({ item, onOpen, onLearnMore }: { item: ResourceItem; onOpen?: () => void; onLearnMore?: () => void }) {
  const Icon = item.icon;
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className="truncate">{item.label}</span>
        </span>
        <span className="mt-1 block"><StateBadge state={item.state} /></span>
        {item.state !== 'inactive' && <span className="mt-1 block truncate text-xs text-muted-foreground">{item.summary}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );
  const card = onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full min-h-24 w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {content}
    </button>
  ) : <div className="flex h-full min-h-24 items-center gap-3 rounded-xl border bg-background p-3 text-left">{content}</div>;
  return (
    <div className="relative h-full">
      {card}
      {onLearnMore && (
        <button
          type="button"
          aria-label={`Saiba mais sobre ${item.label}`}
          title={`Saiba mais sobre ${item.label}`}
          onClick={onLearnMore}
          className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function SummaryRow({ label, value, state, icon: Icon, showValue = false, onClick, inset = false }: { label: string; value: string; state?: ResourceState; icon?: LucideIcon; showValue?: boolean; onClick?: () => void; inset?: boolean }) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2 truncate text-sm text-muted-foreground">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 items-center justify-end gap-2">
        {showValue && <span className="truncate text-right text-sm font-medium">{value}</span>}
        {state ? <StateBadge state={state} /> : !showValue && <span className="text-right text-sm font-medium">{value}</span>}
      </span>
    </>
  );
  const className = cn('flex w-full items-center justify-between gap-3 border-b py-2.5 text-left last:border-b-0', inset && 'px-2');
  return onClick ? <button type="button" onClick={onClick} className={cn(className, 'rounded-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50')}>{content}</button> : <div className={className}>{content}</div>;
}

function EditableSummaryRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={`${label}: ${value}`} onClick={onClick} className="flex w-full items-center justify-between gap-3 border-b py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="min-w-0 truncate text-sm text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-2">
        <span className="truncate text-right text-sm font-medium">{value}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </span>
    </button>
  );
}

function ProjectServicesCard({
  services,
  userServices,
  solution,
  residentialOptions,
  batteryCatalog,
  onAddService,
  onRemoveService,
  onSaveProject,
}: {
  services: ProjectServiceLine[];
  userServices: UserServiceItem[];
  solution: Solution | null;
  residentialOptions: ResidentialOptions;
  batteryCatalog: BatteryCatalogOption[];
  onAddService: (serviceId: string) => void;
  onRemoveService: (serviceId: string) => void;
  onSaveProject?: () => void;
}) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const serviceDetails = calculateSystemCost(solution, [], services, userServices, undefined, batteryCatalog, residentialOptions).serviceDetails ?? [];
  const availableServices = userServices.filter((service) => !services.some((line) => line.serviceId === service.id));

  function saveServiceChange() {
    onSaveProject?.();
  }

  return (
    <Card className="border-0 ring-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <CardIcon icon={Wrench} />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Serviços do projeto</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {services.length === 0 ? 'Nenhum serviço adicionado' : `${services.length} ${services.length === 1 ? 'serviço adicionado' : 'serviços adicionados'}`}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setAddModalOpen(true)} disabled={availableServices.length === 0}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adicionar serviço
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {services.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Selecione um serviço cadastrado no Portfólio para incluí-lo neste projeto.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {services.map((line) => {
              const service = userServices.find((item) => item.id === line.serviceId);
              const detail = serviceDetails.find((item) => item.serviceId === line.serviceId);
              const description = service
                ? `Cobrança por ${servicePricingUnitLabel(service.pricingUnit ?? 'project')} · ${formatCurrencyBRL(service.unitValue)}`
                : 'Serviço não disponível no Portfólio';
              return (
                <div key={line.serviceId} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium">{detail?.total != null ? formatCurrencyBRL(detail.total) : 'Sem preço'}</p>
                    {detail?.quantity != null && detail.pricingUnit !== 'project' && (
                      <p className="text-xs text-muted-foreground">{detail.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {servicePricingUnitLabel(detail.pricingUnit)}</p>
                    )}
                  </div>
                  <ConfirmDeleteModalButton
                    ariaLabel={`Remover serviço ${line.name}`}
                    itemName={line.name}
                    itemType="serviço"
                    label="Remover"
                    showIcon={false}
                    onConfirm={async () => {
                      onRemoveService(line.serviceId);
                      saveServiceChange();
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <ProjectServicesModal
        open={addModalOpen}
        services={availableServices}
        onClose={() => setAddModalOpen(false)}
        onSave={(selectedIds) => {
          selectedIds.forEach((serviceId) => onAddService(serviceId));
          saveServiceChange();
          setAddModalOpen(false);
        }}
      />
    </Card>
  );
}

function ProjectServicesModal({
  open,
  services,
  onClose,
  onSave,
}: {
  open: boolean;
  services: UserServiceItem[];
  onClose: () => void;
  onSave: (serviceIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;

    function getFocusableElements() {
      return Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements();
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => getFocusableElements()[0]?.focus());

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [open]);

  if (!open) return null;

  function close() {
    setSelectedIds([]);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[1px]" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar seleção de serviços" onClick={close} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="project-services-modal-title" className="relative z-10 w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b bg-muted/20 px-5 py-4">
          <div>
            <h2 id="project-services-modal-title" className="text-lg font-semibold tracking-tight">Adicionar serviço</h2>
            <p className="mt-1 text-sm text-muted-foreground">Selecione um ou mais serviços já cadastrados no Portfólio.</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar seleção de serviços" onClick={close}><X className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
        <div className="space-y-2 p-5">
          {services.map((service) => {
            const selected = selectedIds.includes(service.id);
            return (
              <label key={service.id} htmlFor={`workspace-service-${service.id}`} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors', selected ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40')}>
                <input
                  id={`workspace-service-${service.id}`}
                  type="checkbox"
                  checked={selected}
                  onChange={() => setSelectedIds((current) => selected ? current.filter((id) => id !== service.id) : [...current, service.id])}
                  className="h-4 w-4 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{service.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{formatCurrencyBRL(service.unitValue)} / {servicePricingUnitLabel(service.pricingUnit ?? 'project')}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t p-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
          <Button type="button" onClick={() => onSave(selectedIds)} disabled={selectedIds.length === 0}>Adicionar</Button>
        </div>
      </div>
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
  onUpdateProjectInfo,
  onSaveProject,
  onCancelProjectEdit,
  activeResourceId,
  onOpenResource,
  onOpenTechnical,
  onRefreshSolution,
  recalculatingSolution = false,
  onResetSizing,
  onOpenConfiguration,
  technicalEditorOpen,
  services = [],
  userServices = [],
  onAddService,
  onRemoveService,
  onAddToStock,
  onUpdateStockItemValue,
  onUpdateServiceValue,
  onChooseMicrogridVariant,
  quoteProject,
  profile,
  userStockItems = [],
  marginSettings,
  onUpdateStatus,
  onManageSuppliers,
  onOpenProfile,
  onManagePortfolio,
  onOpenBudget,
  onGenerateReport,
  generatingReport,
  lastReport,
  onDownloadLastReport,
  onClearLastReport,
  autosaveStatus = 'idle',
  autosaveLastSavedAt = null,
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
  onOpenResource?: (id: DesiredFeatureId | 'gridType' | 'battery') => void;
  onOpenTechnical?: () => void;
  onRefreshSolution?: () => void;
  recalculatingSolution?: boolean;
  onResetSizing?: () => void;
  onOpenConfiguration?: (initialItem?: 'gridType' | 'battery') => void;
  technicalEditorOpen?: boolean;
  services?: ProjectServiceLine[];
  userServices?: UserServiceItem[];
  onAddService?: (serviceId: string) => void;
  onRemoveService?: (serviceId: string) => void;
  onAddToStock?: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
  onUpdateStockItemValue?: (id: string, unitValue: number) => Promise<void>;
  onUpdateServiceValue?: (id: string, unitValue: number) => Promise<void>;
  onChooseMicrogridVariant?: (variant: 'economic' | 'microgrid') => void;
  quoteProject?: SavedProject;
  profile?: InlineProfile | null;
  userStockItems?: UserStockItem[];
  marginSettings?: MarginSettings;
  onUpdateStatus?: (status: ProjectStatus) => void;
  onManageSuppliers?: () => void;
  onOpenProfile?: () => void;
  onManagePortfolio?: () => void;
  onOpenBudget?: () => void;
  onGenerateReport?: () => void;
  generatingReport?: boolean;
  lastReport?: LivePdfReport | null;
  onDownloadLastReport?: () => void;
  onClearLastReport?: () => void;
  autosaveStatus?: AutosaveStatus;
  autosaveLastSavedAt?: Date | null;
  children: ReactNode;
}) {
  const [section, setSectionState] = useState<WorkspaceSection>('overview');
  const [microgridGuideOpen, setMicrogridGuideOpen] = useState(false);
  const [projectInfoEditField, setProjectInfoEditField] = useState<ProjectInfoEditField>(null);
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
      summary: enabledFeatures.includes('pv') ? residentialOptions.pv ? 'Parâmetros preenchidos' : 'Faltam dados' : 'Desabilitado',
    },
    {
      id: 'external_generator', label: desiredFeatureLabel('external_generator'), icon: featureIcons.external_generator,
      state: enabledFeatures.includes('external_generator') ? hasFeatureIssue('external_generator') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('external_generator') ? residentialOptions.generator ? 'Configuração preenchida' : 'Faltam dados' : 'Desabilitado',
    },
    {
      id: 'microgrid', label: desiredFeatureLabel('microgrid'), icon: featureIcons.microgrid,
      state: enabledFeatures.includes('microgrid') ? hasFeatureIssue('microgrid') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('microgrid') ? residentialOptions.microgrid ? 'Configuração preenchida' : 'Faltam dados' : 'Desabilitado',
    },
    {
      id: 'external_ats', label: desiredFeatureLabel('external_ats'), icon: featureIcons.external_ats,
      state: enabledFeatures.includes('external_ats') ? hasFeatureIssue('external_ats') ? 'attention' : 'configured' : 'inactive',
      summary: enabledFeatures.includes('external_ats') ? residentialOptions.atsBackupAcknowledged ? 'ATS confirmado' : 'Confirmação pendente' : 'Desabilitado',
    },
  ];
  const configuredCount = resources.filter((item) => item.state === 'configured').length;
  const attentionCount = resources.filter((item) => item.state === 'attention').length;
  const loadsState: ResourceState = residentialOptions.loads.length > 0 ? 'configured' : 'attention';
  const resourceConfiguredCount = configuredCount + (loadsState === 'configured' ? 1 : 0);
  const resourceAttentionCount = attentionCount + (loadsState === 'attention' ? 1 : 0);
  const staleSolution = Boolean(solution) && solutionIsStale;
  const technicalConfigurationState: ResourceState = residentialOptions.gridType && residentialOptions.topology && residentialOptions.batteryModel
    ? 'configured'
    : 'attention';

  function openResourceEditor(id: DesiredFeatureId | 'loads' | 'battery') {
    if (id === 'loads') {
      setSectionState('loads');
      return;
    }
    if (id === 'battery' && onOpenConfiguration) {
      setSectionState('configuration');
      onOpenConfiguration('battery');
      return;
    }
    setSectionState('resource');
    onOpenResource?.(id);
  }

  function openFirstPendingResource() {
    if (loadsState === 'attention') {
      openSizingSection('loads');
      return;
    }
    const pending = resources.find((item) => item.state === 'attention');
    if (pending) openResourceEditor(pending.id);
  }

  if (!enabled) return <>{children}</>;

  function openSizingSection(nextSection: WorkspaceSection) {
    setSectionState(nextSection);
  }

  return (
    <ProjectWorkspaceShell
      title={projectInfo.name || 'Projeto sem nome'}
      autosaveStatus={autosaveStatus}
      autosaveLastSavedAt={autosaveLastSavedAt}
      navigation={navigation}
      activeSection={section}
      onSectionChange={(id) => setSectionState(id as WorkspaceSection)}
      subtitle={
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex" role="img" aria-label="Cliente" title="Cliente">
              <UserRound className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>{client?.name || 'Não informado'}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>{residentialOptions.gridType ? gridLabels[residentialOptions.gridType] : 'Rede não configurada'}</span>
        </p>
      }
      actions={
        <>
          {onRefreshSolution && (
            <Button
              type="button"
              variant={solution && !staleSolution ? 'outline' : 'default'}
              size="sm"
              className={cn(
                'shrink-0',
                solution && !staleSolution
                  ? 'border-muted text-muted-foreground'
                  : 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600 hover:text-white'
              )}
              onClick={onRefreshSolution}
              disabled={recalculatingSolution || Boolean(solution && !staleSolution)}
              title={solution && !staleSolution ? 'A solução já está configurada.' : undefined}
              aria-busy={recalculatingSolution}
            >
              {recalculatingSolution ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {recalculatingSolution ? 'Recalculando...' : 'Recalcular solução'}
            </Button>
          )}
          {onResetSizing && (
            <ConfirmDeleteModalButton
              ariaLabel="Limpar dimensionamento"
              itemName="dimensionamento atual"
              itemType="dimensionamento"
              title="Limpar dimensionamento?"
              description="Cargas, configurações e a solução calculada nesta aba serão apagadas."
              label="Limpar"
              icon={<Trash2 className="h-4 w-4" />}
              confirmLabel="Limpar"
              triggerVariant="outline"
              onConfirm={onResetSizing}
            />
          )}
        </>
      }
    >
      {section !== 'overview' && <PageSummary>
        <div className="space-y-4">
          <div className="grid gap-2">
            <SummaryMetric label="Nominal" value={(nominalW / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} unit="kVA" icon={Gauge} />
            <SummaryMetric label="Máxima" value={(peakW / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} unit="kVA" icon={Zap} />
            <SummaryMetric label="Energia" value={dailyKwh.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} unit="kWh" icon={BatteryCharging} />
          </div>
          <Card>
            <CardHeader className="pb-2"><h2 className="text-sm font-semibold">Recursos</h2></CardHeader>
            <CardContent className="pt-0">
              <SummaryRow label="Cargas" value={`${residentialOptions.loads.length}`} state={residentialOptions.loads.length > 0 ? 'configured' : 'attention'} onClick={() => openSizingSection('loads')} inset />
              {resources.map((item) => <SummaryRow key={item.id} label={item.label} value="" state={item.state} onClick={() => openResourceEditor(item.id)} inset />)}
            </CardContent>
          </Card>
        </div>
      </PageSummary>}
      {section === 'overview' ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Card className="rounded-2xl border-0 shadow-sm ring-0">
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <CardIcon icon={ClipboardList} />
                <div className="min-w-0"><h2 className="text-base font-semibold">Instalação</h2><p className="mt-0.5 truncate text-xs text-muted-foreground">{formatAddressSummary(projectInfo.address)}</p></div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Settings2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Configurações gerais</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Identificação e dados da instalação</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    {(onUpdateProjectInfo || onSaveProject) && (
                      <>
                        <EditableSummaryRow label="Nome da instalação" value={projectInfo.name || 'Não informado'} onClick={() => setProjectInfoEditField('name')} />
                        <EditableSummaryRow label="Cliente" value={client?.name || 'Não informado'} onClick={() => setProjectInfoEditField('client')} />
                        <EditableSummaryRow label="Endereço" value={formatAddress(projectInfo.address) || 'Não informado'} onClick={() => setProjectInfoEditField('address')} />
                      </>
                    )}
                    {!onUpdateProjectInfo && !onSaveProject && (
                      <>
                        <SummaryRow label="Nome da instalação" value={projectInfo.name || 'Não informado'} showValue />
                        <SummaryRow label="Cliente" value={client?.name || 'Não informado'} showValue />
                        <SummaryRow label="Endereço" value={formatAddress(projectInfo.address) || 'Não informado'} showValue />
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Settings2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Configurações técnicas</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Rede, inversor e banco de baterias</p>
                      </div>
                    </div>
                    <StateBadge state={technicalConfigurationState} />
                  </div>
                  {(onOpenConfiguration || onOpenResource) ? (
                    <>
                      <EditableSummaryRow
                        label="Rede elétrica"
                        value={residentialOptions.gridType ? gridLabels[residentialOptions.gridType] : 'Não configurada'}
                        onClick={() => onOpenConfiguration ? onOpenConfiguration() : onOpenResource?.('gridType')}
                      />
                      <EditableSummaryRow
                        label="Inversor"
                        value={residentialOptions.inverterModel || 'Automático'}
                        onClick={() => onOpenConfiguration ? onOpenConfiguration() : onOpenResource?.('gridType')}
                      />
                      <EditableSummaryRow
                        label="Bateria"
                        value={residentialOptions.batteryModel
                          ? `${residentialOptions.batteryModel}${residentialOptions.topology ? ` · ${topologyLabels[residentialOptions.topology]}` : ''}`
                          : 'Não selecionada'}
                        onClick={() => openResourceEditor('battery')}
                      />
                    </>
                  ) : (
                    <>
                      <SummaryRow
                        label="Rede elétrica"
                        value={residentialOptions.gridType ? gridLabels[residentialOptions.gridType] : 'Não configurada'}
                        icon={Zap}
                        showValue
                      />
                      <SummaryRow
                        label="Inversor"
                        value={residentialOptions.inverterModel || 'Automático'}
                        icon={Zap}
                        showValue
                      />
                      <SummaryRow
                        label="Bateria"
                        value={residentialOptions.batteryModel
                          ? `${residentialOptions.batteryModel}${residentialOptions.topology ? ` · ${topologyLabels[residentialOptions.topology]}` : ''}`
                          : 'Não selecionada'}
                        icon={Battery}
                        showValue
                      />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 ring-0">
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <CardIcon icon={Layers3} />
                <div><h2 className="text-base font-semibold">Recursos</h2><p className="text-xs text-muted-foreground">{resourceConfiguredCount} configurados{resourceAttentionCount ? ` · ${resourceAttentionCount} requer atenção` : ''}</p></div>
              </CardHeader>
              <CardContent className="grid gap-2 pt-0 sm:grid-cols-2">
                <ResourceCard
                  item={{ id: 'loads', label: 'Cargas', icon: ClipboardList, state: loadsState, summary: residentialOptions.loads.length > 0 ? `${residentialOptions.loads.length} cadastradas` : 'Nenhuma carga cadastrada' }}
                  onOpen={() => openSizingSection('loads')}
                />
                {resources.map((item) => <ResourceCard key={item.id} item={item} onOpen={onOpenResource ? () => openResourceEditor(item.id) : undefined} onLearnMore={item.id === 'microgrid' ? () => setMicrogridGuideOpen(true) : undefined} />)}
              </CardContent>
            </Card>
          </div>

          {onAddService && onRemoveService && (
            <ProjectServicesCard
              services={services}
              userServices={userServices}
              solution={solution}
              residentialOptions={residentialOptions}
              batteryCatalog={batteryCatalog}
              onAddService={onAddService}
              onRemoveService={onRemoveService}
              onSaveProject={onSaveProject}
            />
          )}

          <Card className={cn('overflow-hidden rounded-2xl border-0 bg-primary/[0.035] shadow-sm ring-0', staleSolution && 'bg-amber-50/30')}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div className="flex min-w-0 items-center gap-3">
                <CardIcon icon={Package} />
                <h2 className="text-base font-semibold">Solução atual</h2>
              </div>
              {solution && <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', staleSolution ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700')}>
                {staleSolution ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                {staleSolution ? 'Solução desatualizada' : 'Solução atualizada'}
              </span>}
            </CardHeader>
            <CardContent className="pt-0">
              {solution ? (
                <div className="overflow-hidden rounded-xl border bg-background/70">
                  <table className="w-full table-fixed text-sm" aria-label="Resumo da solução atual">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th scope="col" className="w-[26%] px-4 py-3.5 text-left font-medium">Equipamento</th>
                        <th scope="col" className="px-4 py-3.5 text-left font-medium">Modelo</th>
                        <th scope="col" className="w-16 px-4 py-3.5 text-right font-medium">Qtd.</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b align-top">
                        <th scope="row" className="px-4 py-3 text-left font-medium">Inversor</th>
                        <td className="px-4 py-3">
                          <p className="truncate font-medium" title={solution.inverterModel}>{productMedia[solution.inverterModel]?.nickname || solution.inverterModel}</p>
                          {productMedia[solution.inverterModel]?.nickname && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={solution.inverterModel}>{solution.inverterModel}</p>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{solution.inverterQty ?? 1}</td>
                      </tr>
                      <tr className="align-top">
                        <th scope="row" className="px-4 py-3 text-left font-medium">Baterias</th>
                        <td className="px-4 py-3">
                          <p className="truncate font-medium" title={solution.batteryModel}>{productMedia[solution.batteryModel]?.nickname || solution.batteryModel}</p>
                          {productMedia[solution.batteryModel]?.nickname && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={solution.batteryModel}>{solution.batteryModel}</p>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{solution.batteryQty}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t">
                        <td colSpan={3} className="px-4 py-2.5 text-right">
                          <Button variant="ghost" className="px-0 text-primary hover:bg-transparent hover:text-primary/80" onClick={() => openSizingSection('solution')}>Ver detalhes <ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
                  <div><p className="font-medium">Solução ainda não calculada</p><p className="mt-1 text-sm text-muted-foreground">Configure os dados técnicos para gerar uma recomendação.</p></div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 ring-0">
            <CardHeader className="flex flex-row items-center gap-3 pb-3"><CardIcon icon={Flag} /><h2 className="text-base font-semibold">Próximos passos</h2></CardHeader>
            <CardContent className="grid gap-2 pt-0 sm:grid-cols-3">
              {resourceAttentionCount > 0 && <ActionCard label="Revisar configurações pendentes" detail={`${resourceAttentionCount} recurso(s) requerem atenção`} onClick={openFirstPendingResource} icon={AlertTriangle} />}
              {loadsState === 'attention' && <ActionCard label="Revisar cargas" detail="Nenhuma carga cadastrada" onClick={() => openSizingSection('loads')} icon={ClipboardList} />}
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
          <LoadsSection />
        </>
      ) : section === 'configuration' ? (
        <>
          {technicalEditorOpen && children}
        </>
      ) : section === 'resource' ? (
        <>
          {activeResourceId && !['backup', 'microgrid', 'external_ats', 'pv', 'external_generator', 'white_tariff'].includes(activeResourceId) && <div className="flex flex-wrap items-start justify-between gap-3">
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
            onRefreshSolution={onRefreshSolution}
            recalculatingSolution={recalculatingSolution}
            inverterCatalog={inverterCatalog}
            batteryCatalog={batteryCatalog}
            productMedia={productMedia}
            residentialOptions={residentialOptions}
            nominalW={nominalW}
            peakW={peakW}
                dailyKwh={dailyKwh}
                onChooseMicrogridVariant={onChooseMicrogridVariant}
              />
        </>
      ) : section === 'budget' ? (
          <BudgetSection
            solution={solution}
            residentialOptions={residentialOptions}
            services={services}
            onOpenBudget={onOpenBudget}
          quoteProject={quoteProject}
          client={client}
          profile={profile}
          batteryCatalog={batteryCatalog}
          inverterCatalog={inverterCatalog}
          userStockItems={userStockItems}
          userServices={userServices}
            marginSettings={marginSettings}
            onAddToStock={onAddToStock}
            onUpdateStockItemValue={onUpdateStockItemValue}
            onUpdateServiceValue={onUpdateServiceValue}
            onUpdateStatus={onUpdateStatus}
            onManageSuppliers={onManageSuppliers}
            onOpenProfile={onOpenProfile}
            onManagePortfolio={onManagePortfolio}
          />
      ) : section === 'report' ? (
        <ReportSection
          solution={solution}
          stale={staleSolution}
          onGenerateReport={onGenerateReport}
          generatingReport={generatingReport}
          lastReport={lastReport}
          onDownloadLastReport={onDownloadLastReport}
          onClearLastReport={onClearLastReport}
        />
      ) : (
        <div className="space-y-3">
          {children}
        </div>
      )}
      <ProjectInfoModal
        key={projectInfoEditField ?? 'closed'}
        field={projectInfoEditField}
        projectInfo={projectInfo}
        clients={clients}
        onClose={() => setProjectInfoEditField(null)}
        onSave={(partial) => {
          onUpdateProjectInfo?.(partial);
          onSaveProject?.();
          setProjectInfoEditField(null);
        }}
      />
      <MicrogridGuideDialog open={microgridGuideOpen} onClose={() => setMicrogridGuideOpen(false)} />
    </ProjectWorkspaceShell>
  );
}

function CardIcon({ icon: Icon }: { icon: typeof PanelTop }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span>;
}

type ProjectInfoEditorProps = {
  projectInfo: ProjectInfo;
  clients: Client[];
  onChange?: (partial: Partial<ProjectInfo>) => void;
  onSave?: () => void;
  onCancel?: () => void;
};

function ProjectInfoFields({ projectInfo, clients, onChange, onSave, onCancel }: ProjectInfoEditorProps) {
  const nameError = !projectInfo.name.trim();

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-labelledby="project-info-identification-title">
        <div>
          <h3 id="project-info-identification-title" className="text-sm font-semibold">Identificação</h3>
          <p className="mt-1 text-xs text-muted-foreground">Defina como esta instalação será apresentada no projeto.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </section>

      <section className="space-y-3 border-t pt-5" aria-labelledby="project-info-address-title">
        <div>
          <h3 id="project-info-address-title" className="text-sm font-semibold">Endereço da instalação</h3>
          <p className="mt-1 text-xs text-muted-foreground">Use o CEP para preencher automaticamente os dados disponíveis.</p>
        </div>
        <AddressFields address={projectInfo.address} onChange={(partial) => onChange?.({ address: { ...projectInfo.address, ...partial } })} idPrefix="workspaceProjectAddress" />
      </section>

      <section className="space-y-1.5 border-t pt-5" aria-labelledby="project-info-notes-title">
        <div>
          <h3 id="project-info-notes-title" className="text-sm font-semibold">Observações</h3>
          <p className="mt-1 text-xs text-muted-foreground">Registre informações comerciais ou restrições da instalação.</p>
        </div>
        <textarea id="workspaceProjectNotes" className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm" value={projectInfo.notes} onChange={(event) => onChange?.({ notes: event.target.value })} placeholder="Ex.: acesso restrito, preferência do cliente..." />
      </section>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
        {onSave && <Button type="button" onClick={onSave} disabled={nameError}>Salvar alterações</Button>}
      </div>
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
        <CardContent className="p-5">
          <ProjectInfoFields projectInfo={projectInfo} clients={clients} onChange={onChange} onSave={onSave} onCancel={onCancel} />
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectInfoModal({ field, projectInfo, clients, onClose, onSave }: {
  field: ProjectInfoEditField;
  projectInfo: ProjectInfo;
  clients: Client[];
  onClose: () => void;
  onSave: (partial: Partial<ProjectInfo>) => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [name, setName] = useState(projectInfo.name);
  const [clientId, setClientId] = useState(projectInfo.clientId ?? '');
  const [address, setAddress] = useState(projectInfo.address);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!field) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;

    const getFocusableElements = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ) ?? []);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements();
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => getFocusableElements()[0]?.focus());

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [field]);

  if (!field) return null;

  const title = field === 'name' ? 'Nome da instalação' : field === 'client' ? 'Cliente' : 'Endereço da instalação';
  const description = field === 'name'
    ? 'Atualize o nome usado para identificar esta instalação.'
    : field === 'client'
      ? 'Selecione o cliente relacionado a esta instalação.'
      : 'Atualize os dados do endereço da instalação.';
  const save = () => {
    if (field === 'name') onSave({ name });
    if (field === 'client') onSave({ clientId: clientId || null });
    if (field === 'address') onSave({ address });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[1px]" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label={`Fechar edição de ${title.toLocaleLowerCase('pt-BR')}`} onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="project-info-modal-title" aria-describedby="project-info-modal-description" className={cn('relative z-10 my-auto max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border bg-card text-card-foreground shadow-2xl', field === 'address' ? 'max-w-2xl' : 'max-w-md')}>
        <div className="flex items-start justify-between gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h2 id="project-info-modal-title" className="text-lg font-semibold tracking-tight">{title}</h2>
              <p id="project-info-modal-description" className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Fechar edição de ${title.toLocaleLowerCase('pt-BR')}`} onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
        <div className="p-5 sm:p-6">
          {field === 'name' && (
            <div className="space-y-1.5">
              <Label htmlFor="workspaceProjectNameModal">Nome da instalação</Label>
              <Input id="workspaceProjectNameModal" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!name.trim()} autoFocus />
              {!name.trim() && <p className="text-xs text-destructive" role="alert">Informe um nome para a instalação.</p>}
            </div>
          )}
          {field === 'client' && (
            <div className="space-y-1.5">
              <Label htmlFor="workspaceProjectClientModal">Cliente</Label>
              <Select id="workspaceProjectClientModal" value={clientId} onChange={(event) => setClientId(event.target.value)} autoFocus>
                <option value="">Sem cliente selecionado</option>
                {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </div>
          )}
          {field === 'address' && (
            <AddressFields address={address} onChange={(partial) => setAddress((current) => ({ ...current, ...partial }))} idPrefix="workspaceProjectAddressModal" />
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={save} disabled={field === 'name' && !name.trim()}>Salvar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, compact = false }: { label: string; value: string; icon: typeof Zap; compact?: boolean }) {
  if (compact) {
    return <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0"><div className="truncate text-xs text-muted-foreground">{label}</div><p className="mt-0.5 truncate text-xl font-semibold leading-tight tabular-nums">{value}</p></div></div>;
  }

  return <Card className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" aria-hidden="true" />{label}</div><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></Card>;
}

function SummaryMetric({ label, value, unit, icon: Icon }: { label: string; value: string; unit: string; icon: LucideIcon }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-background px-3 py-2.5 shadow-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className="truncate text-lg font-semibold leading-tight">{value}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
        </div>
        <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function SolutionValue({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
  if (Icon) {
    return (
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold">{value}</p>
        </div>
      </div>
    );
  }

  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-medium">{value}</p></div>;
}

function ActionCard({ label, detail, onClick, icon: Icon }: { label: string; detail: string; onClick: () => void; icon: typeof AlertTriangle }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></button>;
}

function LoadsSection() {
  return <div className="space-y-4">
    <LoadSelector defaultToMine showOperationHours={false} collapsedByDefault />
  </div>;
}

function SolutionSection({
  solution,
  stale,
  onOpenTechnical,
  onRefreshSolution,
  recalculatingSolution,
  inverterCatalog,
  batteryCatalog,
  productMedia,
  residentialOptions,
  nominalW,
  peakW,
  dailyKwh,
  onChooseMicrogridVariant,
}: {
  solution: Solution | null;
  stale: boolean;
  onOpenTechnical?: () => void;
  onRefreshSolution?: () => void;
  recalculatingSolution?: boolean;
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog: BatteryCatalogOption[];
  productMedia: Record<string, ProductMedia>;
  residentialOptions: ResidentialOptions;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
  onChooseMicrogridVariant?: (variant: 'economic' | 'microgrid') => void;
}) {
  const [view, setView] = useState<'summary' | 'margins' | 'criteria'>('summary');
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
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

  if (solution?.microgridAlternative && onChooseMicrogridVariant) {
    return (
      <MicrogridVariantChoice
        economic={solution}
        withMicrogrid={solution.microgridAlternative}
        onChoose={onChooseMicrogridVariant}
        productMedia={productMedia}
        batteryCatalog={batteryCatalog}
      />
    );
  }
  const accessoryGroups = solution
    ? [
        { title: 'Inclusos no Inversor ou Bateria', items: solution.accessories.map(normalizeAccessoryLine).filter((item) => item.bundled) },
        { title: 'Adquirir separadamente', items: solution.accessories.map(normalizeAccessoryLine).filter((item) => !item.bundled) },
      ].filter((group) => group.items.length > 0)
    : [];
  const inverterMedia = solution ? productMedia[solution.inverterModel] : undefined;
  const inverterCatalogEntry = solution ? inverterCatalog.find((item) => item.model === solution.inverterModel) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Solução</h2>
          <p className="text-sm text-muted-foreground">Equipamentos, margens e critérios do dimensionamento.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!solution && onRefreshSolution && <Button onClick={onRefreshSolution} disabled={recalculatingSolution} aria-busy={recalculatingSolution}>{recalculatingSolution ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{recalculatingSolution ? 'Calculando solução...' : 'Calcular solução'}</Button>}
          {!solution && onOpenTechnical && <Button variant={onRefreshSolution ? 'outline' : 'default'} onClick={onOpenTechnical}>Configurar e dimensionar</Button>}
        </div>
      </div>

      {!solution ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div><p className="font-medium">Solução ainda não calculada</p><p className="mt-1 text-sm text-muted-foreground">Calcule a solução para gerar uma recomendação. Se necessário, revise os dados técnicos antes.</p></div>
          </CardContent>
        </Card>
      ) : (
        <>
          {stale && <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>As configurações do Workspace foram alteradas após o último cálculo. Recalcule para atualizar esta solução.</span></div>}
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1" role="group" aria-label="Detalhes da solução">
            {([
              ['summary', 'Resumo'],
              ['margins', 'Margens'],
              ['criteria', 'Critérios'],
            ] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={cn('rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50', view === id ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground')}>{label}</button>)}
          </div>

          {view === 'summary' && metrics && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <MetricCard compact label="Potência do inversor" value={solution.inverterRatedPowerW ? formatKva(solution.inverterRatedPowerW) : 'Não informado'} icon={Zap} />
                <MetricCard compact label="Potência da bateria" value={solution.batteryPowerW ? formatKw(solution.batteryPowerW) : 'Não informado'} icon={Battery} />
                <MetricCard compact label="Potência máxima" value={metrics.peakW != null ? formatKva(metrics.peakW) : 'Não informado'} icon={Gauge} />
                <MetricCard compact label="Energia útil" value={formatKwh(metrics.energyKwh)} icon={BatteryCharging} />
              </div>
              <Card>
                <CardHeader className="pb-3"><h3 className="text-sm font-semibold">Sistema Inteligente de Armazenamento de Energia</h3><p className="mt-0.5 text-xs text-muted-foreground">Inversor e banco de baterias selecionados para este dimensionamento.</p></CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <CatalogProductCard
                      fallbackIcon={<Zap className="h-8 w-8 text-muted-foreground" />}
                      model={solution.inverterModel}
                      nickname={inverterMedia?.nickname}
                      imageUrl={inverterMedia?.imageUrl ?? null}
                      documents={inverterMedia?.documents ?? []}
                      specs={[
                        ['Potência', `${solution.inverterRatedPowerW ? formatKva(solution.inverterRatedPowerW) : 'Não informado'} · pico ${solution.inverterPeakPowerW ? formatKva(solution.inverterPeakPowerW) : 'Não informado'}`],
                        ['Quantidade', `${solution.inverterQty ?? 1} un.`],
                        ['Garantia', `${inverterCatalogEntry?.warrantyYears ?? 10} anos`],
                      ]}
                      appearance="summary"
                      onPreviewImage={setPreviewImage}
                      onPreviewDoc={setPreviewDoc}
                    />
                    {batteryParts.map((part, index) => {
                      const battery = batteryCatalog.find((item) => item.model === part.model);
                      const partMedia = productMedia[part.model];
                      const usefulEnergyKwh = battery ? battery.capacityKwh * (1 - battery.minSocPercent / 100) : null;
                      return (
                        <CatalogProductCard
                          key={`${part.model}-${index}`}
                          fallbackIcon={<Battery className="h-8 w-8 text-muted-foreground" />}
                          model={part.model}
                          nickname={partMedia?.nickname}
                          imageUrl={partMedia?.imageUrl ?? null}
                          documents={partMedia?.documents ?? []}
                          statusBadges={index === 0 ? ['BMS Integrado'] : undefined}
                          specs={[
                            [
                              'Capacidade',
                              battery
                                ? `${formatPtValue(battery.capacityKwh, 'kWh')} · útil ${usefulEnergyKwh != null ? formatPtValue(usefulEnergyKwh, 'kWh') : 'Não informado'}`
                                : (index === 0 && solution.availableEnergyWh ? formatKwh(solution.availableEnergyWh / 1000) : 'Não informado'),
                            ],
                            [
                              'Potência',
                              battery
                                ? `${battery.standardPowerKw != null ? formatPtValue(battery.standardPowerKw, 'kW') : '-'} · pico ${battery.peakPowerKw != null ? formatPtValue(battery.peakPowerKw, 'kW') : '-'}`
                                : (solution.batteryPowerW ? formatKw(solution.batteryPowerW) : 'Não informado'),
                            ],
                            ['Quantidade', `${part.qty} un.`],
                            ['Garantia', battery ? `${battery.warrantyYears ?? 10} anos ou ${battery.warrantyCycles ?? 6000} ciclos` : 'Não informado'],
                            ...(battery?.expansionModel ? [['Expansão', battery.expansionModel] as [string, string]] : []),
                          ]}
                          appearance="summary"
                          onPreviewImage={setPreviewImage}
                          onPreviewDoc={setPreviewDoc}
                        />
                      );
                    })}
                  </div>
                  {solution.pvPowerKw != null && <SolutionValue icon={SolarPanel} label="Fotovoltaico recomendado" value={`${solution.pvPowerKw.toFixed(2)} kWp${solution.pvMonthlyGenerationKwh ? ` · ${solution.pvMonthlyGenerationKwh.toFixed(0)} kWh/mês` : ''}`} />}
                </CardContent>
              </Card>
              {accessoryGroups.length > 0 && (
                <Card>
                  <CardHeader className="pb-3"><h3 className="text-sm font-semibold">Acessórios</h3><p className="mt-0.5 text-xs text-muted-foreground">Itens inclusos ou recomendados para completar a instalação.</p></CardHeader>
                  <CardContent className="space-y-5 pt-0">
                    {accessoryGroups.map((group) => (
                      <section key={group.title} className="space-y-2.5 first:pt-0 first:border-t-0 first:mt-0 border-t border-border/60 pt-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
                          <span className="text-xs text-muted-foreground">{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}</span>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                          {group.items.map((item) => (
                            <CatalogProductCard
                              key={`${group.title}-${item.model}`}
                              fallbackIcon={<Package className="h-8 w-8 text-muted-foreground" />}
                              model={item.model}
                              nickname={productMedia[item.model]?.nickname}
                              imageUrl={productMedia[item.model]?.imageUrl ?? null}
                              documents={productMedia[item.model]?.documents ?? []}
                              description={productMedia[item.model]?.description ?? null}
                              specs={[['Quantidade', `${item.qty} un.`], ...(item.comment ? [['Observação', item.comment] as [string, string]] : [])]}
                              appearance="summary"
                              onPreviewImage={setPreviewImage}
                              onPreviewDoc={setPreviewDoc}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          {view === 'margins' && <div className="grid gap-3 sm:grid-cols-3">{marginRows.map((row) => { const delta = row.providedValue - row.requiredValue; const insufficient = delta < 0; return <Card key={row.key} className={cn(insufficient && 'border-destructive/50')}><CardContent className="p-4"><p className="text-sm font-medium">{row.label}</p><p className={cn('mt-2 text-xl font-semibold tabular-nums', insufficient ? 'text-destructive' : 'text-primary')}>{delta >= 0 ? '+' : '-'}{row.unit === 'W' ? formatKva(Math.abs(delta)) : formatKwh(Math.abs(delta) / 1000)}</p><p className="mt-2 text-xs text-muted-foreground">Necessário {row.unit === 'W' ? formatKva(row.requiredValue) : formatKwh(row.requiredValue / 1000)} · Solução {row.unit === 'W' ? formatKva(row.providedValue) : formatKwh(row.providedValue / 1000)}</p><StateBadge state={insufficient ? 'attention' : 'configured'} /></CardContent></Card>; })}</div>}
          {view === 'criteria' && <Card><CardHeader className="pb-3"><h3 className="text-sm font-semibold">Critérios considerados</h3></CardHeader><CardContent className="space-y-2 pt-0">{[
            ['Rede elétrica', residentialOptions.gridType ? gridLabels[residentialOptions.gridType] : 'Não configurada'],
            ['Cargas consideradas', `${residentialOptions.loads.length} cadastradas`],
            ['Recursos ativos', residentialOptions.desiredFeatures.map((id) => desiredFeatureLabel(id)).join(', ') || 'Nenhum'],
            ['Topologia da bateria', residentialOptions.topology || 'Não configurada'],
            ['Autonomia de referência', `${residentialOptions.operationHours} h de operação`],
          ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>)}</CardContent></Card>}
        </>
      )}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      {previewImage && <div role="dialog" aria-label="Pré-visualização do produto" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewImage(null)}><div className="relative h-[min(80vh,32rem)] w-full max-w-lg rounded-lg bg-background p-4" onClick={(event) => event.stopPropagation()}><Image src={previewImage.url} alt={previewImage.alt} fill sizes="90vw" className="object-contain p-6" /></div></div>}
    </div>
  );
}

function BudgetSection({
  solution,
  residentialOptions,
  services,
  onOpenBudget,
  quoteProject,
  client,
  profile,
  batteryCatalog,
  inverterCatalog,
  userStockItems,
  userServices,
  marginSettings,
  onUpdateStatus,
  onManageSuppliers,
  onOpenProfile,
  onManagePortfolio,
  onAddToStock,
  onUpdateStockItemValue,
  onUpdateServiceValue,
}: {
  solution: Solution | null;
  residentialOptions: ResidentialOptions;
  services: ProjectServiceLine[];
  onOpenBudget?: () => void;
  quoteProject?: SavedProject;
  client: Client | undefined;
  profile?: InlineProfile | null;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  marginSettings?: MarginSettings;
  onUpdateStatus?: (status: ProjectStatus) => void;
  onManageSuppliers?: () => void;
  onOpenProfile?: () => void;
  onManagePortfolio?: () => void;
  onAddToStock?: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
  onUpdateStockItemValue?: (id: string, unitValue: number) => Promise<void>;
  onUpdateServiceValue?: (id: string, unitValue: number) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <BudgetFinancialSummary
        solution={solution}
        residentialOptions={residentialOptions}
        services={services}
        userStockItems={userStockItems}
        userServices={userServices}
        marginSettings={marginSettings}
        batteryCatalog={batteryCatalog}
        onManagePortfolio={onManagePortfolio}
        onAddToStock={onAddToStock}
        onUpdateStockItemValue={onUpdateStockItemValue}
        onUpdateServiceValue={onUpdateServiceValue}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader className="flex flex-row items-start gap-4 pb-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShoppingCart className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold">Solicitar cotação ao fornecedor</h3>
              <span className="mt-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">até 2 fornecedores</span>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">Envie os itens do projeto para fornecedores selecionados e receba preços atualizados.</p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 pt-0">
            <div className="border-t pt-4">
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><span>Revise produtos e quantidades antes do envio.</span></li>
                <li className="flex items-center gap-3"><Clock3 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><span>Acompanhe o status e o histórico de cotações.</span></li>
              </ul>
            </div>
            {quoteProject && onManageSuppliers && onOpenProfile ? (
              <SupplierQuoteAction
                project={quoteProject}
                profile={profile ?? null}
                batteryCatalog={batteryCatalog}
                onManageSuppliers={onManageSuppliers}
                onOpenProfile={onOpenProfile}
                buttonLabel="Solicitar cotação"
                buttonVariant="outline"
                buttonIcon="send"
                className="mt-auto w-full border-primary text-primary hover:bg-primary/5 hover:text-primary"
              />
            ) : (
              <Button className="mt-auto w-full border-primary text-primary hover:bg-primary/5 hover:text-primary" variant="outline" disabled={!solution || !onOpenBudget} onClick={onOpenBudget}>
                <ReceiptText className="h-4 w-4" />
                Revisar solicitação
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="h-full border-primary/20 bg-primary/[0.025]">
          <CardHeader className="flex flex-row items-start gap-4 pb-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <UsersRound className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold">Compartilhar com o cliente</h3>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">Gere um link público com os detalhes da proposta para o cliente final.</p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 pt-0">
            <div className="border-t pt-4">
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3"><Link2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" /><span>O cliente pode consultar equipamentos, valores e responder à cotação pelo link enviado no WhatsApp.</span></li>
                <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" /><span>Link público e seguro, com visual profissional.</span></li>
              </ul>
            </div>
            {quoteProject && profile && marginSettings && onUpdateStatus ? (
              <QuoteShareButton
                project={quoteProject}
                client={client}
                profile={profile}
                batteryCatalog={batteryCatalog}
                inverterCatalog={inverterCatalog}
                userStockItems={userStockItems}
                userServices={userServices}
                marginSettings={marginSettings}
                onUpdateStatus={onUpdateStatus}
                className="mt-auto w-full bg-emerald-600 text-white shadow-sm transition-shadow hover:bg-emerald-700 hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
              />
            ) : (
              <Button className="mt-auto w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled title="Salve o projeto e cadastre o telefone do cliente para compartilhar a cotação.">
                <UserRound className="h-4 w-4" />
                Compartilhar cotação
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BudgetFinancialSummary({ solution, residentialOptions, services, userStockItems, userServices, marginSettings, batteryCatalog, onManagePortfolio, onAddToStock, onUpdateStockItemValue, onUpdateServiceValue }: {
  solution: Solution | null;
  residentialOptions: ResidentialOptions;
  services: ProjectServiceLine[];
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  marginSettings?: MarginSettings;
  batteryCatalog: BatteryCatalogOption[];
  onManagePortfolio?: () => void;
  onAddToStock?: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
  onUpdateStockItemValue?: (id: string, unitValue: number) => Promise<void>;
  onUpdateServiceValue?: (id: string, unitValue: number) => Promise<void>;
}) {
  const [priceItem, setPriceItem] = useState<MissingCostItem | null>(null);
  const estimate = calculateSystemCost(solution, userStockItems, services, userServices, marginSettings, batteryCatalog, residentialOptions);
  const serviceDetails = estimate.serviceDetails ?? [];
  const pricedServicesCount = serviceDetails.filter((detail) => detail.total != null).length;
  const serviceTotal = serviceDetails.reduce((total, detail) => total + (detail.total ?? 0), 0);
  const pricedProductsCount = estimate.pricedItemsCount - pricedServicesCount;
  const productTotal = estimate.totalCost - serviceTotal;
  const hasEstimate = estimate.pricedItemsCount > 0;
  const productItemsCount = Math.max(estimate.totalItemsCount - services.length, 0);
  const productValue = pricedProductsCount > 0 ? formatCurrencyBRL(productTotal) : solution ? 'Aguardando precificação' : '—';
  const serviceValue = services.length === 0
    ? formatCurrencyBRL(0)
    : pricedServicesCount > 0
      ? formatCurrencyBRL(serviceTotal)
      : 'Aguardando precificação';
  const productsNeedPricing = Boolean(solution && pricedProductsCount < productItemsCount);
  const servicesNeedPricing = services.length > 0 && pricedServicesCount < services.length;
  const hasMissingPrices = !estimate.isComplete && (productsNeedPricing || servicesNeedPricing);
  const actionableMissingItems = (estimate.missingCostItems ?? []).filter((item) => {
    if (item.type === 'product') return Boolean(item.productType && item.model && (onAddToStock || onUpdateStockItemValue));
    return Boolean(item.serviceId && userServices.some((service) => service.id === item.serviceId) && onUpdateServiceValue);
  });

  async function saveMissingPrice(item: MissingCostItem, unitValue: number) {
    if (item.type === 'product' && item.productType && item.model) {
      const existing = userStockItems.find((stockItem) => stockItem.productType === item.productType && stockItem.productModel === item.model);
      if (existing && onUpdateStockItemValue) {
        await onUpdateStockItemValue(existing.id, unitValue);
      } else if (onAddToStock) {
        await onAddToStock({ productType: item.productType, productModel: item.model, unitValue });
      }
      return;
    }

    if (item.type === 'service' && item.serviceId && onUpdateServiceValue) {
      await onUpdateServiceValue(item.serviceId, unitValue);
    }
  }

  return (
    <>
    <Card className="border-border/70">
      <CardHeader className="flex flex-row items-start gap-4 pb-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Wallet className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Resumo financeiro da aplicação</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Equipamentos, serviços e margens configuradas.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <dl className="grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-border/70">
          <div className="flex min-w-0 items-start gap-3 pb-1 sm:pr-5 sm:pb-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Investimento estimado</dt>
              <dd className={cn('mt-1 break-words text-xl font-semibold leading-tight tabular-nums', !hasEstimate && 'text-muted-foreground')}>{hasEstimate ? formatCurrencyBRL(estimate.totalCost) : 'Indisponível'}</dd>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-3 border-t pt-4 sm:border-t-0 sm:px-5 sm:pt-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Package className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Equipamentos</dt>
              <dd className={cn('mt-1 break-words text-xl font-semibold leading-tight tabular-nums', productValue === '—' && 'text-muted-foreground', productsNeedPricing && 'text-amber-700')}>{productValue}</dd>
              {productsNeedPricing && <span className="mt-2 inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">Precificação incompleta</span>}
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-3 border-t pt-4 sm:border-t-0 sm:pl-5 sm:pt-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Wrench className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Serviços</dt>
              <dd className={cn('mt-1 break-words text-xl font-semibold leading-tight tabular-nums', serviceValue === 'Aguardando precificação' && 'text-amber-700')}>{serviceValue}</dd>
              {servicesNeedPricing && <span className="mt-2 inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">Precificação incompleta</span>}
            </div>
          </div>
        </dl>
        {estimate.totalItemsCount > 0 && (
          <div className={cn('rounded-lg border p-4 text-xs', estimate.isComplete ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800' : 'border-amber-300/70 bg-amber-50/60 text-amber-900 dark:text-amber-200')}>
            {estimate.isComplete ? (
              <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /><span><span className="font-medium">Orçamento completo.</span> Todos os itens e serviços têm valor cadastrado.</span></p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-start gap-1.5 font-medium"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span>Valor parcial · {estimate.pricedItemsCount} de {estimate.totalItemsCount} itens/serviços precificados.</span></p>
                  <p className="mt-1 break-words text-muted-foreground">Falta precificar: {estimate.missingItems.join(', ')}</p>
                  {actionableMissingItems.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2" aria-label="Itens com preço pendente">
                      {actionableMissingItems.map((item) => {
                        const Icon = item.type === 'product' ? Package : Wrench;
                        const isAddedProduct = item.type === 'product'
                          && userStockItems.some((stockItem) => stockItem.productType === item.productType && stockItem.productModel === item.model);
                        const actionLabel = item.type === 'product' && !isAddedProduct ? 'Adicionar' : 'Definir preço';
                        return (
                          <Button
                            key={`${item.type}-${item.type === 'product' ? `${item.productType}-${item.model}` : item.serviceId}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-8 max-w-full rounded-full border-amber-300 bg-background px-3 py-1.5 text-left text-xs font-medium text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                            onClick={() => setPriceItem(item)}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="truncate">{actionLabel} · {item.model ?? item.name}</span>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {hasMissingPrices && onManagePortfolio && (
                  <Button type="button" variant="outline" size="sm" className="shrink-0 self-start border-amber-400 bg-background text-amber-800 hover:bg-amber-100 hover:text-amber-900 sm:self-center" onClick={onManagePortfolio}>
                    <Package className="h-4 w-4" aria-hidden="true" />
                    Ir para o Portfólio
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {!hasEstimate && estimate.totalItemsCount === 0 && (
          <p className="border-t pt-3 text-xs text-muted-foreground">Calcule a solução ou adicione serviços para visualizar os valores desta aplicação.</p>
        )}
      </CardContent>
    </Card>
    {priceItem && (
      <MissingPriceModal
        key={`${priceItem.type}-${priceItem.type === 'product' ? `${priceItem.productType}-${priceItem.model}` : priceItem.serviceId}`}
        item={priceItem}
        isNewProduct={priceItem.type === 'product' && !userStockItems.some((stockItem) => stockItem.productType === priceItem.productType && stockItem.productModel === priceItem.model)}
        onClose={() => setPriceItem(null)}
        onSave={(unitValue) => saveMissingPrice(priceItem, unitValue)}
      />
    )}
    </>
  );
}

function parseBudgetPrice(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function MissingPriceModal({ item, isNewProduct, onClose, onSave }: { item: MissingCostItem; isNewProduct: boolean; onClose: () => void; onSave: (unitValue: number) => Promise<void> }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = item.model ?? item.name;
  const isProduct = item.type === 'product';
  const title = isNewProduct ? 'Adicionar produto' : 'Definir preço';
  const description = isNewProduct
    ? 'Inclua este produto no Portfólio informando apenas o preço.'
    : 'Atualize o preço usado no resumo financeiro deste orçamento.';

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseBudgetPrice(value);
    if (parsed == null) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed);
      onClose();
    } catch {
      setError('Não foi possível salvar o preço. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="missing-price-title" aria-describedby="missing-price-description" className="w-full max-w-md overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {isProduct ? <Package className="h-5 w-5" aria-hidden="true" /> : <Wrench className="h-5 w-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{isProduct ? 'Produto' : 'Serviço'}</p>
              <h2 id="missing-price-title" className="mt-0.5 truncate text-lg font-semibold tracking-tight">{title}</h2>
              <p id="missing-price-description" className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
        <form className="space-y-5 p-5 sm:p-6" onSubmit={(event) => { void handleSubmit(event); }}>
          <div className="flex items-center gap-3 rounded-xl border bg-muted/25 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
              {isProduct ? <Package className="h-4 w-4" aria-hidden="true" /> : <Wrench className="h-4 w-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{isProduct ? 'Modelo selecionado' : 'Serviço selecionado'}</p>
              <p className="truncate text-sm font-semibold">{label}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="missing-price-value">Preço</Label>
            <div className="flex h-12 items-center rounded-xl border border-input bg-background px-3 shadow-sm transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
              <span className="text-sm font-medium text-muted-foreground" aria-hidden="true">R$</span>
              <input id="missing-price-value" type="text" inputMode="decimal" autoFocus placeholder="0,00" aria-label="Preço" value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9.,]/g, ''))} className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-base outline-none focus:ring-0" />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">Informe o valor unitário. Ele será usado no resumo financeiro do orçamento.</p>
          </div>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-10 sm:min-w-24" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="min-h-10 sm:min-w-32" disabled={parseBudgetPrice(value) == null || saving}>{saving ? 'Salvando...' : isNewProduct ? 'Adicionar produto' : 'Salvar preço'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReportSection({ solution, stale, onGenerateReport, generatingReport, lastReport, onDownloadLastReport, onClearLastReport }: {
  solution: Solution | null;
  stale: boolean;
  onGenerateReport?: () => void;
  generatingReport?: boolean;
  lastReport?: LivePdfReport | null;
  onDownloadLastReport?: () => void;
  onClearLastReport?: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const generatedAt = lastReport
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(lastReport.generatedAt)
    : null;

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">Relatório</h2><p className="text-sm text-muted-foreground">Gere o relatório usando os dados atuais do projeto.</p></div>
      {stale && solution && <div className="flex gap-2 rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>A solução está desatualizada. Recalcule antes de gerar um relatório atualizado.</span></div>}
      <Card>
        <CardHeader className="flex flex-row items-start gap-4 pb-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Relatório de dimensionamento</h3>
            <p className="mt-1 text-sm text-muted-foreground">O PDF reutiliza os cálculos, equipamentos e cargas do projeto.</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {lastReport ? (
            <div className="rounded-xl border border-primary/15 bg-primary/[0.025] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">Último relatório gerado</p>
                  <p className="mt-1 text-sm text-muted-foreground">Gerado em {generatedAt}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Disponível somente nesta sessão.</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">Prévia disponível</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Visualizar prévia
                </Button>
                {onDownloadLastReport && <Button type="button" variant="outline" onClick={onDownloadLastReport}><Download className="h-4 w-4" aria-hidden="true" />Baixar novamente</Button>}
                {onClearLastReport && <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => { setPreviewOpen(false); onClearLastReport(); }}><Trash2 className="h-4 w-4" aria-hidden="true" />Remover prévia</Button>}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-4">
              <p className="font-medium">{solution ? 'Nenhum relatório gerado nesta sessão' : 'Nenhuma solução disponível'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{solution ? 'Gere o relatório para disponibilizar uma prévia temporária nesta tela.' : 'Calcule uma solução para gerar o relatório de dimensionamento.'}</p>
            </div>
          )}
          <div className="flex justify-end border-t pt-4">
            <Button disabled={!solution || !onGenerateReport || Boolean(stale) || generatingReport} onClick={onGenerateReport}>
              {generatingReport ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
              {generatingReport ? 'Gerando relatório...' : lastReport ? 'Gerar nova versão' : 'Gerar relatório'}
            </Button>
          </div>
        </CardContent>
      </Card>
      {previewOpen && lastReport && <ReportPreviewModal report={lastReport} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}

function ReportPreviewModal({ report, onClose }: { report: LivePdfReport; onClose: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(report.blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the object URL is created only after the preview mounts
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [report]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="report-preview-title" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id="report-preview-title" className="font-semibold">Prévia do relatório</h2>
            <p className="mt-1 text-xs text-muted-foreground">Visualização temporária do último PDF gerado.</p>
          </div>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Fechar prévia" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 bg-muted/30 p-2 sm:p-4">
          {previewUrl ? <iframe title="Prévia do relatório" src={previewUrl} className="h-[min(76vh,52rem)] w-full rounded-lg border bg-white" /> : <div className="flex h-[min(76vh,52rem)] items-center justify-center text-sm text-muted-foreground">Carregando prévia...</div>}
        </div>
      </div>
    </div>
  );
}
