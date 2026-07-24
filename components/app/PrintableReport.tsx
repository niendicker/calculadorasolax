'use client';

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
  MicrogridConfig,
  ProjectInfo,
  ResidentialGridType,
  Solution,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { desiredFeatureLabel } from '@/lib/desired-features';
import {
  batteryQuantityBreakdown,
  buildMarginSummary,
  calculateSystemCost,
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
  type InlineProfile,
  type ProductMedia,
} from './types';

const featureIcons: Record<DesiredFeatureId, LucideIcon> = {
  backup: BatteryCharging,
  external_ats: Cable,
  microgrid: Network,
  external_generator: Fuel,
  no_pv: SolarPanel,
  white_tariff: Receipt,
};

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
): string {
  switch (id) {
    case 'white_tariff':
      if (!whiteTariff) return '-';
      return (
        `Potência ${(whiteTariff.requiredPowerW / 1000).toFixed(2)} kVA · ` +
        `energia ${(whiteTariff.requiredEnergyWh / 1000).toFixed(2)} kWh · ` +
        `${whiteTariff.includeBackupReserve ? 'com' : 'sem'} reserva de backup · ` +
        `diferença tarifária ${formatCurrencyBRL(whiteTariff.tariffSpreadPerKwh)}/kWh`
      );
    case 'microgrid':
      if (!microgrid) return '-';
      return (
        `Rede existente ${microgrid.voltageV}V · ${microgrid.onGridPhases}F · ${microgrid.onGridApparentPowerVA} VA · ` +
        `${microgrid.isFundamentalRequirement ? 'requisito fundamental' : 'não fundamental'} · ` +
        `aviso de potência ${microgrid.powerNoticeAcknowledged ? 'confirmado' : 'pendente'}` +
        (microgrid.photoUrl ? ' · foto anexada' : '')
      );
    case 'external_generator':
      if (!generator) return '-';
      return (
        `Gerador ${generator.voltageV}V · ${generator.phases}F · ${generator.apparentPowerVA} VA · ` +
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
    case 'no_pv':
      return 'Dimensionado sem arranjo fotovoltaico.';
    default:
      return '-';
  }
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
}: {
  icon: LucideIcon;
  category: string;
  nickname?: string | null;
  model: string;
  qty: string;
  note?: string;
  alert?: string;
  description?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-3 last:border-0">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{category}</p>
          <p className="text-sm font-semibold text-foreground">{nickname || model}</p>
          {nickname && <p className="text-xs text-muted-foreground">{model}</p>}
          {alert && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
              {alert}
            </p>
          )}
          {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
          {description && <p className="mt-0.5 text-xs text-muted-foreground/80 italic">{description}</p>}
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
  accessoryCatalog,
  userStockItems,
  productMedia,
  desiredFeatures,
  whiteTariff,
  microgrid,
  nominalW,
  peakW,
  dailyKwh,
}: {
  title: string;
  solution: Solution;
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  userStockItems: UserStockItem[];
  productMedia: Record<string, ProductMedia>;
  desiredFeatures: DesiredFeatureId[];
  whiteTariff: WhiteTariffConfig | null;
  microgrid: MicrogridConfig | null;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
}) {
  const systemCost = calculateSystemCost(solution, userStockItems);
  const batteryParts = batteryQuantityBreakdown(
    solution.batteryModel,
    solution.batteryQty,
    batteryCatalog,
    (solution.inverterQty ?? 1) * (solution.batteryPortsUsed ?? 1)
  );
  const metrics = solutionMetrics(solution, batteryCatalog);
  const marginRows = solution.microgridAlternative
    ? []
    : buildMarginSummary({ desiredFeatures, whiteTariff, microgrid, nominalW, peakW, dailyKwh, solution });

  return (
    <section className="mb-8">
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
          />
        ))}
        {solution.pvPowerKw !== null && (
          <ProductLine
            icon={Sun}
            category="Potência FV recomendada"
            model="Arranjo fotovoltaico"
            qty={`${solution.pvPowerKw.toFixed(2)} kWp`}
          />
        )}
        {solution.accessories.map((accessory) => {
          const { model, qty, optional, comment } = normalizeAccessoryLine(accessory);
          const description = accessoryCatalog.find((item) => item.model === model)?.description;
          return (
            <ProductLine
              key={model}
              icon={Package}
              category="Acessório"
              nickname={productMedia[model]?.nickname}
              model={model}
              qty={`×${qty}`}
              note={optional ? `Opcional${comment ? ` — ${comment}` : ''}` : (comment ?? undefined)}
              alert={!optional ? 'Acessório obrigatório' : undefined}
              description={description}
            />
          );
        })}
      </div>
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
      {systemCost.pricedItemsCount > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Custo total do sistema: <span className="font-medium text-foreground">{formatCurrencyBRL(systemCost.totalCost)}</span>
          {!systemCost.isComplete &&
            ` (parcial: ${systemCost.pricedItemsCount} de ${systemCost.totalItemsCount} itens com valor cadastrado)`}
        </p>
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
  topology,
  selectedBatteryModel,
  gridType,
  nominalW,
  peakW,
  dailyKwh,
  userStockItems,
  whiteTariff,
  desiredFeatures,
  microgrid,
  generator,
  atsPhotoUrl,
  atsBackupAcknowledged,
  batteryCatalog,
  accessoryCatalog,
  productMedia,
}: {
  projectInfo: ProjectInfo;
  client: Client | null;
  profile: InlineProfile | null;
  solution: Solution;
  secondarySolution?: Solution | null;
  secondaryBatteryModel?: string | null;
  loads: { id: string; name: string; powerW: number; hoursPerDay: number; qty: number }[];
  topology: BatteryTopology | null;
  selectedBatteryModel: string | null;
  gridType: ResidentialGridType | null;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
  userStockItems: UserStockItem[];
  whiteTariff: WhiteTariffConfig | null;
  desiredFeatures?: DesiredFeatureId[];
  microgrid?: MicrogridConfig | null;
  generator?: GeneratorConfig | null;
  atsPhotoUrl?: string | null;
  atsBackupAcknowledged?: boolean;
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog?: AccessoryCatalogOption[];
  productMedia?: Record<string, ProductMedia>;
}) {
  const generatedAt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

  const loadEnergyKwh = (load: { powerW: number; hoursPerDay: number; qty: number }) =>
    (load.powerW * load.hoursPerDay * load.qty) / 1000;

  const tariffSavings = calculateTariffSavings(whiteTariff);

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

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
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

      <section className="mb-8">
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
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
            Funcionalidades selecionadas
          </h2>
          <div className="space-y-3 rounded-xl border border-border/70 p-4">
            {desiredFeatures.map((id) => {
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
        accessoryCatalog={accessoryCatalog ?? []}
        userStockItems={userStockItems}
        productMedia={productMedia ?? {}}
        desiredFeatures={desiredFeatures ?? []}
        whiteTariff={whiteTariff}
        microgrid={microgrid ?? null}
        nominalW={marginNominalW}
        peakW={marginPeakW}
        dailyKwh={marginDailyKwh}
      />

      {secondarySolution && (
        <ProductsList
          title={`Produtos recomendados — Bateria ${secondaryBatteryModel ?? secondarySolution.batteryModel} (comparação)`}
          solution={secondarySolution}
          batteryCatalog={batteryCatalog}
          accessoryCatalog={accessoryCatalog ?? []}
          userStockItems={userStockItems}
          productMedia={productMedia ?? {}}
          desiredFeatures={desiredFeatures ?? []}
          whiteTariff={whiteTariff}
          microgrid={microgrid ?? null}
          nominalW={marginNominalW}
          peakW={marginPeakW}
          dailyKwh={marginDailyKwh}
        />
      )}

      {(!desiredFeatures || desiredFeatures.includes('backup')) && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
            Cargas informadas
          </h2>
          <div className="overflow-hidden rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Carga</th>
                  <th className="px-4 py-2 text-right font-medium">Potência</th>
                  <th className="px-4 py-2 text-right font-medium">Qtd.</th>
                  <th className="px-4 py-2 text-right font-medium">Uso diário</th>
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
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{load.hoursPerDay} h/dia</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{load.powerW * load.qty} VA</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-foreground">
                      {loadEnergyKwh(load).toFixed(2)} kWh/dia
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tariffSavings && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
            Análise econômica
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <ReportMetric
              icon={TrendingUp}
              label="Economia estimada com Tarifa Branca"
              value={`${formatCurrencyBRL(tariffSavings.monthlySavings)}/mês`}
            />
            <ReportMetric
              icon={TrendingUp}
              label={`Economia anual (${tariffSavings.businessDaysPerMonth} dias úteis/mês)`}
              value={formatCurrencyBRL(tariffSavings.annualSavings)}
            />
          </div>
        </section>
      )}

      <footer className="mt-8 border-t pt-3 text-right text-xs text-muted-foreground">
        {solution.solutionCode ? `Código: ${solution.solutionCode}` : 'Calculadora SolaX'}
      </footer>
    </div>
  );
}
