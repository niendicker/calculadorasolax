'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { AlertTriangle, CalendarDays, Clock3, Zap, RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InfoLabel } from '@/components/ui/tooltip';
import type { DesiredFeatureId, PvConfig, WhiteTariffConfig } from '@/lib/types';
import type { EnergyTariffResult } from '@/lib/tariff/aneel-service';
import { cn } from '@/lib/utils';
import {
  TARIFF_BUSINESS_DAYS_PER_MONTH,
  WHITE_TARIFF_DISPLAY_EFFICIENCY_PERCENT,
  calculateTariffSavings,
  isWhiteTariffConfigIncomplete,
} from '../../../helpers';
import { AutomaticTariffPanel } from './AutomaticTariffPanel';

export const emptyWhiteTariffConfig: WhiteTariffConfig = {
  inputMode: 'advanced',
  totalMonthlyConsumptionKwh: 0,
  pontaConsumptionPercent: 20,
  intermediateConsumptionPercent: 10,
  businessDaysPerMonth: 22,
  pontaWindowHours: 2.5,
  intermediateWindowHours: 0.5,
  requiredPowerW: 0,
  pontaEnergyWh: 0,
  intermediateEnergyWh: 0,
  pontaTariffPerKwh: 0,
  intermediateTariffPerKwh: 0,
  foraPontaTariffPerKwh: 0,
};

type WhiteTariffField =
  | 'totalMonthlyConsumptionKwh'
  | 'requiredPowerW'
  | 'pontaConsumptionPercent'
  | 'intermediateConsumptionPercent'
  | 'pontaTariffPerKwh'
  | 'intermediateTariffPerKwh'
  | 'foraPontaTariffPerKwh';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

function clampPercent(value: number, max = 100) {
  return Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
}

function monthlyKwhToDailyWh(monthlyKwh: number, businessDays: number) {
  return businessDays > 0 ? Math.round((monthlyKwh * 1000) / businessDays) : 0;
}

function DistributionValueCard({ label, dailyKwh, tone, automatic = false, tariff }: {
  label: string;
  dailyKwh: number;
  tone: 'red' | 'yellow' | 'green';
  automatic?: boolean;
  tariff: {
    id: string;
    value: number;
    error?: string;
    manuallyEdited: boolean;
    onChange: (value: number) => void;
    onBlur: () => void;
  };
}) {
  const toneClasses = {
    red: 'border-red-200/70 border-l-4 border-l-red-500 bg-background dark:border-red-400/20 dark:border-l-red-400',
    yellow: 'border-yellow-200/70 border-l-4 border-l-yellow-500 bg-background dark:border-yellow-400/20 dark:border-l-yellow-400',
    green: 'border-emerald-200/70 border-l-4 border-l-emerald-500 bg-background dark:border-emerald-400/20 dark:border-l-emerald-400',
  };
  const iconClasses = {
    red: 'text-red-500 dark:text-red-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    green: 'text-emerald-500 dark:text-emerald-400',
  };

  return (
    <div className={cn('rounded-lg border p-3', toneClasses[tone])}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock3 className={cn('h-3.5 w-3.5 shrink-0', iconClasses[tone])} aria-hidden="true" />
            {label}
          </p>
          <p className="text-base font-semibold tabular-nums text-foreground">{dailyKwh.toFixed(2)} kWh/dia</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {automatic && <span className="rounded-md border border-emerald-200 bg-emerald-100/80 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-500/15 dark:text-emerald-300">Automático</span>}
          {tariff.manuallyEdited && <span className="rounded-md border border-amber-200 bg-amber-100/80 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-300/20 dark:bg-amber-500/15 dark:text-amber-200">Alterado manualmente</span>}
        </div>
      </div>
      <TariffInput {...tariff} label={label} embedded />
    </div>
  );
}

function CalculationPremiseCard({ id, label, tone, Icon, children }: { id: string; label: string; tone: 'red' | 'yellow' | 'neutral'; Icon: LucideIcon; children: React.ReactNode }) {
  const toneClasses = {
    red: 'border-red-200/70 border-l-4 border-l-red-500 bg-background dark:border-red-400/20 dark:border-l-red-400',
    yellow: 'border-yellow-200/70 border-l-4 border-l-yellow-500 bg-background dark:border-yellow-400/20 dark:border-l-yellow-400',
    neutral: 'border-border/70 bg-background/70',
  };
  const iconClasses = {
    red: 'text-red-500 dark:text-red-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    neutral: 'text-primary',
  };

  return (
    <div className={cn('rounded-lg border p-3', toneClasses[tone])}>
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClasses[tone])} aria-hidden="true" />
        {label}
      </Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function DistributionTooltip({ percent, position, tone }: { percent: number; position: number; tone: 'red' | 'yellow' }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-full mb-3 -translate-x-1/2 whitespace-nowrap rounded-lg border bg-card px-3 py-2 text-sm font-semibold tabular-nums shadow-sm',
        tone === 'red' ? 'border-red-200 text-red-600 dark:border-red-400/30 dark:text-red-300' : 'border-yellow-200 text-yellow-700 dark:border-yellow-400/30 dark:text-yellow-300'
      )}
      style={{ left: `${position}%` }}
    >
      {percent}%
      <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-inherit bg-card" />
    </div>
  );
}

function EnergyDistributionControl({
  pontaPercent,
  intermediatePercent,
  businessDays,
  pontaMonthlyKwh,
  intermediateMonthlyKwh,
  offPeakMonthlyKwh,
  pontaTariff,
  intermediateTariff,
  offPeakTariff,
  pontaError,
  intermediateError,
  pontaTariffError,
  intermediateTariffError,
  offPeakTariffError,
  pontaTariffManuallyEdited,
  intermediateTariffManuallyEdited,
  offPeakTariffManuallyEdited,
  onPontaChange,
  onIntermediateChange,
  onPontaTariffChange,
  onIntermediateTariffChange,
  onOffPeakTariffChange,
  onPontaBlur,
  onIntermediateBlur,
  onPontaTariffBlur,
  onIntermediateTariffBlur,
  onOffPeakTariffBlur,
}: {
  pontaPercent: number;
  intermediatePercent: number;
  businessDays: number;
  pontaMonthlyKwh: number;
  intermediateMonthlyKwh: number;
  offPeakMonthlyKwh: number;
  pontaTariff: number;
  intermediateTariff: number;
  offPeakTariff: number;
  pontaError?: string;
  intermediateError?: string;
  pontaTariffError?: string;
  intermediateTariffError?: string;
  offPeakTariffError?: string;
  pontaTariffManuallyEdited: boolean;
  intermediateTariffManuallyEdited: boolean;
  offPeakTariffManuallyEdited: boolean;
  onPontaChange: (percent: number) => void;
  onIntermediateChange: (percent: number) => void;
  onPontaTariffChange: (tariff: number) => void;
  onIntermediateTariffChange: (tariff: number) => void;
  onOffPeakTariffChange: (tariff: number) => void;
  onPontaBlur: () => void;
  onIntermediateBlur: () => void;
  onPontaTariffBlur: () => void;
  onIntermediateTariffBlur: () => void;
  onOffPeakTariffBlur: () => void;
}) {
  const intermediateStart = pontaPercent;
  const intermediateEnd = pontaPercent + intermediatePercent;
  const gradient = `linear-gradient(to right, #ef4444 0%, #ef4444 ${intermediateStart}%, #eab308 ${intermediateStart}%, #eab308 ${intermediateEnd}%, #22c55e ${intermediateEnd}%, #22c55e 100%)`;
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingHandle, setDraggingHandle] = useState<'ponta' | 'intermediate' | null>(null);
  const sliderClass = 'pointer-events-none absolute top-0 h-6 appearance-none bg-transparent outline-none focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-slider-runnable-track]:h-6 [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:h-6 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:h-0 [&::-webkit-slider-thumb]:w-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-none [&::-moz-range-thumb]:h-0 [&::-moz-range-thumb]:w-0 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-none';

  function percentFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return clampPercent(((clientX - rect.left) / rect.width) * 100);
  }

  function updateHandleFromClientX(handle: 'ponta' | 'intermediate', clientX: number) {
    const percent = percentFromClientX(clientX);
    if (handle === 'ponta') {
      onPontaChange(Math.round(clampPercent(percent, 100 - intermediatePercent)));
    } else {
      onIntermediateChange(Math.round(clampPercent(percent - pontaPercent, 100 - pontaPercent)));
    }
  }

  function handleTrackPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const percent = percentFromClientX(event.clientX);
    const handle = Math.abs(percent - intermediateStart) <= Math.abs(percent - intermediateEnd) ? 'ponta' : 'intermediate';
    setDraggingHandle(handle);
    updateHandleFromClientX(handle, event.clientX);
  }

  useEffect(() => {
    if (!draggingHandle) return;

    function updateFromPointer(clientX: number) {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const percent = clampPercent(((clientX - rect.left) / rect.width) * 100);
      if (draggingHandle === 'ponta') {
        onPontaChange(Math.round(clampPercent(percent, 100 - intermediatePercent)));
      } else {
        onIntermediateChange(Math.round(clampPercent(percent - pontaPercent, 100 - pontaPercent)));
      }
    }

    function handlePointerMove(event: PointerEvent) {
      updateFromPointer(event.clientX);
    }

    function handlePointerUp() {
      setDraggingHandle(null);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingHandle, intermediatePercent, onIntermediateChange, onPontaChange, pontaPercent]);

  return (
    <div className="mt-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <DistributionValueCard
          label="Ponta"
          dailyKwh={businessDays > 0 ? pontaMonthlyKwh / businessDays : 0}
          tone="red"
          tariff={{ id: 'whiteTariffPonta', value: pontaTariff, error: pontaTariffError, manuallyEdited: pontaTariffManuallyEdited, onChange: onPontaTariffChange, onBlur: onPontaTariffBlur }}
        />
        <DistributionValueCard
          label="Intermediária"
          dailyKwh={businessDays > 0 ? intermediateMonthlyKwh / businessDays : 0}
          tone="yellow"
          tariff={{ id: 'whiteTariffIntermediate', value: intermediateTariff, error: intermediateTariffError, manuallyEdited: intermediateTariffManuallyEdited, onChange: onIntermediateTariffChange, onBlur: onIntermediateTariffBlur }}
        />
        <DistributionValueCard
          label="Fora ponta"
          dailyKwh={businessDays > 0 ? offPeakMonthlyKwh / businessDays : 0}
          tone="green"
          automatic
          tariff={{ id: 'whiteTariffForaPonta', value: offPeakTariff, error: offPeakTariffError, manuallyEdited: offPeakTariffManuallyEdited, onChange: onOffPeakTariffChange, onBlur: onOffPeakTariffBlur }}
        />
      </div>
      <div className="relative mt-20 px-1">
        <DistributionTooltip percent={pontaPercent} position={intermediateStart} tone="red" />
        <DistributionTooltip percent={intermediatePercent} position={intermediateEnd} tone="yellow" />
        <div ref={trackRef} className="relative h-6 touch-none" onPointerDown={handleTrackPointerDown}>
          <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full border-2 border-background shadow-sm ring-1 ring-border/60" style={{ background: gradient }} />
          <input
            id="whiteTariffPontaPercent"
            type="range"
            min={0}
            max={100 - intermediatePercent}
            step={1}
            value={pontaPercent}
            aria-label="Ponta · percentual do consumo"
            aria-invalid={Boolean(pontaError)}
            aria-describedby={pontaError ? 'whiteTariffPontaPercent-error' : undefined}
            onChange={(event) => onPontaChange(clampPercent(Number(event.target.value), 100 - intermediatePercent))}
            onBlur={onPontaBlur}
            style={{ left: 0, width: `${Math.max(100 - intermediatePercent, 1)}%` }}
            className={cn(sliderClass, 'left-0 [&::-webkit-slider-thumb]:bg-red-500 [&::-moz-range-thumb]:bg-red-500')}
          />
          <span
            className="absolute top-1/2 z-30 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full border-8 border-white bg-red-500 shadow-md ring-1 ring-border/40 active:cursor-grabbing"
            style={{ left: `${intermediateStart}%` }}
            aria-hidden="true"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDraggingHandle('ponta');
            }}
          />
          <input
            type="number"
            min={0}
            max={100 - intermediatePercent}
            step={1}
            value={pontaPercent}
            aria-label="Ponta (%)"
            aria-invalid={Boolean(pontaError)}
            aria-describedby={pontaError ? 'whiteTariffPontaPercent-error' : undefined}
            onChange={(event) => onPontaChange(clampPercent(Number(event.target.value), 100 - intermediatePercent))}
            onBlur={onPontaBlur}
            className="sr-only"
          />
          <input
            id="whiteTariffIntermediatePercent"
            type="range"
            min={0}
            max={100 - pontaPercent}
            step={1}
            value={intermediatePercent}
            aria-label="Intermediária · percentual do consumo"
            aria-valuetext={`${intermediatePercent}% do consumo`}
            aria-invalid={Boolean(intermediateError)}
            aria-describedby={intermediateError ? 'whiteTariffIntermediatePercent-error' : undefined}
            onChange={(event) => onIntermediateChange(clampPercent(Number(event.target.value), 100 - pontaPercent))}
            onBlur={onIntermediateBlur}
            style={{ left: `${pontaPercent}%`, width: `${Math.max(100 - pontaPercent, 1)}%` }}
            className={cn(sliderClass, '[&::-webkit-slider-thumb]:bg-yellow-500 [&::-moz-range-thumb]:bg-yellow-500')}
          />
          <span
            className="absolute top-1/2 z-30 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full border-8 border-white bg-yellow-500 shadow-md ring-1 ring-border/40 active:cursor-grabbing"
            style={{ left: `${intermediateEnd}%` }}
            aria-hidden="true"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDraggingHandle('intermediate');
            }}
          />
          <input
            type="number"
            min={0}
            max={100 - pontaPercent}
            step={1}
            value={intermediatePercent}
            aria-label="Intermediária (%)"
            aria-invalid={Boolean(intermediateError)}
            aria-describedby={intermediateError ? 'whiteTariffIntermediatePercent-error' : undefined}
            onChange={(event) => onIntermediateChange(clampPercent(Number(event.target.value), 100 - pontaPercent))}
            onBlur={onIntermediateBlur}
            className="sr-only"
          />
        </div>
        <div className="mt-5 flex justify-between text-xs font-medium text-muted-foreground">
          {[0, 50, 100].map((value) => (
            <span key={value} className="flex flex-col items-center gap-2">
              <span className="h-2 w-0.5 bg-muted-foreground/50" />
              <span>{value}%</span>
            </span>
          ))}
        </div>
      </div>
      <FieldError id="whiteTariffPontaPercent-error" message={pontaError} />
      <FieldError id="whiteTariffIntermediatePercent-error" message={intermediateError} />
    </div>
  );
}

function formatTariff(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kWh`;
}

function TariffWheelPicker({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const selectedCents = Math.min(999, Math.max(0, Math.round(value * 100)));
  const selectedReais = Math.floor(selectedCents / 100);
  const selectedCentavos = selectedCents % 100;
  const reais = Array.from({ length: 10 }, (_, index) => index);
  const centavos = Array.from({ length: 100 }, (_, index) => index);
  const selectedReaisRef = useRef<HTMLButtonElement>(null);
  const selectedCentavosRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedReaisRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    selectedCentavosRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [selectedReais, selectedCentavos]);

  function selectTariff(reaisValue: number, centavosValue: number) {
    onChange((reaisValue * 100 + centavosValue) / 100);
  }

  function renderColumn(options: number[], selected: number, selectedRef: RefObject<HTMLButtonElement | null>, suffix: string, pad = false) {
    return (
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-muted/25 shadow-inner backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg border border-primary/30 bg-background/75 shadow-sm backdrop-blur-sm" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-12 bg-gradient-to-b from-muted/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-12 bg-gradient-to-t from-muted/70 to-transparent" />
        <div className="tariff-wheel-scroll relative max-h-40 snap-y snap-proximity overflow-y-auto overscroll-contain py-[3.875rem] [scroll-snap-stop:normal]" tabIndex={0} aria-label={suffix}>
          {options.map((option) => {
            const isSelected = option === selected;
            return (
              <button
                key={option}
                ref={isSelected ? selectedRef : undefined}
                type="button"
                aria-label={`${option} ${suffix.toLowerCase()}`}
                className={cn('relative z-20 flex h-9 w-full snap-center items-center justify-center text-sm tabular-nums text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50', isSelected && 'scale-105 font-bold text-foreground')}
                onClick={() => selectTariff(suffix === 'Reais' ? option : selectedReais, suffix === 'Centavos' ? option : selectedCentavos)}
              >
                {pad ? String(option).padStart(2, '0') : option}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute left-1/2 top-full z-50 mt-2 w-[min(18rem,calc(100vw-3rem))] -translate-x-1/2 rounded-2xl border border-border/70 bg-card/75 p-2.5 text-card-foreground shadow-xl backdrop-blur-md" role="dialog" aria-label={`Selecionar tarifa ${label}`}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          {renderColumn(reais, selectedReais, selectedReaisRef, 'Reais')}
        </div>
        <div>
          {renderColumn(centavos, selectedCentavos, selectedCentavosRef, 'Centavos', true)}
        </div>
      </div>
    </div>
  );
}

function RepeatingStepperButton({ label, direction, value, step, precision, min, max, onChange }: {
  label: string;
  direction: 'decrease' | 'increase';
  value: number;
  step: number;
  precision: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasHoldingRef = useRef(false);
  const delta = direction === 'increase' ? step : -step;
  const action = direction === 'increase' ? 'Aumentar' : 'Diminuir';

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [value, onChange]);

  function adjust() {
    const factor = 10 ** precision;
    const nextValue = Math.min(max, Math.max(min, Math.round((valueRef.current + delta) * factor) / factor));
    valueRef.current = nextValue;
    onChangeRef.current(nextValue);
  }

  function stopHolding() {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimeoutRef.current = null;
    holdIntervalRef.current = null;
  }

  function startHolding() {
    stopHolding();
    wasHoldingRef.current = false;
    holdTimeoutRef.current = setTimeout(() => {
      wasHoldingRef.current = true;
      adjust();
      holdIntervalRef.current = setInterval(adjust, 75);
    }, 350);
  }

  function handleClick() {
    if (wasHoldingRef.current) {
      wasHoldingRef.current = false;
      return;
    }
    adjust();
  }

  useEffect(() => () => stopHolding(), []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`${action} ${label}`}
      onClick={handleClick}
      onPointerDown={startHolding}
      onPointerUp={stopHolding}
      onPointerLeave={stopHolding}
      onPointerCancel={stopHolding}
      disabled={direction === 'decrease' ? value <= min : value >= max}
      className="h-9 w-9 shrink-0 text-xl leading-none text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
    >
      {direction === 'increase' ? '+' : '−'}
    </Button>
  );
}

function NumericWheelInput({ id, label, value, options, formatOption, onChange, min, max, step = 1, precision = 0, error, describedBy, onBlur }: {
  id: string;
  label: string;
  value: number;
  options: number[];
  formatOption: (value: number) => string;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  precision?: number;
  error?: boolean;
  describedBy?: string;
  onBlur?: () => void;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const valueButtonRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedValue = options.reduce((closest, option) => Math.abs(option - value) < Math.abs(closest - value) ? option : closest, options[0]);

  useEffect(() => {
    if (!pickerOpen) return;
    selectedRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [pickerOpen, selectedValue]);

  useEffect(() => {
    if (!pickerOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !valueButtonRef.current?.contains(target)) {
        setPickerOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPickerOpen(false);
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [pickerOpen]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-1.5">
        <RepeatingStepperButton label={label} direction="decrease" value={value} step={step} precision={precision} min={min} max={max} onChange={onChange} />
        <button
          id={id}
          ref={valueButtonRef}
          type="button"
          aria-label={label}
          aria-expanded={pickerOpen}
          data-invalid={error || undefined}
          aria-describedby={describedBy}
          onClick={() => setPickerOpen((open) => !open)}
          onBlur={onBlur}
          className="min-w-0 flex-1 px-2 text-center text-sm font-semibold tabular-nums text-foreground transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {formatOption(value)}
        </button>
        <RepeatingStepperButton label={label} direction="increase" value={value} step={step} precision={precision} min={min} max={max} onChange={onChange} />
      </div>
      {pickerOpen && (
        <div ref={pickerRef} className="absolute left-1/2 top-full z-50 mt-2 w-[min(12rem,calc(100vw-3rem))] -translate-x-1/2 rounded-2xl border border-border/70 bg-card/75 p-2.5 text-card-foreground shadow-xl backdrop-blur-md" role="dialog" aria-label={`Selecionar ${label}`}>
          <div className="relative overflow-hidden rounded-xl border border-border/70 bg-muted/25 shadow-inner backdrop-blur-sm">
            <div className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg border border-primary/30 bg-background/75 shadow-sm backdrop-blur-sm" />
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-12 bg-gradient-to-b from-muted/70 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-12 bg-gradient-to-t from-muted/70 to-transparent" />
            <div className="tariff-wheel-scroll relative max-h-40 snap-y snap-proximity overflow-y-auto overscroll-contain py-[3.875rem] [scroll-snap-stop:normal]" tabIndex={0} aria-label={label}>
              {options.map((option) => {
                const selected = option === selectedValue;
                return (
                  <button
                    key={option}
                    ref={selected ? selectedRef : undefined}
                    type="button"
                    aria-label={formatOption(option)}
                    className={cn('relative z-20 flex h-9 w-full snap-center items-center justify-center text-sm tabular-nums text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50', selected && 'scale-105 font-bold text-foreground')}
                    onClick={() => {
                      onChange(option);
                      setPickerOpen(false);
                    }}
                  >
                    {formatOption(option)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatWindowTime(value: number) {
  const totalMinutes = Math.max(0, Math.min(9 * 60 + 59, Math.round(value * 60)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function ConsumptionWheelInput({ id, label, value, onChange, error, describedBy, onBlur }: { id: string; label: string; value: number; onChange: (value: number) => void; error?: boolean; describedBy?: string; onBlur?: () => void }) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const valueButtonRef = useRef<HTMLButtonElement>(null);
  const hundredsRef = useRef<HTMLButtonElement>(null);
  const remainderRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const totalValue = Math.min(2099, Math.max(0, Math.round(value)));
  const [draftValue, setDraftValue] = useState(totalValue);
  const selectedHundreds = draftValue >= 300 ? Math.min(2000, Math.floor(draftValue / 100) * 100) : 300;
  const selectedRemainder = draftValue >= 300 ? draftValue - selectedHundreds : 0;
  const hundreds = Array.from({ length: 18 }, (_, index) => 300 + index * 100);
  const remainders = Array.from({ length: 100 }, (_, index) => index);

  useEffect(() => {
    if (!pickerOpen) return;
    hundredsRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    remainderRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [pickerOpen, selectedHundreds, selectedRemainder]);

  useEffect(() => {
    if (!pickerOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !valueButtonRef.current?.contains(target)) setPickerOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPickerOpen(false);
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [pickerOpen]);

  function selectValue(nextValue: number) {
    const clampedValue = Math.min(2099, Math.max(300, nextValue));
    setDraftValue(clampedValue);
    onChange(clampedValue);
  }

  function togglePicker() {
    if (!pickerOpen) setDraftValue(totalValue);
    setPickerOpen((open) => !open);
  }

  function renderColumn(options: number[], selected: number, selectedRef: RefObject<HTMLButtonElement | null>, suffix: string, pad = false) {
    return (
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-muted/25 shadow-inner backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg border border-primary/30 bg-background/75 shadow-sm backdrop-blur-sm" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-12 bg-gradient-to-b from-muted/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-12 bg-gradient-to-t from-muted/70 to-transparent" />
        <div className="tariff-wheel-scroll relative max-h-40 snap-y snap-proximity overflow-y-auto overscroll-contain py-[3.875rem] [scroll-snap-stop:normal]" tabIndex={0} aria-label={suffix}>
          {options.map((option) => {
            const isSelected = option === selected;
            const displayValue = pad ? String(option).padStart(2, '0') : String(option);
            return (
              <button
                key={option}
                ref={isSelected ? selectedRef : undefined}
                type="button"
                aria-label={`${displayValue} ${suffix.toLowerCase()}`}
                className={cn('relative z-20 flex h-9 w-full snap-center items-center justify-center text-sm tabular-nums text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50', isSelected && 'scale-105 font-bold text-foreground')}
                onClick={() => selectValue(suffix === 'Centenas' ? option + selectedRemainder : selectedHundreds + option)}
              >
                {displayValue}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-1.5">
        <RepeatingStepperButton label={label} direction="decrease" value={value} step={1} precision={0} min={300} max={2099} onChange={onChange} />
        <button
          id={id}
          ref={valueButtonRef}
          type="button"
          aria-label={label}
          aria-expanded={pickerOpen}
          data-invalid={error || undefined}
          aria-describedby={describedBy}
          onClick={togglePicker}
          onBlur={onBlur}
          className="min-w-0 flex-1 px-2 text-center text-sm font-semibold tabular-nums text-foreground transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {value > 0 ? `${Math.round(value)} kWh/mês` : 'Selecionar'}
        </button>
        <RepeatingStepperButton label={label} direction="increase" value={value} step={1} precision={0} min={300} max={2099} onChange={onChange} />
      </div>
      {pickerOpen && (
        <div ref={pickerRef} className="absolute left-1/2 top-full z-50 mt-2 w-[min(18rem,calc(100vw-3rem))] -translate-x-1/2 rounded-2xl border border-border/70 bg-card/75 p-2.5 text-card-foreground shadow-xl backdrop-blur-md" role="dialog" aria-label={`Selecionar ${label}`}>
          <div className="grid grid-cols-2 gap-2">
            {renderColumn(hundreds, selectedHundreds, hundredsRef, 'Centenas')}
            {renderColumn(remainders, selectedRemainder, remainderRef, 'Unidades', true)}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeWheelInput({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const valueButtonRef = useRef<HTMLButtonElement>(null);
  const hoursRef = useRef<HTMLButtonElement>(null);
  const minutesRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const totalMinutes = Math.max(0, Math.min(9 * 60 + 59, Math.round(value * 60)));
  const [draftMinutes, setDraftMinutes] = useState(totalMinutes);
  const selectedHours = Math.floor(draftMinutes / 60);
  const selectedMinutes = draftMinutes % 60;
  const hours = Array.from({ length: 10 }, (_, index) => index);
  const minutes = Array.from({ length: 60 }, (_, index) => index);

  useEffect(() => {
    if (!pickerOpen) return;
    hoursRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    minutesRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [pickerOpen, selectedHours, selectedMinutes]);

  useEffect(() => {
    if (!pickerOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !valueButtonRef.current?.contains(target)) {
        setPickerOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPickerOpen(false);
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [pickerOpen]);

  function selectTime(nextMinutes: number) {
    const clampedMinutes = Math.max(0, Math.min(9 * 60 + 59, nextMinutes));
    setDraftMinutes(clampedMinutes);
    onChange(clampedMinutes / 60);
  }

  function togglePicker() {
    if (!pickerOpen) setDraftMinutes(totalMinutes);
    setPickerOpen((open) => !open);
  }

  function renderColumn(options: number[], selected: number, selectedRef: RefObject<HTMLButtonElement | null>, suffix: string) {
    return (
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-muted/25 shadow-inner backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg border border-primary/30 bg-background/75 shadow-sm backdrop-blur-sm" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-12 bg-gradient-to-b from-muted/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-12 bg-gradient-to-t from-muted/70 to-transparent" />
        <div className="tariff-wheel-scroll relative max-h-40 snap-y snap-proximity overflow-y-auto overscroll-contain py-[3.875rem] [scroll-snap-stop:normal]" tabIndex={0} aria-label={suffix}>
          {options.map((option) => {
            const isSelected = option === selected;
            const displayValue = String(option).padStart(2, '0');
            return (
              <button
                key={option}
                ref={isSelected ? selectedRef : undefined}
                type="button"
                aria-label={`${displayValue} ${suffix.toLowerCase()}`}
                className={cn('relative z-20 flex h-9 w-full snap-center items-center justify-center text-sm tabular-nums text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50', isSelected && 'scale-105 font-bold text-foreground')}
                onClick={() => selectTime(suffix === 'Horas' ? option * 60 + selectedMinutes : selectedHours * 60 + option)}
              >
                {displayValue}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-1.5">
        <RepeatingStepperButton label={label} direction="decrease" value={value} step={1 / 60} precision={6} min={0} max={9 + 59 / 60} onChange={onChange} />
        <button
          id={id}
          ref={valueButtonRef}
          type="button"
          aria-label={label}
          aria-expanded={pickerOpen}
          onClick={togglePicker}
          className="min-w-0 flex-1 px-2 text-center text-sm font-semibold tabular-nums text-foreground transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {formatWindowTime(value)} h
        </button>
        <RepeatingStepperButton label={label} direction="increase" value={value} step={1 / 60} precision={6} min={0} max={9 + 59 / 60} onChange={onChange} />
      </div>
      {pickerOpen && (
        <div ref={pickerRef} className="absolute left-1/2 top-full z-50 mt-2 w-[min(18rem,calc(100vw-3rem))] -translate-x-1/2 rounded-2xl border border-border/70 bg-card/75 p-2.5 text-card-foreground shadow-xl backdrop-blur-md" role="dialog" aria-label={`Selecionar ${label}`}>
          <div className="grid grid-cols-2 gap-2">
            {renderColumn(hours, selectedHours, hoursRef, 'Horas')}
            {renderColumn(minutes, selectedMinutes, minutesRef, 'Minutos')}
          </div>
        </div>
      )}
    </div>
  );
}

function TariffInput({ id, label, value, error, manuallyEdited, onChange, onBlur, embedded = false }: {
  id: string;
  label: string;
  value: number;
  error?: string;
  manuallyEdited: boolean;
  onChange: (value: number) => void;
  onBlur: () => void;
  embedded?: boolean;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const valueButtonRef = useRef<HTMLButtonElement>(null);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasHoldingRef = useRef(false);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [value, onChange]);

  function adjustTariff(delta: number) {
    const nextValue = Math.min(9.99, Math.max(0, Math.round((valueRef.current + delta) * 100) / 100));
    valueRef.current = nextValue;
    onChangeRef.current(nextValue);
  }

  function stopHolding() {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimeoutRef.current = null;
    holdIntervalRef.current = null;
  }

  function startHolding(delta: number) {
    stopHolding();
    wasHoldingRef.current = false;
    holdTimeoutRef.current = setTimeout(() => {
      wasHoldingRef.current = true;
      adjustTariff(delta);
      holdIntervalRef.current = setInterval(() => adjustTariff(delta), 75);
    }, 350);
  }

  function handleAdjustClick(delta: number) {
    if (wasHoldingRef.current) {
      wasHoldingRef.current = false;
      return;
    }
    adjustTariff(delta);
  }

  useEffect(() => {
    if (!pickerOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !valueButtonRef.current?.contains(target)) {
        setPickerOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPickerOpen(false);
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [pickerOpen]);

  useEffect(() => () => stopHolding(), []);

  return (
    <div className={cn('relative', !embedded && 'rounded-lg border bg-background p-3')}>
      {!embedded && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{label}</p>
          {manuallyEdited && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-900 dark:text-amber-100">Alterado manualmente</span>}
        </div>
      )}
      <div className={cn('space-y-1.5', !embedded && 'mt-2')}>
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Diminuir tarifa ${label}`}
            onClick={() => handleAdjustClick(-0.01)}
            onPointerDown={() => startHolding(-0.01)}
            onPointerUp={stopHolding}
            onPointerLeave={stopHolding}
            onPointerCancel={stopHolding}
            onBlur={onBlur}
            disabled={value <= 0}
            className="h-9 w-9 shrink-0 text-xl leading-none text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
          >
            −
          </Button>
          <button
            ref={valueButtonRef}
            type="button"
            aria-label={`Abrir seletor de tarifa ${label}`}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
            className="min-w-0 px-2 text-center text-base font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-lg"
          >
            {formatTariff(value)}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Aumentar tarifa ${label}`}
            onClick={() => handleAdjustClick(0.01)}
            onPointerDown={() => startHolding(0.01)}
            onPointerUp={stopHolding}
            onPointerLeave={stopHolding}
            onPointerCancel={stopHolding}
            onBlur={onBlur}
            className="h-9 w-9 shrink-0 text-xl leading-none text-muted-foreground hover:bg-background hover:text-foreground"
          >
            +
          </Button>
        </div>
        {pickerOpen && (
          <div ref={pickerRef}>
            <TariffWheelPicker label={label} value={value} onChange={onChange} />
          </div>
        )}
        <FieldError id={`${id}-error`} message={error} />
      </div>
    </div>
  );
}

/** Kept in sync between "Armazenamento preliminar" and "Economia preliminar"
 *  in the instant summary below, so both preview numbers share the same
 *  loss assumption instead of one silently being lossless — replaced by the
 *  chosen battery's real round_trip_efficiency_percent once a solution is
 *  picked (see calculateSystemCost/buildMarginSummary call sites). */
const PRELIMINARY_ROUND_TRIP_EFFICIENCY_PERCENT = WHITE_TARIFF_DISPLAY_EFFICIENCY_PERCENT;

export function WhiteTariffPanel({
  value,
  dailyKwh,
  whiteTariff,
  onWhiteTariffChange,
  pv,
}: {
  value: DesiredFeatureId[];
  dailyKwh: number;
  whiteTariff: WhiteTariffConfig | null;
  onWhiteTariffChange: (whiteTariff: WhiteTariffConfig | null) => void;
  pv: PvConfig | null;
}) {
  const backupDailyKwh = value.includes('backup') ? dailyKwh : 0;
  const whiteBusinessDays = whiteTariff?.businessDaysPerMonth ?? TARIFF_BUSINESS_DAYS_PER_MONTH;
  // "automatic" (Automático pela ANEEL) is temporarily disabled — fall back to
  // "manual" even for projects saved while it was still available.
  const tariffInputMode = (
    whiteTariff?.tariffInputMode === 'automatic' ? 'manual' : whiteTariff?.tariffInputMode ?? 'manual'
  ) as 'automatic' | 'manual';
  const currentWhiteTariff = whiteTariff ?? emptyWhiteTariffConfig;
  const whiteTotalMonthlyKwh = currentWhiteTariff.totalMonthlyConsumptionKwh ?? 0;
  const legacyPontaMonthlyKwh = (currentWhiteTariff.pontaEnergyWh / 1000) * whiteBusinessDays;
  const legacyIntermediateMonthlyKwh = (currentWhiteTariff.intermediateEnergyWh / 1000) * whiteBusinessDays;
  const legacyPontaPercent = whiteTotalMonthlyKwh > 0 ? (legacyPontaMonthlyKwh / whiteTotalMonthlyKwh) * 100 : 0;
  const legacyIntermediatePercent = whiteTotalMonthlyKwh > 0 ? (legacyIntermediateMonthlyKwh / whiteTotalMonthlyKwh) * 100 : 0;
  const whitePontaPercent = clampPercent(currentWhiteTariff.pontaConsumptionPercent ?? legacyPontaPercent);
  const whiteIntermediatePercent = clampPercent(currentWhiteTariff.intermediateConsumptionPercent ?? legacyIntermediatePercent, 100 - whitePontaPercent);
  const whitePontaMonthlyKwh = whiteTotalMonthlyKwh * whitePontaPercent / 100;
  const whiteIntermediateMonthlyKwh = whiteTotalMonthlyKwh * whiteIntermediatePercent / 100;
  const whiteExpensiveMonthlyKwh = whitePontaMonthlyKwh + whiteIntermediateMonthlyKwh;
  const whiteOffPeakMonthlyKwh = Math.max(0, whiteTotalMonthlyKwh - whiteExpensiveMonthlyKwh);
  const whiteShiftPercent = whiteTotalMonthlyKwh > 0
    ? Math.min(100, (whiteExpensiveMonthlyKwh / whiteTotalMonthlyKwh) * 100)
    : 0;
  const calculatedPontaEnergyWh = monthlyKwhToDailyWh(whitePontaMonthlyKwh, whiteBusinessDays);
  const calculatedIntermediateEnergyWh = monthlyKwhToDailyWh(whiteIntermediateMonthlyKwh, whiteBusinessDays);
  const tariffForCalculation = whiteTariff
    ? { ...whiteTariff, pontaEnergyWh: calculatedPontaEnergyWh, intermediateEnergyWh: calculatedIntermediateEnergyWh }
    : null;
  const preliminaryStorageKwh = tariffForCalculation
    ? (tariffForCalculation.pontaEnergyWh + tariffForCalculation.intermediateEnergyWh) / 1000 / (PRELIMINARY_ROUND_TRIP_EFFICIENCY_PERCENT / 100)
    : 0;
  // Before a solution exists there's no chosen inverter to cap the array, so
  // the raw (uncapped) PV size is exactly what generates the customer's own
  // monthlyConsumptionKwh over the month — see desiredPvPowerKw in the Edge
  // Function, whose generation (rawKw * hsp * 30) algebraically simplifies
  // back to monthlyConsumptionKwh. That lets the battery displacement
  // preview credit solar as a charging source without duplicating that math.
  const preliminaryPvMonthlyGenerationKwh =
    value.includes('pv') && pv && pv.monthlyConsumptionKwh > 0 && pv.hsp > 0 ? pv.monthlyConsumptionKwh : null;
  const preliminaryTariffSavings = calculateTariffSavings(tariffForCalculation, {
    totalMonthlyConsumptionKwh: whiteTotalMonthlyKwh || null,
    pvMonthlyGenerationKwh: preliminaryPvMonthlyGenerationKwh,
    batteryRoundTripEfficiencyPercent: PRELIMINARY_ROUND_TRIP_EFFICIENCY_PERCENT,
  });
  const summaryReady = Boolean(whiteTariff) && !isWhiteTariffConfigIncomplete(value, tariffForCalculation);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<WhiteTariffField, string>>>({});

  function validateField(field: WhiteTariffField): string | undefined {
    const config = whiteTariff ?? emptyWhiteTariffConfig;
    const valueForField = config[field] ?? 0;
    if (field === 'pontaConsumptionPercent' || field === 'intermediateConsumptionPercent') {
      if (valueForField < 0 || valueForField > 100) return 'Informe um percentual entre 0 e 100.';
      const otherField = field === 'pontaConsumptionPercent' ? 'intermediateConsumptionPercent' : 'pontaConsumptionPercent';
      if (valueForField + (config[otherField] ?? 0) > 100) return 'A soma dos períodos não pode superar 100%.';
      return undefined;
    }
    if (field === 'totalMonthlyConsumptionKwh' && !(valueForField > 0)) return 'Informe o consumo mensal.';
    if (field === 'requiredPowerW' && !(valueForField > 0)) return 'Informe a potência máxima nos horários caros.';
    if (field.endsWith('TariffPerKwh')) {
      if (!(valueForField > 0)) return 'Informe uma tarifa válida.';
      if ((field === 'pontaTariffPerKwh' || field === 'intermediateTariffPerKwh') && valueForField < config.foraPontaTariffPerKwh) {
        return 'A tarifa deve ser maior ou igual à tarifa fora ponta.';
      }
    }
    return undefined;
  }

  function validateAndSet(field: WhiteTariffField) {
    setFieldErrors((current) => ({ ...current, [field]: validateField(field) }));
  }

  function fieldError(field: WhiteTariffField) {
    return fieldErrors[field];
  }

  function fieldDescription(field: WhiteTariffField) {
    return fieldError(field) ? `${field}-error` : undefined;
  }

  function updateDistribution(partial: Partial<Pick<WhiteTariffConfig, 'totalMonthlyConsumptionKwh' | 'pontaConsumptionPercent' | 'intermediateConsumptionPercent'>>) {
    const next = { ...currentWhiteTariff, ...partial };
    const totalMonthlyConsumptionKwh = Math.max(0, next.totalMonthlyConsumptionKwh ?? 0);
    const pontaConsumptionPercent = clampPercent(partial.pontaConsumptionPercent ?? whitePontaPercent);
    const intermediateConsumptionPercent = clampPercent(partial.intermediateConsumptionPercent ?? whiteIntermediatePercent, 100 - pontaConsumptionPercent);
    onWhiteTariffChange({
      ...next,
      totalMonthlyConsumptionKwh,
      pontaConsumptionPercent,
      intermediateConsumptionPercent,
      pontaEnergyWh: monthlyKwhToDailyWh(totalMonthlyConsumptionKwh * pontaConsumptionPercent / 100, whiteBusinessDays),
      intermediateEnergyWh: monthlyKwhToDailyWh(totalMonthlyConsumptionKwh * intermediateConsumptionPercent / 100, whiteBusinessDays),
    });
    setFieldErrors((current) => ({
      ...current,
      totalMonthlyConsumptionKwh: undefined,
      pontaConsumptionPercent: undefined,
      intermediateConsumptionPercent: undefined,
    }));
  }

  const [distributors, setDistributors] = useState<string[]>([]);
  const [loadingDistributors, setLoadingDistributors] = useState(true);
  const [loadingReferenceDate, setLoadingReferenceDate] = useState(true);
  const [fetchingTariffs, setFetchingTariffs] = useState(false);
  const [tariffError, setTariffError] = useState<string | null>(null);
  const [aneelTariffs, setAneelTariffs] = useState<EnergyTariffResult | null>(null);

  const [aneelDistributor, setAneelDistributor] = useState(whiteTariff?.distributor || '');
  const [aneelAccessantAgent, setAneelAccessantAgent] = useState(whiteTariff?.consumerClass || '');
  const [aneelAccessantAgents, setAneelAccessantAgents] = useState<string[]>([]);
  const [loadingAccessantAgents, setLoadingAccessantAgents] = useState(false);
  const [aneelSubgroup, setAneelSubgroup] = useState(whiteTariff?.subgroup || '');
  const [aneelTariffMode, setAneelTariffMode] = useState(whiteTariff?.tariffMode || 'Branca');
  const [aneelReferenceDate, setAneelReferenceDate] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const [distributorsRes, dateRes] = await Promise.all([
          fetch('/api/tariffs/distributors'),
          fetch('/api/tariffs/latest-date'),
        ]);

        if (distributorsRes.ok) {
          const data = await distributorsRes.json();
          setDistributors(data.distributors || []);
        } else {
          console.error('Error fetching distributors:', distributorsRes.status);
        }

        if (dateRes.ok) {
          const data = await dateRes.json();
          setAneelReferenceDate(data.latestDate || '');
        } else {
          console.error('Error fetching latest date:', dateRes.status);
          setAneelReferenceDate('');
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setAneelReferenceDate('');
      } finally {
        setLoadingDistributors(false);
        setLoadingReferenceDate(false);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    async function loadAccessantAgents() {
      if (!aneelDistributor) {
        setAneelAccessantAgents([]);
        setAneelAccessantAgent('');
        return;
      }

      setLoadingAccessantAgents(true);
      try {
        const response = await fetch(`/api/tariffs/accessant-agents?distributor=${encodeURIComponent(aneelDistributor)}`);
        if (response.ok) {
          const data = await response.json();
          setAneelAccessantAgents(data.accessantAgents || []);
        }
      } catch (err) {
        console.error('Error loading accessant agents:', err);
      } finally {
        setLoadingAccessantAgents(false);
      }
    }

    loadAccessantAgents();
  }, [aneelDistributor]);

  async function handleFetchTariffs() {
    if (!aneelDistributor || !aneelSubgroup || !aneelTariffMode || !aneelReferenceDate) {
      setTariffError('Preencha todos os campos obrigatórios');
      return;
    }

    setFetchingTariffs(true);
    setTariffError(null);

    try {
      const params = new URLSearchParams({
        distributor: aneelDistributor,
        subgroup: aneelSubgroup,
        tariffMode: aneelTariffMode,
        referenceDate: aneelReferenceDate,
      });

      if (aneelAccessantAgent) {
        params.append('accessantAgent', aneelAccessantAgent);
      }

      const response = await fetch(`/api/tariffs/lookup?${params}`);
      if (!response.ok) {
        const error = await response.json();
        setTariffError(error.error || 'Erro ao buscar tarifas');
        return;
      }

      const data = await response.json();
      setAneelTariffs(data.tariffs);

      const next = { ...(whiteTariff ?? emptyWhiteTariffConfig) };
      next.tariffInputMode = 'automatic';
      next.tariffSource = 'ANEEL';
      next.distributor = data.tariffs.distributor;
      next.subgroup = data.tariffs.subgroup;
      next.tariffMode = data.tariffs.tariffMode;
      next.validFrom = data.tariffs.validFrom;
      next.validUntil = data.tariffs.validUntil;
      next.fetchedAt = data.tariffs.fetchedAt;

      if (data.tariffs.tariffs.peak !== undefined) {
        next.pontaTariffPerKwh = data.tariffs.tariffs.peak;
      }
      if (data.tariffs.tariffs.intermediate !== undefined) {
        next.intermediateTariffPerKwh = data.tariffs.tariffs.intermediate;
      }
      if (data.tariffs.tariffs.offPeak !== undefined) {
        next.foraPontaTariffPerKwh = data.tariffs.tariffs.offPeak;
      }
      if (data.tariffs.tariffs.conventional !== undefined) {
        next.foraPontaTariffPerKwh = data.tariffs.tariffs.conventional;
      }

      next.manuallyEditedFields = [];
      onWhiteTariffChange(next);
    } catch (err) {
      setTariffError('Erro de conexão ao consultar tarifas');
      console.error(err);
    } finally {
      setFetchingTariffs(false);
    }
  }

  function markFieldAsEdited(fieldName: string) {
    if (!whiteTariff) return;
    const edited = new Set(whiteTariff.manuallyEditedFields || []);
    edited.add(fieldName);
    onWhiteTariffChange({
      ...whiteTariff,
      manuallyEditedFields: Array.from(edited),
    });
  }

  return (
    <div className="space-y-3">
      {tariffInputMode === 'automatic' && (
        <AutomaticTariffPanel
          distributor={aneelDistributor}
          setDistributor={setAneelDistributor}
          distributors={distributors}
          loadingDistributors={loadingDistributors}
          accessantAgent={aneelAccessantAgent}
          setAccessantAgent={setAneelAccessantAgent}
          accessantAgents={aneelAccessantAgents}
          loadingAccessantAgents={loadingAccessantAgents}
          subgroup={aneelSubgroup}
          setSubgroup={setAneelSubgroup}
          tariffMode={aneelTariffMode}
          setTariffMode={setAneelTariffMode}
          referenceDate={aneelReferenceDate}
          loadingReferenceDate={loadingReferenceDate}
          tariffs={aneelTariffs}
          loading={fetchingTariffs}
          error={tariffError}
          onFetchTariffs={handleFetchTariffs}
        />
      )}

      {tariffInputMode === 'automatic' && whiteTariff && aneelTariffs && (
        <div className="flex gap-2">
          <Button
            onClick={handleFetchTariffs}
            disabled={fetchingTariffs}
            variant="outline"
            className="flex-1"
            size="sm"
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', fetchingTariffs && 'animate-spin')} />
            Atualizar tarifas
          </Button>
        </div>
      )}

          <div className="rounded-lg border border-muted/20 bg-muted/20 p-3">
            <p className="text-sm font-semibold">
              <InfoLabel
                label="Consumo"
                tip="Use o consumo total exibido na fatura, sem depender da configuração Fotovoltaico."
              />
            </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background/70 p-3">
            <div className="space-y-1.5">
            <Label htmlFor="whiteTariffTotalConsumption">Consumo total mensal</Label>
              <ConsumptionWheelInput
                id="whiteTariffTotalConsumption"
                label="Consumo total mensal"
                value={whiteTotalMonthlyKwh}
                error={Boolean(fieldError('totalMonthlyConsumptionKwh'))}
                describedBy={fieldDescription('totalMonthlyConsumptionKwh')}
                onChange={(totalMonthlyConsumptionKwh) => updateDistribution({ totalMonthlyConsumptionKwh })}
              onBlur={() => validateAndSet('totalMonthlyConsumptionKwh')}
            />
            <FieldError id="totalMonthlyConsumptionKwh-error" message={fieldError('totalMonthlyConsumptionKwh')} />
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 p-3">
            <div className="space-y-1.5">
            <Label htmlFor="whiteTariffPower">
              <InfoLabel
                label="Potência máxima nos horários caros"
                tip="Maior potência simultânea que a bateria deverá atender na ponta ou intermediária."
              />
            </Label>
            <NumericWheelInput
              id="whiteTariffPower"
              label="Potência máxima nos horários caros"
              value={whiteTariff?.requiredPowerW ? whiteTariff.requiredPowerW / 1000 : 0}
              options={Array.from({ length: 99 }, (_, index) => index + 1)}
              formatOption={(power) => power > 0 ? `${power} kW` : 'Selecionar'}
              min={1}
              max={99}
              error={Boolean(fieldError('requiredPowerW'))}
              describedBy={fieldDescription('requiredPowerW')}
              onChange={(requiredPowerKw) => {
                onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), requiredPowerW: requiredPowerKw * 1000 });
                setFieldErrors((current) => ({ ...current, requiredPowerW: undefined }));
              }}
              onBlur={() => validateAndSet('requiredPowerW')}
            />
            <FieldError id="requiredPowerW-error" message={fieldError('requiredPowerW')} />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
          {value.includes('backup')
            ? summaryReady && backupDailyKwh > 0
              ? `Backup está ativo: +${backupDailyKwh.toFixed(2)} kWh/dia considerados.`
              : 'Backup está ativo. A energia necessária para backup será adicionada ao cálculo.'
            : 'Ative "Backup" para somar a energia das cargas à energia da Tarifa Branca.'}
        </p>
      </div>
      <div className="space-y-2">
        <div className="rounded-lg border border-background bg-background p-3">
          <p className="text-sm font-semibold">
            <InfoLabel
              label="Distribuição e tarifas"
              tip="Defina quanto do consumo ocorre na ponta e no período intermediário. O restante é atribuído automaticamente à fora ponta."
            />
          </p>
          <EnergyDistributionControl
            pontaPercent={whitePontaPercent}
            intermediatePercent={whiteIntermediatePercent}
            businessDays={whiteBusinessDays}
            pontaMonthlyKwh={whitePontaMonthlyKwh}
            intermediateMonthlyKwh={whiteIntermediateMonthlyKwh}
            offPeakMonthlyKwh={whiteOffPeakMonthlyKwh}
            pontaTariff={currentWhiteTariff.pontaTariffPerKwh}
            intermediateTariff={currentWhiteTariff.intermediateTariffPerKwh}
            offPeakTariff={currentWhiteTariff.foraPontaTariffPerKwh}
            pontaError={fieldError('pontaConsumptionPercent')}
            intermediateError={fieldError('intermediateConsumptionPercent')}
            pontaTariffError={fieldError('pontaTariffPerKwh')}
            intermediateTariffError={fieldError('intermediateTariffPerKwh')}
            offPeakTariffError={fieldError('foraPontaTariffPerKwh')}
            pontaTariffManuallyEdited={Boolean(whiteTariff?.manuallyEditedFields?.includes('pontaTariffPerKwh'))}
            intermediateTariffManuallyEdited={Boolean(whiteTariff?.manuallyEditedFields?.includes('intermediateTariffPerKwh'))}
            offPeakTariffManuallyEdited={Boolean(whiteTariff?.manuallyEditedFields?.includes('foraPontaTariffPerKwh'))}
            onPontaChange={(pontaConsumptionPercent) => updateDistribution({ pontaConsumptionPercent })}
            onIntermediateChange={(intermediateConsumptionPercent) => updateDistribution({ intermediateConsumptionPercent })}
            onPontaTariffChange={(pontaTariffPerKwh) => {
              markFieldAsEdited('pontaTariffPerKwh');
              onWhiteTariffChange({ ...currentWhiteTariff, pontaTariffPerKwh });
              setFieldErrors((current) => ({ ...current, pontaTariffPerKwh: undefined }));
            }}
            onIntermediateTariffChange={(intermediateTariffPerKwh) => {
              markFieldAsEdited('intermediateTariffPerKwh');
              onWhiteTariffChange({ ...currentWhiteTariff, intermediateTariffPerKwh });
              setFieldErrors((current) => ({ ...current, intermediateTariffPerKwh: undefined }));
            }}
            onOffPeakTariffChange={(foraPontaTariffPerKwh) => {
              markFieldAsEdited('foraPontaTariffPerKwh');
              onWhiteTariffChange({ ...currentWhiteTariff, foraPontaTariffPerKwh });
              setFieldErrors((current) => ({ ...current, foraPontaTariffPerKwh: undefined }));
            }}
            onPontaBlur={() => validateAndSet('pontaConsumptionPercent')}
            onIntermediateBlur={() => validateAndSet('intermediateConsumptionPercent')}
            onPontaTariffBlur={() => validateAndSet('pontaTariffPerKwh')}
            onIntermediateTariffBlur={() => validateAndSet('intermediateTariffPerKwh')}
            onOffPeakTariffBlur={() => validateAndSet('foraPontaTariffPerKwh')}
          />
        </div>

        {whiteTariff &&
          (whiteTariff.pontaTariffPerKwh < whiteTariff.foraPontaTariffPerKwh ||
            whiteTariff.intermediateTariffPerKwh < whiteTariff.foraPontaTariffPerKwh) && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Para estimar economia, as tarifas de ponta e intermediária devem ser maiores ou iguais à tarifa fora de ponta.
            </p>
          )}
        {isWhiteTariffConfigIncomplete(value, tariffForCalculation) && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Preencha os campos obrigatórios para visualizar a estimativa. A energia de ponta e intermediária não pode superar o consumo total.
          </p>
        )}
        <div className="rounded-lg border border-background bg-background p-3 text-sm">
          <p className="font-semibold"><InfoLabel label="Premissas do cálculo" tip="Por padrão são usados 22 dias úteis, 02:30 de ponta e 00:30 de período intermediário. Ajuste conforme a distribuidora e o calendário local." /></p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <CalculationPremiseCard id="whitePontaHours" label="Janela de ponta" tone="red" Icon={Clock3}>
              <TimeWheelInput
                id="whitePontaHours"
                label="Janela de ponta"
                value={whiteTariff?.pontaWindowHours ?? 2.5}
                onChange={(pontaWindowHours) => onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), pontaWindowHours })}
              />
            </CalculationPremiseCard>
            <CalculationPremiseCard id="whiteIntermediateHours" label="Janela intermediária" tone="yellow" Icon={Clock3}>
              <TimeWheelInput
                id="whiteIntermediateHours"
                label="Janela intermediária"
                value={whiteTariff?.intermediateWindowHours ?? 0.5}
                onChange={(intermediateWindowHours) => onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), intermediateWindowHours })}
              />
            </CalculationPremiseCard>
            <CalculationPremiseCard id="whiteBusinessDays" label="Dias úteis" tone="neutral" Icon={CalendarDays}>
              <NumericWheelInput
                id="whiteBusinessDays"
                label="Dias úteis"
                value={whiteBusinessDays}
                options={Array.from({ length: 12 }, (_, index) => index + 20)}
                formatOption={(days) => `${days} dias`}
                min={20}
                max={31}
                onChange={(businessDaysPerMonth) => onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), businessDaysPerMonth })}
              />
            </CalculationPremiseCard>
          </div>
        </div>
        {whiteTariff && <div className="rounded-lg border bg-primary/[0.03] p-3" aria-live="polite">
          <p className="text-sm font-semibold">
            <InfoLabel
              label="Resumo instantâneo"
              tip="A estimativa final usa a capacidade, RTE, SOH, limites de potência e consumo em espera dos produtos selecionados."
            />
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="col-span-2 rounded-md border border-primary/20 bg-background/70 p-2.5 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Economia preliminar</p>
              <strong className="text-base">{summaryReady && preliminaryTariffSavings
                ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preliminaryTariffSavings.monthlySavings)}/mês`
                : '—'}</strong>
            </div>
            <div><p className="text-xs text-muted-foreground">Energia deslocada</p><strong>{summaryReady ? `${whiteExpensiveMonthlyKwh.toFixed(1)} kWh/mês` : '—'}</strong></div>
            <div><p className="text-xs text-muted-foreground">Potência mínima</p><strong>{summaryReady ? `${(whiteTariff.requiredPowerW / 1000).toFixed(2)} kW` : '—'}</strong></div>
            <div><p className="text-xs text-muted-foreground">Armazenamento preliminar</p><strong>{summaryReady ? `${preliminaryStorageKwh.toFixed(2)} kWh` : '—'}</strong></div>
            <div><p className="text-xs text-muted-foreground">Fora de ponta</p><strong>{summaryReady && whiteOffPeakMonthlyKwh > 0 ? <><span>{whiteOffPeakMonthlyKwh.toFixed(1)}</span> <span>kWh/mês</span></> : '—'}</strong></div>
            <div><p className="text-xs text-muted-foreground">Consumo deslocado</p><strong>{summaryReady ? `${whiteShiftPercent.toFixed(1)}%` : '—'}</strong></div>
          </div>
          {!summaryReady && <p className="mt-3 text-xs text-muted-foreground">Preencha os campos obrigatórios para visualizar a estimativa.</p>}
          {summaryReady && preliminaryTariffSavings && preliminaryTariffSavings.monthlySavings <= 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">Economia não identificada nesta configuração</p>
                <p className="mt-0.5">A diferença tarifária não compensa as perdas e o consumo do sistema.</p>
              </div>
            </div>
          )}
          {summaryReady && preliminaryTariffSavings && preliminaryTariffSavings.monthlySavings > 0 && <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">A arbitragem é economicamente favorável com as premissas preliminares.</p>}
        </div>}
      </div>
    </div>
  );
}
