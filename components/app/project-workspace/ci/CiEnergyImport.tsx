'use client';

import { useCiAcPower } from './ci-ac-power';
import { useId, useState, type ReactNode } from 'react';
import { FileUp, CalendarDays, Columns3, CircleOff, Zap, Clock3, Globe2, ArrowRightToLine, ArrowLeftFromLine } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { InfoTooltip, TooltipList } from '@/components/ui/tooltip';
import { IconSelect } from '@/components/ui/icon-select';
import { cn } from '@/lib/utils';
import { importEnergyProfiles, readEnergyImportTable, suggestEnergyImportMapping, type EnergyImportMapping, type EnergyImportResult, type EnergyImportTable, type EnergyImportUnit } from '@/supabase/functions/_shared/commercial-industrial/energy-profile-import';
import { DEFAULT_CI_SOLAR_CONFIG, type CommercialIndustrialOptions, type LoadCurve } from '@/supabase/functions/_shared/commercial-industrial/types';

export function curvesAlign(load: LoadCurve, generation: LoadCurve): boolean {
  const timestamps = new Set(generation.points.map((point) => Date.parse(point.timestamp)));
  return load.resolutionMinutes === generation.resolutionMinutes && load.points.every((point) => timestamps.has(Date.parse(point.timestamp)));
}

export function CiEnergyImport({ ciOptions, onChange, onImported, defaultSeries = 'consumption', actions }: {
  actions?: ReactNode;
  defaultSeries?: 'consumption' | 'generation';
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
  onImported?: (result: Extract<EnergyImportResult, { ok: true }>, fileName: string) => void;
}) {
  const { factor } = useCiAcPower(ciOptions.acPowerFactor);
  const id = useId();
  const [table, setTable] = useState<EnergyImportTable | null>(null);
  const [mapping, setMapping] = useState<EnergyImportMapping | null>(null);
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [success, setSuccess] = useState('');
  const timezone = ciOptions.loadCurve?.timezone ?? ciOptions.solar?.generationCurve?.timezone ?? 'America/Sao_Paulo';

  const preview = table && mapping ? importEnergyProfiles(table, { ...mapping, powerFactor: factor }) : null;
  const previewCurve = preview?.ok ? preview.consumption ?? preview.generation : null;

  function updateMapping(partial: Partial<EnergyImportMapping>) {
    setMapping((current) => current ? { ...current, ...partial } : current);
    setErrors([]);
  }

  function applyImport() {
    if (!table || !mapping) return;
    const result = importEnergyProfiles(table, { ...mapping, powerFactor: factor });
    if (!result.ok) { setErrors(result.errors); return; }
    const load = result.consumption ?? ciOptions.loadCurve;
    const generation = result.generation ?? (ciOptions.solar?.enabled ? ciOptions.solar.generationCurve : null);
    if (load && generation && !curvesAlign(load, generation)) {
      setErrors(['Consumo e geração precisam cobrir os mesmos horários e usar o mesmo intervalo. Importe os dois no mesmo arquivo ou ajuste o período.']);
      return;
    }
    const partial: Partial<CommercialIndustrialOptions> = {};
    if (result.consumption) partial.loadCurve = result.consumption;
    if (result.generation) partial.solar = { ...(ciOptions.solar ?? DEFAULT_CI_SOLAR_CONFIG), enabled: true, generationCurve: result.generation, generationPoints: undefined };
    onChange(partial);
    onImported?.(result, fileName);
    setSuccess(`${result.consumption && result.generation ? 'Consumo e geração importados. Curva de carga e Solar FV preenchidos' : result.consumption ? 'Consumo importado. Curva de carga preenchida' : 'Geração importada. Solar FV preenchido'} · ${(result.consumption ?? result.generation)!.points.length} amostras · ${mapping.resolutionMinutes} min.`);
    setTable(null);
    setMapping(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
      <label className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer gap-1.5 text-xs focus-within:ring-3 focus-within:ring-ring/50')}>
        <FileUp className="h-4 w-4" aria-hidden="true" />Importar
        <input type="file" accept=".csv,text/csv,.txt,text/plain" aria-label="Importar CSV de consumo e geração" className="sr-only" disabled={reading} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setErrors([]); setSuccess(''); setTable(null); setMapping(null);
          if (file.size > 5 * 1024 * 1024) { setErrors(['O arquivo deve ter no máximo 5 MB e conter até 7 dias de medições.']); return; }
          setReading(true); setFileName(file.name);
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const parsed = readEnergyImportTable(String(reader.result ?? ''));
              setTable(parsed); setMapping(suggestEnergyImportMapping(parsed, timezone, defaultSeries));
            } catch (error) { setErrors([error instanceof Error ? error.message : 'Não foi possível ler o CSV.']); }
            finally { setReading(false); }
          };
          reader.onerror = () => { setErrors(['Não foi possível ler o arquivo. Tente novamente.']); setReading(false); };
          reader.readAsText(file);
        }} />
      </label>
      <InfoTooltip label="Sobre a importação CSV"><TooltipList items={[
        <><strong>Período:</strong> até 7 dias, com intervalos de 15, 30 ou 60 min.</>,
        <><strong>Séries:</strong> consumo total da instalação e geração FV em corrente alternada (AC), antes do BESS.</>,
        <><strong>Energia em kWh:</strong> convertida em potência média pelo intervalo.</>,
        <><strong>Potência em kVA:</strong> usa o fator de potência (FP) do projeto para calcular a energia ativa.</>,
        <><strong>Antes de aplicar:</strong> confira colunas, unidades e horários.</>,
      ]}/></InfoTooltip>
      {actions}
      </div>
      {reading && <p role="status" className="text-xs text-muted-foreground">Lendo arquivo…</p>}
      {success && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{success}</p>}
      {errors.length > 0 && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-medium">Não foi possível importar o arquivo</p><ul className="mt-1 list-disc pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
      {table && mapping && <div className="space-y-4 rounded-xl border bg-muted/15 p-4">
        <div><h3 className="text-sm font-semibold">Importar consumo e geração</h3><p className="mt-1 break-all text-xs text-muted-foreground">{fileName} · {table.rows.length} linhas</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs font-medium" htmlFor={`${id}-date`}>Data e hora<IconSelect id={`${id}-date`} label="Data e hora" className="w-full" value={String(mapping.timestamp)} onValueChange={value=>updateMapping({timestamp:Number(value)})} options={table.headers.map((header,index)=>({value:String(index),label:header,icon:<CalendarDays/>}))}/></label>
          {(['consumption', 'generation'] as const).map((kind) => <div key={kind} className="space-y-2">
            <label className="block space-y-1 text-xs font-medium" htmlFor={`${id}-${kind}`}>{kind === 'consumption' ? 'Coluna de consumo' : 'Coluna de geração'}<IconSelect id={`${id}-${kind}`} label={kind==='consumption'?'Coluna de consumo':'Coluna de geração'} className="w-full" value={mapping[kind]===null?'':String(mapping[kind])} onValueChange={value=>updateMapping({[kind]:value===''?null:Number(value)})} options={[{value:'',label:'Não importar',icon:<CircleOff/>},...table.headers.map((header,index)=>({value:String(index),label:header,icon:<Columns3/>}))]}/></label>
            <label className="block space-y-1 text-xs" htmlFor={`${id}-${kind}-unit`}>Unidade de {kind === 'consumption' ? 'consumo' : 'geração'}<IconSelect id={`${id}-${kind}-unit`} label={`Unidade de ${kind==='consumption'?'consumo':'geração'}`} className="w-full" disabled={mapping[kind]===null} value={mapping[`${kind}Unit`]} onValueChange={value=>updateMapping({[`${kind}Unit`]:value as EnergyImportUnit})} options={['kVA','VA','MVA','kW','W','MW','kWh','Wh','MWh'].map(unit=>({value:unit,label:unit,icon:<Zap/>}))}/></label>
          </div>)}
          <label className="space-y-1 text-xs font-medium" htmlFor={`${id}-resolution`}>Intervalo das medições<IconSelect id={`${id}-resolution`} label="Intervalo das medições" className="w-full" value={String(mapping.resolutionMinutes)} onValueChange={value=>updateMapping({resolutionMinutes:Number(value) as 15|30|60})} options={[15,30,60].map(value=>({value:String(value),label:`${value} minutos`,icon:<Clock3/>}))}/></label>
          <label className="space-y-1 text-xs font-medium" htmlFor={`${id}-timezone`}>Fuso horário do arquivo<IconSelect id={`${id}-timezone`} label="Fuso horário do arquivo" className="w-full" value={mapping.timezone} onValueChange={value=>updateMapping({timezone:value})} options={[
            {value:'America/Sao_Paulo',label:'Brasília (UTC-3)',icon:<Globe2/>},
            {value:'America/Manaus',label:'Manaus / Cuiabá (UTC-4)',icon:<Globe2/>},
          ]}/></label>
          <label className="space-y-1 text-xs font-medium" htmlFor={`${id}-position`}>Data e hora representam<IconSelect id={`${id}-position`} label="Data e hora representam" className="w-full" value={mapping.timestampPosition??'start'} onValueChange={value=>updateMapping({timestampPosition:value as 'start'|'end'})} options={[
            {value:'start',label:'Início do intervalo',icon:<ArrowRightToLine/>},
            {value:'end',label:'Fim do intervalo',icon:<ArrowLeftFromLine/>},
          ]}/></label>
        </div>
        {previewCurve && <p className="rounded-lg border bg-background p-3 text-xs">Período detectado: {previewCurve.periodStart} a {previewCurve.periodEnd} · {previewCurve.points.length} amostras de {previewCurve.resolutionMinutes} min. {preview?.ok && preview.consumption && preview.generation ? 'Consumo e geração identificados: as duas etapas serão preenchidas.' : 'Apenas a série selecionada será atualizada.'}</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={applyImport}>Aplicar</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setTable(null); setMapping(null); setErrors([]); }}>Cancelar</Button></div>
      </div>}
    </div>
  );
}
