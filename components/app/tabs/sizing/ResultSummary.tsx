'use client';

import { useState } from 'react';
import { AlertTriangle, Battery, BatteryCharging, ChevronDown, Gauge, Package, Plug, Sun, TrendingUp, Wallet, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { batteryQuantityBreakdown } from '@/lib/battery-quantity-breakdown';
import type {
  DesiredFeatureId,
  MarginSettings,
  MicrogridConfig,
  ProjectServiceLine,
  ProductDocument,
  PvConfig,
  Solution,
  UserStockItem,
  UserServiceItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  buildMarginSummary,
  calculateSystemCost,
  calculateDegradedPaybackMonths,
  calculateTariffSavings,
  formatCurrencyBRL,
  normalizeAccessoryLine,
  solutionMetrics,
  type MarginRow,
} from '../../helpers';
import { DocPreviewModal, ImagePreviewModal, Metric, ProductAttachments, ProductImage } from '../../shared-ui';
import type { BatteryCatalogOption, InverterCatalogOption, ProductMedia } from '../../types';

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

/** Signed headroom in the row's own unit (e.g. "+0.85 kVA") — shown instead of
 * a relative percentage so the number reads as a concrete amount of slack
 * rather than an abstract ratio that's hard to compare against the
 * "Necessário"/"Solução oferece" values right below it. */
function formatMarginDelta(value: number, unit: 'W' | 'Wh') {
  const formatted = formatMarginValue(Math.abs(value), unit);
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
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
                  {row.marginPct !== null ? formatMarginDelta(row.providedValue - row.requiredValue, row.unit) : '-'}
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
  inverterCatalog,
  productMedia,
  userStockItems,
  services,
  userServices,
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
  inverterCatalog: InverterCatalogOption[];
  productMedia: Record<string, ProductMedia>;
  userStockItems: UserStockItem[];
  services: ProjectServiceLine[];
  userServices: UserServiceItem[];
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
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const inverterMedia = productMedia[solution.inverterModel];
  const batteryPerformance = batteryCatalog.find((item) => item.model === solution.batteryModel);
  const inverterPerformance = inverterCatalog.find((item) => item.model === solution.inverterModel);
  const totalBatteryPorts = (solution.inverterQty ?? 1) * (solution.batteryPortsUsed ?? 1);
  const batteryParts = batteryQuantityBreakdown(solution.batteryModel, solution.batteryQty, batteryCatalog, totalBatteryPorts);
  const systemCost = calculateSystemCost(
    solution,
    userStockItems,
    services,
    userServices,
    marginSettings,
    batteryCatalog
  );
  const tariffSavings = calculateTariffSavings(whiteTariff, {
    totalMonthlyConsumptionKwh: whiteTariff?.totalMonthlyConsumptionKwh || pv?.monthlyConsumptionKwh || null,
    availableEnergyWh: solution.availableEnergyWh ?? 0,
    pvMonthlyGenerationKwh: solution.pvMonthlyGenerationKwh,
    batteryRoundTripEfficiencyPercent: batteryPerformance?.roundTripEfficiencyPercent ?? 95,
    inverterChargeEfficiencyPercent: inverterPerformance?.batteryChargeEfficiencyPercent ?? 97,
    inverterDischargeEfficiencyPercent: inverterPerformance?.batteryDischargeEfficiencyPercent ?? 97,
    initialSohPercent: batteryPerformance?.initialSohPercent ?? 100,
    annualSohLossPercent: batteryPerformance?.annualSohLossPercent ?? 2,
    standbyConsumptionW: inverterPerformance?.standbyConsumptionW ?? 0,
    maxBatteryDischargePowerW: inverterPerformance?.maxBatteryDischargePowerW ?? null,
    maxBatteryChargePowerW: inverterPerformance?.maxBatteryChargePowerW ?? null,
  });
  const canShowPayback = Boolean(
    systemCost.isComplete &&
      systemCost.totalCost > 0 &&
      tariffSavings &&
      tariffSavings.tariffOrderValid &&
      tariffSavings.annualSavings > 0
  );
  const paybackMonths = canShowPayback && tariffSavings
    ? calculateDegradedPaybackMonths(systemCost.totalCost, tariffSavings)
    : null;
  const paybackLabel = paybackMonths
    ? `${Math.floor(paybackMonths / 12)} ${Math.floor(paybackMonths / 12) === 1 ? 'ano' : 'anos'}${
        paybackMonths % 12 ? ` e ${paybackMonths % 12} ${paybackMonths % 12 === 1 ? 'mês' : 'meses'}` : ''
      }`
    : null;

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
                    <Badge variant="secondary" className="absolute right-2 top-2 z-10">
                      <Package className="h-3 w-3" />
                      Incluso
                    </Badge>
                  ) : (
                    <Badge variant={optional ? 'outline' : 'default'} className="absolute right-2 top-2 z-10">
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
        <div className="rounded-xl border bg-background p-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold">Análise financeira estimada</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Investimento e economia projetados para o primeiro ano.</p>

          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-2">
            {systemCost.pricedItemsCount > 0 && (
              <div className="min-w-0 overflow-hidden rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Investimento estimado</p>
                <p className="break-words text-base font-semibold leading-tight tabular-nums [overflow-wrap:anywhere] sm:text-lg">
                  {formatCurrencyBRL(systemCost.totalCost)}
                </p>
                {!systemCost.isComplete && (
                  <p className="mt-1 break-words text-xs text-amber-700 [overflow-wrap:anywhere] dark:text-amber-300">
                    Valor parcial · {systemCost.pricedItemsCount} de {systemCost.totalItemsCount} modelos/serviços
                  </p>
                )}
              </div>
            )}
            {tariffSavings?.tariffOrderValid && (
              <div className="flex min-w-0 items-start gap-2.5 overflow-hidden rounded-lg border border-primary/30 bg-primary/5 p-3">
                <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Ganho com SolaX</p>
                  <p className="break-words text-base font-semibold leading-tight text-primary tabular-nums [overflow-wrap:anywhere] sm:text-lg">
                    {formatCurrencyBRL(tariffSavings.annualSavings)}/ano
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {formatCurrencyBRL(tariffSavings.monthlySavings)}/mês · {tariffSavings.businessDaysPerMonth} dias úteis/mês
                  </p>
                  {tariffSavings.pvMonthlySavings > 0 && (
                    <p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      dos quais {formatCurrencyBRL(tariffSavings.pvMonthlySavings)}/mês de geração solar
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="min-w-0 overflow-hidden rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Retorno simples estimado</p>
              <p className="break-words text-base font-semibold leading-tight tabular-nums [overflow-wrap:anywhere] sm:text-lg">
                {paybackLabel ?? 'Indisponível'}
              </p>
              {!canShowPayback && (
                <p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  Exige orçamento completo e economia positiva.
                </p>
              )}
            </div>
          </div>

          {systemCost.missingItems.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <p className="font-medium text-amber-800 dark:text-amber-300">Falta precificar</p>
              <p className="mt-1 text-muted-foreground">{systemCost.missingItems.join(', ')}</p>
            </div>
          )}

          {tariffSavings && !tariffSavings.tariffOrderValid && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              As tarifas de ponta e intermediária devem ser maiores ou iguais à tarifa fora de ponta para estimar economia.
            </div>
          )}

          {tariffSavings && tariffSavings.tariffOrderValid && (
            <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="font-medium">Composição da economia mensal</p>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Deslocamento com bateria</span>
                  <span className="font-medium">{formatCurrencyBRL(tariffSavings.batteryMonthlySavings)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">RTE efetivo do sistema</span>
                  <span className="font-medium">{tariffSavings.effectiveRoundTripEfficiencyPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1 text-muted-foreground"><Sun className="h-3.5 w-3.5" /> Geração fotovoltaica</span>
                  <span className="font-medium">{formatCurrencyBRL(tariffSavings.pvMonthlySavings)}</span>
                </div>
              </div>
              {tariffSavings.monthlyCostWithoutSolaxBrl != null && tariffSavings.monthlyCostWithSolaxBrl != null && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                  <div><p className="text-muted-foreground">Sem SolaX</p><p className="font-semibold">{formatCurrencyBRL(tariffSavings.monthlyCostWithoutSolaxBrl)}/mês</p></div>
                  <div><p className="text-muted-foreground">Com SolaX</p><p className="font-semibold text-primary">{formatCurrencyBRL(tariffSavings.monthlyCostWithSolaxBrl)}/mês</p></div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            aria-expanded={assumptionsOpen}
            onClick={() => setAssumptionsOpen((current) => !current)}
            className="mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium hover:bg-muted/40"
          >
            Premissas utilizadas
            <ChevronDown className={cn('h-4 w-4 transition-transform', assumptionsOpen && 'rotate-180')} />
          </button>
          {assumptionsOpen && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>{tariffSavings?.businessDaysPerMonth ?? 22} dias úteis por mês para Tarifa Branca.</li>
              <li>Janelas de {whiteTariff?.pontaWindowHours ?? 3} h na ponta e {whiteTariff?.intermediateWindowHours ?? 2} h no período intermediário.</li>
              <li>Tarifas e consumo informados pelo usuário.</li>
              <li>Estimativa de primeiro ano, sem reajuste tarifário ou sazonalidade.</li>
              <li>SOH inicial de {tariffSavings?.initialSohPercent.toFixed(0) ?? 100}% e redução anual de {tariffSavings?.annualSohLossPercent.toFixed(1) ?? '2,0'}% aplicada ao retorno.</li>
              <li>RTE combinado da bateria e das conversões do inversor; consumo em espera descontado da economia.</li>
              <li>Não considera manutenção, impostos, custo de disponibilidade ou perdas adicionais não cadastradas.</li>
              <li>A geração solar considera aproveitamento ideal da energia disponível.</li>
            </ul>
          )}
        </div>
      )}

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
