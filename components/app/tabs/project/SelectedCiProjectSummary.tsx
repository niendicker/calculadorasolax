'use client';

import { BatteryCharging, Gauge, LineChart, MapPin, Receipt, SlidersHorizontal, X, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatAddress } from '@/lib/address';
import { cn } from '@/lib/utils';
import type { Client, SavedCiProject } from '@/lib/types';
import type { CiBessCatalogOption } from '../../types';
import { formatCurrencyBRL, formatKw, formatKwh, formatYears } from '../../helpers';
import { projectStatusLabels } from '../../types';

const statusStyles = {
  draft: 'border-border bg-muted text-muted-foreground',
  sent: 'border-primary/30 bg-primary/10 text-primary',
  accepted: 'border-success/30 bg-success/10 text-success',
  rejected: 'border-destructive/30 bg-destructive/10 text-destructive',
} as const;

const STRATEGY_LABELS: Record<string, string> = {
  BASE: 'Base',
  PEAK_SHAVING: 'Peak Shaving',
  LOAD_SHIFTING: 'Load Shifting',
  HYBRID: 'Híbrido',
};

const RANKING_LABELS: Record<string, string> = { PAYBACK: 'Payback', ROI: 'ROI', NPV: 'NPV' };

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium">{value}</span>
    </div>
  );
}

export function SelectedCiProjectSummary({
  project,
  client,
  ciBessCatalog,
  onClose,
}: {
  project: SavedCiProject;
  client: Client | undefined;
  ciBessCatalog: CiBessCatalogOption[];
  onClose: () => void;
}) {
  const options = project.calculationOptions;
  const selected = project.calculationResult?.selected ?? null;
  const bessProduct = ciBessCatalog.find((product) => product.id === options.bessProductId);
  const loadCurve = options.loadCurve;
  const tariff = options.tariff;
  const sizing = options.sizing;
  const address = formatAddress(project.address);

  return (
    <>
      <div className="-mt-2 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">{project.name}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Fechar resumo do projeto" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="flex items-start gap-1">
          <span className="shrink-0 font-medium text-foreground">Cliente:</span>
          <span className="truncate">{client?.name || 'Não informado'}</span>
        </p>
        {address && (
          <p className="flex items-start gap-1">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{address}</span>
          </p>
        )}
      </div>

      <Badge className={cn('w-fit', statusStyles[project.status])}>{projectStatusLabels[project.status]}</Badge>

      <Separator />

      <div className="space-y-2 rounded-lg border bg-background p-2.5">
        <p className="text-xs font-semibold">Configuração</p>
        <SummaryRow
          label="BESS"
          value={
            bessProduct
              ? `${bessProduct.model} · ${bessProduct.manufacturer}`
              : options.bessProductId
                ? 'Produto selecionado'
                : 'Não configurado'
          }
        />
        <SummaryRow
          label="Módulos"
          value={
            sizing.mode === 'fixed'
              ? String(sizing.moduleCount ?? 'Não definido')
              : `${sizing.minModules ?? '?'}–${sizing.maxModules ?? '?'} (automático)`
          }
        />
        <SummaryRow label="Estratégia" value={STRATEGY_LABELS[options.strategy] ?? options.strategy} />
        <SummaryRow label="Critério" value={RANKING_LABELS[options.rankingCriterion] ?? options.rankingCriterion} />
      </div>

      <div className="space-y-2 rounded-lg border bg-background p-2.5">
        <p className="text-xs font-semibold">Dados de entrada</p>
        <SummaryRow
          label="Curva de carga"
          value={loadCurve ? `${loadCurve.points.length} pontos · ${loadCurve.resolutionMinutes} min` : 'Não configurada'}
        />
        <SummaryRow
          label="Tarifa"
          value={tariff ? `${tariff.tariffModality === 'verde' ? 'Verde' : 'Azul'} · ${formatKw(tariff.contractedDemandKw)}` : 'Não configurada'}
        />
      </div>

      {selected ? (
        <div className="space-y-2 rounded-lg border bg-background p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <BatteryCharging className="h-3.5 w-3.5" />
            Resultado selecionado
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border p-2">
              <p className="flex items-center gap-1 text-[0.7rem] text-muted-foreground"><Zap className="h-3 w-3" />Potência</p>
              <p className="mt-1 text-sm font-medium">{formatKw(selected.totalPowerKw)}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="flex items-center gap-1 text-[0.7rem] text-muted-foreground"><Gauge className="h-3 w-3" />Capacidade</p>
              <p className="mt-1 text-sm font-medium">{formatKwh(selected.totalCapacityKwh)}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="flex items-center gap-1 text-[0.7rem] text-muted-foreground"><LineChart className="h-3 w-3" />Payback</p>
              <p className="mt-1 text-sm font-medium">{formatYears(selected.paybackYearsSimple)}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="flex items-center gap-1 text-[0.7rem] text-muted-foreground"><Receipt className="h-3 w-3" />Economia anual</p>
              <p className="mt-1 text-sm font-medium">{formatCurrencyBRL(selected.annualSavings)}</p>
            </div>
          </div>
          <SummaryRow label="ROI" value={`${selected.roiPercent.toFixed(1).replace('.', ',')}%`} />
          <SummaryRow label="VPL" value={formatCurrencyBRL(selected.npv)} />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Este projeto ainda não tem um resultado calculado.
        </p>
      )}

      <div className="flex items-center gap-1 text-[0.7rem] text-muted-foreground">
        <SlidersHorizontal className="h-3 w-3" />
        Última atualização: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(project.updatedAt))}
      </div>
    </>
  );
}
