'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LoadPhase, LoadPhaseType, LoadVoltage, PeakCalcMode, ResidentialGridType, SingleLoad } from '@/lib/types';
import { gridTypePhaseCount, gridTypePhaseToPhaseVoltages, gridTypeVoltages, loadPhases } from '@/lib/store/wizard-store';
import { cn } from '@/lib/utils';
import { MAX_OPERATION_HOURS } from './load-selector-utils';
import { LoadActionsMenu } from './LoadCard';
import { PhaseTag } from './phase-indicators';

type LoadTableProps = {
  loads: SingleLoad[];
  gridType: ResidentialGridType | null;
  peakCalcMode: PeakCalcMode;
  operationHours: number;
  onUpdate: (id: string, partial: Partial<SingleLoad>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (load: SingleLoad) => void;
  duplicateDisabled: boolean;
  onAddLoad: () => void;
  addDisabled: boolean;
};

function InlineNumberField({ id, value, min, max, step, onValid, onBlurValue, className }: {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValid: (value: number) => void;
  onBlurValue?: (value: number) => void;
  className?: string;
}) {
  const [raw, setRaw] = useState(String(value));

  // Keep the local input buffer aligned after an update from another control.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRaw(String(value)), [value]);

  return (
    <Input
      id={id}
      aria-label={id}
      type="number"
      min={min}
      max={max}
      step={step}
      value={raw}
      onChange={(event) => {
        const next = event.target.value;
        setRaw(next);
        const parsed = Number(next);
        if (next.trim() !== '' && Number.isFinite(parsed) && (min === undefined || parsed >= min) && (max === undefined || parsed <= max)) {
          onValid(parsed);
        }
      }}
      onBlur={() => {
        const parsed = Number(raw);
        if (raw.trim() === '' || !Number.isFinite(parsed) || (min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
          setRaw(String(value));
          return;
        }
        onBlurValue?.(parsed);
      }}
      className={cn('h-8 min-w-16 text-xs', className)}
    />
  );
}

function TableSelect({ id, value, onChange, children, className }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      id={id}
      aria-label={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn('h-8 w-full min-w-20 rounded-md border border-input bg-background px-2 text-xs outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30', className)}
    >
      {children}
    </select>
  );
}

function LoadTableRow({ load, gridType, peakCalcMode, operationHours, onUpdate, onRemove, onDuplicate, duplicateDisabled }: {
  load: SingleLoad;
  gridType: ResidentialGridType | null;
  peakCalcMode: PeakCalcMode;
  operationHours: number;
  onUpdate: (id: string, partial: Partial<SingleLoad>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (load: SingleLoad) => void;
  duplicateDisabled: boolean;
}) {
  const phaseCount = gridType ? gridTypePhaseCount[gridType] : 3;
  const validVoltages = gridType ? gridTypeVoltages[gridType] : [110, 220, 380];
  const phaseToPhaseVoltages = useMemo(() => (gridType ? gridTypePhaseToPhaseVoltages[gridType] : []), [gridType]);
  const phaseType = (load.phaseType ?? 'mono') as LoadPhaseType;
  const voltageV = load.voltageV ?? 220;
  const voltageOptions = phaseType === 'trifasica' && phaseToPhaseVoltages.length > 0
    ? phaseToPhaseVoltages
    : gridType === 'threePhase_380' && phaseType === 'mono'
      ? validVoltages.filter((voltage) => voltage !== 380)
      : validVoltages;
  const voltageValid = voltageOptions.includes(voltageV);
  const needsTwoPhases = phaseType === 'mono' && phaseCount > 1 && phaseToPhaseVoltages.includes(voltageV);
  const phase = load.phase ?? 'L1';
  const usageMode = load.usageMode ?? 'fraction';
  const [usageFactor, setUsageFactor] = useState(String(load.usageFactor ?? 1));
  const [fixedHours, setFixedHours] = useState(String(load.fixedHours ?? operationHours));
  const [editing, setEditing] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setUsageFactor(String(load.usageFactor ?? 1)), [load.usageFactor]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setFixedHours(String(load.fixedHours ?? operationHours)), [load.fixedHours, operationHours]);

  useEffect(() => {
    if (phaseCount < 3 && phaseType === 'trifasica') onUpdate(load.id, { phaseType: 'mono' });
  }, [phaseCount, phaseType, load.id, onUpdate]);

  useEffect(() => {
    if (phaseType === 'trifasica' && phaseToPhaseVoltages.length > 0 && !phaseToPhaseVoltages.includes(voltageV)) {
      onUpdate(load.id, { voltageV: phaseToPhaseVoltages[0] as LoadVoltage });
    }
  }, [phaseType, phaseToPhaseVoltages, voltageV, load.id, onUpdate]);

  useEffect(() => {
    if (gridType === 'threePhase_380' && phaseType === 'mono' && voltageV === 380) onUpdate(load.id, { voltageV: 220 });
  }, [gridType, phaseType, voltageV, load.id, onUpdate]);

  useEffect(() => {
    if (needsTwoPhases && !load.phase2) onUpdate(load.id, { phase: 'L1', phase2: 'L2' });
    else if (!needsTwoPhases && load.phase2) onUpdate(load.id, { phase2: null });
  }, [needsTwoPhases, load.phase2, load.id, onUpdate]);

  const loadPeakW = load.powerW * (load.ipInRatio ?? 1) * load.qty;
  const loadEnergyKwh = usageMode === 'fixed'
    ? (load.powerW * load.qty * (load.fixedHours ?? 0)) / 1000
    : (operationHours * load.powerW * load.qty * (load.usageFactor ?? 1)) / 1000;
  const includedInPeak = load.includedInPeak ?? true;
  const phasePairs: Array<[LoadPhase, LoadPhase]> = [['L1', 'L2'], ['L2', 'L3'], ['L1', 'L3']];
  const phaseLabel = phaseType === 'trifasica'
    ? 'L1 · L2 · L3'
    : needsTwoPhases
      ? `${phase}-${load.phase2 ?? 'L2'}`
      : phase;

  function setUsageMode(mode: 'fraction' | 'fixed') {
    if (mode === usageMode) return;
    if (mode === 'fixed') {
      const initialFixedHours = load.fixedHours ?? operationHours;
      setFixedHours(String(initialFixedHours));
      onUpdate(load.id, { usageMode: mode, fixedHours: initialFixedHours });
    } else {
      onUpdate(load.id, { usageMode: mode });
    }
  }

  return (
    <>
      <tr
        tabIndex={0}
        aria-expanded={editing}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return;
          setEditing((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          setEditing((current) => !current);
        }}
        className={cn('grid cursor-pointer grid-cols-[minmax(0,1fr)_1.5rem_3.5rem_2.5rem_3rem_4rem_2.5rem] gap-x-1 border-b p-1.5 align-middle transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 md:grid-cols-[minmax(0,0.8fr)_3rem_5rem_4.5rem_5.5rem_minmax(8rem,1.2fr)_2.5rem] lg:table-row lg:p-0', editing && 'bg-muted/15')}
      >
        <th scope="row" className="block min-w-0 px-1.5 py-2 text-left lg:table-cell lg:col-auto lg:min-w-44 lg:px-3 lg:py-3.5">
          <p className="truncate text-sm font-semibold" title={load.name}>{load.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <PhaseTag phase={phase} />
          </div>
        </th>
        <td className="block w-auto px-1 py-2 text-center text-sm tabular-nums lg:table-cell lg:w-20 lg:px-2 lg:py-3.5"><span className="hidden">Qtd.</span>{load.qty}</td>
        <td className="block w-auto px-1 py-2 text-xs tabular-nums text-muted-foreground lg:table-cell lg:w-24 lg:px-2 lg:py-3.5"><span className="hidden">Potência</span><span className="font-medium text-foreground">{load.powerW}</span> VA</td>
        <td className="block w-auto px-1 py-2 lg:table-cell lg:w-24 lg:px-2 lg:py-3.5">
          <span className="hidden">Partida</span>
          <span className="inline-flex rounded-full border bg-background px-2 py-1 text-xs font-medium tabular-nums">{load.ipInRatio ?? 1}×</span>
          <span className="mt-1 block truncate text-[0.65rem] tabular-nums text-muted-foreground lg:mt-1">{loadPeakW.toFixed(0)} VA pico</span>
        </td>
        <td className="block w-auto min-w-0 px-1 py-2 lg:table-cell lg:min-w-36 lg:px-2 lg:py-3.5">
          <span className="hidden">Uso</span>
          <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-medium text-primary">{usageMode === 'fixed' ? `${load.fixedHours ?? 0} h` : `${Math.round((load.usageFactor ?? 1) * 100)}%`}</span>
          <span className="mt-1 hidden text-[0.65rem] tabular-nums text-muted-foreground lg:block">{loadEnergyKwh.toFixed(2)} kWh/dia</span>
        </td>
        <td className="block min-w-0 px-1 py-2 lg:table-cell lg:col-auto lg:min-w-40 lg:px-2 lg:py-3.5">
          <span className="hidden">Ligação</span>
          <span className={cn('block truncate rounded-full border bg-background px-1.5 py-1 text-xs', !voltageValid && 'border-destructive/40 text-destructive')} title={`${voltageV}V · ${phaseLabel}`}>{voltageV}V · {phaseLabel}</span>
        </td>
        <td className="order-none col-span-1 col-start-auto block w-auto px-1 py-2 text-right lg:table-cell lg:col-auto lg:w-36 lg:px-2 lg:py-3.5">
          <span className="hidden">Ações</span>
          <div className="flex items-center justify-end gap-1">
            <LoadActionsMenu load={load} compact duplicateDisabled={duplicateDisabled} onDuplicate={onDuplicate} onRemove={onRemove} />
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="block border-b bg-muted/10 last:border-b-0 lg:table-row">
          <td colSpan={7} className="block px-2 pb-3 pt-1 lg:table-cell lg:px-3 lg:pb-4">
            <div className="rounded-xl border bg-background p-3 shadow-sm sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Editar carga</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Ajuste os parâmetros usados no dimensionamento.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {peakCalcMode === 'select' && (
                    <button type="button" aria-pressed={includedInPeak} aria-label={includedInPeak ? `Não contar ${load.name} na potência máxima` : `Contar ${load.name} na potência máxima`} onClick={() => onUpdate(load.id, { includedInPeak: !includedInPeak })} className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', includedInPeak ? 'border-primary/30 bg-primary/5 text-primary' : 'border-muted text-muted-foreground')}>
                      {includedInPeak ? 'Incluída no pico' : 'Fora do pico'}
                    </button>
                  )}
                  <button type="button" aria-label={`Fechar edição de ${load.name}`} title="Fechar edição" onClick={() => setEditing(false)} className="rounded-md border border-transparent p-1.5 text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[7rem_7rem_minmax(16rem,1fr)_minmax(17rem,1.2fr)]">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Quantidade</p>
                  <InlineNumberField id={`Quantidade ${load.name}`} value={load.qty} min={1} onValid={(value) => onUpdate(load.id, { qty: value })} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">IP/IN</p>
                  <InlineNumberField id={`IP/IN ${load.name}`} value={load.ipInRatio ?? 1} min={1} step={0.1} onValid={(value) => onUpdate(load.id, { ipInRatio: value })} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Uso e energia</p>
                  <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
                    <InlineNumberField id={`${usageMode === 'fixed' ? 'Horas' : 'Fator de uso'} ${load.name}`} value={usageMode === 'fixed' ? Number(fixedHours) : Math.round(Number(usageFactor) * 100)} min={0} max={usageMode === 'fixed' ? MAX_OPERATION_HOURS : 100} step={usageMode === 'fixed' ? 0.5 : 5} onValid={(value) => { if (usageMode === 'fixed') { setFixedHours(String(value)); onUpdate(load.id, { fixedHours: value }); } else { const fraction = value / 100; setUsageFactor(String(fraction)); onUpdate(load.id, { usageFactor: fraction }); } }} className="min-w-20 flex-1 rounded-none border-0 bg-transparent focus-visible:ring-0" />
                    <span className="my-1 w-px shrink-0 bg-input" aria-hidden="true" />
                    <TableSelect id={`Modo de uso ${load.name}`} value={usageMode} onChange={(value) => setUsageMode(value as 'fraction' | 'fixed')} className="w-24 shrink-0 rounded-none border-0 bg-transparent focus-visible:ring-0">
                      <option value="fraction">%</option>
                      <option value="fixed">H</option>
                    </TableSelect>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Ligação elétrica</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <TableSelect id={`Tensão ${load.name}`} value={String(voltageV)} onChange={(value) => onUpdate(load.id, { voltageV: Number(value) as LoadVoltage })} className={!voltageValid ? 'border-destructive text-destructive' : undefined}>
                      {!voltageValid && <option value={voltageV}>{voltageV}V · inválida</option>}
                      {voltageOptions.map((voltage) => <option key={voltage} value={voltage}>{voltage}V</option>)}
                    </TableSelect>
                    <TableSelect id={`Tipo de ligação ${load.name}`} value={phaseType} onChange={(value) => onUpdate(load.id, { phaseType: value as LoadPhaseType, ...(value === 'trifasica' ? { phase2: null } : {}) })}>
                      <option value="mono">Mono</option>
                      {phaseCount === 3 && <option value="trifasica">Tri</option>}
                    </TableSelect>
                    {needsTwoPhases ? (
                      <TableSelect id={`Fases ${load.name}`} value={`${phase}-${load.phase2 ?? 'L2'}`} onChange={(value) => { const [first, second] = value.split('-') as [LoadPhase, LoadPhase]; onUpdate(load.id, { phase: first, phase2: second }); }}>
                        {phasePairs.map(([first, second]) => <option key={`${first}-${second}`} value={`${first}-${second}`}>{first}-{second}</option>)}
                      </TableSelect>
                    ) : phaseType === 'trifasica' ? (
                      <span className="flex h-8 items-center justify-center rounded-md border bg-muted/40 px-1 text-xs text-muted-foreground">L1-L2-L3</span>
                    ) : (
                      <TableSelect id={`Fase ${load.name}`} value={phase} onChange={(value) => onUpdate(load.id, { phase: value as LoadPhase, phase2: null })}>
                        {loadPhases.slice(0, phaseCount).map((option) => <option key={option} value={option}>{option}</option>)}
                      </TableSelect>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function LoadTable({ loads, gridType, peakCalcMode, operationHours, onUpdate, onRemove, onDuplicate, duplicateDisabled, onAddLoad, addDisabled }: LoadTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-0 text-sm" aria-label="Cargas do projeto em tabela">
        <thead className="block bg-muted/40 text-[0.65rem] uppercase tracking-wide text-muted-foreground lg:table-header-group">
          <tr className="grid grid-cols-[minmax(0,1fr)_1.5rem_3.5rem_2.5rem_3rem_4rem_2.5rem] gap-x-1 border-b md:grid-cols-[minmax(0,0.8fr)_3rem_5rem_4.5rem_5.5rem_minmax(8rem,1.2fr)_2.5rem] lg:table-row">
            <th scope="col" aria-label="Carga" className="block min-w-0 px-1.5 py-2.5 text-left font-semibold lg:table-cell lg:min-w-44 lg:px-3 lg:py-4" />
            <th scope="col" className="block min-w-0 px-1 py-2.5 text-left font-semibold lg:table-cell lg:w-20 lg:px-2 lg:py-4">Qtd.</th>
            <th scope="col" className="block min-w-0 whitespace-normal px-1 py-2.5 text-left font-semibold leading-tight lg:table-cell lg:w-24 lg:px-2 lg:py-4">Potência</th>
            <th scope="col" className="block min-w-0 px-1 py-2.5 text-left font-semibold lg:table-cell lg:w-24 lg:px-2 lg:py-4">IP/IN</th>
            <th scope="col" className="block min-w-0 whitespace-normal px-1 py-2.5 text-left font-semibold leading-tight lg:table-cell lg:min-w-36 lg:px-2 lg:py-4">Uso e energia</th>
            <th scope="col" className="block min-w-0 whitespace-normal px-1 py-2.5 text-left font-semibold leading-tight md:min-w-0 lg:table-cell lg:min-w-40 lg:px-2 lg:py-4">Ligação elétrica</th>
            <th scope="col" aria-label="Ações" className="block min-w-0 px-1 py-2.5 text-left font-semibold lg:table-cell lg:min-w-28 lg:px-2 lg:py-4 lg:text-right">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Adicionar carga"
                onClick={onAddLoad}
                disabled={addDisabled}
                className="ml-auto border-primary/30 text-primary normal-case tracking-normal hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Adicionar
              </Button>
            </th>
          </tr>
        </thead>
        <tbody>
          {loads.map((load) => (
            <LoadTableRow
              key={load.id}
              load={load}
              gridType={gridType}
              peakCalcMode={peakCalcMode}
              operationHours={operationHours}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onDuplicate={onDuplicate}
              duplicateDisabled={duplicateDisabled}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
