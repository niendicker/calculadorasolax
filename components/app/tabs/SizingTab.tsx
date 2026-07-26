'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Battery,
  BatteryCharging,
  Boxes,
  Cable,
  Calculator,
  Check,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Eraser,
  FileText,
  FolderOpen,
  Fuel,
  Gauge,
  ImagePlus,
  Layers,
  ListChecks,
  Loader2,
  Moon,
  Network,
  Package,
  Plug,
  Receipt,
  Save,
  Settings,
  SolarPanel,
  Sun,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Separator } from '@/components/ui/separator';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import type {
  BatteryTopology,
  DesiredFeatureId,
  GeneratorConfig,
  InverterFlag,
  MicrogridConfig,
  PeakCalcMode,
  ProductDocument,
  PvConfig,
  ResidentialGridType,
  Solution,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipBubble, useTooltipFlip } from '@/components/ui/tooltip';
import {
  batteryQuantityBreakdown,
  buildMarginSummary,
  buildProjectShareText,
  calculateSystemCost,
  calculateTariffSavings,
  checkPhaseVoltageCompatibility,
  TARIFF_BUSINESS_DAYS_PER_MONTH,
  effectiveTargetEnergyWh,
  effectiveTargetPowerW,
  expansionModelSet,
  formatCurrencyBRL,
  gridTypePhaseVoltage,
  isGeneratorAtsUnacknowledged,
  isGeneratorPhaseVoltageIncompatible,
  isGeneratorPowerInsufficient,
  isMicrogridPhaseVoltageIncompatible,
  isMicrogridPowerNoticeUnacknowledged,
  isPvConfigIncomplete,
  normalizeAccessoryLine,
  solutionHasInsufficientMargin,
  solutionMetrics,
  type MarginRow,
} from '../helpers';
import type { AutosaveStatus } from '../hooks/useAutosave';
import { PageHeader, PageSummary } from '../shell/slots';
import {
  BatteryCardsSkeleton,
  DocPreviewModal,
  ImagePreviewModal,
  Metric,
  ProductAttachments,
  ProductImage,
  SharePreviewModal,
  SolutionSkeleton,
} from '../shared-ui';
import {
  gridLabels,
  gridOptions,
  topologyLabels,
  type BatteryCatalogOption,
  type InverterCatalogOption,
  type ProductMedia,
} from '../types';

export function SizingTab({
  title,
  projectName,
  loadingLabel,
  calculateLabel,
  residentialOptions,
  batteryCatalog,
  inverterCatalog,
  availableInverterModels,
  solution,
  secondarySolution,
  secondaryError,
  nominalW,
  peakW,
  dailyKwh,
  canCalculate,
  loading,
  initialLoading,
  error,
  setTopology,
  setBatteryModel,
  setSecondaryBatteryModel,
  setInverterModel,
  setGridType,
  setDesiredFeatures,
  setWhiteTariffConfig,
  setMicrogridConfig,
  setGeneratorConfig,
  setPvConfig,
  setAtsPhotoUrl,
  setAtsBackupAcknowledged,
  onUploadFeaturePhoto,
  resetResidential,
  calculate,
  exportPdf,
  autosaveStatus,
  autosaveLastSavedAt,
  productMedia,
  userStockItems,
  onChooseMicrogridVariant,
}: {
  title: string;
  projectName: string;
  loadingLabel: string;
  calculateLabel: string;
  residentialOptions: {
    topology: BatteryTopology | null;
    batteryModel: string | null;
    secondaryBatteryModel: string | null;
    inverterModel: string | null;
    gridType: ResidentialGridType | null;
    loads: unknown[];
    desiredFeatures: DesiredFeatureId[];
    whiteTariff: WhiteTariffConfig | null;
    microgrid: MicrogridConfig | null;
    generator: GeneratorConfig | null;
    pv: PvConfig | null;
    atsPhotoUrl: string | null;
    atsBackupAcknowledged: boolean;
    maxPowerPerPhaseW: number | null;
    peakCalcMode: PeakCalcMode;
  };
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  solution: Solution | null;
  secondarySolution: Solution | null;
  secondaryError: string | null;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
  canCalculate: boolean;
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setSecondaryBatteryModel: (batteryModel: string | null) => void;
  setInverterModel: (inverterModel: string | null) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  setDesiredFeatures: (desiredFeatures: DesiredFeatureId[]) => void;
  setWhiteTariffConfig: (whiteTariff: WhiteTariffConfig | null) => void;
  setMicrogridConfig: (microgrid: MicrogridConfig | null) => void;
  setGeneratorConfig: (generator: GeneratorConfig | null) => void;
  setPvConfig: (pv: PvConfig | null) => void;
  setAtsPhotoUrl: (atsPhotoUrl: string | null) => void;
  setAtsBackupAcknowledged: (atsBackupAcknowledged: boolean) => void;
  onUploadFeaturePhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
  resetResidential: () => void;
  calculate: () => void;
  exportPdf: () => void;
  autosaveStatus: AutosaveStatus;
  autosaveLastSavedAt: Date | null;
  productMedia: Record<string, ProductMedia>;
  userStockItems: UserStockItem[];
  onChooseMicrogridVariant: (variant: 'economic' | 'microgrid') => void;
}) {
  const [mainTab, setMainTab] = useState<'features' | 'config'>('features');
  const [configTab, setConfigTab] = useState<'gridType' | 'battery'>('gridType');
  const [activeFeatureTab, setActiveFeatureTab] = useState<DesiredFeatureId>('backup');
  const [summaryTab, setSummaryTab] = useState<'resumo' | 'solucao'>('resumo');
  const [activeBatteryTab, setActiveBatteryTab] = useState<'primary' | 'secondary'>('primary');
  const [previewText, setPreviewText] = useState<string | null>(null);

  const hasSecondaryBattery = Boolean(residentialOptions.secondaryBatteryModel);
  const effectiveBatteryTab = hasSecondaryBattery ? activeBatteryTab : 'primary';
  const activeSolution = effectiveBatteryTab === 'primary' ? solution : secondarySolution;
  const activeError = effectiveBatteryTab === 'primary' ? error : secondaryError;

  // Jump straight to the Solução tab whenever a fresh calculation finishes
  // (success or failure) — that's where the feedback the user just asked
  // for lives, so they shouldn't have to switch tabs manually to see it.
  // This can't move into the Calcular button's click handler: `solution`
  // also changes when a saved project is loaded, which this must catch too.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (solution || error || secondarySolution || secondaryError) setSummaryTab('solucao');
  }, [solution, error, secondarySolution, secondaryError]);

  function jumpToGridType() {
    setMainTab('config');
    setConfigTab('gridType');
  }

  function jumpToBattery() {
    setMainTab('config');
    setConfigTab('battery');
  }

  function jumpToFeature(id: DesiredFeatureId) {
    setMainTab('features');
    setActiveFeatureTab(id);
  }

  // Bubbles the same per-tab warning up to the "Funcionalidades"/"Configurações"
  // main tabs, so a pending issue is visible even while the user is looking
  // at the other section — no need to click through every feature tab first.
  const featuresTabHasIssue = DESIRED_FEATURE_DEFINITIONS.some((feature) =>
    desiredFeatureHasPendingIssue(feature.id, residentialOptions.desiredFeatures, {
      microgrid: residentialOptions.microgrid,
      generator: residentialOptions.generator,
      pv: residentialOptions.pv,
      atsBackupAcknowledged: residentialOptions.atsBackupAcknowledged,
      gridType: residentialOptions.gridType,
      peakW,
      loadsCount: residentialOptions.loads.length,
      inverterCatalog,
      availableInverterModels,
      selectedInverterModel: residentialOptions.inverterModel,
    })
  );
  const configTabHasIssue = availableInverterModels !== null && availableInverterModels.size === 0;

  const gridTypeSummary = residentialOptions.gridType
    ? `${gridLabels[residentialOptions.gridType]}${
        residentialOptions.inverterModel ? ` · ${residentialOptions.inverterModel}` : ' · inversor pendente'
      }`
    : 'Nenhuma seleção';

  // The Resumo cards must reflect everything the solution needs to cover, not
  // just the registered loads — e.g. Tarifa Branca raises the power/energy
  // floor (with or without a backup reserve on top), same targets the
  // Edge Function actually sizes against (see effectiveTargetPowerW/
  // effectiveTargetEnergyWh). The loads themselves only count here while
  // Backup is enabled — disabling it doesn't clear the registered loads (the
  // user may re-enable it later), but they shouldn't inflate the summary
  // while backup isn't actually being requested.
  const isBackupEnabled = residentialOptions.desiredFeatures.includes('backup');
  const backupNominalW = isBackupEnabled ? nominalW : 0;
  const backupPeakW = isBackupEnabled ? peakW : 0;
  const backupDailyKwh = isBackupEnabled ? dailyKwh : 0;
  const summaryNominalW = effectiveTargetPowerW(residentialOptions.desiredFeatures, residentialOptions.whiteTariff, backupNominalW);
  const summaryPeakW = effectiveTargetPowerW(residentialOptions.desiredFeatures, residentialOptions.whiteTariff, backupPeakW);
  const summaryDailyKwh =
    effectiveTargetEnergyWh(residentialOptions.desiredFeatures, residentialOptions.whiteTariff, backupDailyKwh * 1000) / 1000;

  // Resumo tab shows the same alert as soon as anything on the page (either
  // section tab) is pending review — no need to switch tabs to notice. A
  // missing battery selection is critical (blocks calculation, see
  // canCalculate); a missing inverter selection is just a heads-up since the
  // backend auto-selects one — same split as the "Inversor"/"Bateria"
  // SummaryRows below.
  const resumoTabCritical = featuresTabHasIssue || configTabHasIssue || !residentialOptions.batteryModel;
  const resumoTabWarning = !residentialOptions.inverterModel;

  // Solução tab shows an alert when the recommended solution falls short of
  // what's required on any operational margin row (same rows/gating as
  // ResultSummary's buildMarginSummary call below).
  const solutionMarginRows =
    activeSolution && !activeSolution.microgridAlternative
      ? buildMarginSummary({
          desiredFeatures: residentialOptions.desiredFeatures,
          whiteTariff: residentialOptions.whiteTariff,
          microgrid: residentialOptions.microgrid,
          pv: residentialOptions.pv,
          nominalW: backupNominalW,
          peakW: backupPeakW,
          dailyKwh: backupDailyKwh,
          solution: activeSolution,
        })
      : [];
  const solutionTabHasIssue = solutionMarginRows.some((row) => row.providedValue < row.requiredValue);

  // Broader than solutionTabHasIssue on purpose: blocks PDF export whenever
  // *either* battery search (primary or secondary) came back short on power/
  // energy, not just whichever tab happens to be active right now — the
  // printed report always includes both solutions regardless of which tab is
  // selected on screen (see PrintableReport.tsx). Skips a solution still
  // sitting on an unchosen microgrid alternative — there's no export button
  // reachable in that state (see ResultSummary's MicrogridVariantChoice
  // early-return), so there's nothing to gate yet.
  const marginCheckParams = {
    desiredFeatures: residentialOptions.desiredFeatures,
    whiteTariff: residentialOptions.whiteTariff,
    microgrid: residentialOptions.microgrid,
    pv: residentialOptions.pv,
    nominalW: backupNominalW,
    peakW: backupPeakW,
    dailyKwh: backupDailyKwh,
  };
  const hasInsufficientSolution = [solution, secondarySolution].some(
    (s) => s && !s.microgridAlternative && solutionHasInsufficientMargin(s, marginCheckParams)
  );

  return (
    <>
      <PageHeader>
        <div>
          {projectName ? (
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <FolderOpen className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              {projectName}
            </h1>
          ) : (
            // No project loaded/named yet — keep a heading for screen readers
            // without showing the app/section name visually in the title bar.
            <h1 className="sr-only">{title}</h1>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutosaveIndicator status={autosaveStatus} lastSavedAt={autosaveLastSavedAt} />
          <ConfirmDeleteButton
            ariaLabel="Limpar dimensionamento"
            title="Limpar dimensionamento?"
            description="Cargas, configurações e a solução calculada nesta aba serão apagadas."
            confirmLabel="Limpar"
            label="Limpar"
            icon={<Eraser className="h-4 w-4" />}
            onConfirm={() => resetResidential()}
            triggerVariant="outline"
          />
          {solution && (
            <Button
              variant="outline"
              onClick={exportPdf}
              disabled={!canCalculate || loading || hasInsufficientSolution}
              title={
                hasInsufficientSolution
                  ? 'A solução encontrada não atende 100% aos requisitos de potência/energia — ajuste as cargas ou escolha outro modelo para poder baixar o relatório.'
                  : undefined
              }
            >
              <FileText className="h-4 w-4" />
              Baixar relatório
            </Button>
          )}
          <Button onClick={calculate} disabled={!canCalculate || loading}>
            <Calculator className="h-4 w-4" />
            {loading ? loadingLabel : calculateLabel}
          </Button>
        </div>
      </PageHeader>

      <PageSummary>
        {/* Sticky within the summary aside (the only place this ever renders —
         * see PageSummary): the tab switcher plus whichever tab's top metric
         * cards are active stay pinned while everything below scrolls
         * underneath. Negative margins cancel the aside's own px-4/py-5
         * padding so the sticky background spans full width and touches the
         * top edge, then re-applies that padding inside. */}
        <div className="sticky top-0 z-10 -mx-4 -mt-5 space-y-3 bg-card px-4 pt-5 pb-3">
          <div className="flex gap-1 rounded-md bg-muted/60 p-0.5" role="tablist" aria-label="Seções do resumo">
            <button
              type="button"
              role="tab"
              aria-selected={summaryTab === 'resumo'}
              onClick={() => setSummaryTab('resumo')}
              className={cn(
                'flex h-11 flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10',
                summaryTab === 'resumo'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              {resumoTabCritical ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
              ) : (
                resumoTabWarning && (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-500 dark:text-yellow-400" aria-hidden="true" />
                )
              )}
              Resumo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={summaryTab === 'solucao'}
              onClick={() => setSummaryTab('solucao')}
              className={cn(
                'flex h-11 flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10',
                summaryTab === 'solucao'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              {solutionTabHasIssue ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    solution || secondarySolution ? 'bg-primary' : 'bg-transparent'
                  )}
                />
              )}
              Solução
            </button>
          </div>
          {summaryTab === 'solucao' && hasSecondaryBattery && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Bateria da solução">
              {(['primary', 'secondary'] as const).map((tab) => {
                const model =
                  tab === 'primary' ? residentialOptions.batteryModel : residentialOptions.secondaryBatteryModel;
                const label = (model && productMedia[model]?.nickname) || model || '—';
                const active = effectiveBatteryTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveBatteryTab(tab)}
                    className={cn(
                      'truncate rounded-md px-2 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {summaryTab === 'resumo' ? (
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Resumo do sistema">
              <Metric icon={Gauge} label="Nominal" value={(summaryNominalW / 1000).toFixed(2)} unit="kVA" />
              <Metric icon={Zap} label="Máxima" value={(summaryPeakW / 1000).toFixed(2)} unit="kVA" />
              <Metric icon={BatteryCharging} label="Energia" value={summaryDailyKwh.toFixed(2)} unit="kWh/dia" />
            </div>
          ) : (
            !loading &&
            !activeError &&
            activeSolution &&
            !activeSolution.microgridAlternative && (
              <SolutionMetricCards solution={activeSolution} batteryCatalog={batteryCatalog} />
            )
          )}
          <Separator />
        </div>
        {summaryTab === 'resumo' ? (
          <div className="space-y-3">
            <ConfigurationSummary
              residentialOptions={residentialOptions}
              loadsCount={residentialOptions.loads.length}
              onJumpToGridType={jumpToGridType}
              onJumpToBattery={jumpToBattery}
              onJumpToFeature={jumpToFeature}
              peakW={peakW}
              inverterCatalog={inverterCatalog}
              availableInverterModels={availableInverterModels}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const text = buildProjectShareText(
                  {
                    name: projectName || 'Sem nome',
                    topology: residentialOptions.topology,
                    gridType: residentialOptions.gridType,
                    loadsCount: residentialOptions.loads.length,
                    peakW,
                    dailyKwh,
                    solution,
                  },
                  undefined,
                  batteryCatalog
                );
                setPreviewText(text);
              }}
            >
              <ClipboardCopy className="h-4 w-4" />
              Copiar dados
            </Button>
            <SharePreviewModal text={previewText} onClose={() => setPreviewText(null)} />
          </div>
        ) : (
          <>
            {activeError && (
              <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
                {activeError}
              </p>
            )}
            {loading ? (
              <SolutionSkeleton />
            ) : !activeSolution ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Configure os dados na aba Resumo e calcule para ver a solução recomendada.
              </p>
            ) : (
              <ResultSummary
                solution={activeSolution}
                batteryCatalog={batteryCatalog}
                onExport={exportPdf}
                canExport={canCalculate && !hasInsufficientSolution}
                productMedia={productMedia}
                userStockItems={userStockItems}
                whiteTariff={residentialOptions.whiteTariff}
                pv={residentialOptions.pv}
                onChooseMicrogridVariant={onChooseMicrogridVariant}
                desiredFeatures={residentialOptions.desiredFeatures}
                microgrid={residentialOptions.microgrid}
                nominalW={backupNominalW}
                peakW={backupPeakW}
                dailyKwh={backupDailyKwh}
              />
            )}
          </>
        )}
      </PageSummary>

      <div className="mt-4 space-y-4">
          <Card className="gap-3 rounded-none border-none bg-transparent p-0 shadow-none ring-0">
            <CardHeader className="px-0">
              <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Seções de dimensionamento">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mainTab === 'features'}
                  onClick={() => setMainTab('features')}
                  className={cn(
                    'flex h-12 flex-1 items-center justify-center gap-2 rounded-md px-6 py-2.5 text-base font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-11',
                    mainTab === 'features'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                    featuresTabHasIssue && 'tab-alert-pulse ring-1 ring-destructive/50'
                  )}
                >
                  {featuresTabHasIssue ? (
                    <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                  ) : (
                    <ListChecks className="h-5 w-5" aria-hidden="true" />
                  )}
                  Funcionalidades
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mainTab === 'config'}
                  onClick={() => setMainTab('config')}
                  className={cn(
                    'flex h-12 flex-1 items-center justify-center gap-2 rounded-md px-6 py-2.5 text-base font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-11',
                    mainTab === 'config'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                    configTabHasIssue && 'tab-alert-pulse ring-1 ring-destructive/50'
                  )}
                >
                  {configTabHasIssue ? (
                    <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                  ) : (
                    <Settings className="h-5 w-5" aria-hidden="true" />
                  )}
                  Armazenamento de Energia
                </button>
              </div>
            </CardHeader>
            <CardContent className={cn('px-0', mainTab === 'config' && 'space-y-4')}>
              {mainTab === 'features' && (
                <DesiredFeaturesPicker
                  activeTab={activeFeatureTab}
                  onActiveTabChange={setActiveFeatureTab}
                  value={residentialOptions.desiredFeatures}
                  onChange={setDesiredFeatures}
                  whiteTariff={residentialOptions.whiteTariff}
                  onWhiteTariffChange={setWhiteTariffConfig}
                  microgrid={residentialOptions.microgrid}
                  onMicrogridChange={setMicrogridConfig}
                  generator={residentialOptions.generator}
                  onGeneratorChange={setGeneratorConfig}
                  pv={residentialOptions.pv}
                  onPvChange={setPvConfig}
                  atsPhotoUrl={residentialOptions.atsPhotoUrl}
                  onAtsPhotoUrlChange={setAtsPhotoUrl}
                  atsBackupAcknowledged={residentialOptions.atsBackupAcknowledged}
                  onAtsBackupAcknowledgedChange={setAtsBackupAcknowledged}
                  onUploadPhoto={onUploadFeaturePhoto}
                  loadsCount={residentialOptions.loads.length}
                  inverterCatalog={inverterCatalog}
                  availableInverterModels={availableInverterModels}
                  selectedInverterModel={residentialOptions.inverterModel}
                  gridType={residentialOptions.gridType}
                  peakW={peakW}
                  nominalW={nominalW}
                  dailyKwh={dailyKwh}
                  peakCalcMode={residentialOptions.peakCalcMode ?? 'sum'}
                />
              )}

              {mainTab === 'config' && (
                <>
                  <div className="flex gap-1 rounded-md bg-muted/60 p-0.5" role="tablist" aria-label="Seções de configuração">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={configTab === 'gridType'}
                      onClick={() => setConfigTab('gridType')}
                      className={cn(
                        'flex h-11 flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9',
                        configTab === 'gridType'
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
                          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          residentialOptions.gridType ? 'bg-primary' : 'bg-transparent'
                        )}
                      />
                      Inversores Híbridos
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={configTab === 'battery'}
                      onClick={() => setConfigTab('battery')}
                      className={cn(
                        'flex h-11 flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9',
                        configTab === 'battery'
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
                          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                      )}
                    >
                      {residentialOptions.batteryModel ? (
                        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
                      )}
                      Modelo bateria
                    </button>
                  </div>

                  {configTab === 'gridType' && (
                    <div className="space-y-3 rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">{gridTypeSummary}</p>
                      <div
                        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4"
                        role="radiogroup"
                        aria-label="Tipo de rede"
                      >
                        {gridOptions.map((option) => {
                          const active = residentialOptions.gridType === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setGridType(option.value)}
                              className={cn(
                                'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-xs',
                                active
                                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                              )}
                            >
                              {option.label}
                              <span className={cn('text-[0.7rem]', active ? 'text-primary' : 'text-muted-foreground/70')}>
                                {option.detail}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {residentialOptions.desiredFeatures.includes('pv') && activeSolution?.pvPowerKw != null && (
                        <div className="rounded-lg border bg-background p-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Sun className="h-4 w-4 text-primary" />
                            FV recomendado
                          </div>
                          <div className="mt-1 flex items-baseline gap-2">
                            <p className="text-lg font-semibold">{activeSolution.pvPowerKw.toFixed(2)} kWp</p>
                            {activeSolution.pvMonthlyGenerationKwh != null && (
                              <p className="text-sm text-muted-foreground">
                                · {activeSolution.pvMonthlyGenerationKwh.toFixed(0)} kWh/mês estimados
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <InverterModelPicker
                        inverters={inverterCatalog}
                        availableModels={availableInverterModels}
                        selectedModel={residentialOptions.inverterModel}
                        loading={initialLoading}
                        setInverterModel={setInverterModel}
                        userStockItems={userStockItems}
                      />
                    </div>
                  )}

                  {configTab === 'battery' && (
                    <BatteryModelPicker
                      batteries={batteryCatalog}
                      topology={residentialOptions.topology}
                      selectedModel={residentialOptions.batteryModel}
                      secondarySelectedModel={residentialOptions.secondaryBatteryModel}
                      loading={initialLoading}
                      setTopology={setTopology}
                      setBatteryModel={setBatteryModel}
                      setSecondaryBatteryModel={setSecondaryBatteryModel}
                      userStockItems={userStockItems}
                      solution={solution}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
      </div>
    </>
  );
}

const emptyWhiteTariffConfig: WhiteTariffConfig = {
  requiredPowerW: 0,
  pontaEnergyWh: 0,
  intermediateEnergyWh: 0,
  includeBackupReserve: false,
  pontaTariffPerKwh: 0,
  intermediateTariffPerKwh: 0,
  foraPontaTariffPerKwh: 0,
};

const emptyMicrogridConfig: MicrogridConfig = {
  voltageV: 220,
  onGridPhases: 1,
  onGridApparentPowerVA: 0,
  // The wizard no longer lets the user opt out of this — enabling
  // Microrrede always means it's a fundamental requirement now.
  isFundamentalRequirement: true,
  photoUrl: null,
  powerNoticeAcknowledged: false,
};

const emptyGeneratorConfig: GeneratorConfig = {
  voltageV: 220,
  phases: 1,
  apparentPowerVA: 0,
  photoUrl: null,
  ownAtsAcknowledged: false,
};

const emptyPvConfig: PvConfig = {
  monthlyConsumptionKwh: 0,
  hsp: 0,
};

const phaseOptions: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Monofásico' },
  { value: 2, label: 'Bifásico' },
  { value: 3, label: 'Trifásico' },
];

/** Replaces the old manual "Salvar projeto" button — reflects useAutosave's
 * status instead. Renders nothing while 'idle' (nothing worth saving yet,
 * e.g. logged out or an empty draft — see the `enabled` gate in
 * SinglePageApp). */
function AutosaveIndicator({ status, lastSavedAt }: { status: AutosaveStatus; lastSavedAt: Date | null }) {
  if (status === 'idle') return null;
  const timeLabel = lastSavedAt ? lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {status === 'saving' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Salvando...
        </>
      ) : status === 'error' ? (
        <>
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
          <span className="text-destructive">Não foi possível salvar automaticamente</span>
        </>
      ) : status === 'pending' ? (
        <>
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          Alterações pendentes de salvamento
        </>
      ) : (
        timeLabel && (
          <>
            <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Salvo automaticamente às {timeLabel}
          </>
        )
      )}
    </span>
  );
}

function PhasePicker({
  value,
  onChange,
  ariaLabel,
  recommendedValues = [],
}: {
  value: 1 | 2 | 3;
  onChange: (value: 1 | 2 | 3) => void;
  ariaLabel: string;
  /** Phase(s) that would fix an incompatible selection — highlighted in green,
   * never auto-applied. Empty when the current selection is already fine. */
  recommendedValues?: (1 | 2 | 3)[];
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={ariaLabel}>
      {phaseOptions.map((option) => {
        const active = value === option.value;
        const recommended = !active && recommendedValues.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative h-9 min-w-[88px] flex-1 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              recommended && 'ring-2 ring-emerald-500/70 text-emerald-700 dark:text-emerald-400'
            )}
          >
            {option.label}
            {recommended && (
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"
              >
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Which voltage(s) are physically valid for a given phase count: mono is
 * always 220V, bifásico is a single dual-rail "110/220V" system (still
 * stored as the nominal 220 value), and only trifásico has a real 220V vs
 * 380V choice. */
function voltageOptionsForPhases(phases: 1 | 2 | 3): { value: 220 | 380; label: string }[] {
  if (phases === 1) return [{ value: 220, label: '220V' }];
  if (phases === 2) return [{ value: 220, label: '110/220V' }];
  return [
    { value: 220, label: '220V' },
    { value: 380, label: '380V' },
  ];
}

function VoltagePicker({
  value,
  phases,
  onChange,
  ariaLabel,
  recommendedValue = null,
}: {
  value: number;
  phases: 1 | 2 | 3;
  onChange: (value: 220 | 380) => void;
  ariaLabel: string;
  /** Voltage that would fix an incompatible selection — highlighted in green,
   * never auto-applied. Null when the current selection is already fine. */
  recommendedValue?: 220 | 380 | null;
}) {
  const options = voltageOptionsForPhases(phases);
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.value;
        const recommended = !active && recommendedValue === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative h-9 min-w-[88px] flex-1 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              recommended && 'ring-2 ring-emerald-500/70 text-emerald-700 dark:text-emerald-400'
            )}
          >
            {option.label}
            {recommended && (
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"
              >
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Phases/voltage to seed Microrrede/Gerador Externo with when the feature is
 * first enabled — matching whatever grid type is already chosen in
 * Configurações (always a valid, compatible starting point) instead of
 * always defaulting to monofásico 220V regardless of context. Falls back to
 * monofásico 220V only when no grid type has been chosen yet. */
function defaultPhaseVoltageForGridType(gridType: ResidentialGridType | null): { phases: 1 | 2 | 3; voltage: 220 | 380 } {
  return gridType ? gridTypePhaseVoltage[gridType] : { phases: 1, voltage: 220 };
}

/** Which phase count(s) would fix the current Microrrede/Gerador Externo
 * selection — the network's own phase count, plus (microgrid only) 1-phase
 * when the documented exception applies. Empty once the current phase/voltage
 * is already compatible. When the current phase is already one of the valid
 * options (only the voltage is off), recommends just that phase — which,
 * being already active, shows no highlight — rather than also pointing at the
 * other valid phase: with the right phase already picked, suggesting a
 * completely different one alongside it would be a confusing, unnecessary
 * detour when fixing the voltage is enough. Feeds the green "recomendado"
 * highlight in PhasePicker; never auto-selects anything. */
function recommendedPhases(
  gridType: ResidentialGridType | null,
  phases: 1 | 2 | 3,
  voltageV: number,
  forMicrogrid: boolean
): (1 | 2 | 3)[] {
  if (!gridType) return [];
  if (checkPhaseVoltageCompatibility(gridType, phases, voltageV, { forMicrogrid }) !== 'incompatible') return [];
  const network = gridTypePhaseVoltage[gridType];
  const exceptionApplies = forMicrogrid && (gridType === 'threePhase_380' || gridType === 'splitPhase_220');
  const validPhases: (1 | 2 | 3)[] = exceptionApplies && network.phases !== 1 ? [network.phases, 1] : [network.phases];
  return validPhases.includes(phases) ? [phases] : validPhases;
}

/** Which voltage would fix the current selection, given the phase count
 * currently chosen — null once the current phase/voltage is already
 * compatible, or when no voltage under that phase count would help (the
 * phase itself needs to change first; VoltagePicker's own options are
 * scoped to the current phase anyway, so there's nothing to highlight). */
function recommendedVoltageForPhase(
  gridType: ResidentialGridType | null,
  phases: 1 | 2 | 3,
  voltageV: number,
  forMicrogrid: boolean
): 220 | 380 | null {
  if (!gridType) return null;
  if (checkPhaseVoltageCompatibility(gridType, phases, voltageV, { forMicrogrid }) !== 'incompatible') return null;
  const network = gridTypePhaseVoltage[gridType];
  if (phases === network.phases) return network.voltage;
  const exceptionApplies = forMicrogrid && (gridType === 'threePhase_380' || gridType === 'splitPhase_220');
  return exceptionApplies && phases === 1 ? 220 : null;
}

/** Shows how many catalog inverters support a given flag (e.g. microgrid,
 * external_generator), and — separately — how many among whatever's already
 * chosen in Configurações (a specific model, or the set compatible with the
 * chosen grid type/battery topology when the model is "Automático") do. */
function InverterSupportSummary({
  flag,
  featureLabel,
  inverterCatalog,
  availableInverterModels,
  selectedInverterModel,
}: {
  flag: InverterFlag;
  featureLabel: string;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  selectedInverterModel: string | null;
}) {
  const totalSupporting = inverterCatalog.filter((inverter) => inverter.flags.includes(flag)).length;

  const selectedCatalog = selectedInverterModel
    ? inverterCatalog.filter((inverter) => inverter.model === selectedInverterModel)
    : availableInverterModels
      ? inverterCatalog.filter((inverter) => availableInverterModels.has(inverter.model))
      : null;
  const selectedSupporting = selectedCatalog?.filter((inverter) => inverter.flags.includes(flag)).length ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SupportCountChip
        icon={Boxes}
        label={`${totalSupporting}/${inverterCatalog.length}`}
        tone="neutral"
        tooltip={`${totalSupporting} de ${inverterCatalog.length} inversores cadastrados no catálogo suportam ${featureLabel}.`}
      />
      {selectedCatalog === null ? (
        <SupportCountChip
          icon={Settings}
          label="—"
          tone="neutral"
          tooltip={`Selecione o tipo de rede em Configurações para ver quantos inversores compatíveis com a seleção atual suportam ${featureLabel}.`}
        />
      ) : (
        <SupportCountChip
          icon={selectedSupporting === 0 ? AlertTriangle : Settings}
          label={`${selectedSupporting}/${selectedCatalog.length}`}
          tone={selectedSupporting === 0 ? 'warning' : 'neutral'}
          tooltip={
            selectedSupporting === 0
              ? `Nenhum inversor das opções selecionadas em Configurações suporta ${featureLabel}.`
              : `${selectedSupporting} de ${selectedCatalog.length} inversores das opções selecionadas em Configurações suportam ${featureLabel}.`
          }
        />
      )}
    </div>
  );
}

/** Compact icon + count pill with a tooltip explaining what it means —
 * used by InverterSupportSummary so the two counts (catalog-wide vs.
 * narrowed by Configurações) read at a glance instead of as full sentences. */
function SupportCountChip({
  icon: Icon,
  label,
  tone,
  tooltip,
}: {
  icon: typeof Boxes;
  label: string;
  tone: 'neutral' | 'warning';
  tooltip: string;
}) {
  return (
    <Tooltip content={tooltip}>
      <span
        aria-label={tooltip}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
          tone === 'warning'
            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
            : 'border-transparent bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
    </Tooltip>
  );
}

/** Blocks calculating (and, since export always follows canCalculate,
 * exporting the PDF too — see canCalculate in useCalculation.ts) when the
 * phases+voltage chosen for the on-grid/generator system don't match (or,
 * for microgrid, don't fall under its one documented exception — see
 * checkPhaseVoltageCompatibility) the grid type already chosen in
 * Configurações. Renders nothing until a grid type is chosen, or once the
 * combination is compatible. */
function PhaseVoltageCompatibilityWarning({
  gridType,
  phases,
  voltageV,
  forMicrogrid,
}: {
  gridType: ResidentialGridType | null;
  phases: 1 | 2 | 3;
  voltageV: number;
  forMicrogrid: boolean;
}) {
  const status = checkPhaseVoltageCompatibility(gridType, phases, voltageV, { forMicrogrid });
  if (!gridType || status !== 'incompatible') return null;

  const phaseLabel = phaseOptions.find((option) => option.value === phases)?.label ?? '';
  const voltageLabel = voltageOptionsForPhases(phases).find((option) => option.value === voltageV)?.label ?? `${voltageV}V`;

  // What the user should pick instead — not applied automatically, just
  // spelled out so they don't have to reverse-engineer it from the grid type.
  const network = gridTypePhaseVoltage[gridType];
  const networkPhaseLabel = phaseOptions.find((option) => option.value === network.phases)?.label ?? '';
  const networkVoltageLabel =
    voltageOptionsForPhases(network.phases).find((option) => option.value === network.voltage)?.label ?? `${network.voltage}V`;
  const microgridExceptionApplies = forMicrogrid && (gridType === 'threePhase_380' || gridType === 'splitPhase_220');

  return (
    <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      A tensão/fases selecionadas ({phaseLabel} {voltageLabel}) são incompatíveis com o tipo de rede configurado (
      {gridLabels[gridType]}) — selecione {networkPhaseLabel} e {networkVoltageLabel}
      {microgridExceptionApplies ? ` (ou Monofásico 220V, aceito como exceção para microrrede)` : ''} para poder calcular.
    </p>
  );
}

function PhotoUploadField({
  label,
  photoUrl,
  slot,
  onUploadPhoto,
  onChange,
}: {
  label: string;
  photoUrl: string | null;
  slot: 'ats' | 'microgrid' | 'generator';
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await onUploadPhoto(file, slot);
      onChange(url);
    } catch {
      setError('Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      setUploading(false);
    }
  }

  const inputId = `photo-upload-${slot}`;

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg border bg-card p-3">
        {photoUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={label}
              className="h-20 w-20 shrink-0 rounded-md border bg-background object-cover"
            />
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <div className="flex flex-wrap gap-2">
                <label htmlFor={inputId} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}>
                  Trocar foto
                </label>
                <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input py-6 text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-muted/60 hover:text-foreground"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="font-medium text-foreground">{uploading ? 'Enviando...' : 'Anexar foto'}</span>
            {!uploading && <span className="text-xs">{label}</span>}
          </label>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SummaryGroup({ title, icon: Icon, children }: { title: string; icon: typeof Boxes; children: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  done,
  alertLevel,
  hasIssue,
  onClick,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  done: boolean;
  /** 'critical' blocks calculation (styled destructive/red); 'warning' is just
   * worth a second look, e.g. an auto-selected inverter (styled amber). */
  alertLevel?: 'critical' | 'warning';
  /** Pending issue on an enabled feature (see desiredFeatureHasPendingIssue) —
   * turns this row's own icon red instead of swapping it for a triangle, so
   * the feature stays identifiable at a glance while flagged. */
  hasIssue?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {alertLevel ? (
        <AlertTriangle
          className={cn(
            'h-4 w-4 shrink-0',
            alertLevel === 'critical' ? 'text-destructive' : 'text-yellow-500 dark:text-yellow-400'
          )}
          aria-hidden="true"
        />
      ) : (
        <Icon
          className={cn('h-4 w-4 shrink-0', hasIssue ? 'text-destructive' : done ? 'text-primary' : 'text-muted-foreground/50')}
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <Badge variant={done ? 'secondary' : 'outline'} className="min-w-0 max-w-[55%] shrink">
        <span className="truncate">{value}</span>
      </Badge>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

const featureIcons: Record<DesiredFeatureId, typeof Boxes> = {
  backup: BatteryCharging,
  external_ats: Cable,
  microgrid: Network,
  external_generator: Fuel,
  pv: SolarPanel,
  white_tariff: Receipt,
};

/** Always-visible, grouped snapshot of every selection made across the
 * Funcionalidades e Configurações tabs, each row jumping straight back to
 * the control that set it — so the user doesn't have to hunt for where a
 * given setting lives. Icons identify each row at a glance, and the current
 * value reads as a tag rather than plain text. */
function ConfigurationSummary({
  residentialOptions,
  loadsCount,
  onJumpToGridType,
  onJumpToBattery,
  onJumpToFeature,
  peakW,
  inverterCatalog,
  availableInverterModels,
}: {
  residentialOptions: {
    topology: BatteryTopology | null;
    batteryModel: string | null;
    inverterModel: string | null;
    gridType: ResidentialGridType | null;
    desiredFeatures: DesiredFeatureId[];
    whiteTariff: WhiteTariffConfig | null;
    microgrid: MicrogridConfig | null;
    generator: GeneratorConfig | null;
    pv: PvConfig | null;
    atsPhotoUrl: string | null;
    atsBackupAcknowledged: boolean;
  };
  loadsCount: number;
  onJumpToGridType: () => void;
  onJumpToBattery: () => void;
  onJumpToFeature: (id: DesiredFeatureId) => void;
  peakW: number;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
}) {
  const {
    topology,
    batteryModel,
    gridType,
    inverterModel,
    desiredFeatures,
    whiteTariff,
    microgrid,
    generator,
    pv,
    atsPhotoUrl,
    atsBackupAcknowledged,
  } = residentialOptions;

  function featureValue(id: DesiredFeatureId): string {
    if (!desiredFeatures.includes(id)) return 'Desativado';
    switch (id) {
      case 'backup':
        return `${loadsCount} ${loadsCount === 1 ? 'carga' : 'cargas'}`;
      case 'external_ats':
        return atsPhotoUrl ? 'Ativado · foto anexada' : 'Ativado · sem foto';
      case 'microgrid':
        return microgrid?.onGridApparentPowerVA ? `Ativado · ${microgrid.onGridApparentPowerVA} VA` : 'Ativado';
      case 'external_generator':
        return generator?.apparentPowerVA ? `Ativado · ${generator.apparentPowerVA} VA` : 'Ativado';
      case 'white_tariff':
        return whiteTariff?.pontaTariffPerKwh || whiteTariff?.intermediateTariffPerKwh || whiteTariff?.foraPontaTariffPerKwh
          ? `Ativado · R$ ${whiteTariff.pontaTariffPerKwh}/${whiteTariff.intermediateTariffPerKwh}/${whiteTariff.foraPontaTariffPerKwh} por kWh`
          : 'Ativado';
      default:
        return 'Ativado';
    }
  }

  return (
    <div className="space-y-3">
      <SummaryGroup title="Rede & inversor" icon={Zap}>
        <SummaryRow
          icon={Zap}
          label="Tipo de rede"
          value={gridType ? gridLabels[gridType] : 'Não selecionado'}
          done={Boolean(gridType)}
          onClick={onJumpToGridType}
        />
        <SummaryRow
          icon={Boxes}
          label="Inversor"
          value={inverterModel ?? 'Automático'}
          done={Boolean(inverterModel)}
          alertLevel={!inverterModel ? 'warning' : undefined}
          onClick={onJumpToGridType}
        />
      </SummaryGroup>
      <SummaryGroup title="Modelo de bateria" icon={Battery}>
        <SummaryRow
          icon={Layers}
          label="Topologia"
          value={topology ? topologyLabels[topology] : 'Não selecionada'}
          done={Boolean(topology)}
          onClick={onJumpToBattery}
        />
        <SummaryRow
          icon={Battery}
          label="Bateria"
          value={batteryModel ?? 'Não selecionado'}
          done={Boolean(batteryModel)}
          alertLevel={!batteryModel ? 'critical' : undefined}
          onClick={onJumpToBattery}
        />
      </SummaryGroup>
      <SummaryGroup title="Funcionalidades" icon={ListChecks}>
        {DESIRED_FEATURE_DEFINITIONS.map((feature) => (
          <SummaryRow
            key={feature.id}
            icon={featureIcons[feature.id]}
            label={feature.label}
            value={featureValue(feature.id)}
            done={desiredFeatures.includes(feature.id)}
            hasIssue={desiredFeatureHasPendingIssue(feature.id, desiredFeatures, {
              microgrid,
              generator,
              pv,
              atsBackupAcknowledged,
              gridType,
              peakW,
              loadsCount,
              inverterCatalog,
              availableInverterModels,
              selectedInverterModel: inverterModel,
            })}
            onClick={() => onJumpToFeature(feature.id)}
          />
        ))}
      </SummaryGroup>
    </div>
  );
}

function InStockBadge() {
  const { ref, openUp, visible, onMouseEnter, onMouseLeave, onFocus, onBlur } = useTooltipFlip<HTMLSpanElement>();
  return (
    <Badge
      ref={ref}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      variant="secondary"
      className="relative gap-1"
    >
      <Check className="h-3 w-3" />
      No catálogo
      <TooltipBubble triggerRef={ref} openUp={openUp} visible={visible}>
        Você tem esse modelo no seu catálogo
      </TooltipBubble>
    </Badge>
  );
}

function FeatureTabButton({
  label,
  description,
  enabled,
  hasIssue,
  isActiveTab,
  onClick,
}: {
  label: string;
  description: string;
  enabled: boolean;
  hasIssue: boolean;
  isActiveTab: boolean;
  onClick: () => void;
}) {
  const { ref, openUp, visible, onMouseEnter, onMouseLeave, onFocus, onBlur } = useTooltipFlip<HTMLButtonElement>();
  const tooltip = hasIssue
    ? `${description ? `${description} ` : ''}Há algo pendente de revisão nesta aba — confira antes de calcular.`
    : description;
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={isActiveTab}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        'relative flex h-11 flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9',
        isActiveTab
          ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
        hasIssue && 'tab-alert-pulse ring-1 ring-destructive/50'
      )}
    >
      {hasIssue ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
      ) : (
        <span
          aria-hidden="true"
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', enabled ? 'bg-primary' : 'bg-transparent')}
        />
      )}
      {label}
      {tooltip && (
        <TooltipBubble triggerRef={ref} openUp={openUp} visible={visible}>
          {tooltip}
        </TooltipBubble>
      )}
    </button>
  );
}

/** True when an enabled desired feature still has something pending review —
 * a blocking inconsistency (generator power/phase-voltage, microgrid
 * phase-voltage), no available inverter supporting the feature's required
 * flag among whatever's chosen in Configurações (see InverterSupportSummary),
 * or just an unacknowledged confirmation (ATS/generator/microgrid checkboxes).
 * Shared between each feature's own tab (see DesiredFeaturesPicker) and the
 * "Funcionalidades" main tab (see SizingTab), which shows the same warning
 * whenever any of its feature tabs would. */
function desiredFeatureHasPendingIssue(
  id: DesiredFeatureId,
  value: DesiredFeatureId[],
  {
    microgrid,
    generator,
    pv,
    atsBackupAcknowledged,
    gridType,
    peakW,
    loadsCount,
    inverterCatalog,
    availableInverterModels,
    selectedInverterModel,
  }: {
    microgrid: MicrogridConfig | null;
    generator: GeneratorConfig | null;
    pv: PvConfig | null;
    atsBackupAcknowledged: boolean;
    gridType: ResidentialGridType | null;
    peakW: number;
    loadsCount: number;
    inverterCatalog: InverterCatalogOption[];
    availableInverterModels: Set<string> | null;
    selectedInverterModel: string | null;
  }
): boolean {
  if (!value.includes(id)) return false;

  const requiredFlag = DESIRED_FEATURE_DEFINITIONS.find((feature) => feature.id === id)?.requiresInverterFlag;
  if (requiredFlag) {
    const narrowedCatalog = selectedInverterModel
      ? inverterCatalog.filter((inverter) => inverter.model === selectedInverterModel)
      : availableInverterModels
        ? inverterCatalog.filter((inverter) => availableInverterModels.has(inverter.model))
        : null;
    if (narrowedCatalog !== null && !narrowedCatalog.some((inverter) => inverter.flags.includes(requiredFlag))) {
      return true;
    }
  }

  switch (id) {
    case 'backup':
      return loadsCount === 0;
    case 'external_ats':
      return !atsBackupAcknowledged;
    case 'microgrid':
      return (
        isMicrogridPowerNoticeUnacknowledged(value, microgrid) ||
        isMicrogridPhaseVoltageIncompatible(value, microgrid, gridType)
      );
    case 'external_generator':
      return (
        isGeneratorPowerInsufficient(value, generator, peakW) ||
        isGeneratorAtsUnacknowledged(value, generator) ||
        isGeneratorPhaseVoltageIncompatible(value, generator, gridType)
      );
    case 'pv':
      return isPvConfigIncomplete(value, pv);
    default:
      return false;
  }
}

const peakCalcModeLabels: Record<PeakCalcMode, string> = {
  sum: 'Soma de todas',
  'largest-surge': 'Só a maior carga',
  select: 'Selecionar cargas',
};

function formatMonthlyKwh(energyWh: number): string {
  if (!energyWh) return '';
  return String(Math.round(((energyWh * TARIFF_BUSINESS_DAYS_PER_MONTH) / 1000) * 100) / 100);
}

/** Tarifa Branca's energy fields (ponta, intermediária) take kWh/mês from the
 * user but the stored value is Wh/dia (see TARIFF_BUSINESS_DAYS_PER_MONTH) —
 * dividing by 22 doesn't round-trip to a clean number, so a naive
 * `value={computed}` would reformat what's on screen (e.g. "100" becoming
 * "99.99") on every keystroke. Buffers the raw text locally instead, only
 * resyncing from `energyWh` when it changes for a reason other than this
 * field's own last edit (project load, feature reset, etc). */
function WhiteTariffEnergyField({
  id,
  label,
  energyWh,
  onChange,
}: {
  id: string;
  label: string;
  energyWh: number;
  onChange: (energyWh: number) => void;
}) {
  const [text, setText] = useState(() => formatMonthlyKwh(energyWh));
  const lastEmittedRef = useRef(energyWh);

  useEffect(() => {
    if (energyWh !== lastEmittedRef.current) {
      lastEmittedRef.current = energyWh;
      setText(formatMonthlyKwh(energyWh));
    }
  }, [energyWh]);

  return (
    <>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={0.01}
        placeholder="Ex.: 110"
        value={text}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          const wh = Math.round(((Number(raw) || 0) * 1000) / TARIFF_BUSINESS_DAYS_PER_MONTH);
          lastEmittedRef.current = wh;
          onChange(wh);
        }}
      />
      {energyWh ? <p className="text-xs text-muted-foreground">{(energyWh / 1000).toFixed(2)} kWh/dia</p> : null}
    </>
  );
}

function DesiredFeaturesPicker({
  activeTab,
  onActiveTabChange,
  value,
  onChange,
  whiteTariff,
  onWhiteTariffChange,
  microgrid,
  onMicrogridChange,
  generator,
  onGeneratorChange,
  pv,
  onPvChange,
  atsPhotoUrl,
  onAtsPhotoUrlChange,
  atsBackupAcknowledged,
  onAtsBackupAcknowledgedChange,
  onUploadPhoto,
  loadsCount,
  inverterCatalog,
  availableInverterModels,
  selectedInverterModel,
  gridType,
  peakW,
  nominalW,
  dailyKwh,
  peakCalcMode,
}: {
  activeTab: DesiredFeatureId;
  onActiveTabChange: (id: DesiredFeatureId) => void;
  value: DesiredFeatureId[];
  onChange: (value: DesiredFeatureId[]) => void;
  whiteTariff: WhiteTariffConfig | null;
  onWhiteTariffChange: (whiteTariff: WhiteTariffConfig | null) => void;
  microgrid: MicrogridConfig | null;
  onMicrogridChange: (microgrid: MicrogridConfig | null) => void;
  generator: GeneratorConfig | null;
  onGeneratorChange: (generator: GeneratorConfig | null) => void;
  pv: PvConfig | null;
  onPvChange: (pv: PvConfig | null) => void;
  atsPhotoUrl: string | null;
  onAtsPhotoUrlChange: (atsPhotoUrl: string | null) => void;
  atsBackupAcknowledged: boolean;
  onAtsBackupAcknowledgedChange: (atsBackupAcknowledged: boolean) => void;
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
  loadsCount: number;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  selectedInverterModel: string | null;
  gridType: ResidentialGridType | null;
  peakW: number;
  nominalW: number;
  dailyKwh: number;
  peakCalcMode: PeakCalcMode;
}) {
  const tabs = DESIRED_FEATURE_DEFINITIONS;
  const activeFeature = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const isBackupTab = activeTab === 'backup';
  const isActiveEnabled = value.includes(activeTab);

  function hasPendingIssue(id: DesiredFeatureId): boolean {
    return desiredFeatureHasPendingIssue(id, value, {
      microgrid,
      generator,
      pv,
      atsBackupAcknowledged,
      gridType,
      peakW,
      loadsCount,
      inverterCatalog,
      availableInverterModels,
      selectedInverterModel,
    });
  }

  function toggle(id: DesiredFeatureId) {
    if (value.includes(id)) {
      onChange(value.filter((item) => item !== id));
      if (id === 'white_tariff') onWhiteTariffChange(null);
      if (id === 'microgrid') onMicrogridChange(null);
      if (id === 'external_generator') onGeneratorChange(null);
      if (id === 'pv') onPvChange(null);
    } else {
      onChange([...value, id]);
      if (id === 'white_tariff' && !whiteTariff) onWhiteTariffChange(emptyWhiteTariffConfig);
      if (id === 'microgrid' && !microgrid) {
        const defaults = defaultPhaseVoltageForGridType(gridType);
        onMicrogridChange({ ...emptyMicrogridConfig, onGridPhases: defaults.phases, voltageV: defaults.voltage });
      }
      if (id === 'external_generator' && !generator) {
        const defaults = defaultPhaseVoltageForGridType(gridType);
        onGeneratorChange({ ...emptyGeneratorConfig, phases: defaults.phases, voltageV: defaults.voltage });
      }
      if (id === 'pv' && !pv) onPvChange(emptyPvConfig);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-md bg-muted/60 p-0.5" role="tablist" aria-label="Funcionalidades desejadas">
        {tabs.map((tab) => (
          <FeatureTabButton
            key={tab.id}
            label={tab.label}
            description={tab.description}
            enabled={value.includes(tab.id)}
            hasIssue={hasPendingIssue(tab.id)}
            isActiveTab={activeTab === tab.id}
            onClick={() => onActiveTabChange(tab.id)}
          />
        ))}
      </div>

      <div className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{activeFeature.label}</p>
            {isBackupTab ? (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Resumo das cargas cadastradas">
                <Metric icon={Gauge} label="Nominal" value={(nominalW / 1000).toFixed(2)} unit="kVA" />
                <Metric icon={Zap} label="Máxima" value={(peakW / 1000).toFixed(2)} unit="kVA" />
                <Metric icon={BatteryCharging} label="Energia" value={dailyKwh.toFixed(2)} unit="kWh/dia" />
                <Metric icon={Layers} label="Modo de cálculo" value={peakCalcModeLabels[peakCalcMode]} />
              </div>
            ) : (
              activeFeature.description && (
                <p className="mt-1 text-xs text-muted-foreground">{activeFeature.description}</p>
              )
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isBackupTab && (
              <Badge variant="secondary">
                {loadsCount} {loadsCount === 1 ? 'carga' : 'cargas'}
              </Badge>
            )}
            <Button
              type="button"
              variant={isActiveEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggle(activeTab)}
            >
              {isActiveEnabled ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Habilitado
                </>
              ) : (
                'Habilitar'
              )}
            </Button>
          </div>
        </div>

        {isBackupTab && isActiveEnabled && <LoadSelector defaultToMine />}

        {isActiveEnabled && activeTab === 'external_ats' && (
          <div className="space-y-3">
            <InverterSupportSummary
              flag="external_ats"
              featureLabel="Backup Total"
              inverterCatalog={inverterCatalog}
              availableInverterModels={availableInverterModels}
              selectedInverterModel={selectedInverterModel}
            />
            <label
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                atsBackupAcknowledged
                  ? 'border-border bg-background'
                  : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={atsBackupAcknowledged}
                onChange={(event) => onAtsBackupAcknowledgedChange(event.target.checked)}
              />
              <span className="flex items-start gap-1.5">
                {!atsBackupAcknowledged && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  {atsBackupAcknowledged
                    ? 'Confirmado: um QTA é usado para backup total.'
                    : 'Um QTA deve ser usado para backup total.'}
                </span>
              </span>
            </label>
            <PhotoUploadField
              label="Foto do disjuntor geral"
              photoUrl={atsPhotoUrl}
              slot="ats"
              onUploadPhoto={onUploadPhoto}
              onChange={onAtsPhotoUrlChange}
            />
          </div>
        )}

        {isActiveEnabled && activeTab === 'white_tariff' && (
          <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="whiteTariffPower">Potência (W)</Label>
            <Input
              id="whiteTariffPower"
              type="number"
              min={0}
              placeholder="Ex.: 3000"
              value={whiteTariff?.requiredPowerW || ''}
              onChange={(event) =>
                onWhiteTariffChange({
                  ...(whiteTariff ?? emptyWhiteTariffConfig),
                  requiredPowerW: Number(event.target.value) || 0,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <div className="rounded-lg border bg-background p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-destructive" />
                Ponta
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <WhiteTariffEnergyField
                    id="whiteTariffPontaEnergy"
                    label="Energia ponta (kWh/mês)"
                    energyWh={whiteTariff?.pontaEnergyWh ?? 0}
                    onChange={(pontaEnergyWh) =>
                      onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), pontaEnergyWh })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="whiteTariffPonta">Tarifa ponta (R$/kWh)</Label>
                  <Input
                    id="whiteTariffPonta"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Ex.: 1.20"
                    value={whiteTariff?.pontaTariffPerKwh || ''}
                    onChange={(event) =>
                      onWhiteTariffChange({
                        ...(whiteTariff ?? emptyWhiteTariffConfig),
                        pontaTariffPerKwh: Number(event.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              {Boolean(whiteTariff?.pontaTariffPerKwh || whiteTariff?.foraPontaTariffPerKwh) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Diferença para fora ponta: R${' '}
                  {((whiteTariff?.pontaTariffPerKwh ?? 0) - (whiteTariff?.foraPontaTariffPerKwh ?? 0)).toFixed(2)}/kWh
                </p>
              )}
            </div>

            <div className="rounded-lg border bg-background p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Intermediária
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <WhiteTariffEnergyField
                    id="whiteTariffIntermediateEnergy"
                    label="Energia intermediária (kWh/mês)"
                    energyWh={whiteTariff?.intermediateEnergyWh ?? 0}
                    onChange={(intermediateEnergyWh) =>
                      onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), intermediateEnergyWh })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="whiteTariffIntermediate">Tarifa intermediária (R$/kWh)</Label>
                  <Input
                    id="whiteTariffIntermediate"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Ex.: 0.95"
                    value={whiteTariff?.intermediateTariffPerKwh || ''}
                    onChange={(event) =>
                      onWhiteTariffChange({
                        ...(whiteTariff ?? emptyWhiteTariffConfig),
                        intermediateTariffPerKwh: Number(event.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              {Boolean(whiteTariff?.intermediateTariffPerKwh || whiteTariff?.foraPontaTariffPerKwh) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Diferença para fora ponta: R${' '}
                  {((whiteTariff?.intermediateTariffPerKwh ?? 0) - (whiteTariff?.foraPontaTariffPerKwh ?? 0)).toFixed(2)}/kWh
                </p>
              )}
            </div>

            <div className="rounded-lg border bg-background p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Moon className="h-3.5 w-3.5 text-accent" />
                Fora ponta
              </p>
              <div className="mt-2 max-w-[calc(50%-0.375rem)] space-y-1.5">
                <Label htmlFor="whiteTariffForaPonta">Tarifa fora ponta (R$/kWh)</Label>
                <Input
                  id="whiteTariffForaPonta"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Ex.: 0.75"
                  value={whiteTariff?.foraPontaTariffPerKwh || ''}
                  onChange={(event) =>
                    onWhiteTariffChange({
                      ...(whiteTariff ?? emptyWhiteTariffConfig),
                      foraPontaTariffPerKwh: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Energia fora ponta é deduzida do consumo total informado em Fotovoltaico, descontando ponta e intermediária.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={whiteTariff?.includeBackupReserve ?? false}
              onChange={(event) =>
                onWhiteTariffChange({
                  ...(whiteTariff ?? emptyWhiteTariffConfig),
                  includeBackupReserve: event.target.checked,
                })
              }
            />
            Reservar para backup das cargas
          </label>
          </div>
        )}

        {isActiveEnabled && activeTab === 'microgrid' && (
          <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Dados do sistema ongrid existente a ser conectado.</p>
          <InverterSupportSummary
            flag="microgrid"
            featureLabel="microrrede"
            inverterCatalog={inverterCatalog}
            availableInverterModels={availableInverterModels}
            selectedInverterModel={selectedInverterModel}
          />
          <div className="space-y-1.5">
            <Label>Fases</Label>
            <PhasePicker
              value={microgrid?.onGridPhases ?? 1}
              ariaLabel="Fases do sistema ongrid"
              recommendedValues={recommendedPhases(gridType, microgrid?.onGridPhases ?? 1, microgrid?.voltageV ?? 220, true)}
              onChange={(phases) => {
                const validVoltages = voltageOptionsForPhases(phases).map((option) => option.value);
                const currentVoltage = microgrid?.voltageV ?? 220;
                onMicrogridChange({
                  ...(microgrid ?? emptyMicrogridConfig),
                  onGridPhases: phases,
                  voltageV: validVoltages.includes(currentVoltage as 220 | 380) ? currentVoltage : validVoltages[0],
                });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tensão</Label>
              <VoltagePicker
                value={microgrid?.voltageV ?? 220}
                phases={microgrid?.onGridPhases ?? 1}
                ariaLabel="Tensão do sistema ongrid"
                recommendedValue={recommendedVoltageForPhase(
                  gridType,
                  microgrid?.onGridPhases ?? 1,
                  microgrid?.voltageV ?? 220,
                  true
                )}
                onChange={(voltageV) =>
                  onMicrogridChange({
                    ...(microgrid ?? emptyMicrogridConfig),
                    voltageV,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="microgridPower">Potência (VA)</Label>
              <Input
                id="microgridPower"
                type="number"
                min={0}
                placeholder="Ex.: 3000"
                value={microgrid?.onGridApparentPowerVA || ''}
                onChange={(event) =>
                  onMicrogridChange({
                    ...(microgrid ?? emptyMicrogridConfig),
                    onGridApparentPowerVA: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          <PhaseVoltageCompatibilityWarning
            gridType={gridType}
            phases={microgrid?.onGridPhases ?? 1}
            voltageV={microgrid?.voltageV ?? 220}
            forMicrogrid
          />
          <label
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-xs transition-colors',
              microgrid?.powerNoticeAcknowledged
                ? 'border-border bg-background'
                : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={microgrid?.powerNoticeAcknowledged ?? false}
              onChange={(event) =>
                onMicrogridChange({
                  ...(microgrid ?? emptyMicrogridConfig),
                  powerNoticeAcknowledged: event.target.checked,
                })
              }
            />
            <span className="flex items-start gap-1.5">
              {!microgrid?.powerNoticeAcknowledged && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>
                {microgrid?.powerNoticeAcknowledged
                  ? 'Confirmado: a potência do sistema ongrid é menor que a do inversor e das baterias da solução.'
                  : 'A potência do sistema ongrid deve ser menor que a do inversor e das baterias da solução.'}
              </span>
            </span>
          </label>
          <PhotoUploadField
            label="Foto da etiqueta do inversor ongrid"
            photoUrl={microgrid?.photoUrl ?? null}
            slot="microgrid"
            onUploadPhoto={onUploadPhoto}
            onChange={(photoUrl) => onMicrogridChange({ ...(microgrid ?? emptyMicrogridConfig), photoUrl })}
          />
          </div>
        )}

        {isActiveEnabled && activeTab === 'external_generator' && (
          <div className="space-y-3">
          <InverterSupportSummary
            flag="external_generator"
            featureLabel="Gerador Externo"
            inverterCatalog={inverterCatalog}
            availableInverterModels={availableInverterModels}
            selectedInverterModel={selectedInverterModel}
          />
          <div className="space-y-1.5">
            <Label>Fases</Label>
            <PhasePicker
              value={generator?.phases ?? 1}
              ariaLabel="Fases do gerador"
              recommendedValues={recommendedPhases(gridType, generator?.phases ?? 1, generator?.voltageV ?? 220, false)}
              onChange={(phases) => {
                const validVoltages = voltageOptionsForPhases(phases).map((option) => option.value);
                const currentVoltage = generator?.voltageV ?? 220;
                onGeneratorChange({
                  ...(generator ?? emptyGeneratorConfig),
                  phases,
                  voltageV: validVoltages.includes(currentVoltage as 220 | 380) ? currentVoltage : validVoltages[0],
                });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tensão</Label>
              <VoltagePicker
                value={generator?.voltageV ?? 220}
                phases={generator?.phases ?? 1}
                ariaLabel="Tensão do gerador"
                recommendedValue={recommendedVoltageForPhase(
                  gridType,
                  generator?.phases ?? 1,
                  generator?.voltageV ?? 220,
                  false
                )}
                onChange={(voltageV) =>
                  onGeneratorChange({
                    ...(generator ?? emptyGeneratorConfig),
                    voltageV,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="generatorPower">Potência (VA)</Label>
              <Input
                id="generatorPower"
                type="number"
                min={0}
                placeholder="Ex.: 5000"
                value={generator?.apparentPowerVA || ''}
                onChange={(event) =>
                  onGeneratorChange({
                    ...(generator ?? emptyGeneratorConfig),
                    apparentPowerVA: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          {isGeneratorPowerInsufficient(value, generator, peakW) && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Potência do gerador insuficiente para carregar as baterias
            </p>
          )}
          <PhaseVoltageCompatibilityWarning
            gridType={gridType}
            phases={generator?.phases ?? 1}
            voltageV={generator?.voltageV ?? 220}
            forMicrogrid={false}
          />
          <label
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
              generator?.ownAtsAcknowledged
                ? 'border-border bg-background'
                : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={generator?.ownAtsAcknowledged ?? false}
              onChange={(event) =>
                onGeneratorChange({
                  ...(generator ?? emptyGeneratorConfig),
                  ownAtsAcknowledged: event.target.checked,
                })
              }
            />
            <span className="flex items-start gap-1.5">
              {!generator?.ownAtsAcknowledged && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>
                {generator?.ownAtsAcknowledged ? (
                  <>
                    <span className="font-medium">Confirmado:</span> o gerador externo tem a própria chave ATS.
                  </>
                ) : (
                  <>
                    <span className="font-medium">Ciente:</span> O gerador externo precisa ter a própria chave ATS.
                  </>
                )}
              </span>
            </span>
          </label>
          <PhotoUploadField
            label="Foto da etiqueta do gerador"
            photoUrl={generator?.photoUrl ?? null}
            slot="generator"
            onUploadPhoto={onUploadPhoto}
            onChange={(photoUrl) => onGeneratorChange({ ...(generator ?? emptyGeneratorConfig), photoUrl })}
          />
          </div>
        )}

        {isActiveEnabled && activeTab === 'pv' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A potência do arranjo é calculada a partir do consumo e do HSP informados abaixo — não das cargas
              cadastradas — e nunca ultrapassa o sobredimensionamento permitido pelo inversor recomendado.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pvMonthlyConsumption">Consumo médio mensal (kWh)</Label>
                <Input
                  id="pvMonthlyConsumption"
                  type="number"
                  min={0}
                  placeholder="Ex.: 450"
                  value={pv?.monthlyConsumptionKwh || ''}
                  onChange={(event) =>
                    onPvChange({ ...(pv ?? emptyPvConfig), monthlyConsumptionKwh: Number(event.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pvHsp">HSP da instalação (h/dia)</Label>
                <Input
                  id="pvHsp"
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder="Ex.: 4.5"
                  value={pv?.hsp || ''}
                  onChange={(event) => onPvChange({ ...(pv ?? emptyPvConfig), hsp: Number(event.target.value) || 0 })}
                />
              </div>
            </div>
            {(!pv?.monthlyConsumptionKwh || !pv?.hsp) && (
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Informe o consumo médio mensal e o HSP para calcular o FV.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BatteryModelPicker({
  batteries,
  topology,
  selectedModel,
  secondarySelectedModel,
  loading,
  setTopology,
  setBatteryModel,
  setSecondaryBatteryModel,
  userStockItems,
  solution,
}: {
  batteries: BatteryCatalogOption[];
  topology: BatteryTopology | null;
  selectedModel: string | null;
  secondarySelectedModel: string | null;
  loading: boolean;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setSecondaryBatteryModel: (batteryModel: string | null) => void;
  userStockItems: UserStockItem[];
  solution: Solution | null;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const activeTopology = topology === 'LowVoltage' ? 'LV' : 'HV';
  const slaveModels = expansionModelSet(batteries);
  const selectableBatteries = batteries.filter((battery) => !slaveModels.has(battery.model));
  const visibleBatteries = selectableBatteries.filter((battery) => battery.topology === activeTopology);
  const counts = {
    HV: selectableBatteries.filter((battery) => battery.topology === 'HV').length,
    LV: selectableBatteries.filter((battery) => battery.topology === 'LV').length,
  };

  const selectedBattery = batteries.find((battery) => battery.model === selectedModel);
  const secondarySelectedBattery = batteries.find((battery) => battery.model === secondarySelectedModel);
  const summary = selectedBattery
    ? `${selectedBattery.model} · ${selectedBattery.capacityKwh} kWh${
        solution?.batteryModel === selectedBattery.model ? ` · x${solution.batteryQty}` : ''
      }${secondarySelectedBattery ? ` + ${secondarySelectedBattery.model} · ${secondarySelectedBattery.capacityKwh} kWh` : ''}`
    : topology
      ? `${topologyLabels[topology]} · modelo pendente`
      : 'Nenhuma seleção';

  function selectTab(nextTopology: 'HV' | 'LV') {
    setTopology(nextTopology === 'HV' ? 'HighVoltage' : 'LowVoltage');
  }

  function selectBattery(battery: BatteryCatalogOption) {
    if (battery.topology !== activeTopology || !topology) {
      setTopology(battery.topology === 'HV' ? 'HighVoltage' : 'LowVoltage');
    }

    if (battery.model === selectedModel) {
      // Unmark the primary; promote the secondary (if any) into its place.
      setBatteryModel(secondarySelectedModel ?? null);
      setSecondaryBatteryModel(null);
      return;
    }
    if (battery.model === secondarySelectedModel) {
      setSecondaryBatteryModel(null);
      return;
    }
    if (!selectedModel) {
      setBatteryModel(battery.model);
      return;
    }
    if (!secondarySelectedModel) {
      setSecondaryBatteryModel(battery.model);
    }
    // Both slots already filled — unmark one before picking a third.
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{summary}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Selecione até 2 modelos para comparar soluções.</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(['HV', 'LV'] as const).map((tab) => {
            const active = activeTopology === tab;
            return (
              <button
                key={tab}
                type="button"
                className={cn(
                  'flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition',
                  active
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
                aria-pressed={active}
                onClick={() => selectTab(tab)}
              >
                {tab}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[0.7rem]', active ? 'bg-primary/10 text-primary' : 'bg-background')}>
                  {counts[tab]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <BatteryCardsSkeleton />
      ) : visibleBatteries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma bateria {activeTopology} cadastrada.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleBatteries.map((battery) => {
            const selected = selectedModel === battery.model;
            const selectedSecondary = secondarySelectedModel === battery.model;
            const usefulEnergyKwh = battery.capacityKwh * (1 - battery.minSocPercent / 100);
            const inStock = userStockItems.some(
              (item) => item.productType === 'battery' && item.productModel === battery.model
            );
            return (
              <div
                key={battery.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected || selectedSecondary}
                onClick={() => selectBattery(battery)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectBattery(battery);
                  }
                }}
                className={cn(
                  'relative grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[88px_1fr]',
                  selected || selectedSecondary
                    ? 'border-accent bg-primary/10 shadow-sm'
                    : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                {secondarySelectedModel && (selected || selectedSecondary) && (
                  <span className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[0.7rem] font-semibold text-accent-foreground shadow-sm">
                    {selected ? '1' : '2'}
                  </span>
                )}
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg bg-background">
                  {battery.imageUrl ? (
                    <button
                      type="button"
                      className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewImage({ url: battery.imageUrl as string, alt: battery.model });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={battery.imageUrl} alt={battery.model} className="h-full w-full object-contain p-2" />
                    </button>
                  ) : (
                    <Battery className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {battery.nickname ? (
                        <>
                          <p className="min-w-0 break-words text-base font-bold leading-snug">{battery.nickname}</p>
                          <p className="min-w-0 break-words text-xs text-muted-foreground">{battery.model}</p>
                        </>
                      ) : (
                        <p className="min-w-0 break-words text-sm font-semibold leading-snug">{battery.model}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {inStock && (
                        <InStockBadge />
                      )}
                      <Badge variant="secondary">{battery.topology}</Badge>
                    </div>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Capacidade: {battery.capacityKwh} kWh</span>
                    <span>
                      Energia útil: {usefulEnergyKwh.toFixed(2)} kWh · SOC mín. {battery.minSocPercent}%
                    </span>
                    <span>
                      Potência: {battery.standardPowerKw ?? '-'} kW · máxima {battery.peakPowerKw ?? '-'} kW
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {battery.documents.length > 0 ? (
                      battery.documents.map((document) => (
                        <button
                          key={`${battery.id}-${document.url}`}
                          type="button"
                          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          onClick={(event) => { event.stopPropagation(); setPreviewDoc(document); }}
                        >
                          {document.name || 'Documento'}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem anexos</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function InverterModelPicker({
  inverters,
  availableModels,
  selectedModel,
  loading,
  setInverterModel,
  userStockItems,
}: {
  inverters: InverterCatalogOption[];
  availableModels: Set<string> | null;
  selectedModel: string | null;
  loading: boolean;
  setInverterModel: (inverterModel: string | null) => void;
  userStockItems: UserStockItem[];
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const visibleInverters = availableModels
    ? inverters.filter((inverter) => availableModels.has(inverter.model))
    : inverters;

  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <p className="text-sm font-medium">Modelo do inversor</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha um modelo específico ou deixe em &quot;Todos&quot; para o sistema escolher automaticamente.
        </p>
      </div>

      {loading ? (
        <BatteryCardsSkeleton />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div
            role="button"
            tabIndex={0}
            aria-pressed={selectedModel === null}
            onClick={() => setInverterModel(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setInverterModel(null);
              }
            }}
            className={cn(
              'grid cursor-pointer place-items-center gap-2 rounded-lg border bg-card p-3 text-center transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              selectedModel === null ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
            )}
          >
            <Zap className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Todos</p>
              <p className="text-xs text-muted-foreground">O sistema escolhe o melhor inversor</p>
            </div>
          </div>

          {visibleInverters.map((inverter) => {
            const selected = selectedModel === inverter.model;
            const inStock = userStockItems.some(
              (item) => item.productType === 'inverter' && item.productModel === inverter.model
            );
            return (
              <div
                key={inverter.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => setInverterModel(inverter.model)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setInverterModel(inverter.model);
                  }
                }}
                className={cn(
                  'grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[88px_1fr]',
                  selected ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg bg-background">
                  {inverter.imageUrl ? (
                    <button
                      type="button"
                      className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewImage({ url: inverter.imageUrl as string, alt: inverter.model });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={inverter.imageUrl} alt={inverter.model} className="h-full w-full object-contain p-2" />
                    </button>
                  ) : (
                    <Zap className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {inverter.nickname ? (
                        <>
                          <p className="min-w-0 break-words text-base font-bold leading-snug">{inverter.nickname}</p>
                          <p className="min-w-0 break-words text-xs text-muted-foreground">{inverter.model}</p>
                        </>
                      ) : (
                        <p className="min-w-0 break-words text-sm font-semibold leading-snug">{inverter.model}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {inStock && (
                        <InStockBadge />
                      )}
                      <Badge variant="secondary">{inverter.topology}</Badge>
                    </div>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Fases: {inverter.phases}</span>
                    <span>
                      Potência: {inverter.standardPowerKva ?? '-'} kVA · máxima {inverter.peakPowerKva ?? '-'} kVA
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {inverter.documents.length > 0 ? (
                      inverter.documents.map((document) => (
                        <button
                          key={`${inverter.id}-${document.url}`}
                          type="button"
                          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          onClick={(event) => { event.stopPropagation(); setPreviewDoc(document); }}
                        >
                          {document.name || 'Documento'}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem anexos</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {visibleInverters.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhum inversor com solução aprovada para este tipo de rede.
            </div>
          )}
        </div>
      )}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

/** The Solução tab's top metric cards — pulled out of ResultSummary so they
 * can be rendered in the sticky header above it, alongside the Resumo tab's
 * own cards, keeping both tabs' top metrics pinned while their tab-specific
 * content scrolls underneath. */
function SolutionMetricCards({
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

function ResultSummary({
  solution,
  batteryCatalog,
  onExport,
  canExport,
  productMedia,
  userStockItems,
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
  const systemCost = calculateSystemCost(solution, userStockItems);
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
