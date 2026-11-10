'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChartNoAxesCombined, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LoadCurvePoint, LoadCurveResolutionMinutes } from '@/supabase/functions/_shared/commercial-industrial/types';
import type { CurveRangeSelection, SelectionSlots } from './LoadCurveChart';
import { useCiAcPower } from './ci-ac-power';

interface Metrics { min: number; max: number; mean: number; energy: number }
const ROWS = [
  { key: 'min', label: 'Mínima', unit: 'kVA' },
  { key: 'max', label: 'Máxima', unit: 'kVA' },
  { key: 'mean', label: 'Média', unit: 'kVA' },
  { key: 'energy', label: 'Energia', unit: 'kWh' },
] as const;

function summarize(values: (number | null | undefined)[], intervalMinutes: number): Metrics | null {
  if (!values.length || values.some(value => value == null || !Number.isFinite(value) || value < 0)) return null;
  const valid = values as number[];
  const sum = valid.reduce((total, value) => total + value, 0);
  return { min: Math.min(...valid), max: Math.max(...valid), mean: sum / valid.length, energy: sum * intervalMinutes / 60 };
}

export function CurveSelectionPopup({ points, generationPoints, resolutionMinutes, timezone, selections, onSelectionsChange, kind = 'load', align, labels }: {
  points: LoadCurvePoint[];
  generationPoints?: { timestamp: string; powerKw: number | null }[];
  resolutionMinutes: LoadCurveResolutionMinutes;
  timezone?: string;
  selections: SelectionSlots;
  onSelectionsChange: React.Dispatch<React.SetStateAction<SelectionSlots>>;
  kind?: 'load' | 'generation';
  align?: 'left' | 'right';
  labels?: { a?: string; b?: string };
}) {
  const { toKva } = useCiAcPower();
  const labelA = labels?.a ?? (kind === 'load' ? 'Carga' : 'Período A');
  const labelB = labels?.b ?? (kind === 'load' ? 'Descarga' : 'Período B');
  const [previous, setPrevious] = useState(selections);
  const [view, setView] = useState<'a' | 'b' | 'delta'>(selections.b ? 'b' : 'a');
  const [dismissed, setDismissed] = useState(false);
  if (previous.a !== selections.a || previous.b !== selections.b) {
    setPrevious(selections);
    setView(selections.b ? 'b' : 'a');
    setDismissed(false);
  }
  const active = view === 'a' ? selections.a : selections.b ?? selections.a;
  const hasSelection = Boolean(active && points.length);
  useEffect(() => {
    if (!hasSelection || dismissed) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setDismissed(true);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [hasSelection, dismissed]);

  const generation = useMemo(() => new Map(generationPoints?.map(point => [Date.parse(point.timestamp), point.powerKw])), [generationPoints]);
  const summarizeRange = (range: CurveRangeSelection | null) => {
    const selected = range ? points.slice(range.startIndex, range.endIndex + 1) : [];
    return {
      consumption: summarize(selected.map(point => point.powerKw), resolutionMinutes),
      solar: summarize(selected.map(point => generation.get(Date.parse(point.timestamp))), resolutionMinutes),
    };
  };
  if (!hasSelection || !active) return null;
  const a = summarizeRange(selections.a), b = summarizeRange(selections.b);
  const current = view === 'a' ? a : b;
  const delta = view === 'delta';
  const both = Boolean(selections.a && selections.b);
  const side = align ?? ((active.startIndex + active.endIndex) / 2 < points.length / 2 ? 'right' : 'left');
  const position = cn('relative z-40 mx-2 mt-2 max-w-[calc(100%-1rem)] sm:absolute sm:top-2 sm:mx-0 sm:mt-0', side === 'right' ? 'sm:right-2' : 'sm:left-2');
  const format = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (timestamp: string | number) => new Date(timestamp).toLocaleString('pt-BR', { timeZone: timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(', ', ' · ');
  const rangeLabel = (range: CurveRangeSelection) => {
    const start = points[range.startIndex], end = points[range.endIndex];
    if (!start || !end) return '';
    return `${formatDate(start.timestamp)} – ${formatDate(Date.parse(end.timestamp) + resolutionMinutes * 60000)}`;
  };
  if (dismissed) return <Button type="button" size="sm" variant="outline" className={cn(position, 'gap-1.5 bg-card shadow-sm')} onClick={() => setDismissed(false)}><ChartNoAxesCombined className="size-3.5" aria-hidden="true" />Ver seleção</Button>;

  function valueFor(series: 'consumption' | 'solar', key: keyof Metrics, unit: 'kVA' | 'kWh') {
    const summary = delta ? a[series] && b[series] ? b[series]![key] - a[series]![key] : null : current[series]?.[key] ?? null;
    if (summary === null) return '—';
    const value = unit === 'kVA' ? toKva(summary) : summary;
    return `${delta && value > 0 ? '+' : ''}${format(value)} ${unit}`;
  }

  const missingSolar = generationPoints !== undefined && (delta ? !a.solar || !b.solar : !current.solar);
  return (
    <section aria-label="Resumo do intervalo selecionado" className={cn(position, 'w-[340px] sm:max-h-[calc(100%-1rem)] overflow-auto overscroll-contain rounded-xl border border-border bg-card/85 p-3 text-xs shadow-lg backdrop-blur-md')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold"><span className={cn('size-1.5 rounded-full', view === 'b' ? 'bg-amber-500' : 'bg-emerald-500')} aria-hidden="true" />{delta ? `Diferença (${labelB} − ${labelA})` : both ? (view === 'a' ? labelA : labelB) : 'Intervalo selecionado'}</div>
        <Button type="button" variant="ghost" size="xs" className="size-6 p-0" aria-label="Fechar resumo da seleção" onClick={() => setDismissed(true)}><X className="size-3.5" aria-hidden="true" /></Button>
      </div>
      {both && <div role="group" aria-label="Comparar intervalos" className="mt-1.5 flex gap-1 rounded-md bg-muted/60 p-0.5">
        {(['a', 'b', 'delta'] as const).map(tab => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)} className={cn('flex-1 rounded px-2 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', view === tab ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>{tab === 'delta' ? 'Diferença' : tab === 'a' ? labelA : labelB}</button>)}
      </div>}
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{delta ? 'Variação absoluta entre os intervalos' : rangeLabel(active)}</p>
      <table aria-label={delta ? 'Diferença entre intervalos' : 'Valores do intervalo'} className="mt-2 w-full table-fixed text-[11px] tabular-nums">
        <thead><tr className="border-b border-border/70 text-muted-foreground"><th scope="col" className="w-[22%] pb-1.5 text-left font-normal"><span className="sr-only">Indicador</span></th><th scope="col" className="pb-1.5 text-right font-medium">{kind === 'generation' ? 'Geração FV' : 'Consumo'}</th>{generationPoints !== undefined && <th scope="col" className="pb-1.5 text-right font-medium"><span className="mr-1 inline-block size-1.5 rounded-full bg-chart-2" aria-hidden="true" />Geração FV</th>}</tr></thead>
        <tbody>{ROWS.map(row => <tr key={row.key} className={cn(row.key === 'energy' && 'border-t border-border/70')}><th scope="row" className="py-1.5 text-left font-normal text-muted-foreground">{row.label}</th><td className="py-1.5 text-right font-semibold whitespace-nowrap">{valueFor('consumption', row.key, row.unit)}</td>{generationPoints !== undefined && <td className="py-1.5 text-right font-semibold whitespace-nowrap">{valueFor('solar', row.key, row.unit)}</td>}</tr>)}</tbody>
      </table>
      {missingSolar && <p className="mt-1 text-[10px] text-muted-foreground">Sem dados FV completos para {delta ? 'comparar os intervalos' : 'este intervalo'}.</p>}
      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/70 pt-1.5 text-[10px] text-muted-foreground">
        <span>{delta ? `${labelB} − ${labelA}` : `${active.endIndex - active.startIndex + 1} pontos · ${(active.endIndex - active.startIndex + 1) * resolutionMinutes} min`}</span>
        <Button type="button" variant="ghost" size="xs" className="h-6 px-1.5 text-[10px]" onClick={() => onSelectionsChange(previous => delta ? { a: null, b: null } : { ...previous, [view]: null })}>{delta ? 'Limpar intervalos' : both ? `Limpar ${view === 'a' ? labelA : labelB}` : 'Limpar seleção'}</Button>
      </div>
    </section>
  );
}
