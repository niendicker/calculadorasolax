'use client';

import { BatteryCharging, Gauge, MapPin, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { Address, MarginSettings, SavedProject, UserServiceItem, UserStockItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  batteryQuantityBreakdown,
  calculateSystemCost,
  servicePricingUnitLabel,
  formatCurrencyBRL,
  normalizeAccessoryLine,
  solutionMetrics,
} from '../../helpers';
import { Metric } from '../../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../../types';
import { ProjectEventsTimeline } from './ProjectEventsTimeline';

/** Compact "Bairro · Cidade/Estado · CEP" line for the summary header —
 *  the full multi-line address (street/number/complement) lives in the PDF
 *  report and the shareable text (see formatAddress), not here. */
function formatAddressSummaryLine(address: Address): string {
  const cityState = address.city && address.state ? `${address.city}/${address.state}` : address.city || address.state;
  return [address.district, cityState, address.postalCode].filter(Boolean).join(' · ');
}

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
  showCaption = true,
}: {
  category: string;
  model: string;
  nickname?: string | null;
  suffix?: string;
  detail?: string;
  /** Set false to always show a single nickname-or-model line with no model
   *  caption underneath — e.g. the Inversor line, which doesn't need the
   *  model code repeated below its nickname. */
  showCaption?: boolean;
}) {
  // A catalog nickname is sometimes just a copy of the model code — treat
  // that the same as having no nickname at all: uppercase it like any other
  // model code, and skip the caption underneath so it isn't repeated.
  const displayName = nickname || model;
  const isModelCode = displayName === model;
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-foreground">{category}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      <p className={cn('text-sm font-medium text-foreground', isModelCode && 'uppercase')}>
        {displayName}
        {suffix}
      </p>
      {showCaption && !isModelCode && <p className="text-[0.7rem] font-mono uppercase text-muted-foreground">{model}</p>}
    </div>
  );
}

/** Rich, read-only summary of a saved project — either one selected from the
 * list ("Abrir"'s own live editor is a separate flow) or the one currently
 * being edited in place, so the sidebar shows the exact same data
 * regardless of how the user got there. Rendered in the shell's
 * summary panel in place of the "Configuração salva junto" summary, which
 * is now only shown for a brand-new, not-yet-saved draft. */
export function SelectedProjectSummary({
  project,
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
  userStockItems,
  userServices,
  marginSettings,
  onClose,
}: {
  project: SavedProject;
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
}) {
  const addressSummaryLine = formatAddressSummaryLine(project.address);
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

  return (
    <>
      <div className="-mt-2 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">{project.name}</h2>
        <div className="flex shrink-0 items-center gap-1">
          {onClose && (
            <Button variant="ghost" size="icon-sm" aria-label="Fechar resumo do projeto" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {addressSummaryLine && (
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0">{addressSummaryLine}</span>
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
                showCaption={false}
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
                    const displayName = nickname || model;
                    const isModelCode = displayName === model;
                    return (
                      <div key={model} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={cn('truncate text-foreground', isModelCode && 'uppercase')}>
                            {displayName}
                            {qty !== 1 ? ` × ${qty}` : ''}
                          </p>
                          {!isModelCode && <p className="truncate text-[0.7rem] uppercase">{model}</p>}
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
      <ProjectEventsTimeline projectId={project.id} refreshKey={project.updatedAt} />
      <p className="text-xs text-muted-foreground">
        Atualizado em{' '}
        {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(project.updatedAt))}
      </p>
    </>
  );
}
