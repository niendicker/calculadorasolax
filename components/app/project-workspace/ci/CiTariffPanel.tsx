'use client';

// Fase 6, section 8.1 item 4 ("Tarifas e demanda") — energy/demand rates,
// peak window, modality/market and taxes that feed the tariff/financial
// engine (Fase 4). Entirely store-driven like CiConfigurationPanel's sizing
// half: no local form state, each field change merges into ciOptions.tariff
// through the existing setCiOptions setter, falling back to DEFAULT_TARIFF
// only for what's rendered — nothing is written to the store until the user
// actually edits a field, matching bessProductId's null-until-chosen pattern.

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { CommercialIndustrialOptions, TariffConfig, TariffMarket, TariffModality } from '@/supabase/functions/_shared/commercial-industrial/types';

const DEFAULT_TARIFF: TariffConfig = {
  energyRatePeakBrlPerMwh: 0,
  energyRateOffPeakBrlPerMwh: 0,
  demandRateBrlPerKwMonth: 0,
  contractedDemandKw: 0,
  peakStart: '18:00',
  peakEnd: '21:00',
  tariffModality: 'verde',
  market: 'cativo',
  icmsPercent: 0,
  pisCofinsPercent: 0,
};

const modalityOptions: { value: TariffModality; label: string }[] = [
  { value: 'verde', label: 'Verde' },
  { value: 'azul', label: 'Azul' },
];

const marketOptions: { value: TariffMarket; label: string }[] = [
  { value: 'cativo', label: 'Cativo' },
  { value: 'livre', label: 'Livre (ACL)' },
];

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value: string): number {
  return Math.min(100, Math.max(0, toNumber(value)));
}

export function CiTariffPanel({
  ciOptions,
  onChange,
}: {
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
}) {
  const tariff = ciOptions.tariff ?? DEFAULT_TARIFF;

  function update(partial: Partial<TariffConfig>) {
    onChange({ tariff: { ...tariff, ...partial } });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold">Tarifa de energia</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Ponta (R$/MWh)</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={tariff.energyRatePeakBrlPerMwh}
              onChange={(event) => update({ energyRatePeakBrlPerMwh: Math.max(0, toNumber(event.target.value)) })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Fora ponta (R$/MWh)</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={tariff.energyRateOffPeakBrlPerMwh}
              onChange={(event) => update({ energyRateOffPeakBrlPerMwh: Math.max(0, toNumber(event.target.value)) })}
            />
          </label>
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-semibold">Demanda</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Tarifa de demanda (R$/kW-mês)</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={tariff.demandRateBrlPerKwMonth}
              onChange={(event) => update({ demandRateBrlPerKwMonth: Math.max(0, toNumber(event.target.value)) })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Demanda contratada (kW)</span>
            <Input
              type="number"
              min={0}
              step="1"
              value={tariff.contractedDemandKw}
              onChange={(event) => update({ contractedDemandKw: Math.max(0, toNumber(event.target.value)) })}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          A demanda contratada também é o alvo padrão do Peak Shaving quando nenhum outro valor é configurado.
        </p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-semibold">Horário de ponta</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Início</span>
            <Input type="time" value={tariff.peakStart} onChange={(event) => update({ peakStart: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Fim</span>
            <Input type="time" value={tariff.peakEnd} onChange={(event) => update({ peakEnd: event.target.value })} />
          </label>
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-semibold">Modalidade e mercado</p>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Modalidade tarifária</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:w-fit">
              {modalityOptions.map((option) => {
                const active = tariff.tariffModality === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update({ tariffModality: option.value })}
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
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Mercado</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:w-fit">
              {marketOptions.map((option) => {
                const active = tariff.market === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update({ market: option.value })}
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
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-semibold">Impostos</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>ICMS (%)</span>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={tariff.icmsPercent}
              onChange={(event) => update({ icmsPercent: clampPercent(event.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>PIS/COFINS (%)</span>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={tariff.pisCofinsPercent}
              onChange={(event) => update({ pisCofinsPercent: clampPercent(event.target.value) })}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
