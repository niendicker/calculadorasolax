'use client';

// Fase 6, section 8.1 item 5 ("Estratégia") — dispatch strategy, ranking
// criterion and the financial assumptions that feed the comparison/ranking
// engine (Fase 5). strategy/rankingCriterion/financialAssumptions are all
// non-nullable in CommercialIndustrialOptions (unlike tariff/loadCurve), so
// unlike CiTariffPanel this reads ciOptions directly with no DEFAULT_*
// fallback — there's always a concrete value to show.

import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type {
  BessStrategyId,
  CommercialIndustrialOptions,
  FinancialAssumptions,
  RankingCriterion,
} from '@/supabase/functions/_shared/commercial-industrial/types';

// 'BASE' is deliberately excluded — scenarios.ts always computes the
// baseline with strategy: 'BASE' internally regardless of what the user
// picks here (see computeBaseline), so it's never a meaningful end-user
// choice, only the three real dispatch strategies (plan section 3.1 MVP).
const strategyOptions: { value: BessStrategyId; label: string; description: string }[] = [
  {
    value: 'PEAK_SHAVING',
    label: 'Peak Shaving',
    description:
      'Reduz potência acima do target de demanda e carrega somente fora da ponta. Durante a carga, a potência do BESS é ajustada dinamicamente para que a potência importada não ultrapasse a demanda contratada.',
  },
  {
    value: 'LOAD_SHIFTING',
    label: 'Load Shifting',
    description:
      'Carrega fora da ponta e descarrega durante a ponta acompanhando dinamicamente o consumo até os limites de potência, energia e SOC. Durante a carga, a potência é ajustada para respeitar a demanda contratada.',
  },
  {
    value: 'HYBRID',
    label: 'Híbrido',
    description:
      'Reserva dinamicamente a energia necessária para a próxima janela de ponta e utiliza somente a energia excedente para Peak Shaving. Durante a ponta, combina Load Shifting e redução de demanda. A carga do BESS é modulada dinamicamente para respeitar a demanda contratada.',
  },
];

const rankingOptions: { value: RankingCriterion; label: string }[] = [
  { value: 'PAYBACK', label: 'Payback' },
  { value: 'ROI', label: 'ROI' },
  { value: 'NPV', label: 'NPV' },
];

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function CiStrategyPanel({
  ciOptions,
  onChange,
}: {
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
}) {
  function updateFinancialAssumptions(partial: Partial<FinancialAssumptions>) {
    onChange({ financialAssumptions: { ...ciOptions.financialAssumptions, ...partial } });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold">Estratégia de despacho</p>
        <div className="grid gap-3 lg:grid-cols-3">
          {strategyOptions.map((option) => {
            const selected = ciOptions.strategy === option.value;
            return (
              <div
                key={option.value}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => onChange({ strategy: option.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onChange({ strategy: option.value });
                  }
                }}
                className={cn(
                  'relative cursor-pointer rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  selected
                    ? 'border-primary bg-primary/[0.06] shadow-sm ring-1 ring-primary/20'
                    : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                {selected && (
                  <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                )}
                <p className="pr-6 text-sm font-semibold">{option.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-semibold">Critério de ranking</p>
        <p className="text-xs text-muted-foreground">Métrica usada para recomendar a melhor quantidade de módulos.</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:w-fit">
          {rankingOptions.map((option) => {
            const active = ciOptions.rankingCriterion === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ rankingCriterion: option.value })}
                className={cn(
                  'flex h-8 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition',
                  active
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-semibold">Premissas financeiras</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Taxa de desconto (%/ano)</span>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={ciOptions.financialAssumptions.discountRatePercent}
              onChange={(event) =>
                updateFinancialAssumptions({ discountRatePercent: Math.min(100, Math.max(0, toNumber(event.target.value))) })
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Horizonte de análise (anos)</span>
            <Input
              type="number"
              min={1}
              max={30}
              step="1"
              value={ciOptions.financialAssumptions.analysisHorizonYears}
              onChange={(event) =>
                updateFinancialAssumptions({ analysisHorizonYears: Math.min(30, Math.max(1, Math.round(toNumber(event.target.value, 1)))) })
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Inflação energética anual (%)</span>
            <Input
              type="number"
              step="0.1"
              value={ciOptions.financialAssumptions.annualEnergyInflationPercent}
              onChange={(event) => updateFinancialAssumptions({ annualEnergyInflationPercent: toNumber(event.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Meses faturados por ano</span>
            <Input
              type="number"
              min={1}
              max={12}
              step="1"
              value={ciOptions.financialAssumptions.monthsPerYear}
              onChange={(event) =>
                updateFinancialAssumptions({ monthsPerYear: Math.min(12, Math.max(1, Math.round(toNumber(event.target.value, 12)))) })
              }
            />
          </label>
        </div>
      </div>
    </div>
  );
}
