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
import { TooltipBubble, useTooltipFlip } from '@/components/ui/tooltip';
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
  isGeneratorPowerInsufficient,
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
  powerNoticeAcknowledged: false,
};

const emptyGeneratorConfig: GeneratorConfig = {
  voltageV: 220,
  phases: 1,
  apparentPowerVA: 0,
  photoUrl: null,
  ownAtsAcknowledged: false,
};

const emptyPvConfig: PvConfig = {
  monthlyConsumptionKwh: 0,
  hsp: 0,
};

const featureIcons: Record<DesiredFeatureId, LucideIcon> = {
  backup: HousePlug,
  external_ats: ShieldCheck,
  microgrid: Network,
  external_generator: Fuel,
  pv: Sun,
  white_tariff: Clock,
};

function FeatureTabButton({
  id,
  label,
  description,
  enabled,
  hasIssue,
  isActiveTab,
  onClick,
}: {
  id: DesiredFeatureId;
  label: string;
  description: string;
  enabled: boolean;
  hasIssue: boolean;
  isActiveTab: boolean;
  onClick: () => void;
}) {
  const Icon = featureIcons[id];
  const { ref, openUp, visible, onMouseEnter, onMouseLeave, onFocus, onBlur } = useTooltipFlip<HTMLButtonElement>();
  const tooltip = hasIssue
    ? `${description ? `${description} ` : ''}Há algo pendente de revisão nesta aba — confira antes de calcular.`
    : description;
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={isActiveTab}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        'group relative flex h-16 min-w-[7.5rem] flex-1 items-center justify-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-14',
        isActiveTab
          ? 'border-primary bg-primary/[0.06] text-foreground'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground',
        hasIssue && 'tab-alert-pulse ring-1 ring-destructive/50'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActiveTab && 'text-primary')} aria-hidden="true" />
      <span className="whitespace-nowrap">{label}</span>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
        {hasIssue ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        ) : enabled ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        ) : (
          <span className="h-2 w-2 rounded-full border border-muted-foreground/40" />
        )}
      </span>
      {tooltip && (
        <TooltipBubble triggerRef={ref} openUp={openUp} visible={visible}>
          {tooltip}
        </TooltipBubble>
      )}
    </button>
  );
}

function formatMonthlyKwh(energyWh: number): string {
  if (!energyWh) return '';
  return String(Math.round(((energyWh * TARIFF_BUSINESS_DAYS_PER_MONTH) / 1000) * 100) / 100);
}

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
}: {
  id: string;
  section: string;
  energyWh: number;
  onChange: (energyWh: number) => void;
}) {
  const [text, setText] = useState(() => formatMonthlyKwh(energyWh));
  const lastEmittedRef = useRef(energyWh);

  useEffect(() => {
    if (energyWh !== lastEmittedRef.current) {
      lastEmittedRef.current = energyWh;
      setText(formatMonthlyKwh(energyWh));
    }
  }, [energyWh]);

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
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          const wh = Math.round(((Number(raw) || 0) * 1000) / TARIFF_BUSINESS_DAYS_PER_MONTH);
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
  onActiveTabChange,
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
  inverterCatalog,
  availableInverterModels,
  selectedInverterModel,
  gridType,
  peakW,
  nominalW,
  dailyKwh,
}: {
  activeTab: DesiredFeatureId;
  onActiveTabChange: (id: DesiredFeatureId) => void;
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

  function hasPendingIssue(id: DesiredFeatureId): boolean {
    return desiredFeatureHasPendingIssue(id, value, {
      microgrid,
      generator,
      pv,
      atsBackupAcknowledged,
      gridType,
      peakW,
      loadsCount,
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
      <div
        className="flex overflow-x-auto border-b bg-background/60"
        role="tablist"
        aria-label="Funcionalidades desejadas"
      >
        {tabs.map((tab) => (
          <FeatureTabButton
            key={tab.id}
            id={tab.id}
            label={tab.label}
            description={tab.description}
            enabled={value.includes(tab.id)}
            hasIssue={hasPendingIssue(tab.id)}
            isActiveTab={activeTab === tab.id}
            onClick={() => onActiveTabChange(tab.id)}
          />
        ))}
      </div>

      {/* The Backup tab's own content (LoadSelector) is already a rich set of
       * bordered sections on its own — wrapping it in another card here just
       * nests boxes. Every other feature tab is simple enough (description +
       * toggle, maybe one config panel) to still want the card framing. */}
      <div className={cn('space-y-4', !isBackupTab && 'rounded-xl border bg-background p-4')}>
        <div className="flex items-start justify-between gap-3 border-b pb-4">
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
          <div className="space-y-1.5">
            <Label htmlFor="whiteTariffPower">Potência (W)</Label>
            <Input
              id="whiteTariffPower"
              type="number"
              min={0}
              placeholder="Ex.: 3000"
              value={whiteTariff?.requiredPowerW || ''}
              onChange={(event) =>
                onWhiteTariffChange({
                  ...(whiteTariff ?? emptyWhiteTariffConfig),
                  requiredPowerW: Number(event.target.value) || 0,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <div className="rounded-lg border bg-background p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-destructive" />
                Ponta
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <WhiteTariffEnergyField
                    id="whiteTariffPontaEnergy"
                    section="Ponta"
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
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <WhiteTariffEnergyField
                    id="whiteTariffIntermediateEnergy"
                    section="Intermediária"
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
              <div className="mt-2 max-w-[calc(50%-0.375rem)] space-y-1.5">
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
          </div>
          </div>
        )}

        {isActiveEnabled && activeTab === 'microgrid' && (
          <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Dados do sistema ongrid existente a ser conectado.</p>
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
          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="microgridPower">Potência (VA)</Label>
              <Input
                id="microgridPower"
                type="number"
                min={0}
                placeholder="Ex.: 3000"
                value={microgrid?.onGridApparentPowerVA || ''}
                onChange={(event) =>
                  onMicrogridChange({
                    ...(microgrid ?? emptyMicrogridConfig),
                    onGridApparentPowerVA: Number(event.target.value) || 0,
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
          <label
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-xs transition-colors',
              microgrid?.powerNoticeAcknowledged
                ? 'border-border bg-background'
                : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={microgrid?.powerNoticeAcknowledged ?? false}
              onChange={(event) =>
                onMicrogridChange({
                  ...(microgrid ?? emptyMicrogridConfig),
                  powerNoticeAcknowledged: event.target.checked,
                })
              }
            />
            <span className="flex items-start gap-1.5">
              {!microgrid?.powerNoticeAcknowledged && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>
                {microgrid?.powerNoticeAcknowledged
                  ? 'Confirmado: a potência do sistema ongrid é menor que a do inversor e das baterias da solução.'
                  : 'A potência do sistema ongrid deve ser menor que a do inversor e das baterias da solução.'}
              </span>
            </span>
          </label>
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
          <InverterSupportSummary
            flag="external_generator"
            featureLabel="Gerador Externo"
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
          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="generatorPower">Potência (VA)</Label>
              <Input
                id="generatorPower"
                type="number"
                min={0}
                placeholder="Ex.: 5000"
                value={generator?.apparentPowerVA || ''}
                onChange={(event) =>
                  onGeneratorChange({
                    ...(generator ?? emptyGeneratorConfig),
                    apparentPowerVA: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          {isGeneratorPowerInsufficient(value, generator, peakW) && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Potência do gerador insuficiente para carregar as baterias
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
