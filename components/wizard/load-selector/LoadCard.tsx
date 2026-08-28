'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BatteryCharging, Copy, MoreHorizontal, Plug, Trash2, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteModalButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { InfoLabel, TooltipBubble, useTooltipFlip } from '@/components/ui/tooltip';
import { isLimitError } from '@/lib/limits';
import { gridTypePhaseCount, gridTypePhaseToPhaseVoltages, gridTypeVoltages, loadPhases } from '@/lib/store/wizard-store';
import type { CatalogItem, LoadPhase, PeakCalcMode, ResidentialGridType, SingleLoad, UserLoadCatalogItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MAX_OPERATION_HOURS, setDragPreview } from './load-selector-utils';
import { PhaseTag, TriPhaseDots } from './phase-indicators';

/** Above this IP/IN, the inrush current is high enough that a soft starter
 * or VFD is worth suggesting to smooth the motor's startup — purely an
 * informational nudge, it doesn't change the load's own peak-power math. */
const SOFT_STARTER_IP_IN_THRESHOLD = 3;

function NumberFieldWithClear({
  id,
  value,
  placeholder,
  min,
  max,
  step,
  ariaLabel,
  onChange,
  onBlur,
  onClear,
  wrapperClassName = 'mt-1',
  inputClassName,
}: {
  id?: string;
  value: string;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onClear: () => void;
  /** Defaults to a top margin, for the common case of sitting right below a
   * Label on its own line. Pass e.g. "flex-1" (no margin) when placing this
   * inline next to another control instead. */
  wrapperClassName?: string;
  /** Extra classes for the underlying Input — e.g. to drop its own
   * border/radius when it's grouped visually with an adjacent control. */
  inputClassName?: string;
}) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <Input
        id={id}
        aria-label={ariaLabel}
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={cn('h-10 pr-8 text-base md:h-8 md:pr-6 md:text-xs', inputClassName)}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Limpar campo"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
          className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground md:size-5"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function LoadCard({
  load,
  gridType,
  loadCatalog,
  userLoadCatalog,
  nameKey,
  peakCalcMode,
  operationHours,
  onUpdate,
  onRemove,
  onDuplicate,
  duplicateDisabled,
  saveManualLoadToCatalog,
  onCatalogSaveWarning,
  presetSelectionMode,
  presetSelected,
  onTogglePresetSelected,
}: {
  load: SingleLoad;
  gridType: ResidentialGridType | null;
  loadCatalog: CatalogItem[];
  userLoadCatalog: UserLoadCatalogItem[];
  nameKey: string;
  peakCalcMode: PeakCalcMode;
  operationHours: number;
  onUpdate: (id: string, partial: Partial<SingleLoad>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (load: SingleLoad) => void;
  duplicateDisabled: boolean;
  saveManualLoadToCatalog: (input: { name: string; powerW: number; ipInRatio: number }) => Promise<void>;
  onCatalogSaveWarning: (message: string | null) => void;
  /** When set, clicking the card toggles it in/out of the predefinição being
   * built instead of expanding it for editing — see "Adicionar predefinição"
   * in the Minhas predefinições tab. */
  presetSelectionMode?: boolean;
  presetSelected?: boolean;
  onTogglePresetSelected?: () => void;
}) {
  const [qty, setQty] = useState(String(load.qty));
  const [ipIn, setIpIn] = useState(String(load.ipInRatio ?? 1));
  const [usageFactor, setUsageFactor] = useState(String(load.usageFactor ?? 1));
  const [fixedHours, setFixedHours] = useState(String(load.fixedHours ?? operationHours));
  const usageMode = load.usageMode ?? 'fraction';
  const [expanded, setExpanded] = useState(false);
  const [draftName, setDraftName] = useState(load.name);
  const [draftPower, setDraftPower] = useState(load.powerW ? String(load.powerW) : '');
  const [draftDropdownOpen, setDraftDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const isDraft = load.powerW === 0;
  const {
    ref: powerTipRef,
    openUp: powerTipOpenUp,
    visible: powerTipVisible,
    onMouseEnter: powerTipOnMouseEnter,
    onMouseLeave: powerTipOnMouseLeave,
    onFocus: powerTipOnFocus,
    onBlur: powerTipOnBlur,
  } = useTooltipFlip<HTMLSpanElement>();
  const {
    ref: peakTipRef,
    openUp: peakTipOpenUp,
    visible: peakTipVisible,
    onMouseEnter: peakTipOnMouseEnter,
    onMouseLeave: peakTipOnMouseLeave,
    onFocus: peakTipOnFocus,
    onBlur: peakTipOnBlur,
  } = useTooltipFlip<HTMLSpanElement>();
  const {
    ref: dailyTipRef,
    openUp: dailyTipOpenUp,
    visible: dailyTipVisible,
    onMouseEnter: dailyTipOnMouseEnter,
    onMouseLeave: dailyTipOnMouseLeave,
    onFocus: dailyTipOnFocus,
    onBlur: dailyTipOnBlur,
  } = useTooltipFlip<HTMLSpanElement>();
  const {
    ref: includedToggleTipRef,
    openUp: includedToggleTipOpenUp,
    visible: includedToggleTipVisible,
    onMouseEnter: includedToggleTipOnMouseEnter,
    onMouseLeave: includedToggleTipOnMouseLeave,
    onFocus: includedToggleTipOnFocus,
    onBlur: includedToggleTipOnBlur,
  } = useTooltipFlip<HTMLButtonElement>();

  const draftMatches = useMemo(() => {
    const query = draftName.trim().toLowerCase();
    if (!query) return { mine: [], system: [] };
    return {
      mine: userLoadCatalog.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 5),
      system: loadCatalog
        .filter((item) => (item[nameKey as keyof CatalogItem] as string).toLowerCase().includes(query))
        .slice(0, 5),
    };
  }, [draftName, userLoadCatalog, loadCatalog, nameKey]);

  // Flattened in the same "Minhas" then "Sistema" order they're rendered in,
  // so arrow-key navigation can walk both groups as a single list.
  const draftSuggestionsFlat = useMemo(
    () => [
      ...draftMatches.mine.map((item) => ({ name: item.name, powerW: item.powerW, ipInRatio: item.ipInRatio })),
      ...draftMatches.system.map((item) => ({
        name: item[nameKey as keyof CatalogItem] as string,
        powerW: item.powerW,
        ipInRatio: item.ipInRatio ?? 1,
      })),
    ],
    [draftMatches, nameKey]
  );

  function selectDraftSuggestion(name: string, powerW: number, ipInRatio: number) {
    setDraftName(name);
    setDraftPower(String(powerW));
    setDraftDropdownOpen(false);
    setHighlightedIndex(-1);
    onUpdate(load.id, { name, powerW, ipInRatio });
  }

  function confirmDraft() {
    const parsedPower = Number(draftPower);
    if (!draftName.trim() || !(parsedPower > 0)) return;
    const name = draftName.trim();
    onUpdate(load.id, { name, powerW: parsedPower });
    // A freely typed name/power (as opposed to picking a "Minhas"/"Sistema"
    // suggestion) is a genuinely new load, so save it for reuse next time.
    onCatalogSaveWarning(null);
    saveManualLoadToCatalog({ name, powerW: parsedPower, ipInRatio: 1 }).catch((error) => {
      const message = isLimitError(error)
        ? error.message
        : 'Carga adicionada ao cálculo, mas não foi possível salvá-la em "Minhas Cargas" para reutilizar depois.';
      onCatalogSaveWarning(message);
    });
  }

  const phaseCount = gridType ? gridTypePhaseCount[gridType] : 3;
  const validVoltages = gridType ? gridTypeVoltages[gridType] : [110, 220, 380];
  const phaseToPhaseVoltages = useMemo(
    () => (gridType ? gridTypePhaseToPhaseVoltages[gridType] : []),
    [gridType]
  );
  const phaseType = load.phaseType ?? 'mono';
  const voltageV = load.voltageV ?? 220;
  // A trifásica load draws from all three phases at once, so it can only be
  // rated at the network's phase-to-phase voltage, not the phase-neutral one.
  // A mono load on a 380V three-phase network is always phase-neutral (220V) here;
  // 380V mono would need a phase-to-phase hookup, which this network doesn't offer as an option.
  const voltageOptions =
    phaseType === 'trifasica' && phaseToPhaseVoltages.length > 0
      ? phaseToPhaseVoltages
      : gridType === 'threePhase_380' && phaseType === 'mono'
        ? validVoltages.filter((v) => v !== 380)
        : validVoltages;
  const voltageValid = voltageOptions.includes(voltageV);
  const needsTwoPhases = phaseType === 'mono' && phaseCount > 1 && phaseToPhaseVoltages.includes(voltageV);
  const phase = load.phase ?? 'L1';
  const phasePairs: [LoadPhase, LoadPhase][] = [['L1', 'L2'], ['L2', 'L3'], ['L1', 'L3']];
  const canDragToPhase = phaseType === 'mono' && phaseCount > 1;

  useEffect(() => {
    if (phaseCount < 3 && phaseType === 'trifasica') {
      onUpdate(load.id, { phaseType: 'mono' });
    }
  }, [phaseCount, phaseType, load.id, onUpdate]);

  useEffect(() => {
    if (phaseType === 'trifasica' && phaseToPhaseVoltages.length > 0 && !phaseToPhaseVoltages.includes(voltageV)) {
      onUpdate(load.id, { voltageV: phaseToPhaseVoltages[0] as 110 | 220 | 380 });
    }
  }, [phaseType, phaseToPhaseVoltages, voltageV, load.id, onUpdate]);

  useEffect(() => {
    if (gridType === 'threePhase_380' && phaseType === 'mono' && voltageV === 380) {
      onUpdate(load.id, { voltageV: 220 });
    }
  }, [gridType, phaseType, voltageV, load.id, onUpdate]);

  useEffect(() => {
    if (needsTwoPhases && !load.phase2) {
      onUpdate(load.id, { phase: 'L1', phase2: 'L2' });
    } else if (!needsTwoPhases && load.phase2) {
      onUpdate(load.id, { phase2: null });
    }
  }, [needsTwoPhases, load.phase2, load.id, onUpdate]);

  function handleChange(
    field: 'qty' | 'ipInRatio' | 'usageFactor' | 'fixedHours',
    raw: string,
    setLocal: (value: string) => void
  ) {
    setLocal(raw);
    const parsed = Number(raw);
    const isValid =
      raw.trim() !== '' &&
      Number.isFinite(parsed) &&
      (field === 'usageFactor'
        ? parsed >= 0 && parsed <= 1
        : field === 'fixedHours'
          ? parsed >= 0 && parsed <= MAX_OPERATION_HOURS
          : parsed > 0);
    if (isValid) {
      onUpdate(load.id, { [field]: parsed } as Partial<SingleLoad>);
    }
  }

  function revertIfInvalid(raw: string, fallback: number, setLocal: (value: string) => void) {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setLocal(String(fallback));
    }
  }

  function revertUsageFactorIfInvalid() {
    const parsed = Number(usageFactor);
    if (usageFactor.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setUsageFactor(String(load.usageFactor ?? 1));
      return;
    }
    if (parsed > 1) {
      setUsageFactor('1');
      onUpdate(load.id, { usageFactor: 1 });
    }
  }

  function revertFixedHoursIfInvalid() {
    const parsed = Number(fixedHours);
    if (fixedHours.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setFixedHours(String(load.fixedHours ?? 0));
      return;
    }
    if (parsed > MAX_OPERATION_HOURS) {
      setFixedHours(String(MAX_OPERATION_HOURS));
      onUpdate(load.id, { fixedHours: MAX_OPERATION_HOURS });
    }
  }

  function setUsageMode(mode: 'fraction' | 'fixed') {
    if (mode === usageMode) return;
    if (mode === 'fixed') {
      const initialFixedHours = load.fixedHours ?? operationHours;
      setFixedHours(String(initialFixedHours));
      onUpdate(load.id, { usageMode: 'fixed', fixedHours: initialFixedHours });
    } else {
      onUpdate(load.id, { usageMode: 'fraction' });
    }
  }

  const loadPeakW = load.powerW * (load.ipInRatio ?? 1) * load.qty;
  const loadEnergyKwh =
    usageMode === 'fixed'
      ? (load.powerW * load.qty * (load.fixedHours ?? 0)) / 1000
      : (operationHours * load.powerW * load.qty * (load.usageFactor ?? 1)) / 1000;
  const includedInPeak = load.includedInPeak ?? true;

  // Shared between the freshly-added (draft) card, which shows every field right
  // away, and the confirmed card's collapsible body.
  const extraFields = (
    <>
      <div className="grid grid-cols-2 gap-2 border-t p-3">
        <p className="col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uso e energia</p>
        <div>
          <Label htmlFor={`qty-${load.id}`} className="text-xs font-normal text-muted-foreground">
            <InfoLabel label="Quantidade" tip="Número de unidades desse equipamento na instalação." />
          </Label>
          <NumberFieldWithClear
            id={`qty-${load.id}`}
            value={qty}
            placeholder="Ex.: 1"
            min={1}
            onChange={(value) => handleChange('qty', value, setQty)}
            onBlur={() => revertIfInvalid(qty, load.qty, setQty)}
            onClear={() => setQty('')}
          />
        </div>
        <div>
          <Label htmlFor={`ip-in-${load.id}`} className="text-xs font-normal text-muted-foreground">
            <InfoLabel
              label="IP/IN"
              tip="Relação entre a potência aparente de partida (máxima) e a nominal. Motores e compressores (ar-condicionado, geladeira, bombas) costumam partir com 2 a 3× a potência nominal; cargas resistivas/eletrônicas usam 1."
            />
          </Label>
          <NumberFieldWithClear
            id={`ip-in-${load.id}`}
            value={ipIn}
            placeholder="Ex.: 1"
            min={1}
            step={0.1}
            onChange={(value) => handleChange('ipInRatio', value, setIpIn)}
            onBlur={() => revertIfInvalid(ipIn, load.ipInRatio ?? 1, setIpIn)}
            onClear={() => setIpIn('')}
          />
        </div>
        <div className="col-span-2">
          <Label
            htmlFor={usageMode === 'fixed' ? `fixed-hours-${load.id}` : `usage-factor-${load.id}`}
            className="text-xs font-normal text-muted-foreground"
          >
            <InfoLabel
              label={usageMode === 'fixed' ? 'Horas fixas' : 'Fator de uso'}
              tip={
                usageMode === 'fixed'
                  ? `Horas por dia em que a carga fica ligada, independente do tempo de operação compartilhado (máx. ${MAX_OPERATION_HOURS} h). Por exemplo, um equipamento com horário de funcionamento próprio. Define o consumo real em kWh/dia; não afeta a potência máxima.`
                  : 'Fração do tempo (0 a 1) em que a carga fica efetivamente ligada dentro do período de operação compartilhado. Por exemplo, um compressor que liga e desliga por termostato. Define o consumo real em kWh/dia; não afeta a potência máxima. Se a carga tiver um horário próprio de funcionamento, use "Horas" ao lado em vez de fração.'
              }
            />
          </Label>
          <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-input bg-muted transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
            {usageMode === 'fixed' ? (
              <NumberFieldWithClear
                id={`fixed-hours-${load.id}`}
                value={fixedHours}
                placeholder="Ex.: 2"
                min={0}
                max={MAX_OPERATION_HOURS}
                step={0.5}
                onChange={(value) => handleChange('fixedHours', value, setFixedHours)}
                onBlur={revertFixedHoursIfInvalid}
                onClear={() => setFixedHours('')}
                wrapperClassName="flex-1"
                inputClassName="rounded-none border-0 bg-transparent focus-visible:ring-0 dark:bg-transparent"
              />
            ) : (
              <NumberFieldWithClear
                id={`usage-factor-${load.id}`}
                value={usageFactor}
                placeholder="Ex.: 1"
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => handleChange('usageFactor', value, setUsageFactor)}
                onBlur={revertUsageFactorIfInvalid}
                onClear={() => setUsageFactor('')}
                wrapperClassName="flex-1"
                inputClassName="rounded-none border-0 bg-transparent focus-visible:ring-0 dark:bg-transparent"
              />
            )}
            <span className="my-1.5 w-px shrink-0 bg-input" aria-hidden="true" />
            <Select
              aria-label="Modo de cálculo de energia"
              value={usageMode}
              onChange={(event) => setUsageMode(event.target.value as 'fraction' | 'fixed')}
              className="w-24 shrink-0 rounded-none border-0 bg-transparent focus-visible:ring-0"
            >
              <option value="fraction">%</option>
              <option value="fixed">H</option>
            </Select>
          </div>
        </div>
      </div>
      {(load.ipInRatio ?? 1) > SOFT_STARTER_IP_IN_THRESHOLD && (
        <p className="flex items-start gap-1.5 border-t bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          IP/IN alto. Considere um inversor de frequência (VFD) ou softstarter para suavizar a partida deste motor e reduzir o pico de corrente.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 border-t p-3 sm:grid-cols-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-3">Ligação elétrica</p>
        <div>
          <Label className="text-xs font-normal text-muted-foreground">
            <InfoLabel label="Tensão" tip="Tensão de operação da carga. Só mostra as tensões disponíveis na rede escolhida." />
          </Label>
          <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
            {(voltageValid ? voltageOptions : [...voltageOptions, voltageV]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={voltageV === option}
                onClick={() => onUpdate(load.id, { voltageV: option as 110 | 220 | 380 })}
                className={cn(
                  'h-7 flex-1 rounded-md text-xs font-medium transition',
                  voltageV === option
                    ? !voltageValid
                      ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/40'
                      : 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
              >
                {option}V
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs font-normal text-muted-foreground">
            <InfoLabel label="Tipo" tip="Se a carga liga em uma única fase (mono) ou distribui a potência pelas três fases (trifásica)." />
          </Label>
          <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              aria-pressed={phaseType === 'mono'}
              onClick={() => onUpdate(load.id, { phaseType: 'mono' })}
              className={cn(
                'h-7 flex-1 rounded-md text-xs font-medium transition',
                phaseType === 'mono'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              Mono
            </button>
            {phaseCount === 3 && (
              <button
                type="button"
                aria-pressed={phaseType === 'trifasica'}
                onClick={() => onUpdate(load.id, { phaseType: 'trifasica' })}
                className={cn(
                  'h-7 flex-1 rounded-md text-xs font-medium transition',
                  phaseType === 'trifasica'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
              >
                Trifásica
              </button>
            )}
          </div>
        </div>
        {phaseCount > 1 && phaseType === 'mono' && needsTwoPhases && phaseCount === 3 && (
          <div>
            <Label className="text-xs font-normal text-muted-foreground">
              <InfoLabel
                label="Fases"
                tip="Essa tensão é obtida ligando a carga entre duas fases (não fase-neutro), então a potência soma nas duas fases escolhidas."
              />
            </Label>
            <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
              {phasePairs.map(([a, b]) => {
                const active = phase === a && load.phase2 === b;
                return (
                  <button
                    key={`${a}${b}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onUpdate(load.id, { phase: a, phase2: b })}
                    className={cn(
                      'flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-xs font-medium transition',
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    {a}-{b}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {phaseCount === 2 && phaseType === 'mono' && needsTwoPhases && (
          <div>
            <Label className="text-xs font-normal text-muted-foreground">
              <InfoLabel
                label="Fases"
                tip="Essa tensão é obtida ligando a carga entre duas fases (não fase-neutro), então a potência soma nas duas fases da rede."
              />
            </Label>
            <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                aria-pressed="true"
                disabled
                className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-background text-xs font-medium text-foreground shadow-sm ring-1 ring-border"
              >
                L1-L2
              </button>
            </div>
          </div>
        )}
        {phaseCount > 1 && phaseType === 'mono' && !needsTwoPhases && (
          <div>
            <Label className="text-xs font-normal text-muted-foreground">
              <InfoLabel label="Fase" tip="Em qual fase da rede essa carga está conectada, para acompanhar o equilíbrio entre fases." />
            </Label>
            <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
              {loadPhases.slice(0, phaseCount).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={phase === option}
                  onClick={() => onUpdate(load.id, { phase: option })}
                  className={cn(
                    'flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-xs font-medium transition',
                    phase === option
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (isDraft) {
    const hasSuggestions = draftMatches.mine.length > 0 || draftMatches.system.length > 0;
    return (
      <div className="rounded-lg border border-dashed bg-card text-sm sm:col-span-2">
        <div className="flex items-start gap-2 p-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="relative">
              <Label htmlFor={`draft-name-${load.id}`} className="text-xs font-normal text-muted-foreground">
                Nome
              </Label>
              <Input
                id={`draft-name-${load.id}`}
                autoFocus
                value={draftName}
                placeholder="Nome do equipamento"
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setDraftDropdownOpen(true);
                  setHighlightedIndex(-1);
                }}
                onFocus={() => setDraftDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDraftDropdownOpen(false), 150)}
                onKeyDown={(event) => {
                  if (draftDropdownOpen && draftSuggestionsFlat.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                    event.preventDefault();
                    setHighlightedIndex((current) => {
                      const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
                      if (next < 0) return draftSuggestionsFlat.length - 1;
                      if (next >= draftSuggestionsFlat.length) return 0;
                      return next;
                    });
                    return;
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const picked =
                      draftDropdownOpen && highlightedIndex >= 0 ? draftSuggestionsFlat[highlightedIndex] : undefined;
                    if (picked) {
                      selectDraftSuggestion(picked.name, picked.powerW, picked.ipInRatio);
                    } else {
                      confirmDraft();
                    }
                    return;
                  }
                  if (event.key === 'Escape' && draftDropdownOpen) {
                    setDraftDropdownOpen(false);
                  }
                }}
                className="mt-1"
              />
              {draftDropdownOpen && draftName.trim() !== '' && hasSuggestions && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
                  {draftMatches.mine.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        Minhas
                      </p>
                      {draftMatches.mine.map((item, index) => (
                        <button
                          key={item.id}
                          type="button"
                          ref={(el) => {
                            if (index === highlightedIndex) el?.scrollIntoView?.({ block: 'nearest' });
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => selectDraftSuggestion(item.name, item.powerW, item.ipInRatio)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                            index === highlightedIndex && 'bg-muted'
                          )}
                        >
                          <span className="truncate">{item.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{item.powerW}VA</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {draftMatches.system.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        Sistema
                      </p>
                      {draftMatches.system.map((item, index) => {
                        const flatIndex = draftMatches.mine.length + index;
                        return (
                        <button
                          key={item.id}
                          type="button"
                          ref={(el) => {
                            if (flatIndex === highlightedIndex) el?.scrollIntoView?.({ block: 'nearest' });
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setHighlightedIndex(flatIndex)}
                          onClick={() =>
                            selectDraftSuggestion(
                              item[nameKey as keyof CatalogItem] as string,
                              item.powerW,
                              item.ipInRatio ?? 1
                            )
                          }
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                            flatIndex === highlightedIndex && 'bg-muted'
                          )}
                        >
                          <span className="truncate">{item[nameKey as keyof CatalogItem] as string}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{item.powerW}VA</span>
                        </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor={`draft-power-${load.id}`} className="text-xs font-normal text-muted-foreground">
                Potência (VA)
              </Label>
              <Input
                id={`draft-power-${load.id}`}
                type="number"
                min={1}
                value={draftPower}
                placeholder="Ex.: 1200"
                onChange={(event) => setDraftPower(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmDraft();
                  }
                }}
                className="mt-1"
              />
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:h-7 md:w-7"
            onClick={() => onRemove(load.id)}
            aria-label="Remover carga em branco"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
        {extraFields}
        <div className="border-t p-3">
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={!draftName.trim() || !(Number(draftPower) > 0)}
            onClick={confirmDraft}
          >
            Adicionar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-card text-sm',
        expanded && !presetSelectionMode && 'sm:col-span-2',
        canDragToPhase && !presetSelectionMode && 'cursor-grab active:cursor-grabbing',
        presetSelectionMode && presetSelected && 'border-primary ring-2 ring-primary/30 bg-primary/5'
      )}
      draggable={canDragToPhase && !presetSelectionMode}
      onDragStart={
        canDragToPhase && !presetSelectionMode
          ? (event) => {
              event.dataTransfer.setData('text/plain', load.id);
              event.dataTransfer.effectAllowed = 'move';
              setDragPreview(event, load.name || 'Carga');
            }
          : undefined
      }
    >
      <div className="flex w-full items-start gap-2 p-3 text-left">
        <button
          type="button"
          role="button"
          aria-label={`${presetSelectionMode ? (presetSelected ? 'Desmarcar' : 'Selecionar') : expanded ? 'Recolher' : 'Expandir'} ${load.name || 'carga'}`}
          aria-expanded={presetSelectionMode ? undefined : expanded}
          aria-pressed={presetSelectionMode ? Boolean(presetSelected) : undefined}
          onClick={() => {
            if (presetSelectionMode) onTogglePresetSelected?.();
            else {
              setExpanded((current) => !current);
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            if (presetSelectionMode) onTogglePresetSelected?.();
            else {
              setExpanded((current) => !current);
            }
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-start text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
        <div className="flex min-w-0 items-start gap-2">
          {presetSelectionMode && (
            <input
              type="checkbox"
              checked={Boolean(presetSelected)}
              readOnly
              aria-hidden="true"
              tabIndex={-1}
              className="mt-1 h-4 w-4 shrink-0"
            />
          )}
          <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{load.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span
              ref={powerTipRef}
              onMouseEnter={powerTipOnMouseEnter}
              onMouseLeave={powerTipOnMouseLeave}
              onFocus={powerTipOnFocus}
              onBlur={powerTipOnBlur}
              className="relative flex items-center gap-1"
            >
              <Plug className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{load.qty}× {load.powerW} VA</span>
              <TooltipBubble triggerRef={powerTipRef} openUp={powerTipOpenUp} visible={powerTipVisible}>
                Potência nominal
              </TooltipBubble>
            </span>
            <span
              ref={peakTipRef}
              onMouseEnter={peakTipOnMouseEnter}
              onMouseLeave={peakTipOnMouseLeave}
              onFocus={peakTipOnFocus}
              onBlur={peakTipOnBlur}
              className={cn(
                'relative flex items-center gap-1',
                peakCalcMode === 'select' && !includedInPeak && 'opacity-50'
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{loadPeakW.toFixed(0)} VA</span>
              <TooltipBubble triggerRef={peakTipRef} openUp={peakTipOpenUp} visible={peakTipVisible}>
                {peakCalcMode === 'select' && !includedInPeak
                  ? 'Potência máxima (não contabilizada: carga desmarcada)'
                  : 'Potência máxima (nominal × IP/IN × quantidade)'}
              </TooltipBubble>
            </span>
            <span className="hidden xl:inline">
              {usageMode === 'fixed'
                ? `${load.fixedHours ?? 0} h/dia`
                : `${Math.round((load.usageFactor ?? 1) * 100)}% de ${operationHours} h`}
            </span>
            <span
              ref={dailyTipRef}
              onMouseEnter={dailyTipOnMouseEnter}
              onMouseLeave={dailyTipOnMouseLeave}
              onFocus={dailyTipOnFocus}
              onBlur={dailyTipOnBlur}
              className="relative flex items-center gap-1"
            >
              <BatteryCharging className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{loadEnergyKwh.toFixed(2)} kWh</span>
              <TooltipBubble triggerRef={dailyTipRef} openUp={dailyTipOpenUp} visible={dailyTipVisible}>
                Consumo diário estimado
              </TooltipBubble>
            </span>
            <span className={cn('inline-flex items-center gap-1.5', !voltageValid && 'font-medium text-destructive')}>
              {voltageV}V ·{' '}
              {phaseType === 'trifasica' ? (
                <span className="inline-flex items-center gap-1">
                  <TriPhaseDots /> Trifásica
                </span>
              ) : load.phase2 ? (
                <span className="inline-flex items-center gap-1">
                  Mono · <PhaseTag phase={phase} /> <PhaseTag phase={load.phase2} />
                </span>
              ) : phaseCount > 1 ? (
                <span className="inline-flex items-center gap-1">
                  Mono · <PhaseTag phase={phase} />
                </span>
              ) : (
                'Mono'
              )}
              {!voltageValid && ' · tensão incompatível'}
            </span>
          </div>
          </div>
        </div>
        </button>
        {!presetSelectionMode && (
        <div className="flex shrink-0 items-center gap-1">
          {peakCalcMode === 'select' && (
            <Button
              ref={includedToggleTipRef}
              variant="ghost"
              size="icon"
              className="relative shrink-0 md:h-7 md:w-7"
              onClick={(event) => {
                event.stopPropagation();
                onUpdate(load.id, { includedInPeak: !includedInPeak });
              }}
              onMouseEnter={includedToggleTipOnMouseEnter}
              onMouseLeave={includedToggleTipOnMouseLeave}
              onFocus={includedToggleTipOnFocus}
              onBlur={includedToggleTipOnBlur}
              aria-pressed={includedInPeak}
              aria-label={
                includedInPeak
                  ? `Não contar ${load.name} na potência máxima`
                  : `Contar ${load.name} na potência máxima`
              }
            >
              <Zap className={cn('h-3.5 w-3.5', includedInPeak ? 'text-primary' : 'text-muted-foreground')} />
              <TooltipBubble triggerRef={includedToggleTipRef} openUp={includedToggleTipOpenUp} visible={includedToggleTipVisible} align="end">
                {includedInPeak
                  ? 'Conta na potência máxima, clique para excluir'
                  : 'Não conta na potência máxima, clique para incluir'}
              </TooltipBubble>
            </Button>
          )}
          <LoadActionsMenu
            load={load}
            duplicateDisabled={duplicateDisabled}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
          />
        </div>
        )}
      </div>
      {!presetSelectionMode && expanded && extraFields}
    </div>
  );
}

export function LoadActionsMenu({ load, compact = false, duplicateDisabled, onDuplicate, onRemove }: {
  load: SingleLoad;
  compact?: boolean;
  duplicateDisabled: boolean;
  onDuplicate: (load: SingleLoad) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size={compact ? 'icon-xs' : 'icon'}
        className={cn('shrink-0', !compact && 'md:h-7 md:w-7')}
        aria-label={`Opções de ${load.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <MoreHorizontal className={compact ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
      </Button>
      {open && (
        <div role="menu" aria-label={`Ações de ${load.name}`} className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
          <button
            type="button"
            role="menuitem"
            disabled={duplicateDisabled}
            onClick={() => {
              onDuplicate(load);
              setOpen(false);
            }}
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Duplicar
          </button>
          <div className="my-1 border-t" />
          <ConfirmDeleteModalButton
            ariaLabel={`Excluir ${load.name}`}
            itemName={load.name || 'carga sem nome'}
            itemType="carga"
            description={`A carga “${load.name || 'carga sem nome'}” será removida do dimensionamento. Esta ação não poderá ser desfeita.`}
            label="Excluir"
            triggerVariant="destructive"
            onConfirm={() => onRemove(load.id)}
          />
        </div>
      )}
    </div>
  );
}
