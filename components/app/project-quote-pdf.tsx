import { cloneElement, type ReactElement } from 'react';
import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
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
  SavedProject,
  Solution,
  UserServiceItem,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { formatAddress, isAddressEmpty } from '@/lib/address';
import { DESIRED_FEATURE_DEFINITIONS, desiredFeatureLabel } from '@/lib/desired-features';
import { totalDailyKwh, totalNominalW, totalPeakW } from '@/lib/store/wizard-calculations';
import {
  batteryQuantityBreakdown,
  buildMarginSummary,
  calculateDegradedPaybackMonths,
  calculateSystemCost,
  calculateTariffSavings,
  formatCurrencyBRL,
  normalizeAccessoryLine,
  solutionMetrics,
  type MarginRow,
} from './helpers';
import {
  gridLabels,
  topologyLabels,
  type AccessoryCatalogOption,
  type BatteryCatalogOption,
  type InlineProfile,
  type InverterCatalogOption,
  type ProductMedia,
} from './types';

const COLORS = {
  primary: '#0d8f85',
  primaryBg: '#eaf7f5',
  text: '#1a1a1a',
  muted: '#666666',
  border: '#dddddd',
  rowBorder: '#eeeeee',
  mutedBg: '#f6f6f6',
  destructive: '#b91c1c',
};

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontSize: 9, fontFamily: 'Helvetica', color: COLORS.text },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.text,
    paddingBottom: 10,
    marginBottom: 18,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'flex-start' },
  logo: { width: 64, height: 36, marginRight: 12, objectFit: 'contain' },
  companyName: { fontSize: 10.5, fontWeight: 700, color: COLORS.primary },
  companyAddress: { fontSize: 8, color: COLORS.muted, marginTop: 2, maxWidth: 260 },
  reportTitle: { fontSize: 16, fontWeight: 700, marginTop: 6 },
  generatedAt: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  headerRight: { fontSize: 8, color: COLORS.muted, textAlign: 'right' },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 8 },

  metricRow: { flexDirection: 'row', marginBottom: 8 },
  metricCard: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 8, marginRight: 6 },
  metricLabel: { fontSize: 7.5, color: COLORS.muted },
  metricValue: { fontSize: 10.5, fontWeight: 700, marginTop: 3 },
  metricNote: { fontSize: 7, color: COLORS.muted, marginTop: 2 },
  metricHighlight: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  metricHighlightText: { color: COLORS.primary },

  infoBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, paddingHorizontal: 10 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rowBorder,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: 8.5, color: COLORS.muted },
  infoValue: { fontSize: 8.5, fontWeight: 700, textAlign: 'right', maxWidth: 330 },

  featureRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.rowBorder },
  featureRowLast: { borderBottomWidth: 0 },
  featureLabel: { fontSize: 8.5, fontWeight: 700 },
  featureDetail: { fontSize: 7.5, color: COLORS.muted, marginTop: 2 },
  featureDetailBold: { fontWeight: 700, color: COLORS.text },

  productBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, paddingHorizontal: 10 },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rowBorder,
  },
  productRowLast: { borderBottomWidth: 0 },
  productCategory: { fontSize: 7.5, color: COLORS.muted },
  productName: { fontSize: 9, fontWeight: 700, marginTop: 1 },
  productModel: { fontSize: 7.5, color: COLORS.muted },
  productNote: { fontSize: 7.5, color: COLORS.muted, marginTop: 1 },
  productAlert: { fontSize: 7.5, color: COLORS.destructive, fontWeight: 700, marginTop: 1 },
  productQty: { fontSize: 9, fontWeight: 700 },

  subBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 8, marginTop: 8 },
  subBoxTitle: { fontSize: 8.5, fontWeight: 700, marginBottom: 6 },
  subBoxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rowBorder,
  },
  subBoxRowLast: { borderBottomWidth: 0 },
  subBoxRowLabel: { fontSize: 8, flexShrink: 1, marginRight: 8 },
  subBoxRowValue: { fontSize: 7.5, color: COLORS.muted, textAlign: 'right' },
  subBoxRowValueAlert: { color: COLORS.destructive, fontWeight: 700 },

  commentItem: { fontSize: 8, color: COLORS.muted, marginTop: 4 },

  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.mutedBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rowBorder,
  },
  tableFooterRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: COLORS.mutedBg },
  tableCellName: { flex: 3, fontSize: 8 },
  tableCellNum: { flex: 1.3, fontSize: 8, textAlign: 'right' },
  tableHeaderText: { fontSize: 7, color: COLORS.muted, fontWeight: 700 },
  tableFooterText: { fontSize: 8, fontWeight: 700 },

  warningBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#f3caca',
    backgroundColor: '#fdf1f1',
    borderRadius: 4,
    padding: 8,
  },
  warningText: { fontSize: 7.5, color: COLORS.destructive },

  assumptionsText: { fontSize: 7, color: COLORS.muted, marginTop: 8, lineHeight: 1.4 },

  referenceBox: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, marginBottom: 16 },
  referenceTitle: { fontSize: 8, fontWeight: 700 },
  referenceCode: { fontSize: 8, fontFamily: 'Courier', marginTop: 2 },
  referenceNote: { fontSize: 7, color: COLORS.muted, marginTop: 2 },

  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    fontSize: 7.5,
    color: COLORS.muted,
  },
});

// react-pdf's `style` prop rejects `false`/`undefined` array entries (unlike
// React Native's StyleSheet, which tolerates them) — this keeps the
// `style={[base, condition && extra]}` shorthand working everywhere below.
function styleIf<T extends object>(condition: boolean | undefined, style: T): T | Record<string, never> {
  return condition ? style : {};
}

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

/** Renders the detail line for one selected feature in "Funcionalidades
 * selecionadas" — every relevant config value the user entered for that
 * feature, so the PDF stands on its own without the app open. */
function DesiredFeatureDetail({
  id,
  whiteTariff,
  microgrid,
  generator,
  atsPhotoUrl,
  atsBackupAcknowledged,
}: {
  id: DesiredFeatureId;
  whiteTariff: WhiteTariffConfig | null;
  microgrid: MicrogridConfig | null;
  generator: GeneratorConfig | null;
  atsPhotoUrl: string | null;
  atsBackupAcknowledged: boolean;
}): ReactElement {
  switch (id) {
    case 'white_tariff': {
      if (!whiteTariff) return <Text style={styles.featureDetail}>-</Text>;
      return (
        <Text style={styles.featureDetail}>
          Potência {(whiteTariff.requiredPowerW / 1000).toFixed(2)} kW
          {whiteTariff.totalMonthlyConsumptionKwh
            ? ` · consumo ${whiteTariff.totalMonthlyConsumptionKwh.toFixed(1)} kWh/mês`
            : ''}
          {' · energia ponta '}
          <Text style={styles.featureDetailBold}>{(whiteTariff.pontaEnergyWh / 1000).toFixed(2)} kWh</Text>
          {' · energia intermediária '}
          <Text style={styles.featureDetailBold}>{(whiteTariff.intermediateEnergyWh / 1000).toFixed(2)} kWh</Text>
          {` · ${whiteTariff.includeBackupReserve ? 'com' : 'sem'} reserva de backup · tarifa ponta `}
          <Text style={styles.featureDetailBold}>{formatCurrencyBRL(whiteTariff.pontaTariffPerKwh)}/kWh</Text>
          {' · tarifa intermediária '}
          <Text style={styles.featureDetailBold}>{formatCurrencyBRL(whiteTariff.intermediateTariffPerKwh)}/kWh</Text>
          {' · tarifa fora ponta '}
          <Text style={styles.featureDetailBold}>{formatCurrencyBRL(whiteTariff.foraPontaTariffPerKwh)}/kWh</Text>
        </Text>
      );
    }
    case 'microgrid':
      if (!microgrid) return <Text style={styles.featureDetail}>-</Text>;
      return (
        <Text style={styles.featureDetail}>
          {`Rede existente ${microgrid.voltageV}V · ${microgrid.onGridPhases}F · ${(microgrid.onGridApparentPowerVA / 1000).toFixed(1)} kW · margem de potência 20%`}
          {microgrid.photoUrl ? ' · foto anexada' : ''}
        </Text>
      );
    case 'external_generator':
      if (!generator) return <Text style={styles.featureDetail}>-</Text>;
      return (
        <Text style={styles.featureDetail}>
          {`Gerador ${generator.voltageV}V · ${generator.phases}F · ${(generator.apparentPowerVA / 1000).toFixed(1)} kVA · FP ${(generator.powerFactor ?? 0.8).toFixed(2)} · margem ${((generator.safetyMarginW ?? 1000) / 1000).toFixed(2)} kW · chave ATS própria ${generator.ownAtsAcknowledged ? 'confirmada' : 'pendente'}`}
          {generator.photoUrl ? ' · foto anexada' : ''}
        </Text>
      );
    case 'external_ats':
      return (
        <Text style={styles.featureDetail}>
          {`Uso para backup completo ${atsBackupAcknowledged ? 'confirmado' : 'pendente'}`}
          {atsPhotoUrl ? ' · foto anexada' : ''}
        </Text>
      );
    case 'backup':
      return <Text style={styles.featureDetail}>Todos os inversores híbridos suportam backup.</Text>;
    case 'pv':
      return <Text style={styles.featureDetail}>Dimensionado com recomendação de arranjo fotovoltaico.</Text>;
    default:
      return <Text style={styles.featureDetail}>-</Text>;
  }
}

function MetricRows({
  metrics,
  perRow = 3,
}: {
  metrics: { label: string; value: string; note?: string; highlight?: boolean }[];
  perRow?: number;
}) {
  const rows: (typeof metrics)[] = [];
  for (let i = 0; i < metrics.length; i += perRow) rows.push(metrics.slice(i, i + perRow));

  return (
    <>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.metricRow} wrap={false}>
          {row.map((metric) => (
            <View key={metric.label} style={[styles.metricCard, styleIf(metric.highlight, styles.metricHighlight)]}>
              <Text style={[styles.metricLabel, styleIf(metric.highlight, styles.metricHighlightText)]}>{metric.label}</Text>
              <Text style={[styles.metricValue, styleIf(metric.highlight, styles.metricHighlightText)]}>{metric.value}</Text>
              {metric.note && <Text style={styles.metricNote}>{metric.note}</Text>}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

function InfoRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <View style={styles.infoBox}>
      {rows.map((row, index) => (
        <View key={row.label} style={[styles.infoRow, styleIf(index === rows.length - 1, styles.infoRowLast)]} wrap={false}>
          <Text style={styles.infoLabel}>{row.label}</Text>
          <Text style={styles.infoValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function ProductLine({
  category,
  nickname,
  model,
  qty,
  note,
  alert,
  description,
  warranty,
  last,
}: {
  category: string;
  nickname?: string | null;
  model: string;
  qty: string;
  note?: string;
  alert?: string;
  description?: string | null;
  warranty?: string | null;
  last?: boolean;
}) {
  return (
    <View style={[styles.productRow, styleIf(last, styles.productRowLast)]} wrap={false}>
      <View style={{ flexShrink: 1, marginRight: 8 }}>
        <Text style={styles.productCategory}>{category}</Text>
        <Text style={styles.productName}>{nickname || model}</Text>
        {nickname && <Text style={styles.productModel}>{model}</Text>}
        {alert && <Text style={styles.productAlert}>{alert}</Text>}
        {note && <Text style={styles.productNote}>{note}</Text>}
        {description && <Text style={styles.productNote}>{description}</Text>}
        {warranty && <Text style={styles.productNote}>Garantia: {warranty}</Text>}
      </View>
      <Text style={styles.productQty}>{qty}</Text>
    </View>
  );
}

function ProductsSection({
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
  const marginRows: MarginRow[] = solution.microgridAlternative
    ? []
    : buildMarginSummary({ desiredFeatures, whiteTariff, microgrid, pv, nominalW, peakW, dailyKwh, solution });

  const productLines: ReactElement<Parameters<typeof ProductLine>[0]>[] = [];
  productLines.push(
    <ProductLine
      key="inverter"
      category="Inversor"
      nickname={productMedia[solution.inverterModel]?.nickname}
      model={solution.inverterModel}
      qty={`×${solution.inverterQty ?? 1}`}
      note={solution.inverterRatedPowerW ? `${solution.inverterRatedPowerW} VA nominal` : undefined}
      warranty={formatWarranty(inverterCatalog.find((item) => item.model === solution.inverterModel))}
    />
  );
  batteryParts.forEach((part, index) => {
    productLines.push(
      <ProductLine
        key={part.model}
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
    );
  });
  if (solution.pvPowerKw !== null) {
    productLines.push(
      <ProductLine
        key="pv"
        category="Potência FV recomendada"
        model="Arranjo fotovoltaico"
        qty={`${solution.pvPowerKw.toFixed(2)} kWp`}
        note={
          solution.pvMonthlyGenerationKwh != null
            ? `${solution.pvMonthlyGenerationKwh.toFixed(0)} kWh/mês estimados`
            : undefined
        }
      />
    );
  }
  solution.accessories.forEach((accessory) => {
    const { model, qty, optional, comment, bundled, appliesTo } = normalizeAccessoryLine(accessory);
    const catalogAccessory = accessoryCatalog.find((item) => item.model === model);
    const bundledLabel =
      appliesTo === 'inverter' ? 'Incluso no inversor' : appliesTo === 'battery' ? 'Incluso na bateria' : 'Incluso';
    productLines.push(
      <ProductLine
        key={model}
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
  });

  const visibleComments = (solution.comments ?? []).filter((comment) => !comment.startsWith('Gerada por regra ESS'));

  return (
    <View style={styles.section} wrap>
      <Text style={styles.sectionTitle}>{title}</Text>
      <MetricRows
        metrics={[
          { label: 'Potência nominal', value: metrics.nominalW != null ? `${(metrics.nominalW / 1000).toFixed(2)} kVA` : '-' },
          { label: 'Potência máxima', value: metrics.peakW != null ? `${(metrics.peakW / 1000).toFixed(2)} kVA` : '-' },
          { label: 'Energia disponível', value: `${metrics.energyKwh.toFixed(2)} kWh` },
        ]}
      />
      <View style={styles.productBox}>
        {productLines.map((line, index) =>
          index === productLines.length - 1 ? cloneElement(line, { last: true }) : line
        )}
      </View>

      {services && services.length > 0 && (
        <View style={styles.subBox}>
          <Text style={styles.subBoxTitle}>Serviços</Text>
          {services.map((line, index) => {
            const unitValue = userServices?.find((service) => service.id === line.serviceId)?.unitValue;
            return (
              <View
                key={line.serviceId}
                style={[styles.subBoxRow, styleIf(index === services.length - 1, styles.subBoxRowLast)]}
                wrap={false}
              >
                <Text style={styles.subBoxRowLabel}>
                  {line.name}
                  {line.qty !== 1 ? ` × ${line.qty}` : ''}
                </Text>
                <Text style={styles.subBoxRowValue}>
                  {unitValue != null ? formatCurrencyBRL(unitValue * line.qty) : 'sem preço'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {marginRows.length > 0 && (
        <View style={styles.subBox}>
          <Text style={styles.subBoxTitle}>Margens operacionais</Text>
          {marginRows.map((row, index) => {
            const marginPct = row.requiredValue > 0 ? ((row.providedValue - row.requiredValue) / row.requiredValue) * 100 : null;
            const insufficient = marginPct !== null && marginPct < 0;
            const unitLabel = row.unit === 'W' ? 'kVA' : 'kWh';
            const toKilo = (value: number) => (value / 1000).toFixed(2);
            const delta = row.providedValue - row.requiredValue;
            return (
              <View
                key={row.key}
                style={[styles.subBoxRow, styleIf(index === marginRows.length - 1, styles.subBoxRowLast)]}
                wrap={false}
              >
                <Text style={styles.subBoxRowLabel}>{(insufficient ? '⚠ ' : '') + row.label}</Text>
                <Text style={[styles.subBoxRowValue, styleIf(insufficient, styles.subBoxRowValueAlert)]}>
                  {`Necessário ${toKilo(row.requiredValue)} ${unitLabel} · Solução oferece ${toKilo(row.providedValue)} ${unitLabel}`}
                  {marginPct !== null && ` (${delta >= 0 ? '+' : '-'}${toKilo(Math.abs(delta))} ${unitLabel})`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {visibleComments.map((comment, index) => (
        <Text key={`${index}-${comment}`} style={styles.commentItem}>
          • {comment}
        </Text>
      ))}
    </View>
  );
}

export interface ProjectQuotePdfInput {
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
}

const knownFeatureIds = new Set<DesiredFeatureId>(DESIRED_FEATURE_DEFINITIONS.map((feature) => feature.id));

/** Renders the project's full technical report as a native PDF Document with
 * @react-pdf/renderer's own primitives (no HTML/CSS) — a real downloadable/
 * attachable file instead of whatever the browser's print-to-PDF dialog
 * produces. Kept as a single big component since every section only exists
 * once and threading it through smaller files would just add indirection. */
export function ProjectQuotePdfDocument({
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
}: ProjectQuotePdfInput) {
  const generatedAt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const documentReference = shortSolutionReference(solution.solutionCode);

  const loadEnergyKwh = (load: (typeof loads)[number]) => {
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
  const reportSystemCost = calculateSystemCost(solution, userStockItems, services, userServices, marginSettings, batteryCatalog);
  const reportPaybackMonths =
    tariffSavings?.tariffOrderValid && tariffSavings.annualSavings > 0 && reportSystemCost.isComplete
      ? calculateDegradedPaybackMonths(reportSystemCost.totalCost, tariffSavings)
      : null;
  const reportPaybackLabel =
    reportPaybackMonths == null
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

  const showLoadsTable = !desiredFeatures || desiredFeatures.includes('backup');
  const showEconomics = reportSystemCost.pricedItemsCount > 0 || Boolean(tariffSavings);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {profile?.companyLogoUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's <Image>, not an <img> — it has no `alt` prop at all.
              <Image src={profile.companyLogoUrl} style={styles.logo} />
            )}
            <View>
              <Text style={styles.companyName}>{profile?.companyName || 'SolaX Power Brasil'}</Text>
              {profile?.companyAddress && !isAddressEmpty(profile.companyAddress) && (
                <Text style={styles.companyAddress}>{formatAddress(profile.companyAddress)}</Text>
              )}
              <Text style={styles.reportTitle}>Relatório de dimensionamento</Text>
              <Text style={styles.generatedAt}>Gerado em {generatedAt}</Text>
            </View>
          </View>
          <Text style={styles.headerRight}>Calculadora SolaX</Text>
        </View>

        <View style={styles.section}>
          <MetricRows
            metrics={[
              { label: 'Pico de carga', value: `${(peakW / 1000).toFixed(2)} kVA` },
              { label: 'Consumo diário', value: `${dailyKwh.toFixed(2)} kWh/dia` },
              { label: 'Topologia', value: topology ? topologyLabels[topology] : '-' },
              {
                label: 'Bateria selecionada',
                value: (selectedBatteryModel && (productMedia?.[selectedBatteryModel]?.nickname || selectedBatteryModel)) || '-',
              },
              { label: 'Rede', value: gridType ? gridLabels[gridType] : '-' },
            ]}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados do projeto</Text>
          <InfoRows
            rows={[
              { label: 'Projeto', value: projectInfo.name || '-' },
              { label: 'Cliente', value: client?.name || '-' },
              { label: 'Email', value: client?.email || '-' },
              { label: 'Telefone', value: client?.phone || '-' },
              { label: 'CPF/CNPJ', value: client?.document || '-' },
              { label: 'Endereço', value: formatAddress(projectInfo.address) || '-' },
              ...(projectInfo.notes ? [{ label: 'Observações', value: projectInfo.notes }] : []),
            ]}
          />
        </View>

        {desiredFeatures && desiredFeatures.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Funcionalidades selecionadas</Text>
            <View style={styles.infoBox}>
              {desiredFeatures
                .filter((id) => knownFeatureIds.has(id))
                .map((id, index, arr) => (
                  <View key={id} style={[styles.featureRow, styleIf(index === arr.length - 1, styles.featureRowLast)]}>
                    <View>
                      <Text style={styles.featureLabel}>{desiredFeatureLabel(id)}</Text>
                      <DesiredFeatureDetail
                        id={id}
                        whiteTariff={whiteTariff}
                        microgrid={microgrid ?? null}
                        generator={generator ?? null}
                        atsPhotoUrl={atsPhotoUrl ?? null}
                        atsBackupAcknowledged={atsBackupAcknowledged ?? false}
                      />
                    </View>
                  </View>
                ))}
            </View>
          </View>
        )}

        <ProductsSection
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
          <ProductsSection
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

        {showLoadsTable && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cargas informadas</Text>
            <Text style={{ fontSize: 7.5, color: COLORS.muted, marginBottom: 6 }}>
              Tempo de operação considerado: {operationHours} h
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow} fixed>
                <Text style={[styles.tableCellName, styles.tableHeaderText]}>Carga</Text>
                <Text style={[styles.tableCellNum, styles.tableHeaderText]}>Potência</Text>
                <Text style={[styles.tableCellNum, styles.tableHeaderText]}>Qtd.</Text>
                <Text style={[styles.tableCellNum, styles.tableHeaderText]}>Pico</Text>
                <Text style={[styles.tableCellNum, styles.tableHeaderText]}>Consumo</Text>
              </View>
              {loads.map((load) => (
                <View key={load.id} style={styles.tableRow} wrap={false}>
                  <Text style={styles.tableCellName}>{load.name}</Text>
                  <Text style={styles.tableCellNum}>{load.powerW} VA</Text>
                  <Text style={styles.tableCellNum}>{load.qty}</Text>
                  <Text style={styles.tableCellNum}>{load.powerW * load.qty} VA</Text>
                  <Text style={styles.tableCellNum}>{loadEnergyKwh(load).toFixed(2)} kWh</Text>
                </View>
              ))}
              <View style={styles.tableFooterRow} wrap={false}>
                <Text style={[styles.tableCellName, styles.tableFooterText]}>Total</Text>
                <Text style={styles.tableCellNum} />
                <Text style={styles.tableCellNum} />
                <Text style={[styles.tableCellNum, styles.tableFooterText]}>{totalLoadPowerW} VA</Text>
                <Text style={[styles.tableCellNum, styles.tableFooterText]}>{totalLoadEnergyKwh.toFixed(2)} kWh</Text>
              </View>
            </View>
          </View>
        )}

        {showEconomics && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Análise econômica</Text>
            <MetricRows
              perRow={2}
              metrics={[
                ...(reportSystemCost.pricedItemsCount > 0
                  ? [
                      {
                        label: reportSystemCost.isComplete ? 'Investimento estimado' : 'Investimento parcial',
                        value: formatCurrencyBRL(reportSystemCost.totalCost),
                        note: reportSystemCost.isComplete ? undefined : `Falta precificar: ${reportSystemCost.missingItems.join(', ')}`,
                      },
                    ]
                  : []),
                ...(tariffSavings?.tariffOrderValid
                  ? [
                      {
                        label: 'Ganho estimado com SolaX',
                        value: `${formatCurrencyBRL(tariffSavings.annualSavings)}/ano`,
                        note:
                          `${formatCurrencyBRL(tariffSavings.monthlySavings)}/mês · considerando ${tariffSavings.businessDaysPerMonth} dias úteis/mês` +
                          ` · bateria ${formatCurrencyBRL(tariffSavings.batteryMonthlySavings)}/mês` +
                          (tariffSavings.pvMonthlySavings > 0
                            ? ` · dos quais ${formatCurrencyBRL(tariffSavings.pvMonthlySavings)}/mês de geração solar`
                            : ''),
                        highlight: true,
                      },
                    ]
                  : []),
                ...(reportPaybackMonths != null
                  ? [{ label: 'Retorno simples estimado', value: reportPaybackLabel ?? '-' }]
                  : []),
                ...(tariffSavings?.tariffOrderValid && tariffSavings.monthlyCostWithoutSolaxBrl != null
                  ? [{ label: 'Custo estimado sem SolaX', value: `${formatCurrencyBRL(tariffSavings.monthlyCostWithoutSolaxBrl)}/mês` }]
                  : []),
                ...(tariffSavings?.tariffOrderValid && tariffSavings.monthlyCostWithSolaxBrl != null
                  ? [{ label: 'Custo estimado com SolaX', value: `${formatCurrencyBRL(tariffSavings.monthlyCostWithSolaxBrl)}/mês` }]
                  : []),
              ]}
            />
            {tariffSavings && !tariffSavings.tariffOrderValid && (
              <View style={styles.warningBox} wrap={false}>
                <Text style={styles.warningText}>
                  Economia e retorno indisponíveis: as tarifas de ponta e intermediária devem ser maiores ou iguais à
                  tarifa fora de ponta.
                </Text>
              </View>
            )}
            {tariffSavings?.tariffOrderValid && (
              <Text style={styles.assumptionsText}>
                Premissas: RTE efetivo de {tariffSavings.effectiveRoundTripEfficiencyPct.toFixed(1)}%, SOH inicial de{' '}
                {tariffSavings.initialSohPercent.toFixed(0)}%, redução de SOH de {tariffSavings.annualSohLossPercent.toFixed(1)}
                %/ano e {tariffSavings.businessDaysPerMonth} dias úteis/mês. Sem reajuste tarifário, sazonalidade,
                manutenção, impostos, custo de disponibilidade ou perdas adicionais.
              </Text>
            )}
          </View>
        )}

        {solution.solutionCode && (
          <View style={styles.referenceBox} wrap={false}>
            <Text style={styles.referenceTitle}>Referência técnica</Text>
            <Text style={styles.referenceCode}>{solution.solutionCode}</Text>
            <Text style={styles.referenceNote}>Identificador interno da regra utilizada no dimensionamento.</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>
            {profile?.companyName || 'SolaX Power Brasil'} · {projectInfo.name || 'Projeto'}
            {documentReference ? ` · Ref. ${documentReference}` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/** Builds the report as a real, downloadable PDF Blob — runs entirely
 * client-side (no server round-trip needed, since every input is already in
 * the wizard store), unlike the old `window.print()` flow this replaces. */
export async function buildProjectQuotePdfBlob(input: ProjectQuotePdfInput): Promise<Blob> {
  return pdf(<ProjectQuotePdfDocument {...input} />).toBlob();
}

/** Assembles a `ProjectQuotePdfInput` straight from a `SavedProject` — used
 * to export a project's report *without* first loading it into the live
 * wizard store. Loading-into-the-store-first used to be how the "Baixar
 * Relatório" card button got its data, but it piggybacked on
 * `currentProjectId` changing to know when to fire, which silently broke
 * (stuck spinner, or one project's download picking up another's data) once
 * two downloads got triggered back to back, or the target project already
 * happened to be the one loaded. Building the input directly from the saved
 * row sidesteps all of that — each call is self-contained. Returns null when
 * the project has no calculated solution, since there'd be nothing to render.
 * `productMedia` (nickname/image lookups) is intentionally omitted here: it's
 * only ever populated for whichever solution is *currently* loaded in the
 * live store, so it would be stale/wrong for an arbitrary saved project —
 * falling back to the bare model code is the honest choice. */
export function buildProjectQuotePdfInputFromSavedProject(
  project: SavedProject,
  {
    client,
    profile,
    userStockItems,
    marginSettings,
    userServices,
    batteryCatalog,
    inverterCatalog,
    accessoryCatalog,
  }: {
    client: Client | null;
    profile: InlineProfile | null;
    userStockItems: UserStockItem[];
    marginSettings?: MarginSettings;
    userServices?: UserServiceItem[];
    batteryCatalog: BatteryCatalogOption[];
    inverterCatalog?: InverterCatalogOption[];
    accessoryCatalog?: AccessoryCatalogOption[];
  }
): ProjectQuotePdfInput | null {
  if (!project.solution) return null;

  return {
    projectInfo: { name: project.name, clientId: project.clientId, address: project.address, notes: project.notes },
    client,
    profile,
    solution: project.solution,
    loads: project.residentialOptions.loads,
    operationHours: project.residentialOptions.operationHours,
    topology: project.residentialOptions.topology,
    selectedBatteryModel: project.residentialOptions.batteryModel,
    gridType: project.residentialOptions.gridType,
    nominalW: totalNominalW(project.residentialOptions.loads),
    peakW: totalPeakW(project.residentialOptions.loads, project.residentialOptions.peakCalcMode ?? 'sum'),
    dailyKwh: totalDailyKwh(project.residentialOptions.loads, project.residentialOptions.operationHours),
    userStockItems,
    marginSettings,
    services: project.services,
    userServices,
    whiteTariff: project.residentialOptions.whiteTariff,
    pv: project.residentialOptions.pv,
    desiredFeatures: project.residentialOptions.desiredFeatures,
    microgrid: project.residentialOptions.microgrid,
    generator: project.residentialOptions.generator,
    atsPhotoUrl: project.residentialOptions.atsPhotoUrl,
    atsBackupAcknowledged: project.residentialOptions.atsBackupAcknowledged,
    batteryCatalog,
    inverterCatalog,
    accessoryCatalog,
  };
}
