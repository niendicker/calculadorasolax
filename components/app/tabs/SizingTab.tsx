'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Calculator,
  Check,
  ClipboardCopy,
  CircleCheck,
  Eraser,
  FileText,
  FolderOpen,
  Gauge,
  ListChecks,
  Loader2,
  Save,
  Settings,
  Sun,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Separator } from '@/components/ui/separator';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import type {
  BatteryTopology,
  DesiredFeatureId,
  GeneratorConfig,
  MarginSettings,
  MicrogridConfig,
  PeakCalcMode,
  PvConfig,
  ResidentialGridType,
  Solution,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  buildMarginSummary,
  buildProjectShareText,
  effectiveTargetEnergyWh,
  effectiveTargetPowerW,
  solutionHasInsufficientMargin,
} from '../helpers';
import type { AutosaveStatus } from '../hooks/useAutosave';
import { PageHeader, PageSummary } from '../shell/slots';
import { Metric, SharePreviewModal, SolutionSkeleton } from '../shared-ui';
import { gridLabels, gridOptions, type BatteryCatalogOption, type InverterCatalogOption, type ProductMedia } from '../types';
import { ConfigurationSummary } from './sizing/ConfigurationSummary';
import { DesiredFeaturesPicker } from './sizing/DesiredFeaturesPicker';
import { desiredFeatureHasPendingIssue } from './sizing/feature-status';
import { BatteryModelPicker, InverterModelPicker } from './sizing/ModelPickers';
import { ResultSummary, SolutionMetricCards } from './sizing/ResultSummary';

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
  marginSettings,
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
  marginSettings: MarginSettings;
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
         * underneath. Negative margins cancel the aside's own px-4/pt-4
         * padding so the sticky background spans full width and touches the
         * top edge, then re-applies that padding inside. */}
        <div className="sticky top-0 z-10 -mx-4 -mt-4 space-y-3 bg-card px-4 pt-4 pb-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1" role="tablist" aria-label="Seções do resumo">
            <button
              type="button"
              role="tab"
              aria-label="Resumo"
              aria-selected={summaryTab === 'resumo'}
              onClick={() => setSummaryTab('resumo')}
              className={cn(
                'flex min-h-11 items-center justify-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-10',
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
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.65rem]',
                  resumoTabCritical
                    ? 'bg-destructive/10 text-destructive'
                    : resumoTabWarning
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'bg-primary/10 text-primary'
                )}
              >
                {resumoTabCritical ? 'Pendente' : resumoTabWarning ? 'Revisar' : 'Completo'}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-label="Solução"
              aria-selected={summaryTab === 'solucao'}
              onClick={() => setSummaryTab('solucao')}
              className={cn(
                'flex min-h-11 items-center justify-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-10',
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
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.65rem]',
                  solutionTabHasIssue
                    ? 'bg-destructive/10 text-destructive'
                    : solution || secondarySolution
                      ? 'bg-primary/10 text-primary'
                      : 'bg-background text-muted-foreground'
                )}
              >
                {solutionTabHasIssue ? 'Revisar' : solution || secondarySolution ? 'Disponível' : 'Aguardando'}
              </span>
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
            {/* Sticky to the bottom of the summary aside (same cancel-the-padding
             * trick as the sticky header above — see its comment) so this stays
             * an easy, always-visible tap target on mobile instead of requiring
             * a scroll to the end of the summary. */}
            <div className="sticky bottom-0 -mx-4 -mb-5 bg-card px-4 pb-5 pt-3">
              <Button
                className="h-12 w-full gap-2 text-base shadow-md md:h-9 md:text-sm"
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
                <ClipboardCopy className="h-5 w-5 md:h-4 md:w-4" />
                Copiar dados
              </Button>
            </div>
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
                marginSettings={marginSettings}
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
              <div className="grid grid-cols-2 border-b" role="tablist" aria-label="Seções de dimensionamento">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mainTab === 'features'}
                  aria-label="Funcionalidades"
                  onClick={() => setMainTab('features')}
                  className={cn(
                    'relative flex min-h-20 items-center gap-3 border-b-2 px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5',
                    mainTab === 'features'
                      ? 'border-primary bg-primary/[0.05] text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground',
                    featuresTabHasIssue && 'tab-alert-pulse ring-1 ring-destructive/50'
                  )}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted', mainTab === 'features' && 'bg-primary/15 text-primary')}>
                    {featuresTabHasIssue ? (
                      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                    ) : (
                      <ListChecks className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold sm:text-base">Funcionalidades</span>
                    <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block">
                      Defina o que o sistema deve atender
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mainTab === 'config'}
                  aria-label="Armazenamento de Energia"
                  onClick={() => setMainTab('config')}
                  className={cn(
                    'relative flex min-h-20 items-center gap-3 border-b-2 px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5',
                    mainTab === 'config'
                      ? 'border-primary bg-primary/[0.05] text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground',
                    configTabHasIssue && 'tab-alert-pulse'
                  )}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted', mainTab === 'config' && 'bg-primary/15 text-primary')}>
                    {configTabHasIssue ? (
                      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                    ) : (
                      <Settings className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold sm:text-base">Configuração do sistema</span>
                    <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block">
                      Selecione rede, inversor e baterias
                    </span>
                  </span>
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
                  <div className="grid grid-cols-2 border-b" role="tablist" aria-label="Seções de configuração">
                    <button
                      type="button"
                      role="tab"
                      aria-label="Inversores Híbridos"
                      aria-selected={configTab === 'gridType'}
                      onClick={() => setConfigTab('gridType')}
                      className={cn(
                        'flex min-h-14 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        configTab === 'gridType'
                          ? 'border-primary bg-primary/[0.04] text-foreground'
                          : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground'
                      )}
                    >
                      {residentialOptions.gridType ? (
                        <CircleCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : (
                        <Zap className="h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      Rede e inversor
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-label="Modelo bateria"
                      aria-selected={configTab === 'battery'}
                      onClick={() => setConfigTab('battery')}
                      className={cn(
                        'flex min-h-14 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        configTab === 'battery'
                          ? 'border-primary bg-primary/[0.04] text-foreground'
                          : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground'
                      )}
                    >
                      {residentialOptions.batteryModel ? (
                        <CircleCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
                      )}
                      Baterias
                    </button>
                  </div>

                  {configTab === 'gridType' && (
                    <div className="space-y-3 rounded-lg border border-transparent">
                      <div>
                        <p className="text-sm font-semibold">Tipo de rede</p>
                        <p className="mt-1 text-xs text-muted-foreground">{gridTypeSummary}</p>
                      </div>
                      <div
                        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
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
                                'relative flex min-h-20 flex-col items-start justify-center rounded-lg border bg-card px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                                active
                                  ? 'border-primary bg-primary/[0.06] text-foreground shadow-sm ring-1 ring-primary/20'
                                  : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/40 hover:text-foreground'
                              )}
                            >
                              <span className="flex w-full items-center justify-between gap-2">
                                <span className="text-sm font-semibold">{option.label}</span>
                                <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', active ? 'border-primary bg-primary' : 'border-muted-foreground/40')}>
                                  {active && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                                </span>
                              </span>
                              <span className={cn('mt-1 text-xs', active ? 'text-primary' : 'text-muted-foreground/70')}>{option.detail}</span>
                            </button>
                          );
                        })}
                      </div>

                      {residentialOptions.desiredFeatures.includes('pv') && activeSolution?.pvPowerKw != null && (
                        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
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
