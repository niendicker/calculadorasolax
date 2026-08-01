'use client';

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Battery,
  BatteryCharging,
  Boxes,
  Cable,
  Fuel,
  Gauge,
  IdCard,
  ListChecks,
  Mail,
  MapPin,
  Network,
  Package,
  Phone,
  Receipt,
  SolarPanel,
  Sun,
  TrendingUp,
  User,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type {
  BatteryTopology,
  Client,
  DesiredFeatureId,
  GeneratorConfig,
  MarginSettings,
  MicrogridConfig,
  ProjectInfo,
  ProjectServiceLine,
  PvConfig,
  ResidentialGridType,
  Solution,
  UserServiceItem,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { desiredFeatureLabel } from '@/lib/desired-features';
import {
  batteryQuantityBreakdown,
  buildMarginSummary,
  calculateSystemCost,
  calculateDegradedPaybackMonths,
  calculateTariffSavings,
  formatCurrencyBRL,
  normalizeAccessoryLine,
  solutionMetrics,
} from './helpers';
import { ReportInfoRow, ReportMetric } from './shared-ui';
import {
  gridLabels,
  topologyLabels,
  type AccessoryCatalogOption,
  type BatteryCatalogOption,
  type InverterCatalogOption,
  type InlineProfile,
  type ProductMedia,
} from './types';

const featureIcons: Record<DesiredFeatureId, LucideIcon> = {
  backup: BatteryCharging,
  external_ats: Cable,
  microgrid: Network,
  external_generator: Fuel,
  pv: SolarPanel,
  white_tariff: Receipt,
};

/** Produces a compact, stable reference for customer-facing areas while the
 * complete rule identifier remains available in the technical appendix. */
function shortSolutionReference(solutionCode?: string) {
  if (!solutionCode) return null;
  let hash = 0x811c9dc5;
  for (let index = 0; index < solutionCode.length; index += 1) {
    hash ^= solutionCode.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `SOL-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

/** Renders the detail line for one selected feature in "Funcionalidades
 * selecionadas" — every relevant config value the user entered for that
 * feature, so the PDF stands on its own without the app open. */
function desiredFeatureDetails(
  id: DesiredFeatureId,
  {
    whiteTariff,
    microgrid,
    generator,
    atsPhotoUrl,
    atsBackupAcknowledged,
  }: {
    whiteTariff: WhiteTariffConfig | null;
    microgrid: MicrogridConfig | null;
    generator: GeneratorConfig | null;
    atsPhotoUrl: string | null;
    atsBackupAcknowledged: boolean;
  }
): ReactNode {
  switch (id) {
    case 'white_tariff':
      if (!whiteTariff) return '-';
      return (
        <>
          Potência {(whiteTariff.requiredPowerW / 1000).toFixed(2)} kW
          {whiteTariff.totalMonthlyConsumptionKwh ? ` · consumo ${whiteTariff.totalMonthlyConsumptionKwh.toFixed(1)} kWh/mês` : ''}
          {' '}· energia ponta{' '}
          <span className="font-medium text-foreground">
            {(whiteTariff.pontaEnergyWh / 1000).toFixed(2)} kWh
          </span>{' '}
          · energia intermediária{' '}
          <span className="font-medium text-foreground">
            {(whiteTariff.intermediateEnergyWh / 1000).toFixed(2)} kWh
          </span>{' '}
          · {whiteTariff.includeBackupReserve ? 'com' : 'sem'} reserva de backup · tarifa ponta{' '}
          <span className="font-medium text-foreground">{formatCurrencyBRL(whiteTariff.pontaTariffPerKwh)}/kWh</span>{' '}
          · tarifa intermediária{' '}
          <span className="font-medium text-foreground">
            {formatCurrencyBRL(whiteTariff.intermediateTariffPerKwh)}/kWh
          </span>{' '}
          · tarifa fora ponta{' '}
          <span className="font-medium text-foreground">
            {formatCurrencyBRL(whiteTariff.foraPontaTariffPerKwh)}/kWh
          </span>
        </>
      );
    case 'microgrid':
      if (!microgrid) return '-';
      return (
        `Rede existente ${microgrid.voltageV}V · ${microgrid.onGridPhases}F · ${(microgrid.onGridApparentPowerVA / 1000).toFixed(1)} kW · ` +
        `margem de potência 20%` +
        (microgrid.photoUrl ? ' · foto anexada' : '')
      );
    case 'external_generator':
      if (!generator) return '-';
      return (
        `Gerador ${generator.voltageV}V · ${generator.phases}F · ${(generator.apparentPowerVA / 1000).toFixed(1)} kVA · FP ${(generator.powerFactor ?? 0.8).toFixed(2)} · margem ${((generator.safetyMarginW ?? 1000) / 1000).toFixed(2)} kW · ` +
        `chave ATS própria ${generator.ownAtsAcknowledged ? 'confirmada' : 'pendente'}` +
        (generator.photoUrl ? ' · foto anexada' : '')
      );
    case 'external_ats':
      return (
        `Uso para backup completo ${atsBackupAcknowledged ? 'confirmado' : 'pendente'}` +
        (atsPhotoUrl ? ' · foto anexada' : '')
      );
    case 'backup':
      return 'Todos os inversores híbridos suportam backup.';
    case 'pv':
      return 'Dimensionado com recomendação de arranjo fotovoltaico.';
    default:
      return '-';
  }
}

/** Formats a catalog product's warranty terms for the report — batteries pair
 * years with a cycle throughput limit (whichever is reached first ends the
 * warranty); inverters/accessories are duration-only. Returns null when the
 * product isn't found in the catalog (e.g. removed after the solution was
 * generated), since showing a fabricated default would be misleading. */
function formatWarranty(product?: { warrantyYears?: number; warrantyCycles?: number } | null): string | null {
  if (!product?.warrantyYears) return null;
  return product.warrantyCycles
    ? `${product.warrantyYears} anos ou ${product.warrantyCycles} ciclos`
    : `${product.warrantyYears} anos`;
}

/** One product/accessory line in a ProductsTable — icon, name (+ nickname-less
 * model as a caption when it needs one), a right-aligned quantity, and an
 * optional note underneath. Shared shape for the inverter, battery, PV and
 * every accessory row, so the section reads as a tidy list, not a grid. */
function ProductLine({
  icon: Icon,
  category,
  nickname,
  model,
  qty,
  note,
  alert,
  description,
  warranty,
}: {
  icon: LucideIcon;
  category: string;
  nickname?: string | null;
  model: string;
  qty: string;
  note?: string;
  alert?: string;
  description?: string | null;
  /** Warranty terms, formatted for display (e.g. "10 anos" or "10 anos ou 6000 ciclos"). */
  warranty?: string | null;
}) {
  return (
    <div className="print-avoid-break flex items-start justify-between gap-4 border-b border-border/50 py-3 last:border-0">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{category}</p>
          <p className="break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{nickname || model}</p>
          {nickname && <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{model}</p>}
          {alert && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
              {alert}
            </p>
          )}
          {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
          {description && <p className="mt-0.5 text-xs text-muted-foreground/80 italic">{description}</p>}
          {warranty && <p className="mt-0.5 text-xs text-muted-foreground">Garantia: {warranty}</p>}
        </div>
      </div>
      <p className="shrink-0 text-sm font-semibold text-foreground">{qty}</p>
    </div>
  );
}

function ProductsList({
  title,
  solution,
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
  services,
  userServices,
  productMedia,
  desiredFeatures,
  whiteTariff,
  microgrid,
  pv,
  nominalW,
  peakW,
  dailyKwh,
}: {
  title: string;
  solution: Solution;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  /** Only meaningful on the primary ProductsList — services (installation,
   * freight, etc.) are a one-time project cost, not tied to whichever
   * battery is being compared, so the secondary "comparação" variant omits
   * them (pass [] there) to avoid double-counting. */
  services?: ProjectServiceLine[];
  userServices?: UserServiceItem[];
  productMedia: Record<string, ProductMedia>;
  desiredFeatures: DesiredFeatureId[];
  whiteTariff: WhiteTariffConfig | null;
  microgrid: MicrogridConfig | null;
  pv: PvConfig | null;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
}) {
  const batteryParts = batteryQuantityBreakdown(
    solution.batteryModel,
    solution.batteryQty,
    batteryCatalog,
    (solution.inverterQty ?? 1) * (solution.batteryPortsUsed ?? 1)
  );
  const metrics = solutionMetrics(solution, batteryCatalog);
  const marginRows = solution.microgridAlternative
    ? []
    : buildMarginSummary({ desiredFeatures, whiteTariff, microgrid, pv, nominalW, peakW, dailyKwh, solution });

  return (
    <section className="print-section mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
        <Boxes className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </h2>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <ReportMetric
          icon={Gauge}
          label="Potência nominal"
          value={metrics.nominalW != null ? `${(metrics.nominalW / 1000).toFixed(2)} kVA` : '-'}
        />
        <ReportMetric
          icon={Zap}
          label="Potência máxima"
          value={metrics.peakW != null ? `${(metrics.peakW / 1000).toFixed(2)} kVA` : '-'}
        />
        <ReportMetric icon={BatteryCharging} label="Energia disponível" value={`${metrics.energyKwh.toFixed(2)} kWh`} />
      </div>
      <div className="rounded-xl border border-border/70 px-4">
        <ProductLine
          icon={Boxes}
          category="Inversor"
          nickname={productMedia[solution.inverterModel]?.nickname}
          model={solution.inverterModel}
          qty={`×${solution.inverterQty ?? 1}`}
          note={solution.inverterRatedPowerW ? `${solution.inverterRatedPowerW} VA nominal` : undefined}
          warranty={formatWarranty(inverterCatalog.find((item) => item.model === solution.inverterModel))}
        />
        {batteryParts.map((part, index) => (
          <ProductLine
            key={part.model}
            icon={Battery}
            category={index === 0 ? 'Bateria' : 'Bateria (expansão)'}
            nickname={productMedia[part.model]?.nickname}
            model={part.model}
            qty={`×${part.qty}`}
            note={
              index === 0 && solution.availableEnergyWh
                ? `${(solution.availableEnergyWh / 1000).toFixed(2)} kWh disponíveis`
                : undefined
            }
            warranty={formatWarranty(batteryCatalog.find((item) => item.model === part.model))}
          />
        ))}
        {solution.pvPowerKw !== null && (
          <ProductLine
            icon={Sun}
            category="Potência FV recomendada"
            model="Arranjo fotovoltaico"
            qty={`${solution.pvPowerKw.toFixed(2)} kWp`}
            note={
              solution.pvMonthlyGenerationKwh != null
                ? `${solution.pvMonthlyGenerationKwh.toFixed(0)} kWh/mês estimados`
                : undefined
            }
          />
        )}
        {solution.accessories.map((accessory) => {
          const { model, qty, optional, comment, bundled, appliesTo } = normalizeAccessoryLine(accessory);
          const catalogAccessory = accessoryCatalog.find((item) => item.model === model);
          const bundledLabel =
            appliesTo === 'inverter' ? 'Incluso no inversor' : appliesTo === 'battery' ? 'Incluso na bateria' : 'Incluso';
          return (
            <ProductLine
              key={model}
              icon={Package}
              category="Acessório"
              nickname={productMedia[model]?.nickname}
              model={model}
              qty={`×${qty}`}
              note={bundled ? bundledLabel : optional ? `Opcional${comment ? ` — ${comment}` : ''}` : (comment ?? undefined)}
              alert={!optional && !bundled ? 'Acessório obrigatório' : undefined}
              description={catalogAccessory?.description}
              warranty={formatWarranty(catalogAccessory)}
            />
          );
        })}
      </div>
      {services && services.length > 0 && (
        <div className="mt-3 rounded-xl border border-border/70 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Package className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Serviços
          </p>
          <div className="space-y-1">
            {services.map((line) => {
              const unitValue = userServices?.find((service) => service.id === line.serviceId)?.unitValue;
              return (
                <div
                  key={line.serviceId}
                  className="flex items-center justify-between gap-2 border-b border-border/40 py-1 text-sm last:border-0"
                >
                  <span className="text-foreground">
                    {line.name}
                    {line.qty !== 1 ? ` × ${line.qty}` : ''}
                  </span>
                  <span className="text-muted-foreground">
                    {unitValue != null ? formatCurrencyBRL(unitValue * line.qty) : 'sem preço'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {marginRows.length > 0 && (
        <div className="mt-3 rounded-xl border border-border/70 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Gauge className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Margens operacionais
          </p>
          <div className="space-y-1">
            {marginRows.map((row) => {
              const marginPct =
                row.requiredValue > 0 ? ((row.providedValue - row.requiredValue) / row.requiredValue) * 100 : null;
              const insufficient = marginPct !== null && marginPct < 0;
              const unitLabel = row.unit === 'W' ? 'kVA' : 'kWh';
              const toKilo = (value: number) => (value / 1000).toFixed(2);
              return (
                <div
                  key={row.key}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/40 py-1 text-sm last:border-0"
                >
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    {insufficient && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />}
                    {row.label}
                  </span>
                  <span className={`text-xs ${insufficient ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                    Necessário {toKilo(row.requiredValue)} {unitLabel} · Solução oferece {toKilo(row.providedValue)} {unitLabel}
                    {marginPct !== null && ` (${marginPct >= 0 ? '+' : ''}${marginPct.toFixed(0)}%)`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {(() => {
        const visibleComments = (solution.comments ?? []).filter((comment) => !comment.startsWith('Gerada por regra ESS'));
        return (
          visibleComments.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {visibleComments.map((comment, index) => (
                <li key={`${index}-${comment}`}>{comment}</li>
              ))}
            </ul>
          )
        );
      })()}
    </section>
  );
}

export function PrintableReport({
  projectInfo,
  client,
  profile,
  solution,
  secondarySolution,
  secondaryBatteryModel,
  loads,
  operationHours,
  topology,
  selectedBatteryModel,
  gridType,
  nominalW,
  peakW,
  dailyKwh,
  userStockItems,
  marginSettings,
  services,
  userServices,
  whiteTariff,
  pv,
  desiredFeatures,
  microgrid,
  generator,
  atsPhotoUrl,
  atsBackupAcknowledged,
  batteryCatalog,
  inverterCatalog = [],
  accessoryCatalog,
  productMedia,
}: {
  projectInfo: ProjectInfo;
  client: Client | null;
  profile: InlineProfile | null;
  solution: Solution;
  secondarySolution?: Solution | null;
  secondaryBatteryModel?: string | null;
  loads: {
    id: string;
    name: string;
    powerW: number;
    qty: number;
    usageFactor?: number;
    usageMode?: 'fraction' | 'fixed';
    fixedHours?: number;
  }[];
  operationHours: number;
  topology: BatteryTopology | null;
  selectedBatteryModel: string | null;
  gridType: ResidentialGridType | null;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
  userStockItems: UserStockItem[];
  marginSettings?: MarginSettings;
  services?: ProjectServiceLine[];
  userServices?: UserServiceItem[];
  whiteTariff: WhiteTariffConfig | null;
  pv?: PvConfig | null;
  desiredFeatures?: DesiredFeatureId[];
  microgrid?: MicrogridConfig | null;
  generator?: GeneratorConfig | null;
  atsPhotoUrl?: string | null;
  atsBackupAcknowledged?: boolean;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog?: InverterCatalogOption[];
  accessoryCatalog?: AccessoryCatalogOption[];
  productMedia?: Record<string, ProductMedia>;
}) {
  const generatedAt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
  const documentReference = shortSolutionReference(solution.solutionCode);

  const loadEnergyKwh = (load: { powerW: number; qty: number; usageFactor?: number; usageMode?: 'fraction' | 'fixed'; fixedHours?: number }) => {
    const hours = load.usageMode === 'fixed' ? Math.max(0, load.fixedHours ?? 0) : operationHours * (load.usageFactor ?? 1);
    return (load.powerW * load.qty * hours) / 1000;
  };

  const batteryPerformance = batteryCatalog.find((item) => item.model === solution.batteryModel);
  const inverterPerformance = inverterCatalog.find((item) => item.model === solution.inverterModel);
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
  const reportSystemCost = calculateSystemCost(
    solution,
    userStockItems,
    services,
    userServices,
    marginSettings,
    batteryCatalog
  );
  const reportPaybackMonths =
    tariffSavings?.tariffOrderValid && tariffSavings.annualSavings > 0 && reportSystemCost.isComplete
      ? calculateDegradedPaybackMonths(reportSystemCost.totalCost, tariffSavings)
      : null;
  const reportPaybackLabel = reportPaybackMonths == null
    ? null
    : reportPaybackMonths < 12
      ? `${reportPaybackMonths} ${reportPaybackMonths === 1 ? 'mês' : 'meses'}`
      : reportPaybackMonths % 12 === 0
        ? `${reportPaybackMonths / 12} ${reportPaybackMonths === 12 ? 'ano' : 'anos'}`
        : `${Math.floor(reportPaybackMonths / 12)} ${Math.floor(reportPaybackMonths / 12) === 1 ? 'ano' : 'anos'} e ${reportPaybackMonths % 12} ${reportPaybackMonths % 12 === 1 ? 'mês' : 'meses'}`;
  const totalLoadPowerW = loads.reduce((total, load) => total + load.powerW * load.qty, 0);
  const totalLoadEnergyKwh = loads.reduce((total, load) => total + loadEnergyKwh(load), 0);

  // Margins must reflect what the loads actually require the same way the
  // Solução tab does: the registered loads only count toward the
  // requirement while Backup is enabled (see SizingTab.tsx) — otherwise a
  // disabled Backup with loads still on file would inflate the margins as if
  // they were still being covered.
  const isBackupEnabled = (desiredFeatures ?? []).includes('backup');
  const marginNominalW = isBackupEnabled ? nominalW : 0;
  const marginPeakW = isBackupEnabled ? peakW : 0;
  const marginDailyKwh = isBackupEnabled ? dailyKwh : 0;

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

      <section className="print-section mb-8 grid grid-cols-3 gap-3">
        <ReportMetric icon={Gauge} label="Pico de carga" value={`${(peakW / 1000).toFixed(2)} kVA`} />
        <ReportMetric icon={BatteryCharging} label="Consumo diário" value={`${dailyKwh.toFixed(2)} kWh/dia`} />
        <ReportMetric icon={Boxes} label="Topologia" value={topology ? topologyLabels[topology] : '-'} />
        <ReportMetric
          icon={Battery}
          label="Bateria selecionada"
          value={(selectedBatteryModel && (productMedia?.[selectedBatteryModel]?.nickname || selectedBatteryModel)) || '-'}
        />
        <ReportMetric icon={Network} label="Rede" value={gridType ? gridLabels[gridType] : '-'} />
      </section>

      <section className="print-section mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <User className="h-4 w-4 text-primary" aria-hidden="true" />
          Dados do projeto
        </h2>
        <div className="grid grid-cols-1 gap-x-8 rounded-xl border border-border/70 px-4 sm:grid-cols-2">
          <ReportInfoRow icon={ListChecks} label="Projeto" value={projectInfo.name || '-'} />
          <ReportInfoRow icon={User} label="Cliente" value={client?.name || '-'} />
          <ReportInfoRow icon={Mail} label="Email" value={client?.email || '-'} />
          <ReportInfoRow icon={Phone} label="Telefone" value={client?.phone || '-'} />
          <ReportInfoRow icon={IdCard} label="CPF/CNPJ" value={client?.document || '-'} />
          <ReportInfoRow icon={MapPin} label="Endereço" value={projectInfo.address || '-'} />
          {projectInfo.notes && <ReportInfoRow label="Observações" value={projectInfo.notes} />}
        </div>
      </section>

      {desiredFeatures && desiredFeatures.length > 0 && (
        <section className="print-section mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
            Funcionalidades selecionadas
          </h2>
          <div className="space-y-3 rounded-xl border border-border/70 p-4">
            {/* Filters out any id no longer recognized (e.g. a renamed/removed
             * feature still sitting in an older saved project) — featureIcons
             * wouldn't have an entry for it. */}
            {desiredFeatures.filter((id) => id in featureIcons).map((id) => {
              const Icon = featureIcons[id];
              return (
                <div key={id} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{desiredFeatureLabel(id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {desiredFeatureDetails(id, {
                        whiteTariff,
                        microgrid: microgrid ?? null,
                        generator: generator ?? null,
                        atsPhotoUrl: atsPhotoUrl ?? null,
                        atsBackupAcknowledged: atsBackupAcknowledged ?? false,
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <ProductsList
        title={secondarySolution ? `Produtos recomendados — Bateria ${solution.batteryModel}` : 'Produtos recomendados'}
        solution={solution}
        batteryCatalog={batteryCatalog}
        inverterCatalog={inverterCatalog}
        accessoryCatalog={accessoryCatalog ?? []}
        services={services}
        userServices={userServices}
        productMedia={productMedia ?? {}}
        desiredFeatures={desiredFeatures ?? []}
        whiteTariff={whiteTariff}
        microgrid={microgrid ?? null}
        pv={pv ?? null}
        nominalW={marginNominalW}
        peakW={marginPeakW}
        dailyKwh={marginDailyKwh}
      />

      {secondarySolution && (
        <ProductsList
          title={`Produtos recomendados — Bateria ${secondaryBatteryModel ?? secondarySolution.batteryModel} (comparação)`}
          solution={secondarySolution}
          batteryCatalog={batteryCatalog}
          inverterCatalog={inverterCatalog}
          accessoryCatalog={accessoryCatalog ?? []}
          productMedia={productMedia ?? {}}
          desiredFeatures={desiredFeatures ?? []}
          whiteTariff={whiteTariff}
          microgrid={microgrid ?? null}
          pv={pv ?? null}
          nominalW={marginNominalW}
          peakW={marginPeakW}
          dailyKwh={marginDailyKwh}
        />
      )}

      {(!desiredFeatures || desiredFeatures.includes('backup')) && (
        <section className="print-section mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
            Cargas informadas
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">Tempo de operação considerado: {operationHours} h</p>
          <div
            className={`print-table-container overflow-hidden rounded-xl border border-border/70 ${loads.length <= 10 ? 'print-table-whole' : ''}`}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Carga</th>
                  <th className="px-4 py-2 text-right font-medium">Potência</th>
                  <th className="px-4 py-2 text-right font-medium">Qtd.</th>
                  <th className="px-4 py-2 text-right font-medium">Pico</th>
                  <th className="px-4 py-2 text-right font-medium">Consumo</th>
                </tr>
              </thead>
              <tbody>
                {loads.map((load) => (
                  <tr key={load.id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2 font-medium text-foreground">{load.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{load.powerW} VA</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{load.qty}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{load.powerW * load.qty} VA</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-foreground">
                      {loadEnergyKwh(load).toFixed(2)} kWh
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/70 bg-muted/30 font-semibold text-foreground">
                  <td className="px-4 py-2" colSpan={3}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalLoadPowerW} VA</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalLoadEnergyKwh.toFixed(2)} kWh</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {(reportSystemCost.pricedItemsCount > 0 || tariffSavings) && (
        <section className="print-section mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
            Análise econômica
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {reportSystemCost.pricedItemsCount > 0 && (
              <ReportMetric
                icon={Wallet}
                label={reportSystemCost.isComplete ? 'Investimento estimado' : 'Investimento parcial'}
                value={formatCurrencyBRL(reportSystemCost.totalCost)}
                note={
                  reportSystemCost.isComplete
                    ? undefined
                    : `Falta precificar: ${reportSystemCost.missingItems.join(', ')}`
                }
              />
            )}
            {tariffSavings?.tariffOrderValid && (
              <ReportMetric
                icon={TrendingUp}
                label="Ganho estimado com SolaX"
                value={`${formatCurrencyBRL(tariffSavings.annualSavings)}/ano`}
                note={
                  `${formatCurrencyBRL(tariffSavings.monthlySavings)}/mês · considerando ${tariffSavings.businessDaysPerMonth} dias úteis/mês` +
                  ` · bateria ${formatCurrencyBRL(tariffSavings.batteryMonthlySavings)}/mês` +
                  (tariffSavings.pvMonthlySavings > 0
                    ? ` · dos quais ${formatCurrencyBRL(tariffSavings.pvMonthlySavings)}/mês de geração solar`
                    : '')
                }
                highlight
              />
            )}
            {reportPaybackMonths != null && (
              <ReportMetric
                icon={TrendingUp}
                label="Retorno simples estimado"
                value={reportPaybackLabel ?? '-'}
              />
            )}
            {tariffSavings?.tariffOrderValid && tariffSavings.monthlyCostWithoutSolaxBrl != null && (
              <ReportMetric
                icon={Wallet}
                label="Custo estimado sem SolaX"
                value={`${formatCurrencyBRL(tariffSavings.monthlyCostWithoutSolaxBrl)}/mês`}
              />
            )}
            {tariffSavings?.tariffOrderValid && tariffSavings.monthlyCostWithSolaxBrl != null && (
              <ReportMetric
                icon={Wallet}
                label="Custo estimado com SolaX"
                value={`${formatCurrencyBRL(tariffSavings.monthlyCostWithSolaxBrl)}/mês`}
              />
            )}
          </div>
          {tariffSavings && !tariffSavings.tariffOrderValid && (
            <div className="print-avoid-break mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p>Economia e retorno indisponíveis: as tarifas de ponta e intermediária devem ser maiores ou iguais à tarifa fora de ponta.</p>
            </div>
          )}
          {tariffSavings?.tariffOrderValid && (
            <p className="mt-3 text-xs text-muted-foreground">
              Premissas: RTE efetivo de {tariffSavings.effectiveRoundTripEfficiencyPct.toFixed(1)}%, SOH inicial de{' '}
              {tariffSavings.initialSohPercent.toFixed(0)}%, redução de SOH de{' '}
              {tariffSavings.annualSohLossPercent.toFixed(1)}%/ano e {tariffSavings.businessDaysPerMonth} dias úteis/mês.
              Sem reajuste tarifário, sazonalidade, manutenção, impostos, custo de disponibilidade ou perdas adicionais.
            </p>
          )}
        </section>
      )}

      {solution.solutionCode && (
        <section className="print-section print-avoid-break mb-8 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
          <p className="font-medium text-foreground">Referência técnica</p>
          <p className="mt-1 break-words font-mono [overflow-wrap:anywhere]">{solution.solutionCode}</p>
          <p className="mt-1">Identificador interno da regra utilizada no dimensionamento.</p>
        </section>
      )}

      <footer className="print-document-footer border-t pt-2 text-xs text-muted-foreground">
        {profile?.companyName || 'SolaX Power Brasil'} · {projectInfo.name || 'Projeto'}
        {documentReference ? ` · Ref. ${documentReference}` : ''}
      </footer>
    </div>
  );
}
