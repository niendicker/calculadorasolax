'use client';

// C&I workspace, "Visão geral" — dashboard-style summary mirroring
// ProjectWorkspace.tsx's own `section === 'overview'` branch (Instalação /
// Recursos / Solução atual cards), adapted to C&I's flatter domain: there's
// no separate "technical config" vs "optional resources" split here, so
// BESS/Curva de carga/Tarifa/Estratégia become one grid of configuration
// cards, followed by a "Resultado atual" card mirroring residential's
// "Solução atual". Local, C&I-only presentational helpers below rather than
// importing ProjectWorkspace.tsx's private ones — same "mirror, don't share"
// convention already used across this module (see ci-projects-repository.ts's
// own header comment).

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BatteryCharging,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  LineChart,
  Receipt,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatAddress } from '@/lib/address';
import { listActiveCiBessProducts, type CiBessProductRecord } from '@/lib/data/ci-bess-products-repository';
import type { Client, ProjectInfo } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';
import { formatCurrencyBRL, formatKw, formatYears } from '../../helpers';
import type { CiWorkspaceSection } from '../CommercialIndustrialWorkspace';
import { ProjectInfoEditor } from '../ProjectInfoEditor';
import { ProjectInfoModal, type ProjectInfoEditField } from '../ProjectInfoModal';

const STRATEGY_LABELS: Record<string, string> = {
  PEAK_SHAVING: 'Peak Shaving',
  LOAD_SHIFTING: 'Load Shifting',
  HYBRID: 'Híbrido',
};

const RANKING_LABELS: Record<string, string> = { PAYBACK: 'Payback', ROI: 'ROI', NPV: 'NPV' };

function CardIcon({ icon: Icon }: { icon: typeof BatteryCharging }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function StateBadge({ configured }: { configured: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', configured ? 'text-emerald-600' : 'text-amber-600')}>
      {configured ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
      {configured ? 'Configurado' : 'Requer atenção'}
    </span>
  );
}

function ConfigCard({
  icon: Icon,
  label,
  configured,
  summary,
  onOpen,
}: {
  icon: typeof BatteryCharging;
  label: string;
  configured: boolean;
  summary: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full min-h-24 w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-1 block">
          <StateBadge configured={configured} />
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{summary}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function EditableSummaryRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value}`}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 border-b py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="min-w-0 truncate text-sm text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-2">
        <span className="truncate text-right text-sm font-medium">{value}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </span>
    </button>
  );
}

export function CiOverviewPanel({
  projectInfo,
  clients,
  client,
  onUpdateProjectInfo,
  onSaveProject,
  onBackToProjects,
  isSaved,
  ciOptions,
  calculationResult,
  onNavigateToSection,
}: {
  projectInfo: ProjectInfo;
  clients: Client[];
  client: Client | null;
  onUpdateProjectInfo: (partial: Partial<ProjectInfo>) => void;
  onSaveProject: () => void;
  onBackToProjects: () => void;
  /** Brand-new, never-saved projects still get the full ProjectInfoEditor
   * form (this is how a C&I project gets its first name/save, mirroring
   * ProjectWorkspace.tsx's own "project" tab) — the summary-row + modal
   * pattern below only makes sense once there's a saved project to
   * summarize, same as residential's "overview" vs "project" tabs. */
  isSaved: boolean;
  ciOptions: CommercialIndustrialOptions;
  calculationResult: CommercialIndustrialResult | null;
  onNavigateToSection: (section: CiWorkspaceSection) => void;
}) {
  const [projectInfoEditField, setProjectInfoEditField] = useState<ProjectInfoEditField>(null);
  const [bessProducts, setBessProducts] = useState<CiBessProductRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    listActiveCiBessProducts()
      .then((products) => {
        if (!cancelled) setBessProducts(products);
      })
      .catch(() => {
        if (!cancelled) setBessProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bessProduct = bessProducts.find((product) => product.id === ciOptions.bessProductId) ?? null;

  const bessConfigured =
    ciOptions.bessProductId !== null &&
    (ciOptions.sizing.mode === 'fixed'
      ? ciOptions.sizing.moduleCount !== null
      : ciOptions.sizing.minModules !== null && ciOptions.sizing.maxModules !== null);
  const bessSummary = !ciOptions.bessProductId
    ? 'Nenhum produto selecionado'
    : `${bessProduct ? `${bessProduct.model} · ${bessProduct.manufacturer}` : 'Produto selecionado'} · ${
        ciOptions.sizing.mode === 'fixed'
          ? `${ciOptions.sizing.moduleCount ?? 1} módulo(s)`
          : `${ciOptions.sizing.minModules ?? '?'}–${ciOptions.sizing.maxModules ?? '?'} módulos`
      }`;

  const loadCurve = ciOptions.loadCurve;
  const curveConfigured = loadCurve !== null && loadCurve.points.length > 0;
  const curveSummary =
    loadCurve && curveConfigured ? `${loadCurve.points.length} pontos · resolução ${loadCurve.resolutionMinutes} min` : 'Nenhuma curva importada';

  const tariff = ciOptions.tariff;
  const tariffConfigured = tariff !== null;
  const tariffSummary = tariff
    ? `Modalidade ${tariff.tariffModality === 'verde' ? 'Verde' : 'Azul'} · Demanda contratada ${formatKw(tariff.contractedDemandKw)}`
    : 'Tarifa não configurada';

  const strategySummary = `${STRATEGY_LABELS[ciOptions.strategy] ?? ciOptions.strategy} · Ranking ${
    RANKING_LABELS[ciOptions.rankingCriterion] ?? ciOptions.rankingCriterion
  }`;

  const configuredCount = [bessConfigured, curveConfigured, tariffConfigured, true].filter(Boolean).length;
  const selected = calculationResult?.selected ?? null;
  // A `selected` scenario is still materialized (for reference) even when
  // nothing was actually viable to recommend — Fase 6 audit, Problem #5.
  const isRecommendationViable = calculationResult?.recommendation.scenarioId !== null;

  return (
    <div className="space-y-6">
      {isSaved ? (
        <Card className="border-0 ring-0">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <CardIcon icon={ClipboardList} />
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Instalação</h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{formatAddress(projectInfo.address) || 'Dados da instalação'}</p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-xl border p-3">
              <EditableSummaryRow label="Nome do projeto" value={projectInfo.name || 'Não informado'} onClick={() => setProjectInfoEditField('name')} />
              <EditableSummaryRow label="Cliente" value={client?.name || 'Não informado'} onClick={() => setProjectInfoEditField('client')} />
              <EditableSummaryRow
                label="Endereço"
                value={formatAddress(projectInfo.address) || 'Não informado'}
                onClick={() => setProjectInfoEditField('address')}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <ProjectInfoEditor
          projectInfo={projectInfo}
          clients={clients}
          onChange={onUpdateProjectInfo}
          onSave={onSaveProject}
          onCancel={onBackToProjects}
        />
      )}

      <Card className="border-0 ring-0">
        <CardHeader className="flex flex-row items-center gap-3 pb-3">
          <CardIcon icon={SlidersHorizontal} />
          <div>
            <h2 className="text-base font-semibold">Configuração do estudo</h2>
            <p className="text-xs text-muted-foreground">{configuredCount} de 4 configurados</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 pt-0 sm:grid-cols-2">
          <ConfigCard
            icon={BatteryCharging}
            label="Configuração BESS"
            configured={bessConfigured}
            summary={bessSummary}
            onOpen={() => onNavigateToSection('bess')}
          />
          <ConfigCard
            icon={LineChart}
            label="Curva de carga"
            configured={curveConfigured}
            summary={curveSummary}
            onOpen={() => onNavigateToSection('curve')}
          />
          <ConfigCard
            icon={Receipt}
            label="Tarifa"
            configured={tariffConfigured}
            summary={tariffSummary}
            onOpen={() => onNavigateToSection('tariff')}
          />
          <ConfigCard
            icon={SlidersHorizontal}
            label="Estratégia"
            configured
            summary={strategySummary}
            onOpen={() => onNavigateToSection('strategy')}
          />
        </CardContent>
      </Card>

      <Card className="border-0 ring-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <CardIcon icon={BarChart3} />
            <h2 className="text-base font-semibold">Resultado atual</h2>
          </div>
          {selected &&
            (isRecommendationViable ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Calculado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Sem cenário viável
              </span>
            ))}
        </CardHeader>
        <CardContent className="pt-0">
          {selected ? (
            <div className="rounded-xl border bg-background/70 p-3">
              {!isRecommendationViable && (
                <p className="mb-2 text-xs text-amber-700">
                  Nenhum cenário atingiu o critério de viabilidade configurado — exibindo a menor configuração avaliada, não uma recomendação.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Módulos</p>
                  <p className="mt-1 text-sm font-semibold">{selected.moduleCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CAPEX</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(selected.capex)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Economia anual</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrencyBRL(selected.annualSavings)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payback simples</p>
                  <p className="mt-1 text-sm font-semibold">{formatYears(selected.paybackYearsSimple)}</p>
                </div>
              </div>
              <div className="mt-2 text-right">
                <Button
                  variant="ghost"
                  className="px-0 text-primary hover:bg-transparent hover:text-primary/80"
                  onClick={() => onNavigateToSection('results')}
                >
                  Ver resultados completos <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
              <div>
                <p className="font-medium">Resultado ainda não calculado</p>
                <p className="mt-1 text-sm text-muted-foreground">Configure o BESS, a curva de carga e a tarifa para calcular.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => onNavigateToSection('results')}>
                Ir para Resultados
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ProjectInfoModal
        key={projectInfoEditField ?? 'closed'}
        field={projectInfoEditField}
        projectInfo={projectInfo}
        clients={clients}
        onClose={() => setProjectInfoEditField(null)}
        onSave={(partial) => {
          onUpdateProjectInfo(partial);
          onSaveProject();
          setProjectInfoEditField(null);
        }}
      />
    </div>
  );
}
