'use client';

import { AlertTriangle, Check } from 'lucide-react';
import type { ResidentialGridType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { checkPhaseVoltageCompatibility, gridTypePhaseVoltage } from '../../helpers';
import { gridLabels } from '../../types';

const phaseOptions: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Monofásico' },
  { value: 2, label: 'Bifásico' },
  { value: 3, label: 'Trifásico' },
];

export function PhasePicker({
  value,
  onChange,
  ariaLabel,
  recommendedValues = [],
}: {
  value: 1 | 2 | 3;
  onChange: (value: 1 | 2 | 3) => void;
  ariaLabel: string;
  /** Phase(s) that would fix an incompatible selection — highlighted in green,
   * never auto-applied. Empty when the current selection is already fine. */
  recommendedValues?: (1 | 2 | 3)[];
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={ariaLabel}>
      {phaseOptions.map((option) => {
        const active = value === option.value;
        const recommended = !active && recommendedValues.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative h-9 min-w-[88px] flex-1 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              recommended && 'ring-2 ring-emerald-500/70 text-emerald-700 dark:text-emerald-400'
            )}
          >
            {option.label}
            {recommended && (
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"
              >
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Which voltage(s) are physically valid for a given phase count: mono is
 * always 220V, bifásico is a single dual-rail "110/220V" system (still
 * stored as the nominal 220 value), and only trifásico has a real 220V vs
 * 380V choice. */
export function voltageOptionsForPhases(phases: 1 | 2 | 3): { value: 220 | 380; label: string }[] {
  if (phases === 1) return [{ value: 220, label: '220V' }];
  if (phases === 2) return [{ value: 220, label: '110/220V' }];
  return [
    { value: 220, label: '220V' },
    { value: 380, label: '380V' },
  ];
}

export function VoltagePicker({
  value,
  phases,
  onChange,
  ariaLabel,
  recommendedValue = null,
}: {
  value: number;
  phases: 1 | 2 | 3;
  onChange: (value: 220 | 380) => void;
  ariaLabel: string;
  /** Voltage that would fix an incompatible selection — highlighted in green,
   * never auto-applied. Null when the current selection is already fine. */
  recommendedValue?: 220 | 380 | null;
}) {
  const options = voltageOptionsForPhases(phases);
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.value;
        const recommended = !active && recommendedValue === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative h-9 min-w-[88px] flex-1 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              recommended && 'ring-2 ring-emerald-500/70 text-emerald-700 dark:text-emerald-400'
            )}
          >
            {option.label}
            {recommended && (
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"
              >
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Phases/voltage to seed Microrrede/Gerador with when the feature is
 * first enabled — matching whatever grid type is already chosen in
 * Configurações (always a valid, compatible starting point) instead of
 * always defaulting to monofásico 220V regardless of context. Falls back to
 * monofásico 220V only when no grid type has been chosen yet. */
export function defaultPhaseVoltageForGridType(gridType: ResidentialGridType | null): { phases: 1 | 2 | 3; voltage: 220 | 380 } {
  return gridType ? gridTypePhaseVoltage[gridType] : { phases: 1, voltage: 220 };
}

/** Which phase count(s) would fix the current Microrrede/Gerador
 * selection — the network's own phase count, plus (microgrid only) 1-phase
 * when the documented exception applies. Empty once the current phase/voltage
 * is already compatible. When the current phase is already one of the valid
 * options (only the voltage is off), recommends just that phase — which,
 * being already active, shows no highlight — rather than also pointing at the
 * other valid phase: with the right phase already picked, suggesting a
 * completely different one alongside it would be a confusing, unnecessary
 * detour when fixing the voltage is enough. Feeds the green "recomendado"
 * highlight in PhasePicker; never auto-selects anything. */
export function recommendedPhases(
  gridType: ResidentialGridType | null,
  phases: 1 | 2 | 3,
  voltageV: number,
  forMicrogrid: boolean
): (1 | 2 | 3)[] {
  if (!gridType) return [];
  if (checkPhaseVoltageCompatibility(gridType, phases, voltageV, { forMicrogrid }) !== 'incompatible') return [];
  const network = gridTypePhaseVoltage[gridType];
  const exceptionApplies = forMicrogrid && (gridType === 'threePhase_380' || gridType === 'splitPhase_220');
  const validPhases: (1 | 2 | 3)[] = exceptionApplies && network.phases !== 1 ? [network.phases, 1] : [network.phases];
  return validPhases.includes(phases) ? [phases] : validPhases;
}

/** Which voltage would fix the current selection, given the phase count
 * currently chosen — null once the current phase/voltage is already
 * compatible, or when no voltage under that phase count would help (the
 * phase itself needs to change first; VoltagePicker's own options are
 * scoped to the current phase anyway, so there's nothing to highlight). */
export function recommendedVoltageForPhase(
  gridType: ResidentialGridType | null,
  phases: 1 | 2 | 3,
  voltageV: number,
  forMicrogrid: boolean
): 220 | 380 | null {
  if (!gridType) return null;
  if (checkPhaseVoltageCompatibility(gridType, phases, voltageV, { forMicrogrid }) !== 'incompatible') return null;
  const network = gridTypePhaseVoltage[gridType];
  if (phases === network.phases) return network.voltage;
  const exceptionApplies = forMicrogrid && (gridType === 'threePhase_380' || gridType === 'splitPhase_220');
  return exceptionApplies && phases === 1 ? 220 : null;
}

/** Blocks calculating (and, since export always follows canCalculate,
 * exporting the PDF too — see canCalculate in useCalculation.ts) when the
 * phases+voltage chosen for the on-grid/generator system don't match (or,
 * for microgrid, don't fall under its one documented exception — see
 * checkPhaseVoltageCompatibility) the grid type already chosen in
 * Configurações. Renders nothing until a grid type is chosen, or once the
 * combination is compatible. */
export function PhaseVoltageCompatibilityWarning({
  gridType,
  phases,
  voltageV,
  forMicrogrid,
}: {
  gridType: ResidentialGridType | null;
  phases: 1 | 2 | 3;
  voltageV: number;
  forMicrogrid: boolean;
}) {
  const status = checkPhaseVoltageCompatibility(gridType, phases, voltageV, { forMicrogrid });
  if (!gridType || status !== 'incompatible') return null;

  const phaseLabel = phaseOptions.find((option) => option.value === phases)?.label ?? '';
  const voltageLabel = voltageOptionsForPhases(phases).find((option) => option.value === voltageV)?.label ?? `${voltageV}V`;

  // What the user should pick instead — not applied automatically, just
  // spelled out so they don't have to reverse-engineer it from the grid type.
  const network = gridTypePhaseVoltage[gridType];
  const networkPhaseLabel = phaseOptions.find((option) => option.value === network.phases)?.label ?? '';
  const networkVoltageLabel =
    voltageOptionsForPhases(network.phases).find((option) => option.value === network.voltage)?.label ?? `${network.voltage}V`;
  const microgridExceptionApplies = forMicrogrid && (gridType === 'threePhase_380' || gridType === 'splitPhase_220');

  return (
    <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      A tensão/fases selecionadas ({phaseLabel} {voltageLabel}) são incompatíveis com o tipo de rede configurado (
      {gridLabels[gridType]}). Selecione {networkPhaseLabel} e {networkVoltageLabel}
      {microgridExceptionApplies ? ` (ou Monofásico 220V, aceito como exceção para microrrede)` : ''} para poder calcular.
    </p>
  );
}
