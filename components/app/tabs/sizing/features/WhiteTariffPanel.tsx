'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Battery, BatteryCharging, Check, Clock, Moon, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DesiredFeatureId, WhiteTariffConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { TARIFF_BUSINESS_DAYS_PER_MONTH, calculateTariffSavings, isWhiteTariffConfigIncomplete } from '../../../helpers';

export const emptyWhiteTariffConfig: WhiteTariffConfig = {
  inputMode: 'basic',
  totalMonthlyConsumptionKwh: 0,
  pontaConsumptionPercent: 20,
  intermediateConsumptionPercent: 10,
  businessDaysPerMonth: 22,
  pontaWindowHours: 3,
  intermediateWindowHours: 2,
  requiredPowerW: 0,
  pontaEnergyWh: 0,
  intermediateEnergyWh: 0,
  includeBackupReserve: false,
  pontaTariffPerKwh: 0,
  intermediateTariffPerKwh: 0,
  foraPontaTariffPerKwh: 0,
};

/** Tarifa Branca's energy fields (ponta, intermediária) take kWh/mês from the
 * user but the stored value is Wh/dia (see TARIFF_BUSINESS_DAYS_PER_MONTH) —
 * dividing by 22 doesn't round-trip to a clean number, so a naive
 * `value={computed}` would reformat what's on screen (e.g. "100" becoming
 * "99.99") on every keystroke. Buffers the raw text locally instead, only
 * resyncing from `energyWh` when it changes for a reason other than this
 * field's own last edit (project load, feature reset, etc). */
function WhiteTariffEnergyField({
  id,
  section,
  energyWh,
  onChange,
  businessDays,
  disabled = false,
}: {
  id: string;
  section: string;
  energyWh: number;
  onChange: (energyWh: number) => void;
  businessDays: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => energyWh ? String(Math.round(((energyWh * businessDays) / 1000) * 100) / 100) : '');
  const lastEmittedRef = useRef(energyWh);

  useEffect(() => {
    if (energyWh !== lastEmittedRef.current) {
      lastEmittedRef.current = energyWh;
      setText(energyWh ? String(Math.round(((energyWh * businessDays) / 1000) * 100) / 100) : '');
    }
  }, [energyWh, businessDays]);

  return (
    <>
      <Label htmlFor={id}>
        <span className="sr-only">{section} · </span>Energia (kWh/mês)
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={0.01}
        placeholder="Ex.: 110"
        value={text}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          const wh = Math.round(((Number(raw) || 0) * 1000) / businessDays);
          lastEmittedRef.current = wh;
          onChange(wh);
        }}
      />
      {energyWh ? <p className="text-xs text-muted-foreground">{(energyWh / 1000).toFixed(2)} kWh/dia</p> : null}
    </>
  );
}

export function WhiteTariffPanel({
  value,
  dailyKwh,
  whiteTariff,
  onWhiteTariffChange,
}: {
  value: DesiredFeatureId[];
  dailyKwh: number;
  whiteTariff: WhiteTariffConfig | null;
  onWhiteTariffChange: (whiteTariff: WhiteTariffConfig | null) => void;
}) {
  const backupDailyKwh = value.includes('backup') ? dailyKwh : 0;
  const whiteBusinessDays = whiteTariff?.businessDaysPerMonth ?? TARIFF_BUSINESS_DAYS_PER_MONTH;
  const whiteInputMode = whiteTariff?.inputMode ?? 'advanced';
  const whiteTotalMonthlyKwh = whiteTariff?.totalMonthlyConsumptionKwh ?? 0;
  const whiteExpensiveMonthlyKwh = whiteTariff
    ? ((whiteTariff.pontaEnergyWh + whiteTariff.intermediateEnergyWh) / 1000) * whiteBusinessDays
    : 0;
  const whiteOffPeakMonthlyKwh = Math.max(0, whiteTotalMonthlyKwh - whiteExpensiveMonthlyKwh);
  const whiteShiftPercent = whiteTotalMonthlyKwh > 0
    ? Math.min(100, (whiteExpensiveMonthlyKwh / whiteTotalMonthlyKwh) * 100)
    : 0;
  const preliminaryStorageKwh = whiteTariff
    ? (whiteTariff.pontaEnergyWh + whiteTariff.intermediateEnergyWh) / 1000 / 0.9
    : 0;
  const preliminaryTariffSavings = calculateTariffSavings(whiteTariff ?? null, {
    totalMonthlyConsumptionKwh: whiteTotalMonthlyKwh || null,
  });

  function updateBasicWhiteTariff(patch: Partial<WhiteTariffConfig>) {
    const next = { ...(whiteTariff ?? emptyWhiteTariffConfig), ...patch };
    const days = next.businessDaysPerMonth ?? TARIFF_BUSINESS_DAYS_PER_MONTH;
    const total = next.totalMonthlyConsumptionKwh ?? 0;
    const pontaMonthly = total * ((next.pontaConsumptionPercent ?? 20) / 100);
    const intermediateMonthly = total * ((next.intermediateConsumptionPercent ?? 10) / 100);
    next.pontaEnergyWh = Math.round((pontaMonthly * 1000) / days);
    next.intermediateEnergyWh = Math.round((intermediateMonthly * 1000) / days);
    next.requiredPowerW = Math.round(Math.max(
      (next.pontaEnergyWh / (next.pontaWindowHours ?? 3)),
      (next.intermediateEnergyWh / (next.intermediateWindowHours ?? 2))
    ));
    onWhiteTariffChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1" role="tablist" aria-label="Modo de preenchimento da Tarifa Branca">
        {(['basic', 'advanced'] as const).map((mode) => (
          <button key={mode} type="button" role="tab" aria-selected={whiteInputMode === mode}
            onClick={() => onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), inputMode: mode })}
            className={cn('rounded-md px-3 py-2 text-sm font-medium', whiteInputMode === mode ? 'bg-background shadow-sm ring-1 ring-border/70' : 'text-muted-foreground')}>
            {mode === 'basic' ? 'Básico' : 'Avançado'}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {whiteInputMode === 'basic'
          ? 'Informe os dados da fatura; o sistema estima a energia e a potência necessárias.'
          : 'Informe diretamente a potência e a energia consumida em cada período tarifário.'}
      </p>
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-sm font-semibold">1. Consumo</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="whiteTariffTotalConsumption">Consumo total mensal (kWh/mês)</Label>
            <Input id="whiteTariffTotalConsumption" type="number" min={0} step={0.01} placeholder="Ex.: 450"
              value={whiteTotalMonthlyKwh || ''}
              onChange={(event) => {
                const totalMonthlyConsumptionKwh = Number(event.target.value) || 0;
                if (whiteInputMode === 'basic') updateBasicWhiteTariff({ totalMonthlyConsumptionKwh });
                else onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), totalMonthlyConsumptionKwh });
              }}/>
            <p className="text-xs text-muted-foreground">Use o consumo total exibido na fatura, sem depender da configuração Fotovoltaico.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whiteTariffPower">Potência máxima nos horários caros (kW)</Label>
            <Input id="whiteTariffPower" type="number" min={0} step={0.01} placeholder="Ex.: 3,0"
              disabled={whiteInputMode === 'basic'}
              value={whiteTariff?.requiredPowerW ? whiteTariff.requiredPowerW / 1000 : ''}
              onChange={(event) => onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), requiredPowerW: (Number(event.target.value) || 0) * 1000 })}/>
            <p className="text-xs text-muted-foreground">Maior potência simultânea que a bateria deverá atender na ponta ou intermediária.</p>
          </div>
        </div>
        {whiteInputMode === 'basic' && <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="whitePontaPercent">Consumo na ponta (%)</Label><Input id="whitePontaPercent" type="number" min={0} max={100} value={whiteTariff?.pontaConsumptionPercent ?? 20} onChange={(event) => updateBasicWhiteTariff({ pontaConsumptionPercent: Number(event.target.value) || 0 })}/></div>
          <div className="space-y-1.5"><Label htmlFor="whiteIntermediatePercent">Consumo intermediário (%)</Label><Input id="whiteIntermediatePercent" type="number" min={0} max={100} value={whiteTariff?.intermediateConsumptionPercent ?? 10} onChange={(event) => updateBasicWhiteTariff({ intermediateConsumptionPercent: Number(event.target.value) || 0 })}/></div>
        </div>}
      </div>
      <div className="space-y-1.5">
        <button
          type="button"
          role="switch"
          aria-checked={whiteTariff?.includeBackupReserve ?? false}
          aria-label="Reservar para backup das cargas"
          onClick={() =>
            onWhiteTariffChange({
              ...(whiteTariff ?? emptyWhiteTariffConfig),
              includeBackupReserve: !(whiteTariff?.includeBackupReserve ?? false),
            })
          }
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
            whiteTariff?.includeBackupReserve
              ? 'border-primary/40 bg-primary/5'
              : 'border-border bg-background hover:bg-muted/40'
          )}
        >
          <span className="flex items-center gap-2">
            {whiteTariff?.includeBackupReserve ? (
              <BatteryCharging className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Battery className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="font-medium">Reservar para backup das cargas</span>
          </span>
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              whiteTariff?.includeBackupReserve
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {whiteTariff?.includeBackupReserve && <Check className="h-3 w-3" />}
            {whiteTariff?.includeBackupReserve ? 'Ativado' : 'Desativado'}
          </span>
        </button>
        {whiteTariff?.includeBackupReserve && (
          <p className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
            {backupDailyKwh > 0
              ? `+${backupDailyKwh.toFixed(1)} kWh/dia somados à energia exigida pela tarifa branca.`
              : 'Soma a energia das cargas de backup à energia exigida pela tarifa branca.'}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">2. Distribuição e tarifas</p>
        <div className="rounded-lg border bg-background p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-destructive" />
            Ponta
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <WhiteTariffEnergyField
                id="whiteTariffPontaEnergy"
                section="Ponta"
                businessDays={whiteBusinessDays}
                disabled={whiteInputMode === 'basic'}
                energyWh={whiteTariff?.pontaEnergyWh ?? 0}
                onChange={(pontaEnergyWh) =>
                  onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), pontaEnergyWh })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whiteTariffPonta">
                <span className="sr-only">Ponta · </span>Tarifa (R$/kWh)
              </Label>
              <Input
                id="whiteTariffPonta"
                type="number"
                min={0}
                step={0.01}
                placeholder="Ex.: 1.20"
                value={whiteTariff?.pontaTariffPerKwh ?? ''}
                onChange={(event) =>
                  onWhiteTariffChange({
                    ...(whiteTariff ?? emptyWhiteTariffConfig),
                    pontaTariffPerKwh: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          {Boolean(whiteTariff?.pontaTariffPerKwh || whiteTariff?.foraPontaTariffPerKwh) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Diferença para fora ponta: R${' '}
              {((whiteTariff?.pontaTariffPerKwh ?? 0) - (whiteTariff?.foraPontaTariffPerKwh ?? 0)).toFixed(2)}/kWh
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-background p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-primary" />
            Intermediária
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <WhiteTariffEnergyField
                id="whiteTariffIntermediateEnergy"
                section="Intermediária"
                businessDays={whiteBusinessDays}
                disabled={whiteInputMode === 'basic'}
                energyWh={whiteTariff?.intermediateEnergyWh ?? 0}
                onChange={(intermediateEnergyWh) =>
                  onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), intermediateEnergyWh })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whiteTariffIntermediate">
                <span className="sr-only">Intermediária · </span>Tarifa (R$/kWh)
              </Label>
              <Input
                id="whiteTariffIntermediate"
                type="number"
                min={0}
                step={0.01}
                placeholder="Ex.: 0.95"
                value={whiteTariff?.intermediateTariffPerKwh ?? ''}
                onChange={(event) =>
                  onWhiteTariffChange({
                    ...(whiteTariff ?? emptyWhiteTariffConfig),
                    intermediateTariffPerKwh: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          {Boolean(whiteTariff?.intermediateTariffPerKwh || whiteTariff?.foraPontaTariffPerKwh) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Diferença para fora ponta: R${' '}
              {((whiteTariff?.intermediateTariffPerKwh ?? 0) - (whiteTariff?.foraPontaTariffPerKwh ?? 0)).toFixed(2)}/kWh
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-background p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Moon className="h-3.5 w-3.5 text-accent" />
            Fora ponta
          </p>
          <div className="mt-2 space-y-1.5 sm:max-w-[calc(50%-0.375rem)]">
            <Label htmlFor="whiteTariffForaPonta">
              <span className="sr-only">Fora ponta · </span>Tarifa (R$/kWh)
            </Label>
            <Input
              id="whiteTariffForaPonta"
              type="number"
              min={0}
              step={0.01}
              placeholder="Ex.: 0.75"
              value={whiteTariff?.foraPontaTariffPerKwh ?? ''}
              onChange={(event) =>
                onWhiteTariffChange({
                  ...(whiteTariff ?? emptyWhiteTariffConfig),
                  foraPontaTariffPerKwh: Number(event.target.value) || 0,
                })
              }
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A energia fora ponta é calculada automaticamente: consumo total (Fotovoltaico) menos ponta e intermediária.
          </p>
        </div>
        {whiteTariff &&
          (whiteTariff.pontaTariffPerKwh < whiteTariff.foraPontaTariffPerKwh ||
            whiteTariff.intermediateTariffPerKwh < whiteTariff.foraPontaTariffPerKwh) && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Para estimar economia, as tarifas de ponta e intermediária devem ser maiores ou iguais à tarifa fora de ponta.
            </p>
          )}
        {isWhiteTariffConfigIncomplete(value, whiteTariff) && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Complete consumo mensal, potência, energia dos períodos e as três tarifas. A energia de ponta e intermediária não pode superar o consumo total.
          </p>
        )}
        {whiteTariff && <div className="rounded-lg border bg-primary/[0.03] p-3">
          <p className="text-sm font-semibold">Resumo instantâneo</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Energia deslocada</p><strong>{whiteExpensiveMonthlyKwh.toFixed(1)} kWh/mês</strong></div>
            <div><p className="text-xs text-muted-foreground">Fora de ponta</p><strong>{whiteTotalMonthlyKwh > 0 ? `${whiteOffPeakMonthlyKwh.toFixed(1)} kWh/mês` : 'Informe o consumo'}</strong></div>
            <div><p className="text-xs text-muted-foreground">Potência mínima</p><strong>{(whiteTariff.requiredPowerW / 1000).toFixed(2)} kW</strong></div>
            <div><p className="text-xs text-muted-foreground">Armazenamento preliminar</p><strong>{preliminaryStorageKwh.toFixed(2)} kWh</strong></div>
            <div><p className="text-xs text-muted-foreground">Consumo deslocado</p><strong>{whiteTotalMonthlyKwh > 0 ? `${whiteShiftPercent.toFixed(1)}%` : '—'}</strong></div>
            <div><p className="text-xs text-muted-foreground">Economia preliminar</p><strong>{preliminaryTariffSavings ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preliminaryTariffSavings.monthlySavings) + '/mês' : 'Preencha as tarifas'}</strong></div>
          </div>
          {preliminaryTariffSavings && <p className={cn('mt-3 text-xs font-medium', preliminaryTariffSavings.monthlySavings > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}>
            {preliminaryTariffSavings.monthlySavings > 0
              ? 'A arbitragem é economicamente favorável com as premissas preliminares.'
              : 'A diferença tarifária não compensa as perdas e o consumo do sistema.'}
          </p>}
          <p className="mt-3 text-xs text-muted-foreground">A estimativa final usa a capacidade, RTE, SOH, limites de potência e consumo em espera dos produtos selecionados.</p>
        </div>}
        <details className="rounded-lg border bg-background p-3 text-sm">
          <summary className="cursor-pointer font-medium">Premissas do cálculo</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="whiteBusinessDays">Dias úteis/mês</Label><Input id="whiteBusinessDays" type="number" min={1} max={31} value={whiteBusinessDays} onChange={(event) => whiteInputMode === 'basic' ? updateBasicWhiteTariff({ businessDaysPerMonth: Number(event.target.value) || 22 }) : onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), businessDaysPerMonth: Number(event.target.value) || 22 })}/></div>
            <div className="space-y-1.5"><Label htmlFor="whitePontaHours">Janela de ponta (h)</Label><Input id="whitePontaHours" type="number" min={0.25} max={24} step={0.25} value={whiteTariff?.pontaWindowHours ?? 3} onChange={(event) => whiteInputMode === 'basic' ? updateBasicWhiteTariff({ pontaWindowHours: Number(event.target.value) || 3 }) : onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), pontaWindowHours: Number(event.target.value) || 3 })}/></div>
            <div className="space-y-1.5"><Label htmlFor="whiteIntermediateHours">Janela intermediária (h)</Label><Input id="whiteIntermediateHours" type="number" min={0.25} max={24} step={0.25} value={whiteTariff?.intermediateWindowHours ?? 2} onChange={(event) => whiteInputMode === 'basic' ? updateBasicWhiteTariff({ intermediateWindowHours: Number(event.target.value) || 2 }) : onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), intermediateWindowHours: Number(event.target.value) || 2 })}/></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Por padrão são usados 22 dias úteis, 3 horas de ponta e 2 horas intermediárias. Ajuste conforme a distribuidora e o calendário local.</p>
        </details>
      </div>
    </div>
  );
}
