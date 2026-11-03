'use client';

// Fase 6, section 8.1 item 3 ("Curva de carga") — redesigned load curve interface.
// Follows the C&I specification:
// 1. Compact header with "Dimensionamento BESS" and BESS -> Curva de carga -> Tarifa steps.
// 2. Title "Curva de carga", subtitle, and "Importar CSV" action.
// 3. Compact configuration strip (periodStart, periodEnd, resolution segmented, timezone).
// 4. Panel "Editor do perfil diário" with base profile select, 2-column layout (chart + lateral editor).
// 5. Panel "Prévia da semana" with 4 indicators strip, ~180px weekly chart with weekend shading,
//    contracted demand line, and bottom status banner.
// 6. Footer with navigation buttons and measurements count.

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileUp, Sparkles, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { parseLoadCurveCsv, summarizeLoadCurve } from '@/supabase/functions/_shared/commercial-industrial/load-curve';
import {
  buildManualDayCurve,
  DAILY_CURVE_PRESETS,
  type DailyCurvePreset,
} from '@/supabase/functions/_shared/commercial-industrial/manual-day-curve';
import {
  LOAD_CURVE_MAX_POINTS,
  type CommercialIndustrialOptions,
  type LoadCurve,
  type LoadCurvePoint,
  type LoadCurveResolutionMinutes,
} from '@/supabase/functions/_shared/commercial-industrial/types';
import { DailyCurveEditor } from './DailyCurveEditor';

export const BRAZIL_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3)' },
  { value: 'America/Manaus', label: 'Manaus / Cuiabá (UTC-4)' },
] as const;

export type BrazilTimezone = (typeof BRAZIL_TIMEZONES)[number]['value'];

const resolutionOptions: LoadCurveResolutionMinutes[] = [15, 30, 60];
type CurveSourceMode = 'csv' | 'manual';
type DailyPattern = 'weekday' | 'weekend';

// uPlot touches the canvas/DOM as soon as its module runs — ssr:false keeps
// that entirely out of the server render.
const LoadCurveChart = dynamic(() => import('./LoadCurveChart').then((mod) => mod.LoadCurveChart), {
  ssr: false,
  loading: () => <div className="h-[180px] w-full animate-pulse rounded-lg bg-muted" />,
});

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function generateCurveCsvContent(points: LoadCurvePoint[]): string {
  const header = 'timestamp,powerKw\n';
  const rows = points.map((p) => `${p.timestamp},${p.powerKw}`).join('\n');
  return header + rows;
}

export function CiLoadCurvePanel({
  ciOptions,
  onChange,
  onNavigateNext,
  onNavigatePrev,
}: {
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
}) {
  const existing = ciOptions.loadCurve;
  const initialManualConfig = existing?.manualConfig ?? null;
  const hasManualConfig = Boolean(
    initialManualConfig &&
      Array.isArray(initialManualConfig.weekdayKw) &&
      initialManualConfig.weekdayKw.length === 24 &&
      Array.isArray(initialManualConfig.weekendKw) &&
      initialManualConfig.weekendKw.length === 24
  );
  const initialTimezone =
    existing?.timezone === 'America/Manaus' || existing?.timezone === 'America/Cuiaba'
      ? 'America/Manaus'
      : 'America/Sao_Paulo';

  const [resolutionMinutes, setResolutionMinutes] = useState<LoadCurveResolutionMinutes>(existing?.resolutionMinutes ?? 15);
  const [timezone, setTimezone] = useState<string>(initialTimezone);
  const [periodStart, setPeriodStart] = useState(existing?.periodStart ?? todayIsoDate());
  const [periodEnd, setPeriodEnd] = useState(existing?.periodEnd ?? addDaysIsoDate(todayIsoDate(), 6));
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);

  const [isCurveCleared, setIsCurveCleared] = useState(false);
  const [sourceMode, setSourceMode] = useState<CurveSourceMode>(existing?.source === 'csv' ? 'csv' : 'manual');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    hasManualConfig ? (initialManualConfig!.presetId ?? 'custom') : 'comercio'
  );
  const [weekdayKw, setWeekdayKw] = useState<number[]>(
    hasManualConfig ? initialManualConfig!.weekdayKw.slice() : DAILY_CURVE_PRESETS[0].weekdayKw.slice()
  );
  const [weekendKw, setWeekendKw] = useState<number[]>(
    hasManualConfig ? initialManualConfig!.weekendKw.slice() : DAILY_CURVE_PRESETS[0].weekendKw.slice()
  );
  const [activePattern, setActivePattern] = useState<DailyPattern>('weekday');

  // Derive CSV parsed curve
  const parseResult =
    csvText === null
      ? null
      : parseLoadCurveCsv(csvText, { resolutionMinutes, timezone, periodStart, periodEnd, profileBasis: 'representative_period' });
  const parsedCurve = parseResult?.ok ? parseResult.curve : null;

  // Derive manual curve
  const manualResult =
    sourceMode === 'manual' && !isCurveCleared
      ? buildManualDayCurve(weekdayKw, weekendKw, { resolutionMinutes, timezone, periodStart, periodEnd }, selectedPresetId)
      : null;
  const manualCurve = manualResult?.ok ? manualResult.curve : null;

  // Active curve displayed in the preview
  const activeCurve: LoadCurve | null =
    isCurveCleared
      ? null
      : sourceMode === 'csv'
      ? parsedCurve
      : (existing && existing.source === 'manual' ? existing : manualCurve);

  const errors =
    sourceMode === 'csv'
      ? (parseResult && !parseResult.ok ? parseResult.errors : [])
      : (manualResult && !manualResult.ok ? manualResult.errors : []);
  const warnings = sourceMode === 'csv' && parseResult?.ok ? parseResult.warnings : [];

  // Emit CSV curve update
  useEffect(() => {
    if (sourceMode === 'csv' && parsedCurve) {
      setIsCurveCleared(false);
      onChange({ loadCurve: parsedCurve });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvText, resolutionMinutes, timezone, periodStart, periodEnd, sourceMode]);

  // Emit manual curve update
  const isInitialManualMountRef = useRef(true);
  useEffect(() => {
    if (isInitialManualMountRef.current) {
      isInitialManualMountRef.current = false;
      if (existing) return;
    }
    if (sourceMode === 'manual' && manualCurve && !isCurveCleared) {
      onChange({ loadCurve: manualCurve });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, weekdayKw, weekendKw, resolutionMinutes, timezone, periodStart, periodEnd, selectedPresetId, isCurveCleared]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setSourceMode('csv');
    setIsCurveCleared(false);
    const reader = new FileReader();
    reader.onload = () => setCsvText(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  }

  function handleSelectPreset(presetId: string) {
    setIsCurveCleared(false);
    if (presetId === 'custom') {
      setSelectedPresetId('custom');
      return;
    }
    const preset = DAILY_CURVE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setWeekdayKw(preset.weekdayKw.slice());
    setWeekendKw(preset.weekendKw.slice());
    setSourceMode('manual');
    setFileName(null);
    setCsvText(null);
  }

  function handleUpdatePatternKw(pattern: DailyPattern, kw: number[]) {
    setIsCurveCleared(false);
    setSelectedPresetId('custom');
    setSourceMode('manual');
    if (pattern === 'weekday') {
      setWeekdayKw(kw);
    } else {
      setWeekendKw(kw);
    }
  }

  function handleClearCurve() {
    setIsCurveCleared(true);
    setFileName(null);
    setCsvText(null);
    onChange({ loadCurve: null });
  }

  function handleDownloadTemplate() {
    const sample = buildManualDayCurve(DAILY_CURVE_PRESETS[0].weekdayKw, DAILY_CURVE_PRESETS[0].weekendKw, {
      resolutionMinutes,
      periodStart,
      periodEnd,
      timezone,
    });
    if (sample.ok) {
      const csvContent = generateCurveCsvContent(sample.curve.points);
      downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), 'modelo-curva-de-carga.csv');
    }
  }

  function handleExportCurrentCsv() {
    const curveToExport = activeCurve ?? existing ?? manualCurve;
    if (!curveToExport) return;
    const csvContent = generateCurveCsvContent(curveToExport.points);
    downloadBlob(
      new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
      `curva-carga-${curveToExport.periodStart}_${curveToExport.periodEnd}.csv`
    );
  }

  const pointCount = activeCurve ? activeCurve.points.length : (existing ? existing.points.length : 0);

  return (
    <div className="space-y-5">
      {/* 1. Cabeçalho compacto com etapas: Dimensionamento BESS | BESS -> Curva de carga -> Tarifa */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Dimensionamento BESS
        </span>
        <nav aria-label="Etapas do dimensionamento" className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={onNavigatePrev}
            className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              ✓
            </span>
            <span>BESS</span>
          </button>
          <span className="text-muted-foreground/40">→</span>
          <span className="flex items-center gap-1 font-semibold text-primary">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              2
            </span>
            <span>Curva de carga</span>
          </span>
          <span className="text-muted-foreground/40">→</span>
          <button
            type="button"
            onClick={onNavigateNext}
            disabled={!activeCurve}
            className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-medium text-muted-foreground">
              3
            </span>
            <span>Tarifa</span>
          </button>
        </nav>
      </div>

      {/* 2. Título Curva de carga, subtítulo e ação secundária Importar CSV */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[27px]">Curva de carga</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Defina o perfil de consumo e confira a semana representativa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer gap-1.5 rounded-lg text-xs')}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            <span>{fileName ? 'Trocar arquivo' : 'Importar CSV'}</span>
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDownloadTemplate}
            className="gap-1.5 text-xs text-muted-foreground"
            title="Baixar CSV modelo"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Baixar CSV modelo</span>
          </Button>
          {(existing || fileName || !isCurveCleared) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearCurve}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Remover curva
            </Button>
          )}
        </div>
      </div>

      {/* Indicador de curva importada ativa */}
      {sourceMode === 'csv' && fileName && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary shrink-0" />
            <span>
              Curva carregada via CSV: <strong>{fileName}</strong>
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setSourceMode('manual');
              setFileName(null);
              setCsvText(null);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            Voltar para perfil manual
          </Button>
        </div>
      )}

      {/* Mensagens de erro e avisos */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3.5 text-xs text-destructive">
          <p className="flex items-center gap-1.5 font-semibold text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{sourceMode === 'csv' ? 'Não foi possível importar o arquivo' : 'Não foi possível processar a curva'}</span>
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 text-xs text-amber-700 dark:text-amber-300">
          <p className="font-semibold">Curva importada com avisos</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. Faixa compacta de configuração (início/fim do período, resolução segmentada, fuso horário) */}
      <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-none">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className="text-muted-foreground">Início do período</span>
            <Input
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              className="h-8 text-xs bg-background"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className="text-muted-foreground">Fim do período</span>
            <Input
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
              className="h-8 text-xs bg-background"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Resolução</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
              {resolutionOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={resolutionMinutes === option}
                  onClick={() => setResolutionMinutes(option)}
                  className={cn(
                    'flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium transition',
                    resolutionMinutes === option
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  )}
                >
                  {option} min
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className="text-muted-foreground">Fuso horário</span>
            <Select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              aria-label="Fuso horário"
              className="h-8 text-xs bg-background"
            >
              {BRAZIL_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      {/* 4. Painel Editor do perfil diário */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-none space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Editor do perfil diário</h2>
            <p className="text-xs text-muted-foreground">Ajuste o consumo típico de 24 horas por faixa horária.</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="base-profile-select" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Perfil base:
            </label>
            <Select
              id="base-profile-select"
              value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="h-8 w-48 text-xs font-medium bg-background"
              aria-label="Perfil base"
            >
              {DAILY_CURVE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Personalizado</option>
            </Select>
          </div>
        </div>

        <DailyCurveEditor
          weekdayKw={weekdayKw}
          weekendKw={weekendKw}
          activePattern={activePattern}
          onPatternChange={setActivePattern}
          onUpdatePatternKw={handleUpdatePatternKw}
        />
      </div>

      {/* 5. Painel Prévia da semana */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-none space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Prévia da semana · Resumo</h2>
            <p className="text-xs text-muted-foreground">
              {periodStart} a {periodEnd} · {pointCount} amostras ({timezone})
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCurrentCsv}
            disabled={!activeCurve}
            className="gap-1.5 rounded-lg text-xs"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exportar CSV
          </Button>
        </div>

        {activeCurve ? (
          <LoadCurveChart
            points={activeCurve.points}
            resolutionMinutes={activeCurve.resolutionMinutes}
            contractedDemandKw={ciOptions.tariff?.contractedDemandKw}
          />
        ) : (
          <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            Nenhuma curva de carga disponível para exibição.
          </div>
        )}
      </div>

      {/* 6. Rodapé com navegação e resumo de pontos */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        {onNavigatePrev ? (
          <Button type="button" variant="outline" onClick={onNavigatePrev} className="gap-1.5 rounded-lg text-xs">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para BESS
          </Button>
        ) : (
          <div />
        )}

        <div className="text-xs text-muted-foreground tabular-nums text-center">
          {pointCount} / {LOAD_CURVE_MAX_POINTS} pontos · resolução {resolutionMinutes} min
        </div>

        {onNavigateNext ? (
          <Button
            type="button"
            onClick={onNavigateNext}
            disabled={!existing}
            className="gap-1.5 rounded-lg text-xs font-semibold"
          >
            Avançar para Tarifa
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
