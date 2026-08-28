'use client';

import { useState } from 'react';
import {
  BatteryCharging,
  Calculator,
  ChevronRight,
  Gauge,
  Mail,
  MapPin,
  PanelTop,
  Phone,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatAddress, isAddressEmpty } from '@/lib/address';
import type { Client, MarginSettings, ProjectStatus, SavedProject, UserServiceItem, UserStockItem } from '@/lib/types';
import {
  batteryQuantityBreakdown,
  calculateSystemCost,
  servicePricingUnitLabel,
  formatCurrencyBRL,
  normalizeAccessoryLine,
  solutionMetrics,
} from '../../helpers';
import { Metric } from '../../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InlineProfile, InverterCatalogOption } from '../../types';
import { gridLabels } from '../../types';
import { ProjectEventsTimeline } from './ProjectEventsTimeline';
import { ProjectStatusSelect } from './ProjectStatusSelect';
import { QuoteShareButton } from './QuoteShareButton';
import { SupplierQuoteAction } from './SupplierQuoteAction';

/** A product's category label, its nickname/model (with quantity, if any),
 * and — only when a nickname is set — the bare model code as a small
 * caption underneath, so a long nickname + model pair doesn't get crammed
 * onto one line next to the category label. */
function ProductNameLine({
  category,
  model,
  nickname,
  suffix,
  detail,
}: {
  category: string;
  model: string;
  nickname?: string | null;
  suffix?: string;
  detail?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-foreground">{category}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      <p className="text-sm font-medium text-foreground">
        {nickname || model}
        {suffix}
      </p>
      {nickname && <p className="text-[0.7rem] font-mono text-muted-foreground">{model}</p>}
    </div>
  );
}

/** Rich, read-only summary of a saved project — either one selected from the
 * list ("Abrir"'s own live editor is a separate flow) or the one currently
 * being edited in place, so the sidebar shows the exact same actions and
 * data regardless of how the user got there. Rendered in the shell's
 * summary panel in place of the "Configuração salva junto" summary, which
 * is now only shown for a brand-new, not-yet-saved draft. */
export function SelectedProjectSummary({
  project,
  client,
  profile,
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
  userStockItems,
  userServices,
  marginSettings,
  onClose,
  onOpenSizing,
  onOpenWorkspace,
  onUpdateStatus,
  onManageSuppliers,
  onOpenProfile,
}: {
  project: SavedProject;
  client: Client | undefined;
  profile: InlineProfile | null;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  marginSettings: MarginSettings;
  /** Omitted while editing this project in place (no "unselect" concept
   *  there — "Fechar" on the draft card itself is what exits editing,
   *  complete with its own discard confirmation when dirty). */
  onClose?: () => void;
  onOpenSizing: () => void;
  onOpenWorkspace?: () => void;
  onUpdateStatus: (status: ProjectStatus) => void;
  /** Sends the seller to Fornecedores — used by the supplier quote-request modal
   *  when they haven't picked any suppliers there yet. */
  onManageSuppliers: () => void;
  onOpenProfile: () => void;
}) {
  const metrics = project.solution ? solutionMetrics(project.solution, batteryCatalog) : null;
  const systemCost =
    project.solution || project.services.length > 0
      ? calculateSystemCost(project.solution, userStockItems, project.services, userServices, marginSettings, batteryCatalog, project.residentialOptions)
      : null;
  const batteryParts = project.solution
    ? batteryQuantityBreakdown(
        project.solution.batteryModel,
        project.solution.batteryQty,
        batteryCatalog,
        (project.solution.inverterQty ?? 1) * (project.solution.batteryPortsUsed ?? 1)
      )
    : [];
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);

  return (
    <>
      <div className="-mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold">{project.name}</h2>
            <ProjectStatusSelect status={project.status} onChange={onUpdateStatus} />
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3 shrink-0" />
            <span className="truncate">{client?.name || 'Cliente não informado'}</span>
          </p>
          {client?.phone && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{client.phone}</span>
            </p>
          )}
          {client?.email && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{client.email}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onClose && (
            <Button variant="ghost" size="icon-sm" aria-label="Fechar resumo do projeto" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!isAddressEmpty(project.address) && (
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0">{formatAddress(project.address)}</span>
        </p>
      )}

      {metrics && project.solution && (
        <>
          <Separator />
          <div className="grid grid-cols-3 gap-2">
            <Metric
              icon={Gauge}
              label="Nominal"
              value={metrics.nominalW != null ? (metrics.nominalW / 1000).toFixed(2) : '-'}
              unit="kVA"
            />
            <Metric
              icon={Zap}
              label="Máxima"
              value={metrics.peakW != null ? (metrics.peakW / 1000).toFixed(2) : '-'}
              unit="kVA"
            />
            <Metric icon={BatteryCharging} label="Energia" value={metrics.energyKwh.toFixed(2)} unit="kWh" />
          </div>
          <div className="space-y-2.5 rounded-lg border bg-background p-2.5 text-xs text-muted-foreground">
            <div className="space-y-2.5">
              <ProductNameLine
                category="Inversor"
                model={project.solution.inverterModel}
                nickname={inverterCatalog.find((item) => item.model === project.solution?.inverterModel)?.nickname}
                detail={`${project.residentialOptions.gridType ? gridLabels[project.residentialOptions.gridType] : 'Rede não informada'} · ${metrics.nominalW != null ? `${(metrics.nominalW / 1000).toFixed(2)} kVA` : 'potência não informada'}`}
              />
              {batteryParts.map((part, index) => (
                <ProductNameLine
                  key={part.model}
                  category={index === 0 ? 'Bateria' : 'Bateria (expansão)'}
                  model={part.model}
                  nickname={batteryCatalog.find((item) => item.model === part.model)?.nickname}
                  suffix={` × ${part.qty}`}
                />
              ))}
              {project.solution.pvPowerKw ? (
                <p>
                  Fotovoltaico <span className="font-medium text-foreground">{project.solution.pvPowerKw.toFixed(2)} kWp</span>
                </p>
              ) : null}
            </div>

            {project.solution.accessories.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2.5">
                  <p className="font-medium text-foreground">Acessórios</p>
                  {project.solution.accessories.map((accessory) => {
                    const { model, qty, optional, bundled, appliesTo } = normalizeAccessoryLine(accessory);
                    const nickname = accessoryCatalog.find((item) => item.model === model)?.nickname;
                    return (
                      <div key={model} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-foreground">
                            {nickname || model}
                            {qty !== 1 ? ` × ${qty}` : ''}
                          </p>
                          {nickname && <p className="truncate text-[0.7rem]">{model}</p>}
                        </div>
                        <span className="shrink-0 text-[0.7rem]">
                          {bundled
                            ? appliesTo === 'inverter'
                              ? 'Incluso no inversor'
                              : appliesTo === 'battery'
                                ? 'Incluso na bateria'
                                : 'Incluso'
                            : optional
                              ? 'Opcional'
                              : 'Obrigatório'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {!project.solution && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Este projeto ainda não tem uma solução calculada.
        </p>
      )}

      {((systemCost && systemCost.pricedItemsCount > 0) || project.services.length > 0) && (
        <>
          <Separator />
          <div className="space-y-2.5 rounded-lg border bg-background p-2.5">
            {systemCost && systemCost.pricedItemsCount > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Valor da solução</p>
                <p className="text-lg font-semibold">{formatCurrencyBRL(systemCost.totalCost)}</p>
                {!systemCost.isComplete && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Preço parcial: {systemCost.pricedItemsCount} de {systemCost.totalItemsCount} itens com valor no
                    estoque.
                  </p>
                )}
              </div>
            )}

            {project.services.length > 0 && (
              <>
                {systemCost && systemCost.pricedItemsCount > 0 && <Separator />}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Serviços</p>
                  {project.services.map((line) => {
                    const detail = systemCost?.serviceDetails?.find((item) => item.serviceId === line.serviceId);
                    return (
                      <div key={line.serviceId} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {line.name}
                          {detail?.quantity != null ? ` × ${detail.quantity.toFixed(2).replace(/\.00$/, '')} ${servicePricingUnitLabel(detail.pricingUnit)}` : ''}
                        </span>
                        <span className="shrink-0">
                          {detail?.total != null ? formatCurrencyBRL(detail.total) : 'sem preço'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      <Separator />

      {onOpenWorkspace && (
        <Button size="lg" className="w-full shadow-sm transition-shadow hover:shadow-md" onClick={onOpenWorkspace}>
          <PanelTop className="h-4 w-4" />
          Abrir Workspace
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {!onOpenWorkspace && (
        <Button size="lg" className="w-full shadow-sm transition-shadow hover:shadow-md" onClick={onOpenSizing}>
          <Calculator className="h-4 w-4" />
          Abrir solução técnica
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      <QuoteShareButton
        project={project}
        client={client}
        profile={profile}
        batteryCatalog={batteryCatalog}
        inverterCatalog={inverterCatalog}
        userStockItems={userStockItems}
        userServices={userServices}
        marginSettings={marginSettings}
        onUpdateStatus={onUpdateStatus}
        onShared={() => setEventsRefreshKey((key) => key + 1)}
        className="w-full bg-emerald-600 text-white shadow-sm transition-shadow hover:bg-emerald-700 hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
      />

      <SupplierQuoteAction
        project={project}
        profile={profile}
        batteryCatalog={batteryCatalog}
        onSent={() => setEventsRefreshKey((key) => key + 1)}
        onManageSuppliers={onManageSuppliers}
        onOpenProfile={onOpenProfile}
        buttonLabel="Solicitar orçamento ao fornecedor"
        buttonVariant="outline"
        buttonIcon="send"
        className="w-full border-primary/25 text-primary hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
      />

      <Separator />
      <ProjectEventsTimeline projectId={project.id} refreshKey={`${project.updatedAt}:${eventsRefreshKey}`} />
      <p className="text-xs text-muted-foreground">
        Atualizado em{' '}
        {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(project.updatedAt))}
      </p>
    </>
  );
}
