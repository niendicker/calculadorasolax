import { Document, G, Line, Page, Polyline, Rect, StyleSheet, Svg, Text, View, pdf } from '@react-pdf/renderer';
import type { Client, ProjectInfo } from '@/lib/types';
import { formatAddress, isAddressEmpty } from '@/lib/address';
import type { CiBessProductRecord } from '@/lib/data/ci-bess-products-repository';
import type {
  BessStrategyId,
  CommercialIndustrialResult,
  DispatchPoint,
  RankingCriterion,
  ScenarioCandidate,
  TariffMarket,
  TariffModality,
} from '@/supabase/functions/_shared/commercial-industrial/types';
import { formatCurrencyBRL, formatKw, formatKwh, formatPercentBRL, formatYears, maskDocument } from '../../helpers';
import { COLORS } from '../../project-quote-pdf';
import type { InlineProfile } from '../../types';

// docs/CI-MODULE-PLAN.md section 9 — the C&I memorial is a technical
// viability study, not a commercial quote. It receives an already-calculated
// CommercialIndustrialResult (result.selected must already carry
// dispatch[]/cashFlow[] — plan section 4.5's materialization rule) and never
// recomputes anything during rendering. Mirrors project-quote-pdf.tsx's
// approach (native @react-pdf/renderer primitives, single file, no HTML/CSS)
// and reuses its brand palette (COLORS) for visual consistency between the
// two reports.

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
  companyName: { fontSize: 10.5, fontWeight: 700, color: COLORS.primary },
  companyAddress: { fontSize: 8, color: COLORS.muted, marginTop: 2, maxWidth: 260 },
  reportTitle: { fontSize: 16, fontWeight: 700, marginTop: 6 },
  reportSubtitle: { fontSize: 8.5, color: COLORS.muted, marginTop: 2 },
  generatedAt: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  headerRight: { fontSize: 8, color: COLORS.muted, textAlign: 'right', maxWidth: 160 },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 8 },
  sectionIntro: { fontSize: 8, color: COLORS.muted, marginBottom: 8, lineHeight: 1.4 },

  metricRow: { flexDirection: 'row', marginBottom: 8 },
  metricCard: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 8, marginRight: 6 },
  metricLabel: { fontSize: 7.5, color: COLORS.muted },
  metricValue: { fontSize: 10.5, fontWeight: 700, marginTop: 3 },
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
  tableRowLast: { borderBottomWidth: 0 },
  tableRowHighlight: { backgroundColor: COLORS.primaryBg },
  tableCell: { flex: 1, fontSize: 7.5, textAlign: 'right' },
  tableCellFirst: { flex: 1.2, fontSize: 7.5, textAlign: 'left' },
  tableHeaderText: { fontSize: 6.8, color: COLORS.muted, fontWeight: 700, textTransform: 'uppercase' },

  warningBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#f3caca',
    backgroundColor: '#fdf1f1',
    borderRadius: 4,
    padding: 8,
  },
  warningText: { fontSize: 7.5, color: COLORS.destructive, marginBottom: 2 },

  noteBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 8, marginTop: 8, backgroundColor: COLORS.mutedBg },
  noteText: { fontSize: 7.5, color: COLORS.muted, lineHeight: 1.4 },

  chartBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 8, marginTop: 6 },
  chartCaption: { fontSize: 7, color: COLORS.muted, marginTop: 4 },
  chartAxisLabel: { position: 'absolute', fontSize: 6, color: COLORS.muted },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 2 },
  legendSwatch: { width: 7, height: 7, marginRight: 4 },
  legendLabel: { fontSize: 7, color: COLORS.muted },

  referenceBox: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, marginBottom: 16 },
  referenceTitle: { fontSize: 8, fontWeight: 700 },
  referenceCode: { fontSize: 7.5, fontFamily: 'Courier', marginTop: 2 },
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

function styleIf<T extends object>(condition: boolean | undefined, style: T): T | Record<string, never> {
  return condition ? style : {};
}

const STRATEGY_LABELS: Record<BessStrategyId, { label: string; description: string }> = {
  BASE: {
    label: 'Linha de base',
    description: 'Sem despacho do BESS — utilizada apenas como referência de comparação.',
  },
  PEAK_SHAVING: {
    label: 'Peak Shaving',
    description:
      'Reduz potência acima do target de demanda e carrega somente fora da ponta. Durante a carga, a potência do BESS é ajustada dinamicamente para que a potência importada não ultrapasse a demanda contratada.',
  },
  LOAD_SHIFTING: {
    label: 'Load Shifting',
    description:
      'Carrega fora da ponta e descarrega durante a ponta acompanhando dinamicamente o consumo até os limites de potência, energia e SOC. Durante a carga, a potência é ajustada para respeitar a demanda contratada.',
  },
  HYBRID: {
    label: 'Híbrido',
    description:
      'Reserva dinamicamente a energia necessária para a próxima janela de ponta e utiliza somente a energia excedente para Peak Shaving. Durante a ponta, combina Load Shifting e redução de demanda. A carga do BESS é modulada dinamicamente para respeitar a demanda contratada.',
  },
};

const TARIFF_MODALITY_LABELS: Record<TariffModality, string> = { verde: 'Verde', azul: 'Azul' };
const MARKET_LABELS: Record<TariffMarket, string> = { cativo: 'Cativo', livre: 'Livre (ACL)' };
const PROFILE_BASIS_LABELS: Record<string, string> = {
  representative_day: 'Dia representativo',
  representative_period: 'Período representativo (semana)',
  annual_series: 'Série anual',
};
const RANKING_CRITERION_LABELS: Record<RankingCriterion, string> = { PAYBACK: 'Payback', ROI: 'ROI', NPV: 'NPV' };

function MetricRows({
  metrics,
  perRow = 4,
}: {
  metrics: { label: string; value: string; highlight?: boolean }[];
  perRow?: number;
}) {
  const rows: (typeof metrics)[] = [];
  for (let index = 0; index < metrics.length; index += perRow) rows.push(metrics.slice(index, index + perRow));

  return (
    <>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.metricRow} wrap={false}>
          {row.map((metric) => (
            <View key={metric.label} style={[styles.metricCard, styleIf(metric.highlight, styles.metricHighlight)]}>
              <Text style={[styles.metricLabel, styleIf(metric.highlight, styles.metricHighlightText)]}>{metric.label}</Text>
              <Text style={[styles.metricValue, styleIf(metric.highlight, styles.metricHighlightText)]}>{metric.value}</Text>
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

function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={styles.legendRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const CHART_WIDTH = 470;
const CHART_HEIGHT = 100;

/** Maps a series of values onto an SVG polyline's `points` string, scaled
 * into [0, width] x [0, height] (y flipped, since SVG grows downward). */
function buildPolylinePoints(values: number[], width: number, height: number, min: number, max: number): string {
  if (values.length === 0) return '';
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Small line chart for a time series (or two, e.g. before/after BESS), with
 * optional dashed reference lines (e.g. SOC min/max). No axis ticks beyond
 * the min/max labels — with up to 672 points (plan section 4.2) per-tick
 * labels would be unreadable, so the caption states the represented period
 * and resolution instead. */
function TimeSeriesChart({
  series,
  referenceLines = [],
  caption,
  formatAxisValue,
}: {
  series: { values: number[]; color: string; label: string }[];
  referenceLines?: { value: number; color: string; label: string }[];
  caption: string;
  formatAxisValue: (value: number) => string;
}) {
  const allValues = [...series.flatMap((item) => item.values), ...referenceLines.map((item) => item.value)];
  if (allValues.length === 0) return null;
  const rawMin = Math.min(...allValues, 0);
  const rawMax = Math.max(...allValues, 0);
  const span = rawMax - rawMin || 1;
  const min = rawMin - span * 0.08;
  const max = rawMax + span * 0.08;

  return (
    <View wrap={false} style={styles.chartBox}>
      <View style={{ position: 'relative' }}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
          <Rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} fill="#ffffff" stroke={COLORS.border} strokeWidth={1} />
          {referenceLines.map((reference) => {
            const y = CHART_HEIGHT - ((reference.value - min) / (max - min)) * CHART_HEIGHT;
            return (
              <Line
                key={reference.label}
                x1={0}
                x2={CHART_WIDTH}
                y1={y}
                y2={y}
                stroke={reference.color}
                strokeWidth={0.75}
                strokeDasharray="3,2"
              />
            );
          })}
          {series.map((item) => (
            <Polyline
              key={item.label}
              points={buildPolylinePoints(item.values, CHART_WIDTH, CHART_HEIGHT, min, max)}
              fill="none"
              stroke={item.color}
              strokeWidth={1.25}
            />
          ))}
        </Svg>
        <Text style={[styles.chartAxisLabel, { top: 2, left: 4 }]}>{formatAxisValue(max)}</Text>
        <Text style={[styles.chartAxisLabel, { bottom: 2, left: 4 }]}>{formatAxisValue(min)}</Text>
      </View>
      <ChartLegend items={[...series.map((item) => ({ color: item.color, label: item.label })), ...referenceLines]} />
      <Text style={styles.chartCaption}>{caption}</Text>
    </View>
  );
}

/** Grouped bar chart comparing CAPEX and annual savings across every
 * evaluated module count — the visual counterpart to the comparison table. */
function ModuleComparisonChart({
  scenarios,
  recommendedScenarioId,
}: {
  scenarios: ScenarioCandidate[];
  /** null when no scenario met the viability bar (Fase 6 audit, Problem
   * #5) — no bar gets the "*" marker in that case. */
  recommendedScenarioId: string | null;
}) {
  const sorted = [...scenarios].sort((a, b) => a.moduleCount - b.moduleCount);
  if (sorted.length === 0) return null;
  const chartHeight = CHART_HEIGHT - 8;
  const maxValue = Math.max(...sorted.map((scenario) => Math.max(scenario.capex, scenario.annualSavings)), 1);
  const groupWidth = CHART_WIDTH / sorted.length;
  const barWidth = Math.min(14, groupWidth / 3);

  return (
    <View wrap={false} style={styles.chartBox}>
      <View style={{ position: 'relative' }}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
          <Rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} fill="#ffffff" stroke={COLORS.border} strokeWidth={1} />
          {sorted.map((scenario, index) => {
            const groupX = index * groupWidth + groupWidth / 2;
            const capexHeight = (scenario.capex / maxValue) * chartHeight;
            const savingsHeight = (scenario.annualSavings / maxValue) * chartHeight;
            return (
              <G key={scenario.scenarioId}>
                <Rect x={groupX - barWidth - 1} y={chartHeight - capexHeight} width={barWidth} height={capexHeight} fill={COLORS.primary} />
                <Rect x={groupX + 1} y={chartHeight - savingsHeight} width={barWidth} height={savingsHeight} fill="#2f9e58" />
              </G>
            );
          })}
        </Svg>
        {/* Y-axis scale — the chart previously had none, so the bars had no
         * readable reference beyond relative height (Fase 6 audit, Problem
         * #7 investigation). */}
        <Text style={[styles.chartAxisLabel, { top: 2, left: 4 }]}>{formatCurrencyBRL(maxValue)}</Text>
        <Text style={[styles.chartAxisLabel, { bottom: 10, left: 4 }]}>{formatCurrencyBRL(0)}</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {sorted.map((scenario) => (
          <Text key={scenario.scenarioId} style={{ flex: 1, fontSize: 6.5, textAlign: 'center', color: COLORS.muted }}>
            {scenario.moduleCount}
            {scenario.scenarioId === recommendedScenarioId ? '*' : ''}
          </Text>
        ))}
      </View>
      <ChartLegend items={[{ color: COLORS.primary, label: 'CAPEX' }, { color: '#2f9e58', label: 'Economia anual' }]} />
      <Text style={styles.chartCaption}>
        Eixo horizontal: quantidade de módulos avaliada
        {recommendedScenarioId ? ' (* = cenário recomendado).' : '. Nenhum cenário foi recomendado — ver Resumo executivo.'}
      </Text>
    </View>
  );
}

function DispatchTimeSeries({ dispatch, resolutionMinutes, periodStart, periodEnd }: { dispatch: DispatchPoint[]; resolutionMinutes: number; periodStart: string; periodEnd: string }) {
  const caption = `Semana representativa: ${periodStart} a ${periodEnd} · resolução de ${resolutionMinutes} min · ${dispatch.length} pontos.`;
  return (
    <>
      <TimeSeriesChart
        caption={caption}
        formatAxisValue={formatKw}
        series={[
          { values: dispatch.map((point) => point.loadKw), color: COLORS.destructive, label: 'Carga original' },
          { values: dispatch.map((point) => point.gridImportKw), color: COLORS.primary, label: 'Carga após BESS (importação da rede)' },
        ]}
      />
      <TimeSeriesChart
        caption={caption}
        formatAxisValue={formatKw}
        series={[
          { values: dispatch.map((point) => point.chargeKw), color: '#2f9e58', label: 'Carga do BESS' },
          { values: dispatch.map((point) => point.dischargeKw), color: '#b45309', label: 'Descarga do BESS' },
        ]}
      />
    </>
  );
}

function SocChart({
  dispatch,
  totalCapacityKwh,
  socMinPercent,
  socMaxPercent,
}: {
  dispatch: DispatchPoint[];
  totalCapacityKwh: number;
  socMinPercent: number | null;
  socMaxPercent: number | null;
}) {
  const referenceLines =
    socMinPercent === null || socMaxPercent === null
      ? []
      : [
          { value: (totalCapacityKwh * socMinPercent) / 100, color: COLORS.destructive, label: `SOC mín. (${formatPercentBRL(socMinPercent, 0)})` },
          { value: (totalCapacityKwh * socMaxPercent) / 100, color: '#2f9e58', label: `SOC máx. (${formatPercentBRL(socMaxPercent, 0)})` },
        ];
  return (
    <TimeSeriesChart
      caption="Estado de carga (SOC) do BESS ao longo da semana representativa simulada."
      formatAxisValue={formatKwh}
      series={[{ values: dispatch.map((point) => point.socKwh), color: COLORS.primary, label: 'SOC' }]}
      referenceLines={referenceLines}
    />
  );
}

function ScenarioTableRow({ scenario, recommended, last }: { scenario: ScenarioCandidate; recommended: boolean; last: boolean }) {
  return (
    <View style={[styles.tableRow, styleIf(last, styles.tableRowLast), styleIf(recommended, styles.tableRowHighlight)]} wrap={false}>
      <Text style={styles.tableCellFirst}>
        {scenario.moduleCount}
        {recommended ? ' (recomendado)' : ''}
        {!scenario.technicalValidity ? ' — inválido' : ''}
      </Text>
      <Text style={styles.tableCell}>{formatCurrencyBRL(scenario.capex)}</Text>
      <Text style={styles.tableCell}>{formatCurrencyBRL(scenario.annualSavings)}</Text>
      <Text style={styles.tableCell}>{formatYears(scenario.paybackYearsSimple)}</Text>
      <Text style={styles.tableCell}>{formatYears(scenario.paybackYearsDiscounted)}</Text>
      <Text style={styles.tableCell}>{formatPercentBRL(scenario.roiPercent)}</Text>
      <Text style={styles.tableCell}>{formatCurrencyBRL(scenario.npv)}</Text>
      <Text style={styles.tableCell}>{scenario.marginalGain === null ? '—' : formatCurrencyBRL(scenario.marginalGain)}</Text>
    </View>
  );
}

export interface CiMemorialPdfInput {
  projectInfo: ProjectInfo;
  client: Client | null;
  profile: InlineProfile | null;
  result: CommercialIndustrialResult;
  product: CiBessProductRecord | null;
  rankingCriterion?: RankingCriterion;
}

/** Renders the C&I study as a native PDF Document — see file header comment.
 * `result.selected` is populated whenever `result.scenarios` is non-empty,
 * but it is only actually "recomendado" when `result.recommendation.
 * scenarioId` is non-null (Fase 6 audit, Problem #5) — when no scenario
 * clears the configured viability bar, `selected` still carries the
 * smallest evaluated module count for reference, and every section below
 * that would otherwise say "recomendado" switches to a neutral "avaliado"
 * framing instead (never silently mislabeling a nonviable result). */
export function CiMemorialPdfDocument({ projectInfo, client, profile, result, product, rankingCriterion }: CiMemorialPdfInput) {
  const generatedAt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const selected = result.selected;
  const isRecommended = result.recommendation.scenarioId !== null;
  const strategyInfo = selected ? STRATEGY_LABELS[selected.strategy] : null;
  const sortedScenarios = [...result.scenarios].sort((a, b) => a.moduleCount - b.moduleCount);
  const totalWarnings = [...result.warnings, ...(selected?.technicalWarnings ?? [])];

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{profile?.companyName || 'SolaX Power Brasil'}</Text>
            {profile?.companyAddress && !isAddressEmpty(profile.companyAddress) && (
              <Text style={styles.companyAddress}>{formatAddress(profile.companyAddress)}</Text>
            )}
            <Text style={styles.reportTitle}>Memorial técnico de viabilidade — BESS C&amp;I</Text>
            <Text style={styles.reportSubtitle}>Estudo técnico de viabilidade, não uma cotação comercial.</Text>
            <Text style={styles.generatedAt}>Gerado em {generatedAt}</Text>
          </View>
          <Text style={styles.headerRight}>
            Calculadora SolaX{'\n'}Motor {result.engineVersion}
            {'\n'}Ref. {result.inputFingerprint.slice(0, 12)}
          </Text>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Resumo executivo</Text>
          {selected ? (
            <>
              <Text style={styles.sectionIntro}>{result.recommendation.reason}</Text>
              <MetricRows
                metrics={[
                  {
                    label: isRecommended ? 'Módulos recomendados' : 'Módulos (menor configuração avaliada)',
                    value: `${selected.moduleCount}`,
                    highlight: isRecommended,
                  },
                  { label: 'CAPEX', value: formatCurrencyBRL(selected.capex) },
                  { label: 'Economia anual', value: formatCurrencyBRL(selected.annualSavings) },
                  { label: 'Payback simples', value: formatYears(selected.paybackYearsSimple) },
                  { label: 'Payback descontado', value: formatYears(selected.paybackYearsDiscounted) },
                  { label: 'ROI anual', value: formatPercentBRL(selected.roiPercent) },
                  { label: 'NPV', value: formatCurrencyBRL(selected.npv) },
                  { label: 'Estratégia', value: strategyInfo?.label ?? selected.strategy },
                ]}
              />
            </>
          ) : (
            <Text style={styles.sectionIntro}>Nenhum cenário foi avaliado nesta execução.</Text>
          )}
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Dados do projeto</Text>
          <InfoRows
            rows={[
              { label: 'Projeto', value: projectInfo.name || '-' },
              { label: 'Cliente', value: client?.name || '-' },
              { label: 'Email', value: client?.email || '-' },
              { label: 'Telefone', value: client?.phone || '-' },
              { label: 'CPF/CNPJ', value: client?.document ? maskDocument(client.document) : '-' },
              { label: 'Endereço', value: formatAddress(projectInfo.address) || '-' },
              ...(projectInfo.notes ? [{ label: 'Observações', value: projectInfo.notes }] : []),
            ]}
          />
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Premissas temporais, tarifárias e financeiras</Text>
          <InfoRows
            rows={[
              { label: 'Perfil da curva', value: PROFILE_BASIS_LABELS[result.assumptions.loadCurve.profileBasis] ?? result.assumptions.loadCurve.profileBasis },
              { label: 'Período representado', value: `${result.assumptions.loadCurve.periodStart} a ${result.assumptions.loadCurve.periodEnd}` },
              { label: 'Resolução / fuso', value: `${result.assumptions.loadCurve.resolutionMinutes} min · ${result.assumptions.loadCurve.timezone}` },
              { label: 'Tarifa de energia (ponta / fora ponta)', value: `${formatCurrencyBRL(result.assumptions.tariff.energyRatePeakBrlPerMwh)} / ${formatCurrencyBRL(result.assumptions.tariff.energyRateOffPeakBrlPerMwh)} por MWh` },
              { label: 'Tarifa de demanda', value: `${formatCurrencyBRL(result.assumptions.tariff.demandRateBrlPerKwMonth)}/kW-mês` },
              { label: 'Demanda contratada', value: formatKw(result.assumptions.tariff.contractedDemandKw) },
              { label: 'Janela de ponta', value: `${result.assumptions.tariff.peakStart} às ${result.assumptions.tariff.peakEnd}` },
              { label: 'Modalidade tarifária / mercado', value: `${TARIFF_MODALITY_LABELS[result.assumptions.tariff.tariffModality]} · ${MARKET_LABELS[result.assumptions.tariff.market]}` },
              { label: 'ICMS / PIS-COFINS', value: `${formatPercentBRL(result.assumptions.tariff.icmsPercent)} / ${formatPercentBRL(result.assumptions.tariff.pisCofinsPercent)}` },
              { label: 'Taxa de desconto', value: `${formatPercentBRL(result.assumptions.financial.discountRatePercent)} a.a.` },
              { label: 'Horizonte de análise', value: `${result.assumptions.financial.analysisHorizonYears} anos` },
              {
                label: 'Inflação energética anual (reajuste uniforme aplicado ao fluxo de caixa)',
                value: formatPercentBRL(result.assumptions.financial.annualEnergyInflationPercent),
              },
              ...(rankingCriterion ? [{ label: 'Critério de ranking', value: RANKING_CRITERION_LABELS[rankingCriterion] }] : []),
            ]}
          />
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Linha de base (sem BESS)</Text>
          <MetricRows
            metrics={[
              { label: 'Custo anual estimado', value: formatCurrencyBRL(result.baseline.annualCostBrl) },
              { label: 'Demanda máx. na ponta', value: formatKw(result.baseline.maxDemandPeakKw) },
              { label: 'Demanda máx. fora ponta', value: formatKw(result.baseline.maxDemandOffPeakKw) },
              {
                // Fase 6 audit, Problem #1: this used to show the ANNUALIZED
                // total mislabeled "(semana)" — ~52x (WEEKS_PER_YEAR) too
                // high. weeklyEnergyImportedPeakKwh/OffPeakKwh are the
                // literal representative-week totals (types.ts's
                // BaselineResult), unscaled.
                label: 'Energia importada (semana representativa)',
                value: formatKwh(result.baseline.weeklyEnergyImportedPeakKwh + result.baseline.weeklyEnergyImportedOffPeakKwh),
              },
              {
                label: 'Energia importada (projeção anual)',
                value: formatKwh(result.baseline.energyImportedPeakKwh + result.baseline.energyImportedOffPeakKwh, 0),
              },
            ]}
          />
        </View>

        {selected && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{isRecommended ? 'BESS recomendado' : 'BESS avaliado (menor configuração — não recomendada)'}</Text>
            <InfoRows
              rows={[
                { label: 'Produto', value: product ? `${product.model} · ${product.manufacturer}` : 'Produto não disponível no catálogo ativo' },
                ...(product?.description ? [{ label: 'Descrição', value: product.description }] : []),
                { label: 'Quantidade de módulos', value: `${selected.moduleCount}` },
                { label: 'Potência total', value: formatKw(selected.totalPowerKw) },
                { label: 'Capacidade total / útil', value: `${formatKwh(selected.totalCapacityKwh)} / ${formatKwh(selected.usefulCapacityKwh)}` },
                ...(product ? [{ label: 'Eficiência de ciclo (catálogo)', value: formatPercentBRL(product.efficiency_percent) }] : []),
                ...(product
                  ? [{ label: 'Faixa de SOC operacional', value: `${formatPercentBRL(product.soc_min_percent, 0)} – ${formatPercentBRL(product.soc_max_percent, 0)}` }]
                  : []),
                ...(product ? [{ label: 'Garantia', value: `${product.warranty_years} anos` }] : []),
              ]}
            />
          </View>
        )}

        {selected && strategyInfo && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Estratégia de despacho</Text>
            <Text style={styles.sectionIntro}>
              <Text style={{ fontWeight: 700 }}>{strategyInfo.label}. </Text>
              {strategyInfo.description}
            </Text>
          </View>
        )}

        {selected && selected.dispatch.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Curva de carga original × carga após BESS, carga/descarga</Text>
            <DispatchTimeSeries
              dispatch={selected.dispatch}
              resolutionMinutes={result.assumptions.loadCurve.resolutionMinutes}
              periodStart={result.assumptions.loadCurve.periodStart}
              periodEnd={result.assumptions.loadCurve.periodEnd}
            />
          </View>
        )}

        {selected && selected.dispatch.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SOC e operação</Text>
            <SocChart
              dispatch={selected.dispatch}
              totalCapacityKwh={selected.totalCapacityKwh}
              socMinPercent={product?.soc_min_percent ?? null}
              socMaxPercent={product?.soc_max_percent ?? null}
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comparação por quantidade de módulos</Text>
          <ModuleComparisonChart scenarios={result.scenarios} recommendedScenarioId={result.recommendation.scenarioId} />
          <View style={[styles.table, { marginTop: 10 }]}>
            <View style={styles.tableHeaderRow} fixed>
              <Text style={[styles.tableCellFirst, styles.tableHeaderText]}>Módulos</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>CAPEX</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Economia/ano</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Payback simples</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Payback desc.</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>ROI</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>NPV</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Ganho marginal</Text>
            </View>
            {sortedScenarios.map((scenario, index) => (
              <ScenarioTableRow
                key={scenario.scenarioId}
                scenario={scenario}
                recommended={scenario.scenarioId === result.recommendation.scenarioId}
                last={index === sortedScenarios.length - 1}
              />
            ))}
          </View>
        </View>

        {selected && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>
              CAPEX, economia, payback, ROI e NPV — {isRecommended ? 'cenário recomendado' : 'menor configuração avaliada'}
            </Text>
            <MetricRows
              perRow={3}
              metrics={[
                { label: 'CAPEX', value: formatCurrencyBRL(selected.capex) },
                { label: 'Economia de energia/ano', value: formatCurrencyBRL(selected.energySavings) },
                { label: 'Economia de demanda/ano', value: formatCurrencyBRL(selected.demandSavings) },
                { label: 'Economia total/ano', value: formatCurrencyBRL(selected.annualSavings), highlight: isRecommended },
                { label: 'Payback simples', value: formatYears(selected.paybackYearsSimple) },
                { label: 'Payback descontado', value: formatYears(selected.paybackYearsDiscounted) },
                { label: 'ROI anual', value: formatPercentBRL(selected.roiPercent) },
                { label: 'NPV', value: formatCurrencyBRL(selected.npv) },
              ]}
            />
          </View>
        )}

        {selected && selected.cashFlow.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fluxo de caixa — {isRecommended ? 'cenário recomendado' : 'menor configuração avaliada'}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow} fixed>
                <Text style={[styles.tableCellFirst, styles.tableHeaderText]}>Ano</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText]}>Fluxo nominal</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText]}>Fluxo descontado</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText]}>Acumulado (nominal)</Text>
              </View>
              {selected.cashFlow.map((year, index) => (
                <View
                  key={year.year}
                  style={[styles.tableRow, styleIf(index === selected.cashFlow.length - 1, styles.tableRowLast)]}
                  wrap={false}
                >
                  <Text style={styles.tableCellFirst}>{year.year === 0 ? 'Ano 0 (investimento)' : `Ano ${year.year}`}</Text>
                  <Text style={styles.tableCell}>{formatCurrencyBRL(year.nominalCashFlow)}</Text>
                  <Text style={styles.tableCell}>{formatCurrencyBRL(year.discountedCashFlow)}</Text>
                  <Text style={styles.tableCell}>{formatCurrencyBRL(year.cumulativeNominalCashFlow)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Insights</Text>
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              • {result.recommendation.reason}
              {'\n'}• A economia de energia resulta da diferença entre o custo com e sem BESS na semana representativa; a
              economia de demanda, da diferença entre as demandas cobradas antes e depois do despacho simulado.
              {'\n'}• O ganho marginal de cada cenário é a diferença em relação ao cenário com uma quantidade de módulos
              imediatamente menor dentro da mesma faixa avaliada — cenários com ganho marginal nulo ou negativo indicam que
              módulos adicionais deixaram de trazer benefício financeiro proporcional.
              {rankingCriterion ? `\n• A recomendação usa o critério de ranking configurado no projeto: ${RANKING_CRITERION_LABELS[rankingCriterion]}.` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Limitações e avisos</Text>
          {totalWarnings.length > 0 && (
            <View style={styles.warningBox}>
              {totalWarnings.map((message, index) => (
                <Text key={`${index}-${message}`} style={styles.warningText}>
                  • {message}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              Este estudo considera uma semana representativa (até 672 pontos), sem exportação de energia para a rede, uma
              única eficiência de ciclo convertida em cargas/descargas equivalentes, e não modela geração solar ou gerador.
              Considera crescimento tarifário uniforme conforme a inflação energética configurada, sem modelar
              individualmente reajustes tarifários, bandeiras ou alterações regulatórias, nem sazonalidade, degradação
              eletroquímica detalhada ou calendário regulatório completo. Os valores financeiros são estimativas a partir
              das premissas declaradas nesta seção e não substituem uma proposta comercial formal.
            </Text>
          </View>
        </View>

        <View style={styles.referenceBox} wrap={false}>
          <Text style={styles.referenceTitle}>Memorial resumido</Text>
          <Text style={styles.referenceCode}>
            Motor {result.engineVersion} · Fingerprint {result.inputFingerprint} · Gerado em {generatedAt}
          </Text>
          <Text style={styles.referenceNote}>
            Este identificador amarra o resultado às premissas e à versão do motor que o produziu — reaberturas futuras
            deste projeto mostram o snapshot congelado, e um novo cálculo gera uma nova execução, sem sobrescrever esta.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${profile?.companyName || 'SolaX Power Brasil'} · ${projectInfo.name || 'Projeto C&I'} · Página ${pageNumber}/${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/** Builds the memorial as a downloadable PDF Blob — runs entirely
 * client-side, fed by an already-calculated result (never recomputes). */
export async function buildCiMemorialPdfBlob(input: CiMemorialPdfInput): Promise<Blob> {
  return pdf(<CiMemorialPdfDocument {...input} />).toBlob();
}
