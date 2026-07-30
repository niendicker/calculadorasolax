'use client';

import { useState } from 'react';
import { Battery, BatteryCharging, FileText, Gauge, Package, Plug, Sun, TrendingUp, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { batteryQuantityBreakdown } from '@/lib/battery-quantity-breakdown';
import type {
  DesiredFeatureId,
  MarginSettings,
  MicrogridConfig,
  ProductDocument,
  PvConfig,
  Solution,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  buildMarginSummary,
  calculateSystemCost,
  calculateTariffSavings,
  formatCurrencyBRL,
  normalizeAccessoryLine,
  solutionMetrics,
  type MarginRow,
} from '../../helpers';
import { DocPreviewModal, ImagePreviewModal, Metric, ProductAttachments, ProductImage } from '../../shared-ui';
import type { BatteryCatalogOption, ProductMedia } from '../../types';

/** The Solução tab's top metric cards — pulled out of ResultSummary so they
 * can be rendered in the sticky header above it, alongside the Resumo tab's
 * own cards, keeping both tabs' top metrics pinned while their tab-specific
 * content scrolls underneath. */
export function SolutionMetricCards({
  solution,
  batteryCatalog,
}: {
  solution: Solution;
  batteryCatalog: BatteryCatalogOption[];
}) {
  const metrics = solutionMetrics(solution, batteryCatalog);
  return (
    <div className="grid grid-cols-3 gap-2">
      <Metric
        icon={Gauge}
        label="Nominal"
        value={metrics.nominalW != null ? (metrics.nominalW / 1000).toFixed(2) : '-'}
        unit="kVA"
        accent
      />
      <Metric
        icon={Zap}
        label="Máxima"
        value={metrics.peakW != null ? (metrics.peakW / 1000).toFixed(2) : '-'}
        unit="kVA"
        accent
      />
      <Metric icon={BatteryCharging} label="Energia" value={metrics.energyKwh.toFixed(2)} unit="kWh" accent />
    </div>
  );
}

function formatMarginValue(value: number, unit: 'W' | 'Wh') {
  const kiloValue = value / 1000;
  return unit === 'W' ? `${kiloValue.toFixed(2)} kVA` : `${kiloValue.toFixed(2)} kWh`;
}

/** Shows how much slack the recommended solution has over what the customer
 * actually needs on each gating dimension, highlighting whichever one has
 * the least slack — the real reason a bigger/smaller solution wasn't picked
 * instead. A negative margin means the solution doesn't actually meet that
 * requirement — the Edge Function intentionally falls back to the largest
 * available combination when nothing fully qualifies (see
 * calculate-residential/logic.ts's rankByLeastShortfall), so this is a real,
 * expected outcome, not an anomaly; it's called out distinctly (destructive
 * styling) and blocks PDF export (see hasInsufficientSolution in SizingTab)
 * until the customer adjusts the configuration. */
function MarginSummary({ rows }: { rows: MarginRow[] }) {
  if (rows.length === 0) return null;

  const withMargin = rows.map((row) => ({
    ...row,
    marginPct: row.requiredValue > 0 ? ((row.providedValue - row.requiredValue) / row.requiredValue) * 100 : null,
  }));

  const decisiveKey = withMargin.reduce<{ key: string; marginPct: number } | null>((tightest, row) => {
    if (row.marginPct === null) return tightest;
    if (!tightest || row.marginPct < tightest.marginPct) return { key: row.key, marginPct: row.marginPct };
    return tightest;
  }, null)?.key;

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Gauge className="h-4 w-4 text-primary" />
        Margem sobre a necessidade do cliente
      </div>
      <div className="mt-2 space-y-2">
        {withMargin.map((row) => {
          const isDecisive = row.key === decisiveKey;
          const insufficient = row.marginPct !== null && row.marginPct < 0;
          return (
            <div
              key={row.key}
              className={cn('rounded-md px-2 py-1.5', isDecisive && 'bg-primary/5 ring-1 ring-primary/20')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {row.label}
                  {isDecisive && (
                    <Badge variant={insufficient ? 'destructive' : 'secondary'} className="text-[0.65rem]">
                      {insufficient ? 'Insuficiente' : 'Fator decisivo'}
                    </Badge>
                  )}
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', insufficient ? 'text-destructive' : 'text-primary')}>
                  {row.marginPct !== null ? `${row.marginPct >= 0 ? '+' : ''}${row.marginPct.toFixed(0)}%` : '—'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Necessário {formatMarginValue(row.requiredValue, row.unit)} · Solução oferece{' '}
                {formatMarginValue(row.providedValue, row.unit)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ResultSummary({
  solution,
  batteryCatalog,
  onExport,
  canExport,
  productMedia,
  userStockItems,
  marginSettings,
  whiteTariff,
  pv,
  onChooseMicrogridVariant,
  desiredFeatures,
  microgrid,
  nominalW,
  peakW,
  dailyKwh,
}: {
  solution: Solution;
  batteryCatalog: BatteryCatalogOption[];
  onExport: () => void;
  canExport: boolean;
  productMedia: Record<string, ProductMedia>;
  userStockItems: UserStockItem[];
  marginSettings: MarginSettings;
  whiteTariff: WhiteTariffConfig | null;
  pv: PvConfig | null;
  onChooseMicrogridVariant: (variant: 'economic' | 'microgrid') => void;
  desiredFeatures: DesiredFeatureId[];
  microgrid: MicrogridConfig | null;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const inverterMedia = productMedia[solution.inverterModel];
  const totalBatteryPorts = (solution.inverterQty ?? 1) * (solution.batteryPortsUsed ?? 1);
  const batteryParts = batteryQuantityBreakdown(solution.batteryModel, solution.batteryQty, batteryCatalog, totalBatteryPorts);
  const systemCost = calculateSystemCost(solution, userStockItems, undefined, undefined, marginSettings);
  const tariffSavings = calculateTariffSavings(whiteTariff, {
    totalMonthlyConsumptionKwh: pv?.monthlyConsumptionKwh ?? null,
    availableEnergyWh: solution.availableEnergyWh ?? 0,
    pvMonthlyGenerationKwh: solution.pvMonthlyGenerationKwh,
  });

  if (solution.microgridAlternative) {
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

  const marginRows = buildMarginSummary({ desiredFeatures, whiteTariff, microgrid, pv, nominalW, peakW, dailyKwh, solution });

  return (
    <div className="space-y-3">
      <MarginSummary rows={marginRows} />
      <div className="rounded-lg border bg-background p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_88px]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-4 w-4 text-accent" />
              Inversor
            </div>
            {inverterMedia?.nickname ? (
              <>
                <p className="mt-1 text-lg font-bold">{inverterMedia.nickname}</p>
                <p className="text-xs text-muted-foreground">{solution.inverterModel}</p>
              </>
            ) : (
              <p className="mt-1 text-lg font-semibold">{solution.inverterModel}</p>
            )}
            {(solution.inverterQty ?? 1) !== 1 && (
              <p className="mt-2 text-sm text-muted-foreground">{solution.inverterQty} unidades</p>
            )}
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Plug className="h-3.5 w-3.5" />
              {totalBatteryPorts} {totalBatteryPorts === 1 ? 'porta de bateria' : 'portas de bateria'}
            </p>
            <ProductAttachments media={inverterMedia} onPreview={setPreviewDoc} />
          </div>
          <ProductImage media={inverterMedia} onPreviewImage={setPreviewImage} />
        </div>
      </div>

      {batteryParts.map((part, index) => {
        const partMedia = productMedia[part.model];
        return (
          <div key={part.model} className="rounded-lg border bg-background p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_88px]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Battery className="h-4 w-4 text-primary" />
                  {index === 0 ? 'Bateria' : 'Bateria (expansão)'}
                </div>
                {partMedia?.nickname ? (
                  <>
                    <p className="mt-1 text-lg font-bold">{partMedia.nickname}</p>
                    <p className="text-xs text-muted-foreground">{part.model}</p>
                  </>
                ) : (
                  <p className="mt-1 text-lg font-semibold">{part.model}</p>
                )}
                {part.qty !== 1 && <p className="mt-2 text-sm text-muted-foreground">{part.qty} unidades</p>}
                {totalBatteryPorts > 1 && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Plug className="h-3.5 w-3.5" />
                    {part.qty / totalBatteryPorts} baterias/porta
                  </p>
                )}
                <ProductAttachments media={partMedia} onPreview={setPreviewDoc} />
              </div>
              <ProductImage media={partMedia} onPreviewImage={setPreviewImage} />
            </div>
          </div>
        );
      })}

      {solution.pvPowerKw !== null && (
        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sun className="h-4 w-4 text-primary" />
            FV recomendado
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-lg font-semibold">{solution.pvPowerKw.toFixed(2)} kWp</p>
            {solution.pvMonthlyGenerationKwh != null && (
              <p className="text-sm text-muted-foreground">
                · {solution.pvMonthlyGenerationKwh.toFixed(0)} kWh/mês estimados
              </p>
            )}
          </div>
        </div>
      )}

      {solution.accessories.length > 0 && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Acessórios</p>
          <div className="mt-2 space-y-2">
            {solution.accessories.map((accessory) => {
              const { model, qty, optional, comment, bundled } = normalizeAccessoryLine(accessory);
              return (
                <div key={model} className="relative rounded-lg border bg-muted/30 p-3">
                  {bundled ? (
                    <Badge variant="secondary" className="absolute right-2 top-2">
                      <Package className="h-3 w-3" />
                      Incluso
                    </Badge>
                  ) : (
                    <Badge variant={optional ? 'outline' : 'default'} className="absolute right-2 top-2">
                      {optional ? 'Opcional' : 'Obrigatório'}
                    </Badge>
                  )}
                  <div className="grid gap-3 sm:grid-cols-[1fr_88px]">
                    <div className="flex min-w-0 flex-col">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">{productMedia[model]?.nickname || model}</Badge>
                      </div>
                      {productMedia[model]?.nickname && (
                        // pl-2 lines this up with the Badge's own text, which sits inset by its px-2.
                        <p className="mt-1.5 pl-2 text-xs text-muted-foreground">{model}</p>
                      )}
                      {productMedia[model]?.description && (
                        <p className="mt-1 pl-2 text-xs text-muted-foreground">{productMedia[model].description}</p>
                      )}
                      {qty !== 1 && <p className="mt-2 pl-2 text-sm text-muted-foreground">{qty} unidades</p>}
                      {comment && <p className="mt-1 pl-2 text-xs text-muted-foreground">{comment}</p>}
                      <ProductAttachments media={productMedia[model]} onPreview={setPreviewDoc} inline className="mt-auto pt-1" />
                    </div>
                    <ProductImage media={productMedia[model]} onPreviewImage={setPreviewImage} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(systemCost.pricedItemsCount > 0 || tariffSavings) && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Análise econômica</p>
          <div className="mt-2 space-y-2 text-sm">
            {systemCost.pricedItemsCount > 0 && (
              <div>
                <p className="text-muted-foreground">Custo total do sistema</p>
                <p className="text-lg font-semibold">{formatCurrencyBRL(systemCost.totalCost)}</p>
                {!systemCost.isComplete && (
                  <p className="text-xs text-muted-foreground">
                    Preço parcial ({systemCost.pricedItemsCount} de {systemCost.totalItemsCount} itens no catálogo)
                  </p>
                )}
              </div>
            )}
            {tariffSavings && (
              <div className="flex items-center gap-2.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-muted-foreground">Ganho com SolaX</p>
                  <p className="text-lg font-semibold text-primary">{formatCurrencyBRL(tariffSavings.annualSavings)}/ano</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrencyBRL(tariffSavings.monthlySavings)}/mês · {tariffSavings.businessDaysPerMonth} dias úteis/mês
                  </p>
                  {tariffSavings.pvMonthlySavings > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Sun className="h-3.5 w-3.5 shrink-0" />
                      dos quais {formatCurrencyBRL(tariffSavings.pvMonthlySavings)}/mês de geração solar
                    </p>
                  )}
                  {tariffSavings.monthlyCostWithoutSolaxBrl != null && tariffSavings.monthlyCostWithSolaxBrl != null && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Sem SolaX: {formatCurrencyBRL(tariffSavings.monthlyCostWithoutSolaxBrl)}/mês · Com SolaX:{' '}
                      {formatCurrencyBRL(tariffSavings.monthlyCostWithSolaxBrl)}/mês
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Button className="w-full" variant="outline" onClick={onExport} disabled={!canExport}>
        <FileText className="h-4 w-4" />
        Baixar relatório
      </Button>

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function MicrogridVariantChoice({
  economic,
  withMicrogrid,
  onChoose,
  productMedia,
  batteryCatalog,
}: {
  economic: Solution;
  withMicrogrid: Solution;
  onChoose: (variant: 'economic' | 'microgrid') => void;
  productMedia: Record<string, ProductMedia>;
  batteryCatalog: BatteryCatalogOption[];
}) {
  const options: { variant: 'economic' | 'microgrid'; label: string; description: string; solution: Solution }[] = [
    {
      variant: 'economic',
      label: 'Versão Econômica',
      description: 'Menor sistema que atende às cargas e demais funcionalidades, sem garantir a microrrede.',
      solution: economic,
    },
    {
      variant: 'microgrid',
      label: 'Versão c/ Microrrede',
      description: 'Sistema dimensionado para suportar o sistema ongrid junto com a microrrede.',
      solution: withMicrogrid,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <p className="text-sm font-medium">Escolha uma versão do sistema</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A Microrrede não é um requisito fundamental e exigi-la deixaria o sistema maior que o necessário. Compare
          as duas opções abaixo e escolha qual usar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const batteryParts = batteryQuantityBreakdown(
            option.solution.batteryModel,
            option.solution.batteryQty,
            batteryCatalog,
            (option.solution.inverterQty ?? 1) * (option.solution.batteryPortsUsed ?? 1)
          );
          return (
            <div key={option.variant} className="flex flex-col gap-3 rounded-lg border bg-background p-3">
              <div>
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Inversor</p>
                  <p className="font-medium">
                    {productMedia[option.solution.inverterModel]?.nickname || option.solution.inverterModel} · x
                    {option.solution.inverterQty ?? 1}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bateria</p>
                  <p className="font-medium">
                    {batteryParts.length > 1
                      ? batteryParts.map((part) => `${part.qty}× ${productMedia[part.model]?.nickname || part.model}`).join(' + ')
                      : `${productMedia[option.solution.batteryModel]?.nickname || option.solution.batteryModel} · x${option.solution.batteryQty}`}
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => onChoose(option.variant)}>
                Usar esta versão
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
