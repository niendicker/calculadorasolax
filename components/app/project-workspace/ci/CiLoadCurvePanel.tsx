'use client';

// One weekly workspace for navigation, analysis, and explicit grouped editing.

import { CiAcPowerProvider, useCiAcPower } from './ci-ac-power';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, Sun, Fuel, ShieldCheck, SlidersHorizontal, Store, Factory, Settings2, Globe2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconSelect } from '@/components/ui/icon-select';
import { InfoTooltip, TooltipList } from '@/components/ui/tooltip';
import {
  buildManualDayCurve,
  toQuarterHourPattern,
  DAILY_CURVE_PRESETS,
  zonedTimeToUtcIso,
} from '@/supabase/functions/_shared/commercial-industrial/manual-day-curve';
import { LOAD_CURVE_MAX_POINTS, type CommercialIndustrialOptions, type LoadCurve, type LoadCurveResolutionMinutes } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiEnergyImport, curvesAlign } from './CiEnergyImport';
import { ciCurveDays } from './ci-curve-days';
import { buildSolarPreviewPoints } from './ci-daily-solar-profile';
import { editGroupedCurvePoints, type CurvePointEdit } from './weekly-curve-editing';
import { exportEnergyCurveCsv } from './ci-energy-csv';
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

// uPlot touches the canvas/DOM as soon as its module runs — ssr:false keeps
// that entirely out of the server render.
const LoadCurveChart = dynamic(() => import('./LoadCurveChart').then((mod) => mod.LoadCurveChart), {
  ssr: false,
  loading: () => <div className="h-[320px] w-full animate-pulse rounded-lg bg-muted" />,
});

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
  const { factor, toKva } = useCiAcPower(ciOptions.acPowerFactor);

  const profileId = useId();
  const dataId = useId();
  const [dataOpen, setDataOpen] = useState(false);
  const [referenceKw, setReferenceKw] = useState<number | undefined>();
  const [application,setApplication]=useState<CiApplication|null>(initialApplication);
  const closeApplication=()=>{setApplication(null);onApplicationClose?.();};
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
    hasManualConfig ? (DAILY_CURVE_PRESETS.some(preset => preset.id === initialManualConfig!.presetId) ? initialManualConfig!.presetId! : 'custom') : 'comercio'
  );
  const [weekdayKw, setWeekdayKw] = useState<number[]>(
    hasManualConfig ? toQuarterHourPattern(initialManualConfig!.weekdayKw) : toQuarterHourPattern(DAILY_CURVE_PRESETS[0].weekdayKw)
  );
  const [weekendKw, setWeekendKw] = useState<number[]>(
    hasManualConfig ? toQuarterHourPattern(initialManualConfig!.weekendKw) : toQuarterHourPattern(DAILY_CURVE_PRESETS[0].weekendKw)
  );
  const [pointOverrides, setPointOverrides] = useState<Record<string, number>>(initialManualConfig?.pointOverrides ?? {});
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
  const manualCurve = useMemo(() => manualResult?.ok ? {
    ...manualResult.curve,
    points: manualResult.curve.points.map(point => ({ ...point, powerKw: pointOverrides[point.timestamp] ?? point.powerKw })),
    manualConfig: { ...manualResult.curve.manualConfig!, pointOverrides },
  } : null, [manualResult, pointOverrides]);

  // Active curve displayed in the preview
  const activeCurve: LoadCurve | null =
    isCurveCleared
      ? null
      : sourceMode === 'csv'
      ? (existing?.source === 'csv' ? existing : null)
      : (manualCurve ?? (existing?.source === 'manual' ? existing : null));

  const days = useMemo(() => ciCurveDays(activeCurve), [activeCurve]);
  const weeklySolarPoints = useMemo(() => activeCurve ? buildSolarPreviewPoints(ciOptions.solar, activeCurve) : undefined, [ciOptions.solar, activeCurve]);
  type EditSnapshot = { curve: LoadCurve; generationCurve: LoadCurve | undefined; generationPoints: number[] | undefined };
  const historyKey = `${sourceMode}:${periodStart}:${periodEnd}:${timezone}:${resolutionMinutes}`;
  const [history, setHistory] = useState<{ key: string; past: EditSnapshot[]; future: EditSnapshot[] }>({ key: '', past: [], future: [] });
  const past = history.key === historyKey ? history.past : [];
  const future = history.key === historyKey ? history.future : [];
  const snapshot = (): EditSnapshot => ({ curve: activeCurve!, generationCurve: ciOptions.solar?.generationCurve, generationPoints: ciOptions.solar?.generationPoints });
  const restore = (saved: EditSnapshot) => {
    if (sourceMode === 'manual') {
      setPointOverrides(saved.curve.manualConfig?.pointOverrides ?? {});
      setSelectedPresetId(saved.curve.manualConfig?.presetId ?? 'custom');
    }
    onChange({ loadCurve: saved.curve, ...(ciOptions.solar ? { solar: { ...ciOptions.solar, generationCurve: saved.generationCurve, generationPoints: saved.generationPoints } } : {}) });
  };
  const editPoints = (edits: CurvePointEdit[], groupedDates: string[], series: 'load' | 'generation') => {
    if (!activeCurve) return;
    const target = series === 'load' ? activeCurve : weeklySolarPoints?.every(point=>point.powerKw!==null) ? { ...activeCurve, points: weeklySolarPoints.map(point=>({...point,powerKw:point.powerKw!})) } : null;
    if (!target) return;
    const points = editGroupedCurvePoints(target, edits, groupedDates);
    if (points.every((point,index)=>point.powerKw===target.points[index].powerKw)) return;
    setHistory({ key: historyKey, past: [...past.slice(-49), snapshot()], future: [] });
    if (series === 'generation' && ciOptions.solar) {
      onChange({ solar: { ...ciOptions.solar, generationPoints: undefined, generationCurve: { ...activeCurve, points, source: 'manual', manualConfig: undefined } } });
    } else if (sourceMode === 'manual') {
      const overrides = { ...pointOverrides };
      points.forEach((point,index)=>{ if(point.powerKw!==activeCurve.points[index].powerKw) overrides[point.timestamp]=point.powerKw; });
      setPointOverrides(overrides);
      setSelectedPresetId('custom');
    } else onChange({ loadCurve: { ...activeCurve, points } });
  };

  // Reproject edited PV patterns when the consumption period/resolution changes.
  useEffect(() => {
    const solar = ciOptions.solar;
    if (!activeCurve || !solar?.enabled || solar.generationCurve?.source !== 'manual' || !solar.generationCurve.manualConfig || !weeklySolarPoints) return;
    const previous = solar.generationCurve;
    if (previous.resolutionMinutes === activeCurve.resolutionMinutes && previous.timezone === activeCurve.timezone && previous.points.length === weeklySolarPoints.length && previous.points.every((point, index) => point.timestamp === weeklySolarPoints[index].timestamp && point.powerKw === weeklySolarPoints[index].powerKw)) return;
    onChange({ solar: { ...solar, generationCurve: { ...previous, periodStart: activeCurve.periodStart, periodEnd: activeCurve.periodEnd, timezone: activeCurve.timezone, resolutionMinutes: activeCurve.resolutionMinutes, points: weeklySolarPoints.map(point => ({ ...point, powerKw: point.powerKw ?? 0 })) } } });
  }, [activeCurve, ciOptions.solar, weeklySolarPoints, onChange]);

  const errors = manualResult && !manualResult.ok ? manualResult.errors : [];
  const dataSettingsOpen = dataOpen || errors.length > 0;
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
  }, [sourceMode, weekdayKw, weekendKw, resolutionMinutes, timezone, periodStart, periodEnd, selectedPresetId, isCurveCleared, pointOverrides]);

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
      setPointOverrides({});
      setHistory({key:'',past:[],future:[]});
      setFileName(null);
      return;
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
      const csvContent = exportEnergyCurveCsv(sample.curve, factor);
      downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), 'modelo-curva-de-carga.csv');
    }
  }

  function handleExportCurrentCsv() {
    const curveToExport = activeCurve ?? existing ?? manualCurve;
    if (!curveToExport) return;
    const csvContent = exportEnergyCurveCsv(curveToExport, factor, ciOptions.solar);
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
    <CiAcPowerProvider powerFactor={factor}><div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-base font-semibold">Curvas e aplicações</h2>
          <InfoTooltip label="Sobre curvas e aplicações"><TooltipList items={[
            <><strong>Curva:</strong> edite os pontos ou importe até 7 dias de medições.</>,
            <><strong>Aplicações:</strong> configure FV, gerador e backup nos botões acima.</>,
            <><strong>Backup:</strong> selecione um intervalo no gráfico e use a ação de backup.</>,
          ]}/></InfoTooltip>
        </div>
        <section aria-label="Aplicações do projeto" className={`grid gap-1.5 sm:flex sm:w-auto ${canAccessCiBackup?'w-full grid-cols-3':'w-auto grid-cols-1'}`}>
          {([{id:'solar',label:'FV',icon:Sun,enabled:ciOptions.solar?.enabled},{id:'generator',label:'Gerador',icon:Fuel,enabled:ciOptions.generator?.enabled},{id:'backup',label:'Backup',icon:ShieldCheck,enabled:ciOptions.backup?.enabled}] as const).filter(item=>item.id==='solar'||canAccessCiBackup).map(item=><Button key={item.id} type="button" size="sm" variant="outline" aria-label={`Configurar ${item.id==='solar'?'FV':item.label.toLowerCase()}`} aria-haspopup="dialog" aria-describedby={`${dataId}-${item.id}-status`} onClick={()=>setApplication(item.id)} className="h-auto flex-col gap-1 px-2 py-2 text-xs sm:h-9 sm:flex-row sm:gap-2 sm:px-3 sm:py-0">
            <item.icon aria-hidden="true" className="hidden size-3.5 text-muted-foreground sm:block" />
            {item.label}<span id={`${dataId}-${item.id}-status`} className={`rounded-md px-1.5 py-0.5 text-[11px] font-normal ${item.enabled?'bg-primary/10 text-primary':'bg-muted text-muted-foreground'}`}>{item.enabled?'Ativo':'Inativo'}</span>
          </Button>)}
        </section>
      </div>
      {backupSummary&&<div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
        <span className="flex items-center gap-1 font-medium text-foreground">Reserva de backup<InfoTooltip label="Sobre a reserva de backup"><TooltipList items={[
          <><strong>Valores:</strong> incluem a margem de segurança, antes das perdas.</>,
          <><strong>Ajustes:</strong> configure cargas, autonomia e transferência em Backup.</>,
        ]}/></InfoTooltip></span>
        <span>{toKva(backupSummary.requiredContinuousPowerKw).toFixed(2)} kVA contínuos</span><span>{toKva(backupSummary.requiredPeakPowerKw).toFixed(2)} kVA de pico</span><span>{backupSummary.autonomyHours.toFixed(2)} h</span><span>{backupSummary.requiredEnergyKwh.toFixed(2)} kWh</span>
      </div>}
      {backupError&&<p role="alert" className="text-xs text-destructive">{backupError}</p>}

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

      <section aria-label="Curva principal" className="space-y-3 rounded-xl border border-border/80 bg-card p-3 sm:p-4">
        <header className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h3 className="text-sm font-semibold">Consumo e geração</h3>
              <InfoTooltip label="Sobre a curva atual"><TooltipList items={[
                <><strong>Origem:</strong> {sourceMode==='csv'?`CSV · ${fileName??'Curva salva'}`:'Perfil manual'}.</>,
                <><strong>Período:</strong> {periodStart.split('-').reverse().join('/')} a {periodEnd.split('-').reverse().join('/')}.</>,
                <><strong>Medições:</strong> {pointCount} pontos, a cada {resolutionMinutes} min.</>,
                <><strong>Fator de potência (FP):</strong> {factor}.</>,
                <><strong>Referência:</strong> serve para análise; não altera os limites configurados.</>,
                <><strong>Intervalos:</strong> arraste as alças para ajustar início e fim.</>,
              ]}/></InfoTooltip>
            </div>
            <p className="mt-1 text-xs text-muted-foreground" aria-label="Resumo dos dados da curva">
              {activeCurve ? <>{sourceMode==='csv'?'Arquivo CSV':'Perfil manual'} · {activeCurve.periodStart.split('-').reverse().join('/')} a {activeCurve.periodEnd.split('-').reverse().join('/')} · <span aria-label="Intervalo dos dados">{activeCurve.resolutionMinutes} min</span></> : sourceMode==='manual' ? 'Selecione um perfil base ou importe um CSV para começar.' : 'Importe um CSV em Configurar dados para começar.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Configuração da curva">
            {sourceMode==='manual'&&<IconSelect id={profileId} label="Perfil base" className="w-auto max-w-full" value={selectedPresetId} onValueChange={handleSelectPreset} options={[
              ...DAILY_CURVE_PRESETS.map(preset=>({value:preset.id,label:preset.label,icon:preset.id==='comercio'?<Store/>:<Factory/>})),
              {value:'custom',label:'Personalizado',icon:<Settings2/>},
            ]}/>}
            <Button type="button" size="sm" variant="outline" aria-expanded={dataSettingsOpen} aria-controls={dataId} onClick={()=>setDataOpen(value=>!value)} className="gap-1.5 text-xs">
              <SlidersHorizontal className="size-3.5" aria-hidden="true"/>Configurar dados<ChevronDown className={`size-3.5 transition-transform ${dataSettingsOpen?'rotate-180':''}`} aria-hidden="true"/>
            </Button>
          </div>
        </header>
        <p aria-live="polite" className="sr-only">{pointCount} pontos · {resolutionMinutes} min</p>
        <div id={dataId} role="region" aria-label="Configuração dos dados da curva" hidden={!dataSettingsOpen} className="space-y-4 rounded-lg border bg-muted/10 p-3">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold">Período e fuso</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 items-end">
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
                <IconSelect
                  label="Fuso horário"
                  options={BRAZIL_TIMEZONES.map(zone=>({...zone,icon:<Globe2/>}))}
                  disabled={sourceMode === 'csv'}
                  value={timezone}
                  onValueChange={(nextTimezone) => {
                    const shifted: Record<string, number> = {};
                    for (const day of days) day.indices.forEach((index, slot) => {
                      const point = activeCurve!.points[index];
                      if (pointOverrides[point.timestamp] !== undefined) shifted[zonedTimeToUtcIso(day.date, Math.floor(day.minutes[slot] / 60), day.minutes[slot] % 60, nextTimezone)] = pointOverrides[point.timestamp];
                    });
                    setPointOverrides(shifted);
                    setTimezone(nextTimezone);
                  }}
                  className="w-full"
                />
              </label>

            </div>
          </div>
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-1">
              <h4 className="text-xs font-semibold">Arquivos CSV</h4>
              <InfoTooltip label="Sobre os dados da curva"><TooltipList items={[
                <><strong>Manual:</strong> intervalos de 15 min, até {LOAD_CURVE_MAX_POINTS} pontos.</>,
                <><strong>Importação:</strong> preserva os horários e o intervalo do arquivo.</>,
                <><strong>Exportação:</strong> salva todo o período, mesmo com zoom.</>,
                <><strong>Conteúdo:</strong> consumo em kVA e geração, se o Solar FV estiver ativo. Geração indisponível fica em branco.</>,
                <><strong>Reimportação:</strong> use o mesmo fator de potência (FP).</>,
                <><strong>Fuso:</strong> {activeCurve?.timezone??timezone}.</>,
              ]}/></InfoTooltip>
            </div>
            <CiEnergyImport actions={<>
              <Button type="button" variant="ghost" size="sm" onClick={handleExportCurrentCsv} disabled={!activeCurve} className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" aria-hidden="true"/>Exportar</Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleDownloadTemplate} className="gap-1.5 text-xs text-muted-foreground">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />Baixar modelo
              </Button>
              {(existing || fileName || !isCurveCleared) && <Button type="button" variant="ghost" size="sm" onClick={handleClearCurve} className="text-xs text-destructive">Remover curva</Button>}
            </>} ciOptions={ciOptions} onChange={onChange} onImported={(result, name) => {
              setDataOpen(false);
              if (!result.consumption) return;
              setSourceMode('csv'); setIsCurveCleared(false); setFileName(name); setPointOverrides({}); setHistory({key:'',past:[],future:[]});
              setResolutionMinutes(result.consumption.resolutionMinutes);
              setTimezone(result.consumption.timezone);
              setPeriodStart(result.consumption.periodStart); setPeriodEnd(result.consumption.periodEnd);
            }} />
          </div>
        </div>
        {activeCurve ? <LoadCurveChart key={historyKey} referenceKw={referenceKw} onReferenceChange={setReferenceKw} points={activeCurve.points} generationPoints={weeklySolarPoints} resolutionMinutes={activeCurve.resolutionMinutes} timezone={activeCurve.timezone} curveDays={days} onEditPoints={editPoints} contractedDemandKw={ciOptions.tariff?.contractedDemandKw} backupCurve={canAccessCiBackup?activeCurve:undefined} backupSelection={ciOptions.backup?.curveSelection} onApplyBackupSelection={canAccessCiBackup?applyBackupSelection:undefined} rechargeWindow={ciOptions.rechargeWindow} onRechargeWindowChange={(window) => onChange({ rechargeWindow: window })} dischargeWindow={ciOptions.dischargeWindow} onDischargeWindowChange={(window) => onChange({ dischargeWindow: window })} editHistory={{
          canUndo: Boolean(past.length), canRedo: Boolean(future.length),
          undo: ()=>{const saved=past.at(-1);if(saved){setHistory({key:historyKey,past:past.slice(0,-1),future:[...future,snapshot()]});restore(saved);}},
          redo: ()=>{const saved=future.at(-1);if(saved){setHistory({key:historyKey,past:[...past,snapshot()],future:future.slice(0,-1)});restore(saved);}},
        }} /> : <p className="flex h-36 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">Nenhuma curva de carga disponível para exibição.</p>}
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
    </div></CiAcPowerProvider>
  );
}
