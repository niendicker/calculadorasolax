'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Battery,
  BatteryCharging,
  Calculator,
  Check,
  ChevronLeft,
  ClipboardCopy,
  CircleCheck,
  Download,
  Eraser,
  FolderOpen,
  Gauge,
  Loader2,
  Save,
  ShoppingCart,
  Sun,
  Zap,
  type LucideIcon,
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
  ProjectServiceLine,
  UserStockItem,
  UserServiceItem,
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
import { Metric, SharePreviewModal, SolutionSkeleton, WhatsAppIcon } from '../shared-ui';
import { gridLabels, gridOptions, type BatteryCatalogOption, type InverterCatalogOption, type ProductMedia } from '../types';
import { ConfigurationSummary } from './sizing/ConfigurationSummary';
import { DesiredFeaturesPicker, featureIcons } from './sizing/DesiredFeaturesPicker';
import { desiredFeatureHasPendingIssue } from './sizing/feature-status';
import { BatteryModelPicker, InverterModelPicker } from './sizing/ModelPickers';
import { ResultSummary, SolutionMetricCards } from './sizing/ResultSummary';

/** The unified overview grid mixes the 6 desired-feature ids with two
 * config items that aren't features at all (grid/inverter, battery) — this
 * widens the id space just enough to let one card grid + one strip + one
 * "active item" state cover both, instead of a separate tab layer per
 * concern (see the removed mainTab/configTab split this replaced). */
type PickerItemId = DesiredFeatureId | 'gridType' | 'battery';

type PickerItemState = 'on' | 'warn' | 'off';

interface PickerItem {
  id: PickerItemId;
  icon: LucideIcon;
  label: string;
  description: string;
  state: PickerItemState;
  meta: string;
}

export function SizingTab({
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
  exportingPdf,
  onSendQuote,
  sendingQuote,
  canSendQuoteByWhatsApp,
  onQuoteSolution,
  autosaveStatus,
  autosaveLastSavedAt,
  productMedia,
  userStockItems,
  services = [],
  userServices = [],
  marginSettings,
  onChooseMicrogridVariant,
  summaryDrawerOpen,
}: {
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
    operationHours: number;
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
  /** True while exportPdf() is generating the PDF blob — the report isn't
   * instant, so both "Baixar relatório" triggers below need to show that
   * something's happening instead of looking unresponsive. */
  exportingPdf: boolean;
  /** Same handleSendQuote approach as the Projeto tab's SelectedProjectSummary
   * — tries to share the actual PDF report via the OS share sheet, falling
   * back to a plain wa.me text link. */
  onSendQuote: () => void;
  /** True while onSendQuote() is building the PDF blob to share. */
  sendingQuote: boolean;
  /** Whether the client attached to this project (if any) has a phone number
   *  to send the WhatsApp quote to — the button stays visible but disabled
   *  (with an explanatory title) otherwise, matching SelectedProjectSummary. */
  canSendQuoteByWhatsApp: boolean;
  /** Sends the user to Compras with the current solution's inverter/battery/
   *  accessories pre-loaded into the cart — same items as "Importar itens da
   *  solução atual" over there, just reachable in one click from here. */
  onQuoteSolution: () => void;
  autosaveStatus: AutosaveStatus;
  autosaveLastSavedAt: Date | null;
  productMedia: Record<string, ProductMedia>;
  userStockItems: UserStockItem[];
  services?: ProjectServiceLine[];
  userServices?: UserServiceItem[];
  marginSettings: MarginSettings;
  onChooseMicrogridVariant: (variant: 'economic' | 'microgrid') => void;
  /** True while the summary panel is showing as a mobile/tablet drawer (see
   *  SinglePageApp's summaryDrawerOpen) — always false on desktop, where the
   *  panel is a permanently-visible column instead of something that gets
   *  shown/hidden. Used to reset back to "Resumo" whenever the drawer opens,
   *  regardless of whichever tab a previous calculation left selected. */
  summaryDrawerOpen: boolean;
}) {
  const [activeItem, setActiveItem] = useState<PickerItemId | null>(null);
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

  // On mobile/tablet, the summary panel is a drawer the user explicitly
  // opens rather than something always on screen — "Resumo" should be what
  // greets them every time it's opened, not whatever tab a calculation from
  // earlier in the session already left selected (see the effect above).
  // No-op on desktop: summaryDrawerOpen never turns true there (see
  // SinglePageApp's aside, always the static xl:flex column instead).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reaction to the drawer opening, not a render-time derivation
    if (summaryDrawerOpen) setSummaryTab('resumo');
  }, [summaryDrawerOpen]);

  function jumpToGridType() {
    setActiveItem('gridType');
  }

  function jumpToBattery() {
    setActiveItem('battery');
  }

  function jumpToFeature(id: DesiredFeatureId) {
    setActiveItem(id);
  }

  // Bubbles up to the Resumo tab's own status pill, so a pending issue is
  // visible from the summary without opening every feature card first.
  const featuresTabHasIssue = DESIRED_FEATURE_DEFINITIONS.some((feature) =>
    desiredFeatureHasPendingIssue(feature.id, residentialOptions.desiredFeatures, {
      microgrid: residentialOptions.microgrid,
      generator: residentialOptions.generator,
      pv: residentialOptions.pv,
      whiteTariff: residentialOptions.whiteTariff,
      atsBackupAcknowledged: residentialOptions.atsBackupAcknowledged,
      gridType: residentialOptions.gridType,
      peakW,
      loadsCount: residentialOptions.loads.length,
      operationHours: residentialOptions.operationHours,
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

  // Overview grid: the 6 desired features plus the two config items, all in
  // one flat list of cards (see PickerItem) — replaces the old main-tab/
  // sub-tab split with a single level, grouped visually but not navigationally.
  const featureItems: PickerItem[] = DESIRED_FEATURE_DEFINITIONS.map((feature) => {
    const enabled = residentialOptions.desiredFeatures.includes(feature.id);
    const hasIssue = desiredFeatureHasPendingIssue(feature.id, residentialOptions.desiredFeatures, {
      microgrid: residentialOptions.microgrid,
      generator: residentialOptions.generator,
      pv: residentialOptions.pv,
      whiteTariff: residentialOptions.whiteTariff,
      atsBackupAcknowledged: residentialOptions.atsBackupAcknowledged,
      gridType: residentialOptions.gridType,
      peakW,
      loadsCount: residentialOptions.loads.length,
      operationHours: residentialOptions.operationHours,
      inverterCatalog,
      availableInverterModels,
      selectedInverterModel: residentialOptions.inverterModel,
    });
    return {
      id: feature.id,
      icon: featureIcons[feature.id],
      label: feature.label,
      description: feature.description,
      state: hasIssue ? 'warn' : enabled ? 'on' : 'off',
      meta:
        feature.id === 'backup'
          ? enabled
            ? `${residentialOptions.loads.length} carga${residentialOptions.loads.length === 1 ? '' : 's'} selecionada${residentialOptions.loads.length === 1 ? '' : 's'}`
            : 'Nenhuma carga selecionada'
          : hasIssue
            ? 'Requer atenção'
            : enabled
              ? 'Configurado'
              : 'Não usado neste projeto',
    };
  });

  const configItems: PickerItem[] = [
    {
      id: 'gridType',
      icon: Zap,
      label: 'Rede e inversor',
      description: 'Tipo de rede elétrica do cliente e o inversor usado na instalação.',
      state: configTabHasIssue ? 'warn' : residentialOptions.gridType ? 'on' : 'off',
      meta: gridTypeSummary,
    },
    {
      id: 'battery',
      icon: Battery,
      label: 'Baterias',
      description: 'Topologia e modelo do banco de baterias que atende os requisitos definidos.',
      state: residentialOptions.batteryModel ? 'on' : 'warn',
      meta: residentialOptions.batteryModel
        ? `${residentialOptions.batteryModel}${residentialOptions.secondaryBatteryModel ? ` + ${residentialOptions.secondaryBatteryModel}` : ''}`
        : 'Modelo ainda não escolhido',
    },
  ];

  const isConfigItem = activeItem === 'gridType' || activeItem === 'battery';

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
  // selected on screen (see project-quote-pdf.tsx). Skips a solution still
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
          <h1 className="text-2xl font-semibold tracking-tight">Dimensionamento</h1>
          {projectName && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {projectName}
            </p>
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
          <Button
            variant="outline"
            onClick={exportPdf}
            disabled={!solution || !canCalculate || loading || hasInsufficientSolution || exportingPdf}
            title={
              !solution
                ? 'Calcule uma solução antes de baixar o relatório.'
                : hasInsufficientSolution
                  ? 'A solução encontrada não atende 100% aos requisitos de potência/energia — ajuste as cargas ou escolha outro modelo para poder baixar o relatório.'
                  : undefined
            }
          >
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exportingPdf ? 'Gerando relatório...' : 'Baixar relatório'}
          </Button>
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
        <div className="sticky top-0 z-20 -mx-4 -mt-4 space-y-3 bg-card px-4 pt-4 pb-3">
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
            <Button
              className="w-full"
              variant="outline"
              onClick={exportPdf}
              disabled={!solution || !canCalculate || loading || hasInsufficientSolution || exportingPdf}
              title={
                !solution
                  ? 'Calcule uma solução antes de baixar o relatório.'
                  : hasInsufficientSolution
                    ? 'A solução encontrada não atende 100% aos requisitos de potência/energia — ajuste as cargas ou escolha outro modelo para poder baixar o relatório.'
                    : undefined
              }
            >
              {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exportingPdf ? 'Gerando relatório...' : 'Baixar relatório'}
            </Button>
            <Button
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-50"
              disabled={!canSendQuoteByWhatsApp || sendingQuote}
              title={canSendQuoteByWhatsApp ? undefined : 'Cadastre o telefone do cliente para enviar a cotação por WhatsApp.'}
              onClick={onSendQuote}
            >
              {sendingQuote ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppIcon className="h-4 w-4" />}
              Compartilhar cotação
            </Button>
            {/* Sticky to the bottom of the summary aside (same cancel-the-padding
             * trick as the sticky header above — see its comment) so this stays
             * an easy, always-visible tap target on mobile instead of requiring
             * a scroll to the end of the summary. */}
            <div className="sticky bottom-0 -mx-4 -mb-5 grid gap-2 bg-card px-4 pb-5 pt-3">
              <Button
                variant="outline"
                className="h-12 w-full gap-2 text-base shadow-md md:h-9 md:text-sm"
                onClick={onQuoteSolution}
              >
                <ShoppingCart className="h-5 w-5 md:h-4 md:w-4" />
                Cotar solução
              </Button>
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
                Copiar dados para fornecedor
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
                inverterCatalog={inverterCatalog}
                productMedia={productMedia}
                userStockItems={userStockItems}
                services={services}
                userServices={userServices}
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
        {activeItem === null ? (
          <div className="space-y-6">
            <PickerGroup
              label="Configuração do sistema"
              hint="Selecione rede, inversor e baterias"
              items={configItems}
              onSelect={setActiveItem}
            />
            <PickerGroup
              label="Funcionalidades"
              hint="Defina o que o sistema deve atender"
              items={featureItems}
              onSelect={setActiveItem}
            />
          </div>
        ) : (
          <Card className="gap-3 rounded-none border-none bg-transparent p-0 shadow-none ring-0">
            <CardHeader className="flex flex-row flex-wrap items-start gap-2 px-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Voltar à visão geral"
                className="shrink-0"
                onClick={() => setActiveItem(null)}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" role="tablist" aria-label="Itens de dimensionamento">
                {/* Contextual, not a fixed set of 8: showing every item at
                 * once was what forced the wrapping/grouping workarounds.
                 * While a feature is open, only the other features are
                 * useful alternatives; while a config item is open, only
                 * the other config item is. */}
                {(isConfigItem ? configItems : featureItems).map((item) => (
                  <PickerPill key={item.id} item={item} active={item.id === activeItem} onClick={() => setActiveItem(item.id)} />
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-0">
              {activeItem === 'gridType' ? (
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
              ) : activeItem === 'battery' ? (
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
              ) : (
                <DesiredFeaturesPicker
                  activeTab={activeItem}
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
                  operationHours={residentialOptions.operationHours}
                  inverterCatalog={inverterCatalog}
                  availableInverterModels={availableInverterModels}
                  selectedInverterModel={residentialOptions.inverterModel}
                  gridType={residentialOptions.gridType}
                  peakW={peakW}
                  nominalW={nominalW}
                  dailyKwh={dailyKwh}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

/** One labeled section of the overview grid (see PickerItem) — the label is
 * a category heading, not a tab: nothing here is clickable except the cards
 * themselves, and every card across every group is reachable by scrolling. */
function PickerGroup({
  label,
  hint,
  items,
  onSelect,
}: {
  label: string;
  hint: string;
  items: PickerItem[];
  onSelect: (id: PickerItemId) => void;
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="tablist" aria-label={label}>
        {items.map((item) => (
          <PickerCard key={item.id} item={item} onClick={() => onSelect(item.id)} />
        ))}
      </div>
    </div>
  );
}

/** A card is functionally the same choice as the compact PickerPill it turns
 * into once opened (see below) — both pick one of the 8 items and reveal its
 * panel — so both share the tab/tabpanel pattern instead of a plain button.
 * `aria-selected` is always false here: nothing is "current" while the
 * overview grid itself is showing (there's no panel open yet). */
function PickerCard({ item, onClick }: { item: PickerItem; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={false}
      aria-label={item.label}
      onClick={onClick}
      className={cn(
        'flex min-h-[8.5rem] flex-col items-start gap-2 rounded-lg border bg-card px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        item.state === 'on'
          ? 'border-primary/40 bg-primary/[0.04]'
          : item.state === 'warn'
            ? 'border-destructive/30 hover:bg-muted/40'
            : 'border-border hover:border-primary/40 hover:bg-muted/40'
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
            item.state === 'on' && 'bg-primary/15 text-primary',
            item.state === 'warn' && 'bg-destructive/10 text-destructive'
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        {item.state === 'warn' ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : item.state === 'on' ? (
          <CircleCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{item.label}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
      </div>
      <p
        className={cn(
          'mt-auto pt-1 text-xs font-medium',
          item.state === 'warn' ? 'text-destructive' : item.state === 'on' ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {item.meta}
      </p>
    </button>
  );
}

/** The compact strip shown once an item is open — every item from both
 * groups in one row, so switching from a feature straight to "Baterias"
 * doesn't require going back to the overview first. */
function PickerPill({ item, active, onClick }: { item: PickerItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active
          ? 'border-primary bg-primary/[0.08] text-foreground'
          : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground'
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', active && 'text-primary')} aria-hidden="true" />
      {item.label}
      {item.state === 'warn' ? (
        <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" aria-hidden="true" />
      ) : item.state === 'on' ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      ) : null}
    </button>
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
