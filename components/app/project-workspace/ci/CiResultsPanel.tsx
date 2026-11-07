'use client';

// Fase 6, section 8.1 item 7 ("Resultados e comparação") — runs the
// canonical calculation route (plan section 7:
// POST /api/projects/:projectId/calculations) and renders the scenario
// grid. That route deliberately never takes options in the request body —
// it always recalculates from the project's own saved `calculation_options`
// — so this panel can only run once the project has been saved at least
// once (currentCiProjectId set). Autosave (SinglePageApp.tsx) only writes
// that column ~12s after the user stops editing, so clicking "Calcular"
// right after a change would otherwise race it and read a stale snapshot —
// the same bug fixed for residential's "Recalcular solução" in 08cab2f6.
// Here the fix is `onFlushSave`: force-persist the live ciOptions before
// the calculation request, since (unlike residential) this route can't just
// be handed live options directly. Selecting a different candidate than the
// auto-recommended one (plan section 4.5's materialization flow) is a later
// increment; this shows the recommended scenario's full detail (already
// materialized server-side) plus the comparison grid.

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, BarChart3, Check, CheckCircle2, ChevronLeft, FileDown, Loader2, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { ciScenarioLabel } from './ci-scenario-label';
import { getCiConfigurationStatus } from './ci-configuration-status';
import type { CiWorkspaceSection } from '../CommercialIndustrialWorkspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Client, ProjectInfo } from '@/lib/types';
import { buildPdfFileName, formatCurrencyBRL, formatKw, formatKwh, formatPercentBRL, formatYears } from '../../helpers';
import type { InlineProfile } from '../../types';
import type { CommercialIndustrialOptions, CommercialIndustrialResult, ScenarioCandidate } from '@/supabase/functions/_shared/commercial-industrial/types';

const CiDispatchChart = dynamic(() => import('./CiDispatchChart').then((mod) => mod.CiDispatchChart), {
  ssr: false,
  loading: () => <div className="h-[280px] w-full animate-pulse rounded-lg bg-muted" />,
});

function ScenarioRow({
  scenario,
  recommended,
  active,
  onSelect,
}: {
  scenario: ScenarioCandidate;
  recommended: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={cn(
        'cursor-pointer transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active ? 'bg-primary/10 font-medium' : recommended ? 'bg-primary/[0.04]' : undefined
      )}
    >
      <td className={cn("sticky left-0 z-10 bg-background px-3 py-2 text-sm shadow-[1px_0_0_0_hsl(var(--border))]", scenario.composition ? "min-w-44 max-w-60 whitespace-normal" : "whitespace-nowrap")}>
        <button
          type="button"
          aria-label={`Inspecionar cenário de ${ciScenarioLabel(scenario)}`}
          aria-pressed={active}
          onClick={(event) => { event.stopPropagation(); onSelect(); }}
          className="rounded-md px-2 py-1 font-semibold underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {scenario.equipmentLabel && <span className="block text-xs">{scenario.equipmentLabel}</span>}{scenario.composition ? <span className="block whitespace-normal">{scenario.composition.pcsCount} PCS · {scenario.composition.batteryCount} baterias<span className="block text-xs font-normal">{scenario.composition.seriesCount}S × {scenario.composition.parallelStringsPerPcs}P / PCS</span></span> : scenario.moduleCount}
        </button>
        {recommended && (
          <Badge variant="secondary" className="ml-2">
            Recomendado
          </Badge>
        )}
        {active && !recommended && (
          <Badge variant="outline" className="ml-2 border-primary/40 text-primary">
            Selecionado
          </Badge>
        )}
        {!scenario.technicalValidity && (
          <Badge variant="outline" className="ml-2 text-destructive border-destructive/30">
            Inválido
          </Badge>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{scenario.pricingComplete === false ? 'Preço pendente' : formatCurrencyBRL(scenario.capex)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{scenario.pricingComplete === false ? '—' : formatCurrencyBRL(scenario.annualSavings)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{scenario.pricingComplete === false ? '—' : formatYears(scenario.paybackYearsSimple)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{scenario.pricingComplete === false ? '—' : formatPercentBRL(scenario.roiPercent)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{scenario.pricingComplete === false ? '—' : formatCurrencyBRL(scenario.npv)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">
        {scenario.marginalGain === null ? '—' : formatCurrencyBRL(scenario.marginalGain)}
      </td>
    </tr>
  );
}

export interface CiCalculationSnapshot {
  result: CommercialIndustrialResult;
  optionsFingerprint: string;
}

export function CiResultsPanel({
  projectId,
  projectInfo,
  client,
  profile,
  ciOptions,
  onFlushSave,
  onNavigatePrev,
  prevSectionLabel,
  initialSnapshot = null,
  onCalculated,
  onNavigateToSection,
  canAccessCiBackup = true,
}: {
  projectId: string | null;
  projectInfo: ProjectInfo;
  client: Client | null;
  profile: InlineProfile | null;
  ciOptions: CommercialIndustrialOptions;
  /** Persists the live ciOptions right now, bypassing autosave's debounce —
   * see the file header comment for why "Calcular" needs this. */
  onFlushSave: () => Promise<unknown>;
  onNavigatePrev?: () => void;
  prevSectionLabel?: string;
  initialSnapshot?: CiCalculationSnapshot | null;
  onCalculated?: (snapshot: CiCalculationSnapshot) => void;
  onNavigateToSection?: (section: CiWorkspaceSection) => void;
  canAccessCiBackup?: boolean;
}) {
  const [result, setResult] = useState<CommercialIndustrialResult | null>(initialSnapshot?.result ?? null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingMemorial, setGeneratingMemorial] = useState(false);
  const [memorialSuccess, setMemorialSuccess] = useState(false);
  const [memorialError, setMemorialError] = useState<string | null>(null);
  const [calculatedOptionsFingerprint, setCalculatedOptionsFingerprint] = useState<string | null>(initialSnapshot?.optionsFingerprint ?? null);

  useEffect(() => {
    if (!memorialSuccess) return;
    const timer = setTimeout(() => setMemorialSuccess(false), 2500);
    return () => clearTimeout(timer);
  }, [memorialSuccess]);

  async function runCalculation() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      try {
        await onFlushSave();
      } catch {
        setError('Não foi possível salvar as alterações antes de calcular. Tente novamente.');
        return;
      }
      const response = await fetch(`/api/projects/${projectId}/calculations`, { method: 'POST' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError((data as { error?: string } | null)?.error ?? 'Não foi possível calcular. Tente novamente.');
        return;
      }
      const calculationResult = data as CommercialIndustrialResult;
      setResult(calculationResult);
      const optionsFingerprint = JSON.stringify(ciOptions);
      setCalculatedOptionsFingerprint(optionsFingerprint);
      onCalculated?.({ result: calculationResult, optionsFingerprint });
      setSelectedScenarioId(calculationResult.technicalSelection?.scenarioId ?? calculationResult.recommendation.scenarioId ?? calculationResult.selected?.scenarioId ?? null);
    } catch {
      setError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateMemorial() {
    if (!result?.selected || result.selected.pricingComplete === false || loading || calculatedOptionsFingerprint !== JSON.stringify(ciOptions)) return;
    setGeneratingMemorial(true);
    setMemorialError(null);
    try {
      const [{ buildCiMemorialPdfBlob }, { listActiveCiBessProducts }] = await Promise.all([
        import('./ci-memorial-pdf'),
        import('@/lib/data/ci-bess-products-repository'),
      ]);
      const products = ciOptions.bessProductId ? await listActiveCiBessProducts() : [];
      const product = products.find((item) => item.id === ciOptions.bessProductId) ?? null;
      const blob = await buildCiMemorialPdfBlob({
        projectInfo,
        client,
        profile,
        result,
        product,
        rankingCriterion: ciOptions.rankingCriterion,
        solar: ciOptions.solar,
        generator: ciOptions.generator,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${buildPdfFileName(projectInfo.name || 'memorial-ci')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMemorialSuccess(true);
    } catch {
      setMemorialError('Não foi possível gerar o memorial em PDF. Tente novamente.');
    } finally {
      setGeneratingMemorial(false);
    }
  }

  if (!projectId) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p>Salve o projeto na aba Visão geral antes de calcular.</p>
        {onNavigateToSection && <Button type="button" variant="outline" onClick={() => onNavigateToSection('overview')}>Ir para Visão geral</Button>}
      </div>
    );
  }

  const sortedScenarios = result ? [...result.scenarios].sort((a, b) => a.composition && b.composition ? a.totalCapacityKwh - b.totalCapacityKwh || a.totalPowerKw - b.totalPowerKw : a.moduleCount - b.moduleCount) : [];
  const currentScenario =
    sortedScenarios.find((s) => s.scenarioId === selectedScenarioId) ??
    (result?.selected?.scenarioId === selectedScenarioId ? result.selected : null) ??
    sortedScenarios.find((s) => s.scenarioId === result?.technicalSelection?.scenarioId) ??
    sortedScenarios.find((s) => s.scenarioId === result?.recommendation.scenarioId) ??
    result?.selected ??
    null;
  const isRecommendedActive =
    result?.recommendation.scenarioId
      ? currentScenario?.scenarioId === result.recommendation.scenarioId
      : currentScenario?.scenarioId === result?.selected?.scenarioId;

  const dispatch = result?.selected?.dispatch ?? [];
  const hasDispatch = dispatch.length > 0;
  const resolutionHours = (result?.assumptions.loadCurve.resolutionMinutes ?? 15) / 60;
  const totalSolarKwh = dispatch.reduce((sum, d) => sum + (d.solarGenerationKw ?? 0) * resolutionHours, 0);
  const totalGenKwh = dispatch.reduce((sum, d) => sum + (d.generatorKw ?? 0) * resolutionHours, 0);
  const maxOriginalDemandKw = hasDispatch ? Math.max(...dispatch.map((d) => d.loadKw)) : 0;
  const maxGridDemandKw = hasDispatch ? Math.max(...dispatch.map((d) => d.gridImportKw)) : 0;
  const peakReductionKw = Math.max(0, maxOriginalDemandKw - maxGridDemandKw);
  const peakReductionPercent = maxOriginalDemandKw > 0 ? (peakReductionKw / maxOriginalDemandKw) * 100 : 0;

  const configuration = getCiConfigurationStatus(ciOptions);
  const readiness: { section: CiWorkspaceSection; label: string; configured: boolean; inactive?: boolean }[] = [
    { section: 'bess', label: 'Configuração BESS', configured: configuration.bess },
    { section: 'solar', label: 'Solar FV', configured: configuration.solar, inactive: !ciOptions.solar?.enabled },
    { section: 'curve', label: 'Curvas e aplicações', configured: configuration.curve },
    { section: 'tariff', label: 'Tarifa', configured: configuration.tariff },
    { section: 'strategy', label: 'Estratégia', configured: true },
    ...(canAccessCiBackup ? [{ section: 'backup' as const, label: 'Falta de rede', configured: configuration.backup, inactive: !ciOptions.backup?.enabled }] : []),
  ];
  const pendingCount = readiness.filter((item) => !item.configured).length;

  const isStale = Boolean(result && calculatedOptionsFingerprint && calculatedOptionsFingerprint !== JSON.stringify(ciOptions));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Simulação de dimensionamento</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Salva as alterações atuais antes de calcular os cenários de BESS.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result?.selected && (
            <Button
              type="button"
              variant={memorialSuccess ? 'secondary' : 'outline'}
              onClick={handleGenerateMemorial}
              disabled={generatingMemorial || loading || isStale || result.selected?.pricingComplete === false}
              className={cn(memorialSuccess && 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400')}
            >
              {generatingMemorial ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : memorialSuccess ? (
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden="true" />
              )}
              {generatingMemorial ? 'Gerando memorial...' : memorialSuccess ? 'Memorial baixado!' : 'Gerar memorial (PDF)'}
            </Button>
          )}
          <Button type="button" onClick={runCalculation} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            {loading ? 'Calculando...' : result ? 'Recalcular' : 'Calcular'}
          </Button>
        </div>
      </div>

      {isStale && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>Os parâmetros do estudo foram alterados nas outras abas. Recalcule para atualizar os resultados e o memorial.</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runCalculation}
            disabled={loading}
            className="shrink-0 h-7 text-xs border-amber-500/40 hover:bg-amber-500/20"
          >
            Recalcular agora
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        </div>
      )}

      {memorialError && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {memorialError}
          </p>
        </div>
      )}

      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Salvando parâmetros e calculando os cenários. Aguarde…</p>}

      {!result && !loading && (
        <div className="rounded-xl border border-muted bg-card/60 p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3 text-primary shrink-0">
              <BarChart3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">{pendingCount > 0 ? 'Revise as pendências do estudo' : 'Pronto para dimensionar a solução BESS'}</h3>
              <p className="text-sm text-muted-foreground">
                Confira as configurações abaixo. Abra uma etapa para completar os dados ou use Calcular para executar a simulação.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {readiness.map(({ section, label, configured, inactive }) => (
              <div key={section} className="flex items-center gap-2.5 rounded-lg border bg-background/80 p-3">
                {configured ? <CheckCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{inactive ? 'Opcional · Inativo' : configured ? 'Configurado' : 'Requer atenção'}</p>
                </div>
                {onNavigateToSection && <Button type="button" size="sm" variant="ghost" aria-label={`Abrir ${label}`} onClick={() => onNavigateToSection(section)}>Abrir</Button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-semibold">Linha de base (sem BESS)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Custo anual</p>
                <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(result.baseline.annualCostBrl)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Demanda máx. ponta</p>
                <p className="mt-1 text-sm font-semibold">{formatKw(result.baseline.maxDemandPeakKw)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Demanda máx. fora ponta</p>
                <p className="mt-1 text-sm font-semibold">{formatKw(result.baseline.maxDemandOffPeakKw)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Energia importada (ano)</p>
                <p className="mt-1 text-sm font-semibold">
                  {formatKwh(result.baseline.energyImportedPeakKwh + result.baseline.energyImportedOffPeakKwh, 0)}
                </p>
              </div>
            </div>
          </div>

          {currentScenario && (
            <div
              className={
                isRecommendedActive && result.recommendation.scenarioId
                  ? 'space-y-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-4'
                  : 'space-y-3 rounded-lg border border-muted-foreground/30 bg-muted/20 p-4'
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {isRecommendedActive && result.recommendation.scenarioId ? (
                    <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
                  ) : (
                    <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  {currentScenario.scenarioId === result.technicalSelection?.scenarioId ? `Solução que atende tecnicamente — ${ciScenarioLabel(currentScenario)}` : isRecommendedActive
                    ? (result.recommendation.scenarioId
                        ? `Cenário recomendado — ${ciScenarioLabel(currentScenario)}`
                        : result.technicalSelection ? `Nenhuma solução atende tecnicamente — referência: ${ciScenarioLabel(currentScenario)}` : `Nenhum cenário economicamente viável — configuração de referência: ${ciScenarioLabel(currentScenario)} (não recomendada)`)
                    : `Cenário inspecionado — ${ciScenarioLabel(currentScenario)}`}
                </p>
                {!isRecommendedActive && result.recommendation.scenarioId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-primary"
                    onClick={() => setSelectedScenarioId(result.recommendation.scenarioId)}
                  >
                    Voltar ao recomendado
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {currentScenario.scenarioId === result.technicalSelection?.scenarioId ? result.technicalSelection.reason : isRecommendedActive
                  ? result.recommendation.reason
                  : `Visualizando métricas financeiras detalhadas para a configuração de ${ciScenarioLabel(currentScenario)}. Clique em outra linha da tabela para comparar.`}
              </p>
              {currentScenario.scenarioId === result.technicalSelection?.scenarioId && <p className="text-xs text-muted-foreground">{result.recommendation.reason}</p>}
              {Boolean(currentScenario.accessories?.length) && <div className="space-y-2 border-t pt-3 text-xs"><p className="font-semibold">Acessórios C&I</p><ul className="space-y-2">{currentScenario.accessories!.map(item=><li key={item.productId}><div className="flex flex-wrap justify-between gap-2"><span>{item.quantity} × {item.model}{item.bundled ? ' · Incluso':''}</span><strong>{currentScenario.pricingComplete === false ? 'Preço pendente' : formatCurrencyBRL(item.totalBrl)}</strong></div><p className="text-muted-foreground">{item.reasons.join('; ')}</p></li>)}</ul></div>}
              {currentScenario.composition && <div className="space-y-3 border-t pt-3 text-xs">
                <p>{currentScenario.composition.pcsModel} + {currentScenario.composition.batteryModel} · {currentScenario.composition.seriesCount} unidades em série × {currentScenario.composition.parallelStringsPerPcs} strings por PCS.</p>
                <p>Carga AC até {formatKw(currentScenario.composition.chargePowerKw)} · Descarga AC até {formatKw(currentScenario.composition.dischargePowerKw)} · Banco DC {currentScenario.composition.voltageMinV}–{currentScenario.composition.voltageMaxV} V.</p>
                <p>Compatibilidade: {currentScenario.composition.compatibilityName} · Revisão {currentScenario.composition.revision}.</p>
                <ul className="space-y-1">{currentScenario.composition.items.filter(item=>!currentScenario.accessories?.length || item.productType!=='accessory').map((item) => <li key={`${item.productType}-${item.productId}`} className="flex flex-wrap justify-between gap-2"><span>{item.quantity} × {item.model}{currentScenario.pricingComplete === false ? '' : ` · ${formatCurrencyBRL(item.unitPriceBrl)}/un.`}</span><strong>{currentScenario.pricingComplete === false ? 'Preço pendente' : formatCurrencyBRL(item.totalBrl)}</strong></li>)}</ul>
              </div>}
              {currentScenario.technicalWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-medium">Avisos deste cenário</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {currentScenario.technicalWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}
              {currentScenario.pricingComplete === false ? <p role="status" className="text-sm">Preencha os preços no Portfólio para avaliar o financeiro: {currentScenario.missingPrices?.join(', ')}.</p> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">CAPEX</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(currentScenario.capex)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Economia anual</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(currentScenario.annualSavings)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payback simples / descontado</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatYears(currentScenario.paybackYearsSimple)}
                    {currentScenario.paybackYearsDiscounted !== undefined
                      ? ` / ${formatYears(currentScenario.paybackYearsDiscounted)}`
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ROI / NPV</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatPercentBRL(currentScenario.roiPercent)} / {formatCurrencyBRL(currentScenario.npv)}
                  </p>
                </div>
              </div>}
            </div>
          )}

          {result.selected && hasDispatch && (
            <div className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Operação e Despacho BESS</p>
                  <p className="text-xs text-muted-foreground">Dados da configuração calculada: {ciScenarioLabel(result.selected)}. O gráfico e o memorial permanecem vinculados a essa configuração ao inspecionar outras linhas.</p>
                  <p className="text-xs text-muted-foreground">
                    Comparativo da carga original versus demanda atendida pela rede após o corte de pico com BESS.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border bg-muted/20 p-2.5">
                    <p className="text-xs text-muted-foreground">Pico de Carga Original</p>
                    <p className="mt-1 text-sm font-semibold">{formatKw(maxOriginalDemandKw)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2.5">
                    <p className="text-xs text-muted-foreground">Pico com BESS (Rede)</p>
                    <p className="mt-1 text-sm font-semibold">{formatKw(maxGridDemandKw)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2.5">
                    <p className="text-xs text-muted-foreground">Redução no Pico</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatKw(peakReductionKw)} ({peakReductionPercent.toFixed(1)}%)
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2.5">
                    <p className="text-xs text-muted-foreground">Economia em Demanda</p>
                    <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(result.selected.demandSavings)}/ano</p>
                  </div>
                </div>

                {(totalSolarKwh > 0 || totalGenKwh > 0) && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {totalSolarKwh > 0 && (
                      <div className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Geração Solar FV (período simulado)</span>
                        <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{formatKwh(totalSolarKwh, 1)}</span>
                      </div>
                    )}
                    {totalGenKwh > 0 && (
                      <div className="flex items-center justify-between rounded-md border border-orange-500/20 bg-orange-500/5 p-2.5">
                        <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Geração GMG (período simulado)</span>
                        <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">{formatKwh(totalGenKwh, 1)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <CiDispatchChart
                dispatch={dispatch}
                contractedDemandKw={result.assumptions.tariff.contractedDemandKw}
              />
            </div>
          )}

          {currentScenario?.sts && <section aria-label="STS selecionada" className="space-y-2 rounded-xl border p-4 text-sm">
            <h3 className="font-semibold">Transferência / STS</h3>
            <p>{currentScenario.sts.selected ? `1 × ${currentScenario.sts.selected.spec.model} · ${currentScenario.pricingComplete === false ? 'Preço pendente' : `${formatCurrencyBRL(currentScenario.sts.selected.totalBrl)} (incluído no CAPEX)`}` : 'Nenhuma STS compatível para este cenário'}</p>
            <p className="text-xs text-muted-foreground">{currentScenario.sts.gridBusScope==='installation'?'Barramento da instalação':'Barramento de backup (passagem declarada)'} · Corrente exigida: {currentScenario.sts.requiredCurrentA.toFixed(1)} A · {currentScenario.sts.lineVoltageV} V · FP {currentScenario.sts.powerFactor} · {currentScenario.sts.pcsCount} PCS/unidades.</p>
            {currentScenario.sts.selected && <p className="text-xs text-muted-foreground">Limite aprovado: {currentScenario.sts.selected.compatibility.max_pcs} PCS/unidades · revisão {currentScenario.sts.selected.compatibility.revision}. Corrente nominal: {currentScenario.sts.lineVoltageV===380?currentScenario.sts.selected.spec.rated_current_380v_a:currentScenario.sts.selected.spec.rated_current_400v_a} A.</p>}
            <p className="text-xs text-muted-foreground">{currentScenario.sts.message}</p>
          </section>}

          {result.backup && result.backup.status !== 'disabled' && (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                  <p className="text-sm font-semibold">Confiabilidade e Operação em Falta de Rede (Backup)</p>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    result.backup.status === 'fully_covered'
                      ? 'bg-emerald-100 text-emerald-700'
                      : result.backup.status === 'partially_covered'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-destructive/10 text-destructive'
                  )}
                >
                  {result.backup.status === 'insufficient_transfer' ? 'Transferência não atendida' : result.backup.status === 'fully_covered'
                    ? '100% Atendido'
                    : result.backup.status === 'partially_covered'
                      ? 'Autonomia Parcial'
                      : 'Potência Insuficiente'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Autonomia Estimada</p>
                  <p className="mt-1 text-sm font-semibold">{result.backup.effectiveAutonomyHours.toFixed(1)} horas</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Potência Crítica Suportada</p>
                  <p className="mt-1 text-sm font-semibold">
                    {result.selected?.totalPowerKw ?? 0} kW / {result.backup.requiredContinuousPowerKw.toFixed(1)} kW
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reserva de SOC On-Grid</p>
                  <p className="mt-1 text-sm font-semibold">{result.backup.recommendedSocReservePercent.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{result.selected?.composition ? 'Múltiplos da composição p/ autonomia' : 'Módulos Mín. p/ Autonomia'}</p>
                  <p className="mt-1 text-sm font-semibold">{result.backup.minModulesForBackup} {result.selected?.composition ? 'composição(ões)' : 'módulo(s)'}</p>
                </div>
              </div>
              {result.backup.warningMessage && (
                <p className="text-xs text-amber-700 pt-1">{result.backup.warningMessage}</p>
              )}
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{result.scenarios.some((item) => item.composition) ? 'Comparação de composições PCS + baterias' : 'Comparação por quantidade de módulos'}</p>
              <p className="text-xs text-muted-foreground">Clique em uma linha para inspecionar os detalhes acima</p>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left">
                <caption className="sr-only">Comparação dos cenários BESS por quantidade de módulos. Use o botão na primeira coluna para inspecionar cada cenário.</caption>
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 whitespace-nowrap bg-muted px-3 py-2 text-xs font-medium text-muted-foreground shadow-[1px_0_0_0_hsl(var(--border))]">{result.scenarios.some((item) => item.composition) ? 'Composição' : 'Módulos'}</th>
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">CAPEX</th>
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">Economia/ano</th>
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">Payback</th>
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">ROI</th>
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">NPV</th>
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">Ganho marginal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedScenarios.map((scenario) => (
                    <ScenarioRow
                      key={scenario.scenarioId}
                      scenario={scenario}
                      recommended={scenario.scenarioId === result.recommendation.scenarioId}
                      active={scenario.scenarioId === currentScenario?.scenarioId}
                      onSelect={() => setSelectedScenarioId(scenario.scenarioId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700">
              <p className="font-medium">Avisos técnicos</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
                {result.warnings.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {onNavigatePrev && (
        <div className="flex items-center justify-start border-t pt-4">
          <Button type="button" variant="outline" onClick={onNavigatePrev} className="gap-1.5 rounded-lg text-xs">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para {prevSectionLabel || 'Configurações'}
          </Button>
        </div>
      )}
    </div>
  );
}
