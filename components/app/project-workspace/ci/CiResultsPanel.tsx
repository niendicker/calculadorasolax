'use client';

// Flush live project options before the canonical calculation route reads
// persisted configuration. Render only the selected technical solution or
// the proven failure reasons returned by that route.

import { formatAcPowerWarning } from '@/supabase/functions/_shared/commercial-industrial/ac-power';
import { useCiAcPower } from './ci-ac-power';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  FileDown,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { CiSolutionProducts } from './CiSolutionProducts';
import { ciScenarioLabel } from './ci-scenario-label';
import { getCiConfigurationStatus } from './ci-configuration-status';
import type { CiWorkspaceSection } from '../CommercialIndustrialWorkspace';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Client, ProjectInfo } from '@/lib/types';
import { buildPdfFileName, formatCurrencyBRL, formatKwh, formatPercentBRL, formatYears } from '../../helpers';
import type { InlineProfile } from '../../types';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';
import { fetchCiProductImages } from '@/lib/data/ci-product-images';

const CiDispatchChart = dynamic(() => import('./CiDispatchChart').then((mod) => mod.CiDispatchChart), {
  ssr: false,
  loading: () => <div className="h-[280px] w-full animate-pulse rounded-lg bg-muted" />,
});

export interface CiCalculationSnapshot {
  result: CommercialIndustrialResult;
  optionsFingerprint: string;
}

export type CiResultsSubTab = 'products' | 'dispatch' | 'engineering';

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
  onUpdateCiOptions?: (partial: Partial<CommercialIndustrialOptions>) => void;
  canAccessCiBackup?: boolean;
}) {
  const [result, setResult] = useState<CommercialIndustrialResult | null>(initialSnapshot?.result ?? null);
  const { factor, formatPower } = useCiAcPower(result ? result.assumptions.acPowerFactor ?? 1 : ciOptions.acPowerFactor);
  const powerWarning = (text: string) => formatAcPowerWarning(text, factor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingMemorial, setGeneratingMemorial] = useState(false);
  const [memorialSuccess, setMemorialSuccess] = useState(false);
  const [memorialError, setMemorialError] = useState<string | null>(null);
  const [calculatedOptionsFingerprint, setCalculatedOptionsFingerprint] = useState<string | null>(initialSnapshot?.optionsFingerprint ?? null);
  const [activeTab, setActiveTab] = useState<CiResultsSubTab>('products');
  const [productImages, setProductImages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!memorialSuccess) return;
    const timer = setTimeout(() => setMemorialSuccess(false), 2500);
    return () => clearTimeout(timer);
  }, [memorialSuccess]);

  const hasTechnicalSolution = Boolean(result?.selected?.technicalValidity && result.technicalSelection?.scenarioId !== null);
  const currentScenario = hasTechnicalSolution ? result!.selected : null;

  useEffect(() => {
    if (!currentScenario) return;
    let cancelled = false;

    async function loadImages() {
      try {
        const items = [
          ...(currentScenario?.billOfMaterials ?? []),
          ...(currentScenario?.composition?.items ?? []),
          ...(currentScenario?.accessories ?? []),
          ...(currentScenario?.sts?.selected
            ? [{ productId: currentScenario.sts.selected.spec.accessory_id, model: currentScenario.sts.selected.spec.model }]
            : []),
        ];
        if (ciOptions.bessProductId) {
          items.push({ productId: ciOptions.bessProductId, model: currentScenario?.equipmentLabel || '' });
        }
        const images = await fetchCiProductImages(items);
        if (!cancelled) {
          setProductImages(images);
        }
      } catch {
        // Fallback to local default icons if image fetch fails
      }
    }

    void loadImages();
    return () => {
      cancelled = true;
    };
  }, [currentScenario, ciOptions.bessProductId]);

  async function runCalculation() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setResult(null);
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
            Salva as alterações atuais e dimensiona uma solução que atende ao projeto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result?.selected?.technicalValidity && result.technicalSelection?.scenarioId !== null && (
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

      {loading && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Salvando parâmetros e dimensionando a solução. Aguarde…
        </p>
      )}

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

      {result && !hasTechnicalSolution && (
        <section role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-4 text-sm">
          <h3 className="font-semibold">Nenhuma solução atende aos requisitos técnicos</h3>
          <ul className="list-disc space-y-2 pl-5">
            {(result.technicalIssues?.length
              ? result.technicalIssues.map((issue) =>
                  issue.unit === 'kW' && issue.required !== undefined && issue.available !== undefined
                    ? `Potência insuficiente: o projeto exige ${formatPower(issue.required)}; os modelos selecionados permitem até ${formatPower(issue.available)} nas configurações aprovadas.`
                    : issue.message
                )
              : [result.technicalSelection?.reason ?? 'Recalcule para identificar os requisitos que não foram atendidos.']
            ).map((message) => (
              <li key={message}>{powerWarning(message)}</li>
            ))}
          </ul>
        </section>
      )}

      {result && hasTechnicalSolution && currentScenario && (
        <>
          {/* Executive KPI ribbon */}
          <section aria-label="Indicadores executivos" className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border bg-card/70 p-3.5 sm:p-4 shadow-xs">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Investimento (CAPEX)</p>
              <p className="mt-1 break-words text-base sm:text-lg font-bold tracking-tight text-foreground">
                {currentScenario.pricingComplete === false ? 'Preço pendente' : formatCurrencyBRL(currentScenario.capex)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Economia anual</p>
              <p className="mt-1 break-words text-base sm:text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatCurrencyBRL(currentScenario.annualSavings)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Payback simples</p>
              <p className="mt-1 break-words text-base sm:text-lg font-bold tracking-tight text-foreground">
                {formatYears(currentScenario.paybackYearsSimple)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Capacidade do sistema</p>
              <p className="mt-1 break-words text-base sm:text-lg font-bold tracking-tight text-foreground">
                {formatPower(currentScenario.totalPowerKw)} · {formatKwh(currentScenario.usefulCapacityKwh, 1)} útil
              </p>
            </div>
          </section>

          {/* Abas internas modernas */}
          <div className="flex gap-1.5 rounded-xl border bg-muted/50 p-1 shadow-xs overflow-x-auto" role="tablist" aria-label="Seções do resultado">
            <button
              type="button"
              role="tab"
              id="ci-results-tab-products"
              aria-controls="ci-results-panel-products"
              aria-selected={activeTab === 'products'}
              onClick={() => setActiveTab('products')}
              className={cn(
                'flex h-9 min-w-36 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeTab === 'products'
                  ? 'bg-background text-foreground shadow-xs ring-1 ring-border/60'
                  : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
              )}
            >
              <Package className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Produtos &amp; Valores</span>
            </button>
            <button
              type="button"
              role="tab"
              id="ci-results-tab-dispatch"
              aria-controls="ci-results-panel-dispatch"
              aria-selected={activeTab === 'dispatch'}
              onClick={() => setActiveTab('dispatch')}
              className={cn(
                'flex h-9 min-w-36 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeTab === 'dispatch'
                  ? 'bg-background text-foreground shadow-xs ring-1 ring-border/60'
                  : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
              )}
            >
              <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Operação &amp; Despacho</span>
            </button>
            <button
              type="button"
              role="tab"
              id="ci-results-tab-engineering"
              aria-controls="ci-results-panel-engineering"
              aria-selected={activeTab === 'engineering'}
              onClick={() => setActiveTab('engineering')}
              className={cn(
                'flex h-9 min-w-44 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeTab === 'engineering'
                  ? 'bg-background text-foreground shadow-xs ring-1 ring-border/60'
                  : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
              )}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Engenharia &amp; Confiabilidade</span>
              {currentScenario.technicalWarnings.length > 0 && (
                <span className="size-2 rounded-full bg-amber-500" aria-label="Contém avisos técnicos" />
              )}
            </button>
          </div>

          {/* Aba 1: Produtos & Valores */}
          <div
            role="tabpanel"
            id="ci-results-panel-products"
            aria-labelledby="ci-results-tab-products"
            tabIndex={0}
            hidden={activeTab !== 'products'}
            className="space-y-6 focus-visible:outline-none"
          >
            <section aria-label="Solução dimensionada" className="space-y-5 rounded-xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
              <CiSolutionProducts scenario={currentScenario} productImages={productImages} />
            </section>

            {currentScenario?.sts && (
              <section aria-label="STS selecionada" className="space-y-2 rounded-xl border bg-card p-4 sm:p-5 text-sm">
                <h3 className="font-semibold text-base">Transferência / STS</h3>
                <p>
                  {currentScenario.sts.selected
                    ? `1 × ${currentScenario.sts.selected.spec.model} · ${
                        currentScenario.pricingComplete === false
                          ? 'Preço pendente'
                          : `${formatCurrencyBRL(currentScenario.sts.selected.totalBrl)} (incluído no CAPEX)`
                      }`
                    : 'Nenhuma STS compatível para este cenário'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {currentScenario.sts.gridBusScope === 'installation' ? 'Barramento da instalação' : 'Barramento de backup (passagem declarada)'} · Corrente
                  exigida: {currentScenario.sts.requiredCurrentA.toFixed(1)} A · {currentScenario.sts.lineVoltageV} V · FP{' '}
                  {currentScenario.sts.powerFactor} · {currentScenario.sts.pcsCount} PCS/unidades.
                </p>
                {currentScenario.sts.selected && (
                  <p className="text-xs text-muted-foreground">
                    Limite aprovado: {currentScenario.sts.selected.compatibility.max_pcs} PCS/unidades · revisão{' '}
                    {currentScenario.sts.selected.compatibility.revision}. Corrente nominal:{' '}
                    {currentScenario.sts.lineVoltageV === 380
                      ? currentScenario.sts.selected.spec.rated_current_380v_a
                      : currentScenario.sts.selected.spec.rated_current_400v_a}{' '}
                    A.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{currentScenario.sts.message}</p>
              </section>
            )}



            <section aria-label="Investimento e retorno" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
              <div>
                <h3 className="text-base font-semibold">Investimento e retorno financeiro</h3>
                <p className="mt-1 text-xs text-muted-foreground">{result.recommendation.reason}</p>
              </div>
              {currentScenario.pricingComplete === false ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <p role="status">Preencha os preços no Portfólio para avaliar o financeiro: {currentScenario.missingPrices?.join(', ')}.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">CAPEX</p>
                    <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(currentScenario.capex)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Economia anual</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrencyBRL(currentScenario.annualSavings)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Payback simples / descontado</p>
                    <p className="mt-1 text-sm font-semibold">
                      {formatYears(currentScenario.paybackYearsSimple)}
                      {currentScenario.paybackYearsDiscounted !== undefined
                        ? ` / ${formatYears(currentScenario.paybackYearsDiscounted)}`
                        : ''}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">ROI / NPV</p>
                    <p className="mt-1 text-sm font-semibold">
                      {formatPercentBRL(currentScenario.roiPercent)} / {formatCurrencyBRL(currentScenario.npv)}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section aria-label="Capacidade da solução" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
                  Capacidade e atendimento técnico
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{`Solução que atende tecnicamente — ${ciScenarioLabel(currentScenario)}`}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Potência CA', formatPower(currentScenario.totalPowerKw)],
                  ['Energia nominal', formatKwh(currentScenario.totalCapacityKwh, 1)],
                  ['Energia útil', formatKwh(currentScenario.usefulCapacityKwh, 1)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 break-words text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              {result.technicalRequirements && (
                <p className="text-xs text-muted-foreground">
                  Requisitos do projeto: {formatPower(result.technicalRequirements.minPowerKw)} · {formatKwh(result.technicalRequirements.minEnergyKwh, 1)} úteis mínimos, incluindo reserva de backup.
                </p>
              )}
              <p className="text-xs text-muted-foreground">{result.technicalSelection?.reason ?? 'Solução selecionada pelo atendimento aos requisitos técnicos do projeto.'}</p>
            </section>
          </div>

          {/* Aba 2: Operação & Despacho */}
          <div
            role="tabpanel"
            id="ci-results-panel-dispatch"
            aria-labelledby="ci-results-tab-dispatch"
            tabIndex={0}
            hidden={activeTab !== 'dispatch'}
            className="space-y-6 focus-visible:outline-none"
          >
            {result.selected && hasDispatch && (
              <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold">Operação e Despacho BESS</h3>
                    <p className="text-xs text-muted-foreground">Dados da configuração calculada: {ciScenarioLabel(result.selected)}. O gráfico e o memorial correspondem à solução selecionada pelo atendimento técnico.</p>
                    <p className="text-xs text-muted-foreground">
                      Comparativo da carga original versus demanda atendida pela rede após o corte de pico com BESS.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-md border bg-muted/20 p-2.5">
                      <p className="text-xs text-muted-foreground">Pico de Carga Original</p>
                      <p className="mt-1 text-sm font-semibold">{formatPower(maxOriginalDemandKw)}</p>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-2.5">
                      <p className="text-xs text-muted-foreground">Pico com BESS (Rede)</p>
                      <p className="mt-1 text-sm font-semibold">{formatPower(maxGridDemandKw)}</p>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-2.5">
                      <p className="text-xs text-muted-foreground">Redução no Pico</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatPower(peakReductionKw)} ({peakReductionPercent.toFixed(1)}%)
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
                  powerFactor={result.assumptions.acPowerFactor ?? 1}
                  generatorPowerFactor={result.assumptions.generatorPowerFactor}
                  dispatch={dispatch}
                  contractedDemandKw={result.assumptions.tariff.contractedDemandKw}
                  rechargeWindow={ciOptions.rechargeWindow ?? result.assumptions.rechargeWindow ?? null}
                  dischargeWindow={ciOptions.dischargeWindow ?? result.assumptions.dischargeWindow ?? null}
                  timezone={ciOptions.loadCurve?.timezone ?? result.assumptions.loadCurve?.timezone}
                />
              </div>
            )}

            <div className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
              <div>
                <h3 className="text-base font-semibold">Linha de base (sem BESS)</h3>
                <p className="mt-1 text-xs text-muted-foreground">Custo e demanda do consumidor antes da aplicação da solução de armazenamento.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Custo anual</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(result.baseline.annualCostBrl)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Demanda máx. ponta</p>
                  <p className="mt-1 text-sm font-semibold">{formatPower(result.baseline.maxDemandPeakKw)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Demanda máx. fora ponta</p>
                  <p className="mt-1 text-sm font-semibold">{formatPower(result.baseline.maxDemandOffPeakKw)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Energia importada (ano)</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatKwh(result.baseline.energyImportedPeakKwh + result.baseline.energyImportedOffPeakKwh, 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Aba 3: Engenharia & Confiabilidade */}
          <div
            role="tabpanel"
            id="ci-results-panel-engineering"
            aria-labelledby="ci-results-tab-engineering"
            tabIndex={0}
            hidden={activeTab !== 'engineering'}
            className="space-y-6 focus-visible:outline-none"
          >
            {currentScenario.technicalWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-300">
                <p className="font-semibold text-sm">Avisos deste cenário</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {currentScenario.technicalWarnings.map((warning) => (
                    <li key={warning}>{powerWarning(warning)}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.backup && result.backup.status !== 'disabled' && (
              <div className="space-y-3 rounded-xl border border-primary/20 bg-muted/20 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                    <h3 className="text-base font-semibold">Confiabilidade e Operação em Falta de Rede (Backup)</h3>
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
                    {result.backup.status === 'insufficient_transfer'
                      ? 'Transferência não atendida'
                      : result.backup.status === 'fully_covered'
                        ? '100% Atendido'
                        : result.backup.status === 'partially_covered'
                          ? 'Autonomia Parcial'
                          : 'Potência Insuficiente'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">Autonomia Estimada</p>
                    <p className="mt-1 text-sm font-semibold">{result.backup.effectiveAutonomyHours.toFixed(1)} horas</p>
                  </div>
                  <div className="rounded-lg border bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">Potência Crítica Suportada</p>
                    <p className="mt-1 text-sm font-semibold">
                      {formatPower(result.selected?.totalPowerKw ?? 0)} / {formatPower(result.backup.requiredContinuousPowerKw)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">Reserva de SOC On-Grid</p>
                    <p className="mt-1 text-sm font-semibold">{result.backup.recommendedSocReservePercent.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-lg border bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">
                      {result.selected?.group
                        ? 'Múltiplos do agrupamento'
                        : result.selected?.composition
                          ? 'Múltiplos da composição'
                          : 'Módulos Mín. p/ Autonomia'}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {result.backup.minModulesForBackup}{' '}
                      {result.selected?.group ? 'agrupamento(s)' : result.selected?.composition ? 'composição(ões)' : 'módulo(s)'}
                    </p>
                  </div>
                </div>
                {result.backup.warningMessage && (
                  <p className="text-xs text-amber-700 pt-1">{powerWarning(result.backup.warningMessage)}</p>
                )}
              </div>
            )}



            {(currentScenario.group || currentScenario.composition) && (
              <details className="rounded-xl border bg-card p-4">
                <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                  Detalhes de conexão e compatibilidade
                </summary>
                {currentScenario.group && (
                  <div className="space-y-2 border-t pt-3 text-xs">
                    {result.assumptions.lineVoltageV && (
                      <p>Tensão de operação CA entre fases: {result.assumptions.lineVoltageV} V.</p>
                    )}
                    <p>
                      Carga CA até {formatPower(currentScenario.group.ac.chargePowerKw)} · Descarga CA até{' '}
                      {formatPower(currentScenario.group.ac.dischargePowerKw)} · Energia útil{' '}
                      {currentScenario.group.storage.usableEnergyKwh.toFixed(1)} kWh.
                    </p>
                    {currentScenario.group.dc.ports ? (
                      <ul className="space-y-1">
                        {currentScenario.group.dc.ports.map((port) => (
                          <li key={`${port.unit}:${port.port}`}>
                            Unidade {port.unit} · banco CC {port.port}: {port.series}S × {port.parallelStrings}P ·{' '}
                            {port.voltageMinV}–{port.voltageMaxV} V · carga/descarga CC até{' '}
                            {port.chargePowerKw.toFixed(1)}/{port.dischargePowerKw.toFixed(1)} kW · {port.chargeCurrentA}/
                            {port.dischargeCurrentA} A.
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        {currentScenario.group.dc.buses} barramento(s) CC · {currentScenario.group.dc.voltageMinV}–
                        {currentScenario.group.dc.voltageMaxV} V.
                      </p>
                    )}
                    <p>
                      Referência: {currentScenario.group.source.reference} · Revisão {currentScenario.group.source.revision}.
                    </p>
                  </div>
                )}
                {currentScenario.composition && (
                  <div className="space-y-3 border-t pt-3 text-xs">
                    <p>
                      {currentScenario.composition.pcsModel} + {currentScenario.composition.batteryModel} ·{' '}
                      {currentScenario.composition.portBanks
                        ? currentScenario.composition.portBanks.map((bank, i) => `Porta ${i + 1}: ${bank.series}S × ${bank.parallelStrings}P`).join(' / ')
                        : `${currentScenario.composition.seriesCount} unidades em série × ${currentScenario.composition.parallelStringsPerPcs} strings por PCS.`}
                    </p>
                    <p>
                      Carga AC até {formatPower(currentScenario.composition.chargePowerKw)} · Descarga AC até{' '}
                      {formatPower(currentScenario.composition.dischargePowerKw)} · Banco DC{' '}
                      {currentScenario.composition.voltageMinV}–{currentScenario.composition.voltageMaxV} V.
                    </p>
                    <p>
                      Compatibilidade: {currentScenario.composition.compatibilityName} · Revisão{' '}
                      {currentScenario.composition.revision}.
                    </p>
                  </div>
                )}
              </details>
            )}

            {result.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700">
                <p className="font-semibold">Avisos técnicos</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                  {result.warnings.map((message) => (
                    <li key={message}>{powerWarning(message)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
