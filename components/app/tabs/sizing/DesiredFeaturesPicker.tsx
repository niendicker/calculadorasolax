'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Battery,
  BatteryCharging,
  Check,
  Clock,
  Fuel,
  Gauge,
  HousePlug,
  Layers,
  Moon,
  Network,
  ShieldCheck,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import type {
  DesiredFeatureId,
  GeneratorConfig,
  MicrogridConfig,
  PvConfig,
  ResidentialGridType,
  WhiteTariffConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  TARIFF_BUSINESS_DAYS_PER_MONTH,
  calculateTariffSavings,
  generatorActivePowerW,
  isGeneratorPowerInsufficient,
  isWhiteTariffConfigIncomplete,
  recommendedGeneratorActivePowerW,
  recommendedGeneratorApparentPowerVA,
  recommendedMicrogridSupportPowerW,
} from '../../helpers';
import { Metric } from '../../shared-ui';
import type { InverterCatalogOption } from '../../types';
import { desiredFeatureHasPendingIssue } from './feature-status';
import { InverterSupportSummary } from './InverterSupportSummary';
import {
  PhasePicker,
  PhaseVoltageCompatibilityWarning,
  VoltagePicker,
  defaultPhaseVoltageForGridType,
  recommendedPhases,
  recommendedVoltageForPhase,
  voltageOptionsForPhases,
} from './PhaseVoltagePicker';
import { PhotoUploadField } from './PhotoUploadField';

const emptyWhiteTariffConfig: WhiteTariffConfig = {
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

const emptyMicrogridConfig: MicrogridConfig = {
  voltageV: 220,
  onGridPhases: 1,
  onGridApparentPowerVA: 0,
  // The wizard no longer lets the user opt out of this — enabling
  // Microrrede always means it's a fundamental requirement now.
  isFundamentalRequirement: true,
  photoUrl: null,
  powerNoticeAcknowledged: true,
};

const emptyGeneratorConfig: GeneratorConfig = {
  voltageV: 220,
  phases: 1,
  apparentPowerVA: 0,
  powerFactor: 0.8,
  safetyMarginPercent: 20,
  photoUrl: null,
  ownAtsAcknowledged: false,
};

const emptyPvConfig: PvConfig = {
  monthlyConsumptionKwh: 0,
  hsp: 0,
};

export const featureIcons: Record<DesiredFeatureId, LucideIcon> = {
  backup: HousePlug,
  external_ats: ShieldCheck,
  microgrid: Network,
  external_generator: Fuel,
  pv: Sun,
  white_tariff: Clock,
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

export function DesiredFeaturesPicker({
  activeTab,
  value,
  onChange,
  whiteTariff,
  onWhiteTariffChange,
  microgrid,
  onMicrogridChange,
  generator,
  onGeneratorChange,
  pv,
  onPvChange,
  atsPhotoUrl,
  onAtsPhotoUrlChange,
  atsBackupAcknowledged,
  onAtsBackupAcknowledgedChange,
  onUploadPhoto,
  loadsCount,
  operationHours,
  inverterCatalog,
  availableInverterModels,
  selectedInverterModel,
  gridType,
  peakW,
  nominalW,
  dailyKwh,
}: {
  activeTab: DesiredFeatureId;
  value: DesiredFeatureId[];
  onChange: (value: DesiredFeatureId[]) => void;
  whiteTariff: WhiteTariffConfig | null;
  onWhiteTariffChange: (whiteTariff: WhiteTariffConfig | null) => void;
  microgrid: MicrogridConfig | null;
  onMicrogridChange: (microgrid: MicrogridConfig | null) => void;
  generator: GeneratorConfig | null;
  onGeneratorChange: (generator: GeneratorConfig | null) => void;
  pv: PvConfig | null;
  onPvChange: (pv: PvConfig | null) => void;
  atsPhotoUrl: string | null;
  onAtsPhotoUrlChange: (atsPhotoUrl: string | null) => void;
  atsBackupAcknowledged: boolean;
  onAtsBackupAcknowledgedChange: (atsBackupAcknowledged: boolean) => void;
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
  loadsCount: number;
  operationHours: number;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  selectedInverterModel: string | null;
  gridType: ResidentialGridType | null;
  peakW: number;
  nominalW: number;
  dailyKwh: number;
}) {
  const tabs = DESIRED_FEATURE_DEFINITIONS;
  const activeFeature = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const ActiveFeatureIcon = featureIcons[activeTab];
  const isBackupTab = activeTab === 'backup';
  const isActiveEnabled = value.includes(activeTab);
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
  const generatorPowerFactor = generator?.powerFactor ?? 0.8;
  const generatorSafetyMargin = generator?.safetyMarginPercent ?? 20;
  const generatorAvailableW = generatorActivePowerW(generator);
  const generatorRecommendedW = recommendedGeneratorActivePowerW(peakW, generatorSafetyMargin);
  const generatorRecommendedVA = recommendedGeneratorApparentPowerVA(peakW, generatorPowerFactor, generatorSafetyMargin);
  const generatorChargingReserveW = Math.max(0, generatorAvailableW - peakW);
  const microgridExistingPowerW = microgrid?.onGridApparentPowerVA ?? 0;
  const microgridRequiredPowerW = recommendedMicrogridSupportPowerW(microgridExistingPowerW);
  const microgridRequiredPerPhaseW = microgridRequiredPowerW / (microgrid?.onGridPhases ?? 1);

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

  function hasPendingIssue(id: DesiredFeatureId): boolean {
    return desiredFeatureHasPendingIssue(id, value, {
      microgrid,
      generator,
      pv,
      whiteTariff,
      atsBackupAcknowledged,
      gridType,
      peakW,
      loadsCount,
      operationHours,
      inverterCatalog,
      availableInverterModels,
      selectedInverterModel,
    });
  }

  function toggle(id: DesiredFeatureId) {
    if (value.includes(id)) {
      onChange(value.filter((item) => item !== id));
      if (id === 'white_tariff') onWhiteTariffChange(null);
      if (id === 'microgrid') onMicrogridChange(null);
      if (id === 'external_generator') onGeneratorChange(null);
      if (id === 'pv') onPvChange(null);
    } else {
      onChange([...value, id]);
      if (id === 'white_tariff' && !whiteTariff) onWhiteTariffChange(emptyWhiteTariffConfig);
      if (id === 'microgrid' && !microgrid) {
        const defaults = defaultPhaseVoltageForGridType(gridType);
        onMicrogridChange({ ...emptyMicrogridConfig, onGridPhases: defaults.phases, voltageV: defaults.voltage });
      }
      if (id === 'external_generator' && !generator) {
        const defaults = defaultPhaseVoltageForGridType(gridType);
        onGeneratorChange({ ...emptyGeneratorConfig, phases: defaults.phases, voltageV: defaults.voltage });
      }
      if (id === 'pv' && !pv) onPvChange(emptyPvConfig);
    }
  }

  return (
    <div className="space-y-3">
      {/* The Backup tab's own content (LoadSelector) is already a rich set of
       * bordered sections on its own — wrapping it in another card here just
       * nests boxes. Every other feature tab is simple enough (description +
       * toggle, maybe one config panel) to still want the card framing. */}
      <div className={cn('space-y-4', !isBackupTab && 'rounded-xl border bg-background p-4')}>
        <div className={cn('flex items-start justify-between gap-3', isActiveEnabled && 'border-b pb-4')}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
                isActiveEnabled && 'bg-primary/10 text-primary'
              )}
            >
              <ActiveFeatureIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold">{activeFeature.label}</p>
              <Badge
                variant="outline"
                className={cn(
                  hasPendingIssue(activeTab)
                    ? 'border-destructive/30 bg-destructive/5 text-destructive'
                    : isActiveEnabled
                      ? 'border-primary/30 bg-primary/5 text-primary'
                      : 'text-muted-foreground'
                )}
              >
                {hasPendingIssue(activeTab) ? 'Requer atenção' : isActiveEnabled ? 'Ativo' : 'Desativado'}
              </Badge>
            </div>
            {isBackupTab ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Selecione os equipamentos que precisam permanecer ligados durante uma falta de energia.
              </p>
            ) : (
              activeFeature.description && (
                <p className="mt-1 text-xs text-muted-foreground">{activeFeature.description}</p>
              )
            )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant={isActiveEnabled ? 'default' : 'outline'}
              size="sm"
              className="min-w-28"
              onClick={() => toggle(activeTab)}
            >
              {isActiveEnabled ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Habilitado
                </>
              ) : (
                'Habilitar'
              )}
            </Button>
          </div>
        </div>

        {isBackupTab && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Resumo das cargas cadastradas">
            <Metric icon={Gauge} label="Nominal" value={(nominalW / 1000).toFixed(2)} unit="kVA" />
            <Metric icon={Zap} label="Máxima" value={(peakW / 1000).toFixed(2)} unit="kVA" />
            <Metric icon={BatteryCharging} label="Energia" value={dailyKwh.toFixed(2)} unit="kWh/dia" />
            <Metric icon={Layers} label="Cargas" value={String(loadsCount)} />
          </div>
        )}

        {isBackupTab && isActiveEnabled && <LoadSelector defaultToMine />}

        {isActiveEnabled && activeTab === 'external_ats' && (
          <div className="space-y-3">
            <InverterSupportSummary
              flag="external_ats"
              featureLabel="Backup Total"
              inverterCatalog={inverterCatalog}
              availableInverterModels={availableInverterModels}
              selectedInverterModel={selectedInverterModel}
            />
            <label
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                atsBackupAcknowledged
                  ? 'border-border bg-background'
                  : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={atsBackupAcknowledged}
                onChange={(event) => onAtsBackupAcknowledgedChange(event.target.checked)}
              />
              <span className="flex items-start gap-1.5">
                {!atsBackupAcknowledged && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  {atsBackupAcknowledged
                    ? 'Confirmado: um QTA é usado para backup total.'
                    : 'Um QTA deve ser usado para backup total.'}
                </span>
              </span>
            </label>
            <PhotoUploadField
              label="Foto do disjuntor geral"
              photoUrl={atsPhotoUrl}
              slot="ats"
              onUploadPhoto={onUploadPhoto}
              onChange={onAtsPhotoUrlChange}
            />
          </div>
        )}

        {isActiveEnabled && activeTab === 'white_tariff' && (
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
        )}

        {isActiveEnabled && activeTab === 'microgrid' && (
          <div className="space-y-3">
          <div className="rounded-lg border bg-primary/[0.03] px-3 py-2 text-sm">
            <p className="font-medium">Sistema fotovoltaico existente</p>
            <p className="mt-1 text-xs text-muted-foreground">A Microrrede conecta e mantém operando um inversor on-grid já instalado. Para dimensionar um novo arranjo, use a funcionalidade Fotovoltaico.</p>
          </div>
          <InverterSupportSummary
            flag="microgrid"
            featureLabel="microrrede"
            inverterCatalog={inverterCatalog}
            availableInverterModels={availableInverterModels}
            selectedInverterModel={selectedInverterModel}
          />
          <div className="space-y-1.5">
            <Label>Fases</Label>
            <PhasePicker
              value={microgrid?.onGridPhases ?? 1}
              ariaLabel="Fases do sistema ongrid"
              recommendedValues={recommendedPhases(gridType, microgrid?.onGridPhases ?? 1, microgrid?.voltageV ?? 220, true)}
              onChange={(phases) => {
                const validVoltages = voltageOptionsForPhases(phases).map((option) => option.value);
                const currentVoltage = microgrid?.voltageV ?? 220;
                onMicrogridChange({
                  ...(microgrid ?? emptyMicrogridConfig),
                  onGridPhases: phases,
                  voltageV: validVoltages.includes(currentVoltage as 220 | 380) ? currentVoltage : validVoltages[0],
                });
              }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tensão</Label>
              <VoltagePicker
                value={microgrid?.voltageV ?? 220}
                phases={microgrid?.onGridPhases ?? 1}
                ariaLabel="Tensão do sistema ongrid"
                recommendedValue={recommendedVoltageForPhase(
                  gridType,
                  microgrid?.onGridPhases ?? 1,
                  microgrid?.voltageV ?? 220,
                  true
                )}
                onChange={(voltageV) =>
                  onMicrogridChange({
                    ...(microgrid ?? emptyMicrogridConfig),
                    voltageV,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="microgridPower">Potência nominal AC (kW)</Label>
              <Input
                id="microgridPower"
                type="number"
                min={0}
                step={0.1}
                placeholder="Ex.: 5,0"
                value={microgrid?.onGridApparentPowerVA ? microgrid.onGridApparentPowerVA / 1000 : ''}
                onChange={(event) =>
                  onMicrogridChange({
                    ...(microgrid ?? emptyMicrogridConfig),
                    onGridApparentPowerVA: (Number(event.target.value) || 0) * 1000,
                  })
                }
              />
            </div>
          </div>
          <PhaseVoltageCompatibilityWarning
            gridType={gridType}
            phases={microgrid?.onGridPhases ?? 1}
            voltageV={microgrid?.voltageV ?? 220}
            forMicrogrid
          />
          {!microgridExistingPowerW && <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>Informe a potência nominal AC do inversor on-grid existente.</p>}
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Resumo instantâneo</p><Badge variant="outline" className={microgridExistingPowerW ? 'border-primary/30 text-primary' : 'text-muted-foreground'}>{microgridExistingPowerW ? 'Limite calculado' : 'Potência pendente'}</Badge></div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Sistema existente</p><strong>{(microgridExistingPowerW / 1000).toFixed(2)} kW</strong></div>
              <div><p className="text-xs text-muted-foreground">Margem aplicada</p><strong>20%</strong></div>
              <div><p className="text-xs text-muted-foreground">Inversor e baterias</p><strong>mín. {(microgridRequiredPowerW / 1000).toFixed(2)} kW</strong></div>
              <div><p className="text-xs text-muted-foreground">Limite por fase</p><strong>mín. {(microgridRequiredPerPhaseW / 1000).toFixed(2)} kW/fase</strong></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">A solução final é validada automaticamente contra a potência nominal, a potência das baterias e o limite de cada fase.</p>
          </div>
          <PhotoUploadField
            label="Foto da etiqueta do inversor ongrid"
            photoUrl={microgrid?.photoUrl ?? null}
            slot="microgrid"
            onUploadPhoto={onUploadPhoto}
            onChange={(photoUrl) => onMicrogridChange({ ...(microgrid ?? emptyMicrogridConfig), photoUrl })}
          />
          </div>
        )}

        {isActiveEnabled && activeTab === 'external_generator' && (
          <div className="space-y-3">
          <div className="rounded-lg border bg-primary/[0.03] px-3 py-2 text-sm">
            <p className="font-medium">Operação combinada</p>
            <p className="mt-1 text-xs text-muted-foreground">O gerador alimenta as cargas e usa a potência restante para carregar as baterias.</p>
          </div>
          <InverterSupportSummary
            flag="external_generator"
              featureLabel="Gerador"
            inverterCatalog={inverterCatalog}
            availableInverterModels={availableInverterModels}
            selectedInverterModel={selectedInverterModel}
          />
          <div className="space-y-1.5">
            <Label>Fases</Label>
            <PhasePicker
              value={generator?.phases ?? 1}
              ariaLabel="Fases do gerador"
              recommendedValues={recommendedPhases(gridType, generator?.phases ?? 1, generator?.voltageV ?? 220, false)}
              onChange={(phases) => {
                const validVoltages = voltageOptionsForPhases(phases).map((option) => option.value);
                const currentVoltage = generator?.voltageV ?? 220;
                onGeneratorChange({
                  ...(generator ?? emptyGeneratorConfig),
                  phases,
                  voltageV: validVoltages.includes(currentVoltage as 220 | 380) ? currentVoltage : validVoltages[0],
                });
              }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tensão</Label>
              <VoltagePicker
                value={generator?.voltageV ?? 220}
                phases={generator?.phases ?? 1}
                ariaLabel="Tensão do gerador"
                recommendedValue={recommendedVoltageForPhase(
                  gridType,
                  generator?.phases ?? 1,
                  generator?.voltageV ?? 220,
                  false
                )}
                onChange={(voltageV) =>
                  onGeneratorChange({
                    ...(generator ?? emptyGeneratorConfig),
                    voltageV,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="generatorPower">Potência nominal (kVA)</Label>
              <Input
                id="generatorPower"
                type="number"
                min={0}
                step={0.1}
                placeholder="Ex.: 8,5"
                value={generator?.apparentPowerVA ? generator.apparentPowerVA / 1000 : ''}
                onChange={(event) =>
                  onGeneratorChange({
                    ...(generator ?? emptyGeneratorConfig),
                    apparentPowerVA: (Number(event.target.value) || 0) * 1000,
                  })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="generatorPowerFactor">Fator de potência</Label>
              <Input id="generatorPowerFactor" type="number" min={0.1} max={1} step={0.01}
                value={generatorPowerFactor}
                onChange={(event) => onGeneratorChange({ ...(generator ?? emptyGeneratorConfig), powerFactor: Math.max(0.1, Math.min(1, Number(event.target.value) || 0.8)) })}/>
              <p className="text-xs text-muted-foreground">Use o valor da placa; quando desconhecido, adota-se 0,80.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="generatorMargin">Margem para recarga e operação (%)</Label>
              <Input id="generatorMargin" type="number" min={0} max={100} step={1}
                value={generatorSafetyMargin}
                onChange={(event) => onGeneratorChange({ ...(generator ?? emptyGeneratorConfig), safetyMarginPercent: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })}/>
              <p className="text-xs text-muted-foreground">Reserva acima do pico das cargas; recomendação padrão de 20%.</p>
            </div>
          </div>
          {isGeneratorPowerInsufficient(value, generator, peakW) && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              O gerador fornece aproximadamente {(generatorAvailableW / 1000).toFixed(2)} kW, mas são recomendados {(generatorRecommendedW / 1000).toFixed(2)} kW para cargas e margem. Considere pelo menos {(generatorRecommendedVA / 1000).toFixed(1)} kVA com fator de potência {generatorPowerFactor.toFixed(2)}.
            </p>
          )}
          <PhaseVoltageCompatibilityWarning
            gridType={gridType}
            phases={generator?.phases ?? 1}
            voltageV={generator?.voltageV ?? 220}
            forMicrogrid={false}
          />
          <label
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
              generator?.ownAtsAcknowledged
                ? 'border-border bg-background'
                : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={generator?.ownAtsAcknowledged ?? false}
              onChange={(event) =>
                onGeneratorChange({
                  ...(generator ?? emptyGeneratorConfig),
                  ownAtsAcknowledged: event.target.checked,
                })
              }
            />
            <span className="flex items-start gap-1.5">
              {!generator?.ownAtsAcknowledged && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>
                {generator?.ownAtsAcknowledged ? (
                  <>
                    <span className="font-medium">Confirmado:</span> o gerador externo tem a própria chave ATS.
                  </>
                ) : (
                  <>
                    <span className="font-medium">Ciente:</span> O gerador externo precisa ter a própria chave ATS.
                  </>
                )}
              </span>
            </span>
          </label>
          <PhotoUploadField
            label="Foto da etiqueta do gerador"
            photoUrl={generator?.photoUrl ?? null}
            slot="generator"
            onUploadPhoto={onUploadPhoto}
            onChange={(photoUrl) => onGeneratorChange({ ...(generator ?? emptyGeneratorConfig), photoUrl })}
          />
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Resumo instantâneo</p>
              <Badge variant="outline" className={cn(isGeneratorPowerInsufficient(value, generator, peakW) ? 'border-destructive/30 text-destructive' : generator?.apparentPowerVA ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
                {!generator?.apparentPowerVA ? 'Potência pendente' : isGeneratorPowerInsufficient(value, generator, peakW) ? 'Abaixo do recomendado' : 'Dentro do limite'}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Potência ativa</p><strong>{(generatorAvailableW / 1000).toFixed(2)} kW</strong></div>
              <div><p className="text-xs text-muted-foreground">Pico das cargas</p><strong>{(peakW / 1000).toFixed(2)} kW</strong></div>
              <div><p className="text-xs text-muted-foreground">Reserva para recarga</p><strong>{(generatorChargingReserveW / 1000).toFixed(2)} kW</strong></div>
              <div><p className="text-xs text-muted-foreground">Gerador recomendado</p><strong>{(generatorRecommendedVA / 1000).toFixed(1)} kVA</strong></div>
            </div>
          </div>
          </div>
        )}

        {isActiveEnabled && activeTab === 'pv' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A potência do arranjo é calculada a partir do consumo e do HSP informados abaixo — não das cargas
              cadastradas — e nunca ultrapassa o sobredimensionamento permitido pelo inversor recomendado.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pvMonthlyConsumption">Consumo médio mensal (kWh)</Label>
                <Input
                  id="pvMonthlyConsumption"
                  type="number"
                  min={0}
                  placeholder="Ex.: 450"
                  value={pv?.monthlyConsumptionKwh || ''}
                  onChange={(event) =>
                    onPvChange({ ...(pv ?? emptyPvConfig), monthlyConsumptionKwh: Number(event.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pvHsp">HSP da instalação (h/dia)</Label>
                <Input
                  id="pvHsp"
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder="Ex.: 4.5"
                  value={pv?.hsp || ''}
                  onChange={(event) => onPvChange({ ...(pv ?? emptyPvConfig), hsp: Number(event.target.value) || 0 })}
                />
              </div>
            </div>
            {(!pv?.monthlyConsumptionKwh || !pv?.hsp) && (
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Informe o consumo médio mensal e o HSP para calcular o FV.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
