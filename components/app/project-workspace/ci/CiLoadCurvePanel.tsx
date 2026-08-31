'use client';

// Fase 6, section 8.1 item 3 ("Curva de carga") — import a CSV load curve
// and show its normalized summary. CSV-only for the MVP (plan section
// 14/15: XLSX is deliberately deferred); parseLoadCurveCsv/summarizeLoadCurve
// (Fase 2, lib/commercial-industrial/load-curve.ts) already do all the
// normalization/validation — this panel is just the file picker, metadata
// form, and result display around them.

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, FileUp, Gauge, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parseLoadCurveCsv, summarizeLoadCurve } from '@/supabase/functions/_shared/commercial-industrial/load-curve';
import {
  LOAD_CURVE_MAX_POINTS,
  type CommercialIndustrialOptions,
  type LoadCurveResolutionMinutes,
} from '@/supabase/functions/_shared/commercial-industrial/types';

const resolutionOptions: LoadCurveResolutionMinutes[] = [15, 30, 60];

// uPlot touches the canvas/DOM as soon as its module runs — ssr:false keeps
// that entirely out of the server render, and the ~50kb only ships once a
// curve actually needs plotting instead of bloating every C&I workspace load.
const LoadCurveChart = dynamic(() => import('./LoadCurveChart').then((mod) => mod.LoadCurveChart), {
  ssr: false,
  loading: () => <div className="h-[240px] w-full animate-pulse rounded-lg bg-muted" />,
});

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function CiLoadCurvePanel({
  ciOptions,
  onChange,
}: {
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
}) {
  const existing = ciOptions.loadCurve;
  const [resolutionMinutes, setResolutionMinutes] = useState<LoadCurveResolutionMinutes>(existing?.resolutionMinutes ?? 15);
  const [timezone, setTimezone] = useState(existing?.timezone ?? 'America/Sao_Paulo');
  const [periodStart, setPeriodStart] = useState(existing?.periodStart ?? todayIsoDate());
  const [periodEnd, setPeriodEnd] = useState(existing?.periodEnd ?? addDaysIsoDate(todayIsoDate(), 6));
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);

  // Re-derived on every render from csvText + the declared metadata (not
  // stored in state) so adjusting resolution/timezone/period after importing
  // shows updated errors/warnings immediately, with nothing that could drift
  // out of sync with its own inputs.
  const parseResult =
    csvText === null
      ? null
      : parseLoadCurveCsv(csvText, { resolutionMinutes, timezone, periodStart, periodEnd, profileBasis: 'representative_period' });
  const errors = parseResult && !parseResult.ok ? parseResult.errors : [];
  const warnings = parseResult?.ok ? parseResult.warnings : [];
  const parsedCurve = parseResult?.ok ? parseResult.curve : null;

  // The only actual side effect here: push a successfully parsed curve up to
  // the store, keyed on the same primitive inputs parseResult is derived
  // from above (re-running this only when csvText or the declared metadata
  // actually changes, not on every render).
  useEffect(() => {
    if (parsedCurve) onChange({ loadCurve: parsedCurve });
    // onChange is a store setter, stable enough not to need to be a
    // dependency — including it would re-run this on every unrelated
    // ciOptions edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvText, resolutionMinutes, timezone, periodStart, periodEnd]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  }

  function clearCurve() {
    setFileName(null);
    setCsvText(null);
    onChange({ loadCurve: null });
  }

  const summary = existing ? summarizeLoadCurve(existing) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Período representado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            O MVP usa uma semana representativa (até {LOAD_CURVE_MAX_POINTS} pontos), com dia útil e fim de semana
            distinguidos ponto a ponto na própria curva.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Fuso horário</span>
            <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="America/Sao_Paulo" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Início do período</span>
            <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Fim do período</span>
            <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium">Resolução</p>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:w-fit">
            {resolutionOptions.map((option) => {
              const active = resolutionMinutes === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setResolutionMinutes(option)}
                  className={cn(
                    'flex h-8 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition',
                    active
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  )}
                >
                  {option} min
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <div>
          <p className="text-sm font-semibold">Arquivo CSV</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Duas colunas: <code className="rounded bg-muted px-1 py-0.5">timestamp</code> (ISO 8601) e{' '}
            <code className="rounded bg-muted px-1 py-0.5">powerKw</code>. Aceita <code className="rounded bg-muted px-1 py-0.5">;</code> ou{' '}
            <code className="rounded bg-muted px-1 py-0.5">,</code> como separador.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer')}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            {fileName ? 'Trocar arquivo' : 'Importar CSV'}
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                handleFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          {existing && (
            <Button type="button" variant="ghost" size="sm" onClick={clearCurve}>
              Remover curva
            </Button>
          )}
        </div>

        {errors.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Não foi possível importar o arquivo
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700">
            <p className="font-medium">Curva importada com avisos</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
              {warnings.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {existing && summary && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold">Curva de carga</p>
          <div className="rounded-lg border bg-card p-3">
            <LoadCurveChart points={existing.points} />
          </div>
          <p className="text-sm font-semibold">Resumo</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Pico
              </p>
              <p className="mt-1 text-sm font-semibold">{summary.peakKw.toFixed(2)} kW</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> Mínima
              </p>
              <p className="mt-1 text-sm font-semibold">{summary.minKw.toFixed(2)} kW</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" /> Média
              </p>
              <p className="mt-1 text-sm font-semibold">{summary.averageKw.toFixed(2)} kW</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Energia
              </p>
              <p className="mt-1 text-sm font-semibold">{summary.totalEnergyKwh.toFixed(2)} kWh</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {summary.pointCount} / {LOAD_CURVE_MAX_POINTS} pontos · resolução {existing.resolutionMinutes} min · {existing.periodStart} a{' '}
            {existing.periodEnd} · {existing.timezone}
          </p>
        </div>
      )}
    </div>
  );
}
