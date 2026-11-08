'use client';

// One curve workspace: edit/select a reference day or inspect the full period.
// Imported samples remain unchanged when switching views.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { InfoTooltip } from '@/components/ui/tooltip';
import {
  buildManualDayCurve,
  toQuarterHourPattern,
  DAILY_CURVE_PRESETS,
} from '@/supabase/functions/_shared/commercial-industrial/manual-day-curve';
import { LOAD_CURVE_MAX_POINTS, type CommercialIndustrialOptions, type LoadCurve, type LoadCurvePoint, type LoadCurveResolutionMinutes } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiEnergyImport, curvesAlign } from './CiEnergyImport';
import { DailyCurveEditor } from './DailyCurveEditor';
import type { CurveRangeSelection, SelectionSlots } from './LoadCurveChart';
import { ciCurveDays, ciDayRange, ciEditorRange } from './ci-curve-days';
import { buildDailySolarProfile, buildSolarPreviewPoints, updateDailySolarProfile } from './ci-daily-solar-profile';
import { DateRangePicker } from './DateRangePicker';
import { CiApplicationModal, type CiApplication } from './CiApplicationModal';
import { computeBackupRequirements } from '@/supabase/functions/_shared/commercial-industrial/backup';
import { resolveBackupCurve } from '@/supabase/functions/_shared/commercial-industrial/backup-curve';
import { DEFAULT_CI_BACKUP_CONFIG, type CiBackupCurveSelection } from '@/supabase/functions/_shared/commercial-industrial/types';

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
  canAccessCiBackup = false,
  initialApplication = null,
  onApplicationClose,
}: {
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
  canAccessCiBackup?: boolean;
  initialApplication?: CiApplication | null;
  onApplicationClose?: () => void;
}) {
  const profileId = useId();
  const [application,setApplication]=useState<CiApplication|null>(initialApplication);
  const closeApplication=()=>{setApplication(null);onApplicationClose?.();};
  const existing = ciOptions.loadCurve;
  const [viewMode,setViewMode]=useState<'day'|'period'>(existing?.source==='csv'?'period':'day');
  const [referenceDate,setReferenceDate]=useState('');
  const [editImportedSolar,setEditImportedSolar]=useState(false);
  const [dailySelection,setDailySelection]=useState<{key:string;slots:SelectionSlots}>({key:'',slots:{a:null,b:null}});
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

  const days = useMemo(() => ciCurveDays(activeCurve), [activeCurve]);
  const matchingDays = sourceMode === 'manual' ? days.filter(day => day.pattern === activePattern) : days;
  const referenceDay = matchingDays.find(day => day.date === referenceDate) ?? matchingDays[0];
  const dailyKey = JSON.stringify([
    sourceMode, referenceDay?.date, activeCurve?.resolutionMinutes,
    activeCurve?.points[0]?.timestamp, activeCurve?.points.at(-1)?.timestamp, activeCurve?.points.length,
  ]);
  const dailySlots: SelectionSlots = dailySelection.key === dailyKey ? dailySelection.slots : { a: null, b: null };
  const setDailySlots: React.Dispatch<React.SetStateAction<SelectionSlots>> = update => setDailySelection(previous => {
    const slots = previous.key === dailyKey ? previous.slots : { a: null, b: null };
    return { key: dailyKey, slots: typeof update === 'function' ? update(slots) : update };
  });
  const selectDailyRange = (range: CurveRangeSelection | null) => {
    if (!activeCurve || !referenceDay) return;
    const actual = range ? ciDayRange(activeCurve, referenceDay, range) : null;
    setDailySlots(previous => {
      if (actual) return previous.a ? { ...previous, b: actual } : { a: actual, b: null };
      return previous.b ? { ...previous, b: null } : { a: null, b: null };
    });
  };
  const editorRanges = activeCurve && referenceDay
    ? [dailySlots.a, dailySlots.b].map(range => ciEditorRange(activeCurve, referenceDay, range))
      .filter((range): range is CurveRangeSelection => range !== null)
    : [];
  const csvDayCurve = activeCurve && referenceDay ? {
    ...activeCurve, periodStart: referenceDay.date, periodEnd: referenceDay.date,
    points: referenceDay.indices.map(index => activeCurve.points[index]),
  } : null;

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
      setViewMode('day');
      setFileName(null);
      return;
    }
    const customPreset = customPresets.find((p) => p.id === presetId);
    if (customPreset) {
      setSelectedPresetId(customPreset.id);
      setWeekdayKw(toQuarterHourPattern(customPreset.weekdayKw));
      setWeekendKw(toQuarterHourPattern(customPreset.weekendKw));
      setSourceMode('manual');
      setViewMode('day');
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
  let backupSummary:ReturnType<typeof computeBackupRequirements>=null;
  let backupError:string|null=null;
  if(canAccessCiBackup&&ciOptions.backup?.enabled){
    try{backupSummary=computeBackupRequirements(ciOptions.backup,activeCurve);}
    catch(cause){backupError=cause instanceof Error?cause.message:'Revise a seleção de backup.';}
  }
  const applyBackupSelection=(selection:CiBackupCurveSelection)=>{
    if(!canAccessCiBackup||!activeCurve)return;
    const preview=resolveBackupCurve(selection,activeCurve);
    onChange({loadCurve:activeCurve,backup:{...DEFAULT_CI_BACKUP_CONFIG,...ciOptions.backup,enabled:true,inputMode:'simple',curveSelection:selection,targetPowerKw:preview.continuousPowerKw,autonomyHours:preview.durationHours}});
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">Curvas e aplicações</h2>
        <InfoTooltip label="Sobre curvas e aplicações">Importe consumo e geração de até 7 dias ou edite um perfil de consumo em intervalos de 15 minutos. Configure FV, gerador e backup nas aplicações do projeto.</InfoTooltip>
      </div>

      <section aria-label="Aplicações do projeto" className="space-y-3">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold">Aplicações</h3>
          <InfoTooltip label="Sobre as aplicações">Ajuste a geração FV, o gerador e a reserva de backup sem sair da curva. Para vincular o backup ao consumo, selecione um intervalo no gráfico e aplique-o ao backup.</InfoTooltip>
        </div>
        <div className={`grid gap-2 ${canAccessCiBackup?'sm:grid-cols-3':''}`}>
          {([{id:'solar',label:'FV',enabled:ciOptions.solar?.enabled},{id:'generator',label:'Gerador',enabled:ciOptions.generator?.enabled},{id:'backup',label:'Backup',enabled:ciOptions.backup?.enabled}] as const).filter(item=>item.id==='solar'||canAccessCiBackup).map(item=><Button key={item.id} type="button" variant="outline" aria-label={`Configurar ${item.id==='solar'?'FV':item.label.toLowerCase()}`} aria-haspopup="dialog" onClick={()=>setApplication(item.id)} className="h-auto justify-between gap-3 p-3">
            <span className="text-sm font-medium">{item.label}</span>
            <span className="flex items-center gap-2"><Badge variant={item.enabled?'secondary':'outline'}>{item.enabled?'Ativo':'Desativado'}</Badge><ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true"/></span>
          </Button>)}
        </div>
        {backupSummary&&<div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
          <span className="flex items-center gap-1 font-medium">Reserva de backup<InfoTooltip label="Sobre a reserva de backup">Requisitos com margem de segurança, antes das perdas. Revise cargas, autonomia e transferência em Configurar backup.</InfoTooltip></span>
          <span>{backupSummary.requiredContinuousPowerKw.toFixed(2)} kW contínuos</span><span>{backupSummary.requiredPeakPowerKw.toFixed(2)} kW de pico</span><span>{backupSummary.autonomyHours.toFixed(2)} h</span><span>{backupSummary.requiredEnergyKwh.toFixed(2)} kWh</span>
        </div>}
        {backupError&&<p role="alert" className="text-xs text-destructive">{backupError}</p>}
      </section>

      <CiEnergyImport actions={<>
        <Button type="button" variant="ghost" size="sm" onClick={handleDownloadTemplate} className="gap-1.5 text-xs text-muted-foreground">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />Baixar CSV modelo
        </Button>
        {(existing || fileName || !isCurveCleared) && <Button type="button" variant="ghost" size="sm" onClick={handleClearCurve} className="text-xs text-muted-foreground hover:text-destructive">Remover curva</Button>}
      </>} ciOptions={ciOptions} onChange={onChange} onImported={(result, name) => {
        if (!result.consumption) return;
        setSourceMode('csv'); setViewMode('period');setEditImportedSolar(false); setIsCurveCleared(false); setFileName(name);
        setResolutionMinutes(result.consumption.resolutionMinutes);
        setTimezone(result.consumption.timezone);
        setPeriodStart(result.consumption.periodStart); setPeriodEnd(result.consumption.periodEnd);
      }} />

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
      <section aria-label="Curva principal" className="space-y-4 rounded-xl border border-border/80 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold">Consumo e geração</h3>
            <InfoTooltip label="Sobre a curva do projeto">O modo Dia permite editar o perfil e selecionar intervalos na data de referência. Período exibe a curva inteira. Exportar CSV sempre inclui todos os pontos.</InfoTooltip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Visualização da curva" className="inline-flex gap-1">
              <Button type="button" size="sm" variant={viewMode==='day'?'default':'outline'} aria-pressed={viewMode==='day'} onClick={()=>setViewMode('day')}>Dia</Button>
              <Button type="button" size="sm" variant={viewMode==='period'?'default':'outline'} aria-pressed={viewMode==='period'} onClick={()=>setViewMode('period')}>Período</Button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={handleExportCurrentCsv} disabled={!activeCurve} className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" aria-hidden="true"/>Exportar CSV</Button>
          </div>
        </div>
        {sourceMode==='csv'&&fileName&&<p className="break-all text-xs text-muted-foreground">CSV · {fileName}</p>}
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

          <div className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Amostras</span>
            <p className="flex h-8 items-center gap-1 tabular-nums">{pointCount} / {LOAD_CURVE_MAX_POINTS} pontos · <span>{resolutionMinutes} min</span>
              <InfoTooltip label="Sobre as amostras da curva">Até 672 pontos em 7 dias. Perfis manuais usam intervalos de 15 minutos; arquivos CSV mantêm os horários e a resolução de origem.</InfoTooltip>
            </p>
          </div>
        </div>

        {viewMode==='day'&&<div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs">Dia de referência<Select aria-label="Dia de referência" value={referenceDay?.date??''} disabled={!matchingDays.length} onChange={event=>setReferenceDate(event.target.value)}>{matchingDays.length?matchingDays.map(day=><option key={day.date} value={day.date}>{day.label}</option>):<option value="">Sem dia disponível</option>}</Select></label>
          <div className="space-y-1 text-xs"><span className="flex items-center gap-1"><label htmlFor={profileId}>Perfil base</label><InfoTooltip label="Sobre o perfil base">O perfil editado se repete nos dias úteis ou fins de semana. A seleção de intervalo usa a data de referência e a resolução da curva.</InfoTooltip></span><Select id={profileId} aria-label="Perfil base" value={selectedPresetId} onChange={event=>handleSelectPreset(event.target.value)}>
            {DAILY_CURVE_PRESETS.map(preset=><option key={preset.id} value={preset.id}>{preset.label}</option>)}
            {customPresets.length>0&&<optgroup label="Modelos salvos">{customPresets.map(preset=><option key={preset.id} value={preset.id}>★ {preset.label}</option>)}</optgroup>}
            <option value="custom">Personalizado</option>
          </Select></div>
          {sourceMode==='csv'&&dailySolarKw&&<Button type="button" size="sm" variant="outline" onClick={()=>{if(referenceDay)setActivePattern(referenceDay.pattern);setEditImportedSolar(value=>!value);}}>{editImportedSolar?'Ver dados do dia':'Editar perfil FV'}</Button>}
          {sourceMode==='csv'&&<Button type="button" size="sm" variant="outline" onClick={()=>{setSourceMode('manual');setResolutionMinutes(15);setIsCurveCleared(false);setSelectedPresetId('custom');}}>Editar perfil típico</Button>}
        </div>}
        {viewMode==='day'&&sourceMode==='csv'&&<p className="text-xs text-muted-foreground">Editar perfil típico ou escolher um perfil base substitui o consumo importado.</p>}
        {sourceMode==='manual'&&<div hidden={viewMode!=='day'} className="space-y-4">
          <DailyCurveEditor
            solarKw={dailySolarKw}
            onSolarChange={activeCurve?handleUpdateSolarKw:undefined}
            solarDescription={ciOptions.solar?.generationCurve?.source==='manual'?'Perfil FV personalizado · edite os pontos':ciOptions.solar?.generationCurve||ciOptions.solar?.generationPoints?'Média por horário dos dias selecionados · dados importados':'Geração estimada em Solar FV'}
            weekdayKw={weekdayKw} weekendKw={weekendKw} activePattern={activePattern} onPatternChange={setActivePattern}
            onUpdatePatternKw={handleUpdatePatternKw} onSaveAsCustomModel={handleSaveAsCustomModel} saveModelLimitReached={customPresets.length>=MAX_CUSTOM_PRESETS}
            onSelectRange={activeCurve&&referenceDay?selectDailyRange:undefined} selectedRanges={editorRanges}
          />
          {activeCurve&&(dailySlots.a||dailySlots.b)&&<LoadCurveChart summaryOnly points={activeCurve.points} generationPoints={weeklySolarPoints} resolutionMinutes={activeCurve.resolutionMinutes} timezone={activeCurve.timezone} selectionSlots={dailySlots} onSelectionSlotsChange={setDailySlots} backupCurve={canAccessCiBackup?activeCurve:undefined} onApplyBackupSelection={canAccessCiBackup?applyBackupSelection:undefined}/>}
        </div>}
        {sourceMode==='csv'&&viewMode==='day'&&editImportedSolar&&dailySolarKw&&<div className="space-y-3"><div className="flex items-center gap-1 text-xs font-medium">Perfil FV<InfoTooltip label="Sobre a edição do perfil FV">A edição é feita por tipo de dia. O consumo importado é preservado; a geração é alinhada aos horários originais.</InfoTooltip></div><DailyCurveEditor solarOnly weekdayKw={weekdayKw} weekendKw={weekendKw} activePattern={activePattern} onPatternChange={setActivePattern} solarKw={dailySolarKw} onSolarChange={handleUpdateSolarKw}/></div>}
        {sourceMode==='csv'&&viewMode==='day'&&!editImportedSolar&&csvDayCurve&&<LoadCurveChart key={`day:${dailyKey}`} points={csvDayCurve.points} generationPoints={weeklySolarPoints?referenceDay?.indices.map(index=>weeklySolarPoints[index]):undefined} resolutionMinutes={csvDayCurve.resolutionMinutes} timezone={csvDayCurve.timezone} contractedDemandKw={ciOptions.tariff?.contractedDemandKw} backupCurve={canAccessCiBackup?csvDayCurve:undefined} onApplyBackupSelection={canAccessCiBackup?applyBackupSelection:undefined}/>}
        <div hidden={viewMode!=='period'}>
          {activeCurve?<LoadCurveChart points={activeCurve.points} generationPoints={weeklySolarPoints} resolutionMinutes={activeCurve.resolutionMinutes} timezone={activeCurve.timezone} contractedDemandKw={ciOptions.tariff?.contractedDemandKw} backupCurve={canAccessCiBackup?activeCurve:undefined} onApplyBackupSelection={canAccessCiBackup?applyBackupSelection:undefined}/>:<p className="flex h-36 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">Nenhuma curva de carga disponível para exibição.</p>}
        </div>
        {modelSaveError&&<p role="alert" className="text-xs text-destructive">{modelSaveError}</p>}
      </section>

      {/* Navigation follows the curve and application settings. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        {onNavigatePrev ? (
          <Button type="button" variant="outline" onClick={onNavigatePrev} className="gap-1.5 rounded-lg text-xs">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para Configuração BESS
          </Button>
        ) : (
          <div />
        )}

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
      {application&&(application==='solar'||canAccessCiBackup)&&<CiApplicationModal key={application} application={application} ciOptions={ciOptions} onSave={onChange} onClose={closeApplication}/>}
    </div>
  );
}
