'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, Moon, Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  pontaWindowHours: 3,
  intermediateWindowHours: 2,
  requiredPowerW: 0,
  pontaEnergyWh: 0,
  intermediateEnergyWh: 0,
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
  error,
  onBlur,
}: {
  id: string;
  section: string;
  energyWh: number;
  onChange: (energyWh: number) => void;
  businessDays: number;
  disabled?: boolean;
  error?: string;
  onBlur?: () => void;
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
        inputMode="decimal"
        placeholder="Ex.: 110"
        value={text}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onBlur={onBlur}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          const wh = Math.round(((Number(raw) || 0) * 1000) / businessDays);
          lastEmittedRef.current = wh;
          onChange(wh);
        }}
      />
      <FieldError id={`${id}-error`} message={error} />
      {energyWh ? <p className="text-xs text-muted-foreground">{(energyWh / 1000).toFixed(2)} kWh/dia</p> : null}
    </>
  );
}

type WhiteTariffField =
  | 'totalMonthlyConsumptionKwh'
  | 'requiredPowerW'
  | 'pontaConsumptionPercent'
  | 'intermediateConsumptionPercent'
  | 'pontaEnergyWh'
  | 'intermediateEnergyWh'
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
  const whiteTotalMonthlyKwh = whiteTariff?.totalMonthlyConsumptionKwh ?? 0;
  const whiteExpensiveMonthlyKwh = whiteTariff
    ? ((whiteTariff.pontaEnergyWh + whiteTariff.intermediateEnergyWh) / 1000) * whiteBusinessDays
    : 0;
  const whiteOffPeakMonthlyKwh = Math.max(0, whiteTotalMonthlyKwh - whiteExpensiveMonthlyKwh);
  const whiteOffPeakDailyKwh = whiteBusinessDays > 0 ? whiteOffPeakMonthlyKwh / whiteBusinessDays : 0;
  const whiteShiftPercent = whiteTotalMonthlyKwh > 0
    ? Math.min(100, (whiteExpensiveMonthlyKwh / whiteTotalMonthlyKwh) * 100)
    : 0;
  const preliminaryStorageKwh = whiteTariff
    ? (whiteTariff.pontaEnergyWh + whiteTariff.intermediateEnergyWh) / 1000 / (PRELIMINARY_ROUND_TRIP_EFFICIENCY_PERCENT / 100)
    : 0;
  // Before a solution exists there's no chosen inverter to cap the array, so
  // the raw (uncapped) PV size is exactly what generates the customer's own
  // monthlyConsumptionKwh over the month — see desiredPvPowerKw in the Edge
  // Function, whose generation (rawKw * hsp * 30) algebraically simplifies
  // back to monthlyConsumptionKwh. That lets the battery displacement
  // preview credit solar as a charging source without duplicating that math.
  const preliminaryPvMonthlyGenerationKwh =
    value.includes('pv') && pv && pv.monthlyConsumptionKwh > 0 && pv.hsp > 0 ? pv.monthlyConsumptionKwh : null;
  const preliminaryTariffSavings = calculateTariffSavings(whiteTariff ?? null, {
    totalMonthlyConsumptionKwh: whiteTotalMonthlyKwh || null,
    pvMonthlyGenerationKwh: preliminaryPvMonthlyGenerationKwh,
    batteryRoundTripEfficiencyPercent: PRELIMINARY_ROUND_TRIP_EFFICIENCY_PERCENT,
  });
  const summaryReady = Boolean(whiteTariff) && !isWhiteTariffConfigIncomplete(value, whiteTariff);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<WhiteTariffField, string>>>({});

  function validateField(field: WhiteTariffField): string | undefined {
    const config = whiteTariff ?? emptyWhiteTariffConfig;
    const total = config.totalMonthlyConsumptionKwh ?? 0;
    const valueForField = config[field] ?? 0;
    if (field === 'pontaConsumptionPercent' || field === 'intermediateConsumptionPercent') {
      return valueForField < 0 || valueForField > 100 ? 'Informe um percentual entre 0 e 100.' : undefined;
    }
    if (field === 'pontaEnergyWh' || field === 'intermediateEnergyWh') {
      if (!(valueForField > 0)) return field === 'pontaEnergyWh'
        ? 'Informe a energia mensal na ponta.'
        : 'Informe a energia mensal intermediária.';
      const expensiveMonthlyKwh = ((config.pontaEnergyWh + config.intermediateEnergyWh) / 1000) * whiteBusinessDays;
      if (expensiveMonthlyKwh > total && total > 0) return 'A energia dos períodos não pode superar o consumo total.';
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
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1" role="tablist" aria-label="Fonte de tarifas">
          {(['automatic', 'manual'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={tariffInputMode === mode}
              aria-disabled={mode === 'automatic'}
              disabled={mode === 'automatic'}
              onClick={() => {
                if (mode === 'automatic') return;
                const next = { ...(whiteTariff ?? emptyWhiteTariffConfig), tariffInputMode: mode };
                onWhiteTariffChange(next);
              }}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium',
                tariffInputMode === mode ? 'bg-background shadow-sm ring-1 ring-border/70' : 'text-muted-foreground',
                mode === 'automatic' && 'cursor-not-allowed opacity-50'
              )}
            >
              {mode === 'automatic' ? (
                <span className="flex flex-col items-center gap-0.5 leading-tight">
                  <span>Automático pela ANEEL</span>
                  <span className="text-[11px] font-normal">Em breve</span>
                </span>
              ) : 'Manual'}
            </button>
          ))}
        </div>
      </div>

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

      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-sm font-semibold">1. Consumo</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="whiteTariffTotalConsumption">Consumo total mensal (kWh/mês)</Label>
            <Input id="whiteTariffTotalConsumption" type="number" min={0} step={0.01} inputMode="decimal" placeholder="Ex.: 450"
              aria-invalid={Boolean(fieldError('totalMonthlyConsumptionKwh'))}
              aria-describedby={fieldDescription('totalMonthlyConsumptionKwh')}
              value={whiteTotalMonthlyKwh || ''}
              onChange={(event) => {
                const totalMonthlyConsumptionKwh = Number(event.target.value) || 0;
                onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), totalMonthlyConsumptionKwh });
                setFieldErrors((current) => ({ ...current, totalMonthlyConsumptionKwh: undefined }));
              }}
              onBlur={() => validateAndSet('totalMonthlyConsumptionKwh')}/>
            <FieldError id="totalMonthlyConsumptionKwh-error" message={fieldError('totalMonthlyConsumptionKwh')} />
            <p className="text-xs text-muted-foreground">Use o consumo total exibido na fatura, sem depender da configuração Fotovoltaico.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whiteTariffPower">Potência máxima nos horários caros (kW)</Label>
            <Input id="whiteTariffPower" type="number" min={0} step={0.01} inputMode="decimal" placeholder="Ex.: 3,0"
              aria-invalid={Boolean(fieldError('requiredPowerW'))}
              aria-describedby={fieldDescription('requiredPowerW')}
              value={whiteTariff?.requiredPowerW ? whiteTariff.requiredPowerW / 1000 : ''}
              onChange={(event) => {
                onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), requiredPowerW: (Number(event.target.value) || 0) * 1000 });
                setFieldErrors((current) => ({ ...current, requiredPowerW: undefined }));
              }}
              onBlur={() => validateAndSet('requiredPowerW')}/>
            <FieldError id="requiredPowerW-error" message={fieldError('requiredPowerW')} />
            <p className="text-xs text-muted-foreground">Maior potência simultânea que a bateria deverá atender na ponta ou intermediária.</p>
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
        <p className="text-sm font-semibold">2. Distribuição e tarifas</p>
        <div className="rounded-lg border bg-background p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-destructive" />
            Ponta
            {whiteTariff?.manuallyEditedFields?.includes('pontaTariffPerKwh') && (
              <span className="ml-auto text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded">
                Alterado manualmente
              </span>
            )}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <WhiteTariffEnergyField
                id="whiteTariffPontaEnergy"
                section="Ponta"
                businessDays={whiteBusinessDays}
                energyWh={whiteTariff?.pontaEnergyWh ?? 0}
                error={fieldError('pontaEnergyWh')}
                onBlur={() => validateAndSet('pontaEnergyWh')}
                onChange={(pontaEnergyWh) =>
                  (onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), pontaEnergyWh }), setFieldErrors((current) => ({ ...current, pontaEnergyWh: undefined })))
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
                inputMode="decimal"
                placeholder="Ex.: 1.20"
                aria-invalid={Boolean(fieldError('pontaTariffPerKwh'))}
                aria-describedby={fieldDescription('pontaTariffPerKwh')}
                value={whiteTariff?.pontaTariffPerKwh || ''}
                onChange={(event) => {
                  markFieldAsEdited('pontaTariffPerKwh');
                  onWhiteTariffChange({
                    ...(whiteTariff ?? emptyWhiteTariffConfig),
                    pontaTariffPerKwh: Number(event.target.value) || 0,
                  });
                  setFieldErrors((current) => ({ ...current, pontaTariffPerKwh: undefined }));
                }}
                onBlur={() => validateAndSet('pontaTariffPerKwh')}
              />
              <FieldError id="pontaTariffPerKwh-error" message={fieldError('pontaTariffPerKwh')} />
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
            {whiteTariff?.manuallyEditedFields?.includes('intermediateTariffPerKwh') && (
              <span className="ml-auto text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded">
                Alterado manualmente
              </span>
            )}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <WhiteTariffEnergyField
                id="whiteTariffIntermediateEnergy"
                section="Intermediária"
                businessDays={whiteBusinessDays}
                energyWh={whiteTariff?.intermediateEnergyWh ?? 0}
                error={fieldError('intermediateEnergyWh')}
                onBlur={() => validateAndSet('intermediateEnergyWh')}
                onChange={(intermediateEnergyWh) =>
                  (onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), intermediateEnergyWh }), setFieldErrors((current) => ({ ...current, intermediateEnergyWh: undefined })))
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
                inputMode="decimal"
                placeholder="Ex.: 0.95"
                aria-invalid={Boolean(fieldError('intermediateTariffPerKwh'))}
                aria-describedby={fieldDescription('intermediateTariffPerKwh')}
                value={whiteTariff?.intermediateTariffPerKwh || ''}
                onChange={(event) => {
                  markFieldAsEdited('intermediateTariffPerKwh');
                  onWhiteTariffChange({
                    ...(whiteTariff ?? emptyWhiteTariffConfig),
                    intermediateTariffPerKwh: Number(event.target.value) || 0,
                  });
                  setFieldErrors((current) => ({ ...current, intermediateTariffPerKwh: undefined }));
                }}
                onBlur={() => validateAndSet('intermediateTariffPerKwh')}
              />
              <FieldError id="intermediateTariffPerKwh-error" message={fieldError('intermediateTariffPerKwh')} />
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
            {whiteTariff?.manuallyEditedFields?.includes('foraPontaTariffPerKwh') && (
              <span className="ml-auto text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded">
                Alterado manualmente
              </span>
            )}
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Energia calculada</p>
              <p className="min-h-8 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm font-medium tabular-nums">
                {summaryReady ? `${whiteOffPeakMonthlyKwh.toFixed(1)} kWh/mês` : '—'}
              </p>
              {summaryReady && <p className="text-xs text-muted-foreground">{whiteOffPeakDailyKwh.toFixed(2)} kWh/dia</p>}
              <p className="text-xs text-muted-foreground">Consumo total − ponta − intermediária</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whiteTariffForaPonta"><span className="sr-only">Fora ponta · </span>Tarifa (R$/kWh)</Label>
              <Input
                id="whiteTariffForaPonta"
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                placeholder="Ex.: 0.75"
                aria-invalid={Boolean(fieldError('foraPontaTariffPerKwh'))}
                aria-describedby={fieldDescription('foraPontaTariffPerKwh')}
                value={whiteTariff?.foraPontaTariffPerKwh || ''}
                onChange={(event) => {
                  markFieldAsEdited('foraPontaTariffPerKwh');
                  onWhiteTariffChange({
                    ...(whiteTariff ?? emptyWhiteTariffConfig),
                    foraPontaTariffPerKwh: Number(event.target.value) || 0,
                  });
                  setFieldErrors((current) => ({ ...current, foraPontaTariffPerKwh: undefined }));
                }}
                onBlur={() => validateAndSet('foraPontaTariffPerKwh')}
              />
              <FieldError id="foraPontaTariffPerKwh-error" message={fieldError('foraPontaTariffPerKwh')} />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A energia fora ponta é calculada automaticamente: consumo total mensal menos ponta e intermediária.
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
            Preencha os campos obrigatórios para visualizar a estimativa. A energia de ponta e intermediária não pode superar o consumo total.
          </p>
        )}
        {whiteTariff && <div className="rounded-lg border bg-primary/[0.03] p-3" aria-live="polite">
          <p className="text-sm font-semibold">Resumo instantâneo</p>
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
            <div><p className="text-xs text-muted-foreground">Fora de ponta</p><strong>{summaryReady ? `${whiteOffPeakMonthlyKwh.toFixed(1)} kWh/mês` : '—'}</strong></div>
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
          <p className="mt-3 text-xs text-muted-foreground">A estimativa final usa a capacidade, RTE, SOH, limites de potência e consumo em espera dos produtos selecionados.</p>
        </div>}
        <details className="rounded-lg border bg-background p-3 text-sm">
          <summary className="cursor-pointer font-medium">Premissas do cálculo</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="whiteBusinessDays">Dias úteis/mês</Label><Input id="whiteBusinessDays" type="number" min={1} max={31} value={whiteBusinessDays} onChange={(event) => onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), businessDaysPerMonth: Number(event.target.value) || 22 })}/></div>
            <div className="space-y-1.5"><Label htmlFor="whitePontaHours">Janela de ponta (h)</Label><Input id="whitePontaHours" type="number" min={0.25} max={24} step={0.25} value={whiteTariff?.pontaWindowHours ?? 3} onChange={(event) => onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), pontaWindowHours: Number(event.target.value) || 3 })}/></div>
            <div className="space-y-1.5"><Label htmlFor="whiteIntermediateHours">Janela intermediária (h)</Label><Input id="whiteIntermediateHours" type="number" min={0.25} max={24} step={0.25} value={whiteTariff?.intermediateWindowHours ?? 2} onChange={(event) => onWhiteTariffChange({ ...(whiteTariff ?? emptyWhiteTariffConfig), intermediateWindowHours: Number(event.target.value) || 2 })}/></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Por padrão são usados 22 dias úteis, 3 horas de ponta e 2 horas intermediárias. Ajuste conforme a distribuidora e o calendário local.</p>
        </details>
      </div>
    </div>
  );
}
