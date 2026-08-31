'use client';

// Fase 6, section 8.1 item 7 ("Resultados e comparação") — runs the
// canonical calculation route (plan section 7:
// POST /api/projects/:projectId/calculations) and renders the scenario
// grid. That route deliberately never takes options in the request body —
// it always recalculates from the project's own saved `calculation_options`
// — so this panel can only run once the project has been saved at least
// once (currentCiProjectId set) and reflects whatever was last saved, not
// unsaved edits still sitting in the other panels. Selecting a different
// candidate than the auto-recommended one (plan section 4.5's
// materialization flow) is a later increment; this shows the recommended
// scenario's full detail (already materialized server-side) plus the
// comparison grid.

import { useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrencyBRL } from '../../helpers';
import type { CommercialIndustrialResult, ScenarioCandidate } from '@/supabase/functions/_shared/commercial-industrial/types';

function formatYears(years: number | null): string {
  return years === null ? '—' : `${years.toFixed(1)} anos`;
}

function ScenarioRow({ scenario, recommended }: { scenario: ScenarioCandidate; recommended: boolean }) {
  return (
    <tr className={recommended ? 'bg-primary/[0.06]' : undefined}>
      <td className="whitespace-nowrap px-3 py-2 text-sm font-medium">
        {scenario.moduleCount}
        {recommended && (
          <Badge variant="secondary" className="ml-2">
            Recomendado
          </Badge>
        )}
        {!scenario.technicalValidity && (
          <Badge variant="outline" className="ml-2">
            Inválido
          </Badge>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{formatCurrencyBRL(scenario.capex)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{formatCurrencyBRL(scenario.annualSavings)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{formatYears(scenario.paybackYearsSimple)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{scenario.roiPercent.toFixed(1)}%</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{formatCurrencyBRL(scenario.npv)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">
        {scenario.marginalGain === null ? '—' : formatCurrencyBRL(scenario.marginalGain)}
      </td>
    </tr>
  );
}

export function CiResultsPanel({ projectId }: { projectId: string | null }) {
  const [result, setResult] = useState<CommercialIndustrialResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCalculation() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/calculations`, { method: 'POST' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError((data as { error?: string } | null)?.error ?? 'Não foi possível calcular. Tente novamente.');
        return;
      }
      setResult(data as CommercialIndustrialResult);
    } catch {
      setError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Simulação de dimensionamento</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Usa a última configuração salva do projeto (BESS, curva, tarifa e estratégia).
          </p>
        </div>
        <Button type="button" onClick={runCalculation} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          {loading ? 'Calculando...' : result ? 'Recalcular' : 'Calcular'}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
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
                <p className="mt-1 text-sm font-semibold">{result.baseline.maxDemandPeakKw.toFixed(1)} kW</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Demanda máx. fora ponta</p>
                <p className="mt-1 text-sm font-semibold">{result.baseline.maxDemandOffPeakKw.toFixed(1)} kW</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Energia importada</p>
                <p className="mt-1 text-sm font-semibold">
                  {(result.baseline.energyImportedPeakKwh + result.baseline.energyImportedOffPeakKwh).toFixed(0)} kWh
                </p>
              </div>
            </div>
          </div>

          {result.selected && (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
                Cenário recomendado — {result.selected.moduleCount} módulo{result.selected.moduleCount === 1 ? '' : 's'}
              </p>
              <p className="text-xs text-muted-foreground">{result.recommendation.reason}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">CAPEX</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(result.selected.capex)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Economia anual</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(result.selected.annualSavings)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payback simples / descontado</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatYears(result.selected.paybackYearsSimple)} / {formatYears(result.selected.paybackYearsDiscounted)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ROI / NPV</p>
                  <p className="mt-1 text-sm font-semibold">
                    {result.selected.roiPercent.toFixed(1)}% / {formatCurrencyBRL(result.selected.npv)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-semibold">Comparação por quantidade de módulos</p>
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
    </div>
  );
}
