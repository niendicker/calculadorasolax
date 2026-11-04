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

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronLeft, FileDown, Loader2, Play, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
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
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'cursor-pointer transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active ? 'bg-primary/10 font-medium' : recommended ? 'bg-primary/[0.04]' : undefined
      )}
    >
      <td className="whitespace-nowrap px-3 py-2 text-sm">
        <span className="font-semibold">{scenario.moduleCount}</span>
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
      <td className="whitespace-nowrap px-3 py-2 text-sm">{formatCurrencyBRL(scenario.capex)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{formatCurrencyBRL(scenario.annualSavings)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{formatYears(scenario.paybackYearsSimple)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{formatPercentBRL(scenario.roiPercent)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{formatCurrencyBRL(scenario.npv)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">
        {scenario.marginalGain === null ? '—' : formatCurrencyBRL(scenario.marginalGain)}
      </td>
    </tr>
  );
}

export function CiResultsPanel({
  projectId,
  projectInfo,
  client,
  profile,
  ciOptions,
  onFlushSave,
  onNavigatePrev,
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
}) {
  const [result, setResult] = useState<CommercialIndustrialResult | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingMemorial, setGeneratingMemorial] = useState(false);
  const [memorialError, setMemorialError] = useState<string | null>(null);

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
      setSelectedScenarioId(calculationResult.recommendation.scenarioId ?? calculationResult.selected?.scenarioId ?? null);
    } catch {
      setError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateMemorial() {
    if (!result?.selected) return;
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
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${buildPdfFileName(projectInfo.name || 'memorial-ci')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMemorialError('Não foi possível gerar o memorial em PDF. Tente novamente.');
    } finally {
      setGeneratingMemorial(false);
    }
  }

  if (!projectId) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Salve o projeto (aba &quot;Visão geral&quot;) antes de calcular — o cálculo sempre usa a última
        configuração salva.
      </div>
    );
  }

  const sortedScenarios = result ? [...result.scenarios].sort((a, b) => a.moduleCount - b.moduleCount) : [];
  const currentScenario =
    sortedScenarios.find((s) => s.scenarioId === selectedScenarioId) ??
    (result?.selected?.scenarioId === selectedScenarioId ? result.selected : null) ??
    sortedScenarios.find((s) => s.scenarioId === result?.recommendation.scenarioId) ??
    result?.selected ??
    null;
  const isRecommendedActive =
    result?.recommendation.scenarioId
      ? currentScenario?.scenarioId === result.recommendation.scenarioId
      : currentScenario?.scenarioId === result?.selected?.scenarioId;

  const dispatch = result?.selected?.dispatch ?? [];
  const hasDispatch = dispatch.length > 0;
  const maxOriginalDemandKw = hasDispatch ? Math.max(...dispatch.map((d) => d.loadKw)) : 0;
  const maxGridDemandKw = hasDispatch ? Math.max(...dispatch.map((d) => d.gridImportKw)) : 0;
  const peakReductionKw = Math.max(0, maxOriginalDemandKw - maxGridDemandKw);
  const peakReductionPercent = maxOriginalDemandKw > 0 ? (peakReductionKw / maxOriginalDemandKw) * 100 : 0;

  const hasBessProduct = Boolean(ciOptions.bessProductId);
  const hasCurve = Boolean(ciOptions.loadCurve && (ciOptions.loadCurve.points.length > 0 || (ciOptions.loadCurve as any).representativeDays?.length > 0));
  const hasTariff = Boolean(ciOptions.tariff && (ciOptions.tariff.peakEnergyRateBrlKwh > 0 || ciOptions.tariff.offPeakEnergyRateBrlKwh > 0));
  const hasStrategy = Boolean(ciOptions.strategy);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Simulação de dimensionamento</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Usa a última configuração salva do projeto (BESS, curva, tarifa e estratégia).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result?.selected && (
            <Button type="button" variant="outline" onClick={handleGenerateMemorial} disabled={generatingMemorial}>
              {generatingMemorial ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden="true" />
              )}
              {generatingMemorial ? 'Gerando memorial...' : 'Gerar memorial (PDF)'}
            </Button>
          )}
          <Button type="button" onClick={runCalculation} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            {loading ? 'Calculando...' : result ? 'Recalcular' : 'Calcular'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        </div>
      )}

      {memorialError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {memorialError}
          </p>
        </div>
      )}

      {!result && !loading && (
        <div className="rounded-xl border border-muted bg-card/60 p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3 text-primary shrink-0">
              <BarChart3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Pronto para dimensionar a solução BESS</h3>
              <p className="text-sm text-muted-foreground">
                Revise os parâmetros definidos nas abas anteriores antes de executar a otimização econômica e técnica:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2.5 rounded-lg border bg-background/80 p-3">
              <CheckCircle2
                className={cn('h-5 w-5 shrink-0', hasBessProduct ? 'text-emerald-500' : 'text-muted-foreground/40')}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Produto BESS</p>
                <p className="truncate text-xs font-medium">{hasBessProduct ? 'Selecionado' : 'Padrão / Não definido'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border bg-background/80 p-3">
              <CheckCircle2
                className={cn('h-5 w-5 shrink-0', hasCurve ? 'text-emerald-500' : 'text-muted-foreground/40')}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Curva de Carga</p>
                <p className="truncate text-xs font-medium">{hasCurve ? 'Configurada' : 'Não definida'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border bg-background/80 p-3">
              <CheckCircle2
                className={cn('h-5 w-5 shrink-0', hasTariff ? 'text-emerald-500' : 'text-muted-foreground/40')}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Tarifas e Demanda</p>
                <p className="truncate text-xs font-medium">{hasTariff ? 'Estrutura preenchida' : 'Valores padrão'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border bg-background/80 p-3">
              <CheckCircle2
                className={cn('h-5 w-5 shrink-0', hasStrategy ? 'text-emerald-500' : 'text-muted-foreground/40')}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Estratégia</p>
                <p className="truncate text-xs font-medium">{ciOptions.strategy || 'HYBRID'}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <Button type="button" onClick={runCalculation} disabled={loading} className="gap-2">
              <Play className="h-4 w-4" aria-hidden="true" />
              Executar Dimensionamento
            </Button>
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
                isRecommendedActive
                  ? 'space-y-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-4'
                  : 'space-y-3 rounded-lg border border-muted-foreground/30 bg-muted/20 p-4'
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {isRecommendedActive ? (
                    <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
                  ) : (
                    <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  {isRecommendedActive
                    ? (result.recommendation.scenarioId
                        ? `Cenário recomendado — ${currentScenario.moduleCount} módulo${currentScenario.moduleCount === 1 ? '' : 's'}`
                        : `Nenhum cenário economicamente viável — menor configuração avaliada: ${currentScenario.moduleCount} módulo${currentScenario.moduleCount === 1 ? '' : 's'} (não recomendada)`)
                    : `Cenário inspecionado — ${currentScenario.moduleCount} módulo${currentScenario.moduleCount === 1 ? '' : 's'}`}
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
                {isRecommendedActive
                  ? result.recommendation.reason
                  : `Visualizando métricas financeiras detalhadas para a configuração de ${currentScenario.moduleCount} módulo(s). Clique em outra linha da tabela para comparar.`}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                    {'paybackYearsDiscounted' in currentScenario && (currentScenario as any).paybackYearsDiscounted !== undefined
                      ? ` / ${formatYears((currentScenario as any).paybackYearsDiscounted)}`
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ROI / NPV</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatPercentBRL(currentScenario.roiPercent)} / {formatCurrencyBRL(currentScenario.npv)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {result.selected && hasDispatch && (
            <div className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Operação e Despacho BESS (Peak Shaving)</p>
                  <p className="text-xs text-muted-foreground">
                    Comparativo da carga original versus demanda atendida pela rede após o corte de pico com BESS.
                  </p>
                </div>
              </div>

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

              <CiDispatchChart
                dispatch={dispatch}
                contractedDemandKw={ciOptions.tariff?.contractedDemandKw}
              />
            </div>
          )}

          {result.backup && result.backup.status !== 'disabled' && (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-muted/20 p-4">
              <div className="flex items-center justify-between">
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
                  {result.backup.status === 'fully_covered'
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
                  <p className="text-xs text-muted-foreground">Módulos Mín. p/ Autonomia</p>
                  <p className="mt-1 text-sm font-semibold">{result.backup.minModulesForBackup} módulo(s)</p>
                </div>
              </div>
              {result.backup.warningMessage && (
                <p className="text-xs text-amber-700 pt-1">{result.backup.warningMessage}</p>
              )}
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Comparação por quantidade de módulos</p>
              <p className="text-xs text-muted-foreground">Clique em uma linha para inspecionar os detalhes acima</p>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Módulos</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">CAPEX</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Economia/ano</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Payback</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">ROI</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">NPV</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Ganho marginal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedScenarios.map((scenario) => (
                    <ScenarioRow
                      key={scenario.scenarioId}
                      scenario={scenario}
                      recommended={scenario.scenarioId === result.recommendation.scenarioId}
                      active={scenario.scenarioId === (selectedScenarioId ?? result.recommendation.scenarioId)}
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
            Voltar para Configurações
          </Button>
        </div>
      )}
    </div>
  );
}
