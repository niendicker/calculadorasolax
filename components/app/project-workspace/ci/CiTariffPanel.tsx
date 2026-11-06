'use client';

// Fase 6, section 8.1 item 4 ("Tarifas e demanda") — energy/demand rates,
// peak window, modality/market and taxes that feed the tariff/financial
// engine (Fase 4). Entirely store-driven like CiConfigurationPanel's sizing
// half: no local form state, each field change merges into ciOptions.tariff
// through the existing setCiOptions setter, falling back to DEFAULT_TARIFF
// only for what's rendered — nothing is written to the store until the user
// actually edits a field, matching bessProductId's null-until-chosen pattern.

import { AlertTriangle, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface TariffPreset {
  label: string;
  energyRatePeakBrlPerMwh: number;
  energyRateOffPeakBrlPerMwh: number;
  demandRateBrlPerKwMonth: number;
  tariffModality: TariffModality;
}

const TARIFF_PRESETS: TariffPreset[] = [
  {
    label: 'Média Brasil (A4 Verde)',
    energyRatePeakBrlPerMwh: 1250,
    energyRateOffPeakBrlPerMwh: 480,
    demandRateBrlPerKwMonth: 42.5,
    tariffModality: 'verde',
  },
  {
    label: 'CPFL Paulista (A4 Verde)',
    energyRatePeakBrlPerMwh: 1420,
    energyRateOffPeakBrlPerMwh: 510,
    demandRateBrlPerKwMonth: 46.8,
    tariffModality: 'verde',
  },
  {
    label: 'Enel SP (A4 Verde)',
    energyRatePeakBrlPerMwh: 1380,
    energyRateOffPeakBrlPerMwh: 495,
    demandRateBrlPerKwMonth: 44.2,
    tariffModality: 'verde',
  },
  {
    label: 'Cemig (A4 Verde)',
    energyRatePeakBrlPerMwh: 1510,
    energyRateOffPeakBrlPerMwh: 530,
    demandRateBrlPerKwMonth: 48.0,
    tariffModality: 'verde',
  },
];

const PEAK_WINDOW_PRESETS: { label: string; start: string; end: string }[] = [
  { label: '17:30 – 20:30 (Sudeste/Sul)', start: '17:30', end: '20:30' },
  { label: '18:00 – 21:00 (Padrão)', start: '18:00', end: '21:00' },
  { label: '18:30 – 21:30', start: '18:30', end: '21:30' },
  { label: '19:00 – 22:00', start: '19:00', end: '22:00' },
];

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
  onNavigatePrev,
  onNavigateNext,
}: {
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
}) {
  const tariff = ciOptions.tariff ?? DEFAULT_TARIFF;

  function update(partial: Partial<TariffConfig>) {
    onChange({ tariff: { ...tariff, ...partial } });
  }

  function applyPreset(preset: TariffPreset) {
    update({
      energyRatePeakBrlPerMwh: preset.energyRatePeakBrlPerMwh,
      energyRateOffPeakBrlPerMwh: preset.energyRateOffPeakBrlPerMwh,
      demandRateBrlPerKwMonth: preset.demandRateBrlPerKwMonth,
      tariffModality: preset.tariffModality,
    });
  }

  function applyPeakWindow(start: string, end: string) {
    update({ peakStart: start, peakEnd: end });
  }

  const isPeakLowerOrEqual =
    tariff.energyRatePeakBrlPerMwh > 0 &&
    tariff.energyRateOffPeakBrlPerMwh > 0 &&
    tariff.energyRatePeakBrlPerMwh <= tariff.energyRateOffPeakBrlPerMwh;

  return (
    <div className="space-y-6">
      {/* Quick Tariff Presets */}
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3.5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="text-xs font-semibold text-foreground">Preenchimento rápido com tarifas de referência (Grupo A4)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TARIFF_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-md border bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Tarifa de energia</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tariff-peak-mwh" className="text-sm font-medium">
              Ponta (R$/MWh)
            </label>
            <Input
              id="tariff-peak-mwh"
              type="number"
              min={0}
              step="0.01"
              value={tariff.energyRatePeakBrlPerMwh}
              onChange={(event) => update({ energyRatePeakBrlPerMwh: Math.max(0, toNumber(event.target.value)) })}
            />
            {tariff.energyRatePeakBrlPerMwh > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground">
                Equivalente a R$ {(tariff.energyRatePeakBrlPerMwh / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} / kWh
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tariff-offpeak-mwh" className="text-sm font-medium">
              Fora ponta (R$/MWh)
            </label>
            <Input
              id="tariff-offpeak-mwh"
              type="number"
              min={0}
              step="0.01"
              value={tariff.energyRateOffPeakBrlPerMwh}
              onChange={(event) => update({ energyRateOffPeakBrlPerMwh: Math.max(0, toNumber(event.target.value)) })}
            />
            {tariff.energyRateOffPeakBrlPerMwh > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground">
                Equivalente a R$ {(tariff.energyRateOffPeakBrlPerMwh / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} / kWh
              </span>
            )}
          </div>
        </div>

        {isPeakLowerOrEqual && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>A tarifa de ponta normalmente é de 2x a 4x superior à tarifa fora ponta para viabilizar arbitragem tarifária.</span>
          </div>
        )}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Horário de ponta (3 horas consecutivas)</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Atalhos:</span>
            {PEAK_WINDOW_PRESETS.map((p) => (
              <button
                key={p.start}
                type="button"
                onClick={() => applyPeakWindow(p.start, p.end)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  tariff.peakStart === p.start && tariff.peakEnd === p.end
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {p.start}–{p.end}
              </button>
            ))}
          </div>
        </div>
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

      {(onNavigatePrev || onNavigateNext) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {onNavigatePrev ? (
            <Button type="button" variant="outline" onClick={onNavigatePrev} className="gap-1.5 rounded-lg text-xs">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Voltar para Curva de carga
            </Button>
          ) : (
            <div />
          )}

          {onNavigateNext && (
            <Button
              type="button"
              onClick={onNavigateNext}
              className="gap-1.5 rounded-lg text-xs font-semibold"
            >
              Avançar para Estratégia
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
