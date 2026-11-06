'use client';

// Fase 6, section 8.1 item 3 ("Curva de carga") — redesigned load curve interface.
// Follows the C&I specification:
// 1. Title "Curva de carga", subtitle, and "Importar CSV" action.
// 3. Compact configuration strip (periodStart, periodEnd, resolution segmented, timezone).
// 4. Panel "Editor do perfil diário" with base profile select, 2-column layout (chart + lateral editor).
// 5. Panel "Prévia da semana" with 4 indicators strip, 235px weekly chart with weekend shading,
//    contracted demand line, and bottom status banner.
// 6. Footer with navigation buttons and measurements count.

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  buildManualDayCurve,
  toQuarterHourPattern,
  DAILY_CURVE_PRESETS,
} from '@/supabase/functions/_shared/commercial-industrial/manual-day-curve';
import { LOAD_CURVE_MAX_POINTS, type CommercialIndustrialOptions, type LoadCurve, type LoadCurvePoint, type LoadCurveResolutionMinutes } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiEnergyImport, curvesAlign } from './CiEnergyImport';
import { DailyCurveEditor } from './DailyCurveEditor';
import { buildDailySolarProfile, buildSolarPreviewPoints, updateDailySolarProfile } from './ci-daily-solar-profile';
import { DateRangePicker } from './DateRangePicker';

export const BRAZIL_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3)' },
  { value: 'America/Manaus', label: 'Manaus / Cuiabá (UTC-4)' },
] as const;

export type BrazilTimezone = (typeof BRAZIL_TIMEZONES)[number]['value'];

type CurveSourceMode = 'csv' | 'manual';
type DailyPattern = 'weekday' | 'weekend';

// uPlot touches the canvas/DOM as soon as its module runs — ssr:false keeps
// that entirely out of the server render.
const LoadCurveChart = dynamic(() => import('./LoadCurveChart').then((mod) => mod.LoadCurveChart), {
  ssr: false,
  loading: () => <div className="h-[235px] w-full animate-pulse rounded-lg bg-muted" />,
});

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const CUSTOM_PRESETS_STORAGE_KEY = 'solax_ci_custom_daily_profiles';
const MAX_CUSTOM_PRESETS = 5;

interface StoredCustomPreset {
  id: string;
  label: string;
  weekdayKw: number[];
  weekendKw: number[];
}

function loadCustomPresetsFromStorage(): StoredCustomPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomPresetToStorage(preset: StoredCustomPreset): StoredCustomPreset[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const current = loadCustomPresetsFromStorage();
    if (current.length >= MAX_CUSTOM_PRESETS) return null;
    const updated = [...current.filter((p) => p.id !== preset.id), preset];
    localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return null;
  }
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
      [24, 96].includes(initialManualConfig.weekdayKw.length) &&
      Array.isArray(initialManualConfig.weekendKw) &&
      [24, 96].includes(initialManualConfig.weekendKw.length)
  );
  const initialTimezone =
    existing?.timezone === 'America/Manaus' || existing?.timezone === 'America/Cuiaba'
      ? 'America/Manaus'
      : 'America/Sao_Paulo';

  const [resolutionMinutes, setResolutionMinutes] = useState<LoadCurveResolutionMinutes>(existing?.resolutionMinutes ?? 15);
  const [timezone, setTimezone] = useState<string>(initialTimezone);
  const [periodStart, setPeriodStart] = useState(existing?.periodStart ?? todayIsoDate());
  const [periodEnd, setPeriodEnd] = useState(existing?.periodEnd ?? addDaysIsoDate(todayIsoDate(), 6));
  const [fileName, setFileName] = useState<string | null>(existing?.source === 'csv' ? 'Curva salva' : null);

  const [isCurveCleared, setIsCurveCleared] = useState(false);
  const [sourceMode, setSourceMode] = useState<CurveSourceMode>(existing?.source === 'csv' ? 'csv' : 'manual');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    hasManualConfig ? (initialManualConfig!.presetId ?? 'custom') : 'comercio'
  );
  const [weekdayKw, setWeekdayKw] = useState<number[]>(
    hasManualConfig ? toQuarterHourPattern(initialManualConfig!.weekdayKw) : toQuarterHourPattern(DAILY_CURVE_PRESETS[0].weekdayKw)
  );
  const [weekendKw, setWeekendKw] = useState<number[]>(
    hasManualConfig ? toQuarterHourPattern(initialManualConfig!.weekendKw) : toQuarterHourPattern(DAILY_CURVE_PRESETS[0].weekendKw)
  );
  const [activePattern, setActivePattern] = useState<DailyPattern>('weekday');
  const [customPresets, setCustomPresets] = useState<StoredCustomPreset[]>([]);
  const [modelSaveError, setModelSaveError] = useState<string | null>(null);

  useEffect(() => {
    setCustomPresets(loadCustomPresetsFromStorage());
  }, []);

  function handleSaveAsCustomModel(name: string, newWeekdayKw: number[], newWeekendKw: number[]) {
    if (customPresets.length >= MAX_CUSTOM_PRESETS) return false;
    const newPreset: StoredCustomPreset = {
      id: `custom-${Date.now()}`,
      label: name,
      weekdayKw: newWeekdayKw.slice(),
      weekendKw: newWeekendKw.slice(),
    };
    const saved = saveCustomPresetToStorage(newPreset);
    if (!saved) {
      const current = loadCustomPresetsFromStorage();
      setCustomPresets(current);
      setModelSaveError(current.length >= MAX_CUSTOM_PRESETS ? null : 'Não foi possível salvar o modelo neste navegador.');
      return false;
    }
    setCustomPresets(saved);
    setModelSaveError(null);
    setSelectedPresetId(newPreset.id);
    return true;
  }

  // Derive manual curve
  const manualResult = useMemo(() => {
    if (sourceMode !== 'manual' || isCurveCleared) return null;
    return buildManualDayCurve(
      weekdayKw,
      weekendKw,
      { resolutionMinutes, timezone, periodStart, periodEnd },
      selectedPresetId
    );
  }, [sourceMode, isCurveCleared, weekdayKw, weekendKw, resolutionMinutes, timezone, periodStart, periodEnd, selectedPresetId]);
  const manualCurve = manualResult?.ok ? manualResult.curve : null;

  // Active curve displayed in the preview
  const activeCurve: LoadCurve | null =
    isCurveCleared
      ? null
      : sourceMode === 'csv'
      ? (existing?.source === 'csv' ? existing : null)
      : (manualCurve ?? (existing?.source === 'manual' ? existing : null));

  const dailySolarKw = useMemo(() => buildDailySolarProfile(ciOptions.solar, activePattern, timezone, activeCurve), [ciOptions.solar, activePattern, timezone, activeCurve]);

  const weeklySolarPoints = useMemo(() => activeCurve ? buildSolarPreviewPoints(ciOptions.solar, activeCurve) : undefined, [ciOptions.solar, activeCurve]);

  // Reproject edited PV patterns when the consumption period/resolution changes.
  useEffect(() => {
    const solar = ciOptions.solar;
    if (!activeCurve || !solar?.enabled || solar.generationCurve?.source !== 'manual' || !solar.generationCurve.manualConfig || !weeklySolarPoints) return;
    const previous = solar.generationCurve;
    if (previous.resolutionMinutes === activeCurve.resolutionMinutes && previous.timezone === activeCurve.timezone && previous.points.length === weeklySolarPoints.length && previous.points.every((point, index) => point.timestamp === weeklySolarPoints[index].timestamp && point.powerKw === weeklySolarPoints[index].powerKw)) return;
    onChange({ solar: { ...solar, generationCurve: { ...previous, periodStart: activeCurve.periodStart, periodEnd: activeCurve.periodEnd, timezone: activeCurve.timezone, resolutionMinutes: activeCurve.resolutionMinutes, points: weeklySolarPoints.map(point => ({ ...point, powerKw: point.powerKw ?? 0 })) } } });
  }, [activeCurve, ciOptions.solar, weeklySolarPoints, onChange]);

  function handleUpdateSolarKw(values: number[]) {
    if (!ciOptions.solar?.enabled || !activeCurve) return;
    onChange({ solar: updateDailySolarProfile(ciOptions.solar, activeCurve, activePattern, values) });
  }

  const errors = manualResult && !manualResult.ok ? manualResult.errors : [];
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

  function handleSelectPreset(presetId: string) {
    setIsCurveCleared(false);
    if (presetId === 'custom') {
      setSelectedPresetId('custom');
      return;
    }
    const standardPreset = DAILY_CURVE_PRESETS.find((p) => p.id === presetId);
    if (standardPreset) {
      setSelectedPresetId(standardPreset.id);
      setWeekdayKw(toQuarterHourPattern(standardPreset.weekdayKw));
      setWeekendKw(toQuarterHourPattern(standardPreset.weekendKw));
      setSourceMode('manual');
      setFileName(null);
      return;
    }
    const customPreset = customPresets.find((p) => p.id === presetId);
    if (customPreset) {
      setSelectedPresetId(customPreset.id);
      setWeekdayKw(toQuarterHourPattern(customPreset.weekdayKw));
      setWeekendKw(toQuarterHourPattern(customPreset.weekendKw));
      setSourceMode('manual');
      setFileName(null);
    }
  }

  function handleUpdatePatternKw(pattern: DailyPattern, kw: number[]) {
    setIsCurveCleared(false);
    setSelectedPresetId('custom');
    setSourceMode('manual');
    setResolutionMinutes(15);
    if (pattern === 'weekday') {
      setWeekdayKw(kw);
    } else {
      setWeekendKw(kw);
    }
  }

  function handleClearCurve() {
    setIsCurveCleared(true);
    setFileName(null);
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
      {/* 1. Título Curva de carga, subtítulo e ação secundária Importar CSV */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Curva de carga</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Importe consumo e geração de até 7 dias ou edite o perfil de consumo a cada 15 minutos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <CiEnergyImport ciOptions={ciOptions} onChange={onChange} onImported={(result, name) => {
        if (!result.consumption) return;
        setSourceMode('csv'); setIsCurveCleared(false); setFileName(name);
        setResolutionMinutes(result.consumption.resolutionMinutes);
        setTimezone(result.consumption.timezone);
        setPeriodStart(result.consumption.periodStart); setPeriodEnd(result.consumption.periodEnd);
      }} />

      {/* Indicador de curva importada ativa */}
      {sourceMode === 'csv' && fileName && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-xs text-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <FileUp className="h-4 w-4 text-primary shrink-0" />
            <span>
              Curva carregada via CSV: <strong>{fileName}</strong>
            </span>
            <span className="text-muted-foreground">({pointCount} pontos)</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span>Intervalo: {resolutionMinutes} min · até 7 dias</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setSourceMode('manual');
                setFileName(null);
                setResolutionMinutes(15);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Voltar para perfil manual
            </Button>
          </div>
        </div>
      )}

      {/* Mensagens de erro e avisos */}
      {errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3.5 text-xs text-destructive">
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

      {ciOptions.solar?.enabled && ciOptions.solar.generationCurve && activeCurve && !curvesAlign(activeCurve, ciOptions.solar.generationCurve) && <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">A geração importada não cobre todos os horários deste consumo. Importe consumo e geração com o mesmo período e intervalo antes de calcular.</p>}

      {/* 3. Faixa compacta de configuração (Período unificado, Fuso horário, Resolução) */}
      <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-none">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 items-end">
          {/* Seletor de período com dropdown de calendário personalizado */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Período</span>
            {sourceMode === 'csv' ? <p className="flex h-8 items-center text-xs">{periodStart} a {periodEnd} · período do arquivo</p> : <DateRangePicker
              startDate={periodStart}
              endDate={periodEnd}
              onChange={({ startDate, endDate }) => {
                setPeriodStart(startDate);
                setPeriodEnd(endDate);
              }}
              maxDays={7}
            />}
          </div>

          {/* Fuso horário */}
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className="text-muted-foreground">Fuso horário</span>
            <Select
              disabled={sourceMode === 'csv'}
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

          {/* Resolução */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Resolução temporal</span>
              <span className="text-[11px] text-muted-foreground">
                {sourceMode === 'csv' ? 'Arquivo CSV' : 'Padrão C&I'}
              </span>
            </div>
            <div className="flex h-8 items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-3 text-xs">
              <span className="font-semibold text-foreground">{resolutionMinutes} min</span>
              <span className="text-[11px] text-muted-foreground">
                {sourceMode === 'csv' ? 'Do arquivo CSV' : 'Pontos de 15 minutos'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Painel Editor do perfil diário */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-none space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Editor do perfil diário</h2>
            <p className="text-xs text-muted-foreground">{sourceMode === 'csv' ? 'Editar este perfil substitui o consumo importado por um padrão diário de 15 minutos.' : 'Ajuste o consumo típico de 24 horas em intervalos de 15 minutos.'}</p>
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
              {customPresets.length > 0 && (
                <optgroup label="Modelos salvos">
                  {customPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      ★ {p.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="custom">Personalizado</option>
            </Select>
          </div>
        </div>

        <DailyCurveEditor
          solarKw={dailySolarKw}
          onSolarChange={activeCurve ? handleUpdateSolarKw : undefined}
          solarDescription={ciOptions.solar?.generationCurve?.source === 'manual' ? 'Perfil FV personalizado · edite os pontos' : ciOptions.solar?.generationCurve || ciOptions.solar?.generationPoints ? 'Média por horário dos dias selecionados · dados importados' : 'Geração estimada em Solar FV'}
          weekdayKw={weekdayKw}
          weekendKw={weekendKw}
          activePattern={activePattern}
          onPatternChange={setActivePattern}
          onUpdatePatternKw={handleUpdatePatternKw}
          onSaveAsCustomModel={handleSaveAsCustomModel}
          saveModelLimitReached={customPresets.length >= MAX_CUSTOM_PRESETS}
        />
        {modelSaveError && <p role="alert" className="text-xs text-destructive">{modelSaveError}</p>}
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
            generationPoints={weeklySolarPoints}
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
            Voltar para Solar FV
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
