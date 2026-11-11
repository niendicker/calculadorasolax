'use client';

import { useCiAcPower } from './ci-ac-power';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InfoTooltip, TooltipList } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { IconSelect } from '@/components/ui/icon-select';
import { cn } from '@/lib/utils';
import { ChartNoAxesCombined, Gauge, TrendingUp, Pencil } from 'lucide-react';
import { resolveBackupCurve } from '@/supabase/functions/_shared/commercial-industrial/backup-curve';
import type { CiBackupCurveSelection, LoadCurve } from '@/supabase/functions/_shared/commercial-industrial/types';

export const backupSelectionMethods = {
  profile: 'Perfil selecionado',
  average: 'Potência média',
  maximum: 'Potência máxima',
  manual: 'Potência manual',
} as const;

export interface CiBackupRange { label: string; startIndex: number; endIndex: number }

/** One backup source per project: pick the window, then the method, then apply. */
export function CiBackupSelectionAction({curve,ranges,applied,onApply}:{
  curve: LoadCurve; ranges: CiBackupRange[]; applied?: CiBackupCurveSelection;
  onApply:(selection:CiBackupCurveSelection)=>void;
}) {
  const { toKva, fromKva } = useCiAcPower();
  const methodId = useId();
  const [method,setMethod]=useState<CiBackupCurveSelection['method']>('profile');
  const [power,setPower]=useState('');
  const [chosen,setChosen]=useState<string|null>(null);
  const [appliedKey,setAppliedKey]=useState<string|null>(null);

  const bounds=(range:CiBackupRange)=>{
    const start=curve.points[range.startIndex], end=curve.points[range.endIndex];
    if(!start||!end)return null;
    const endMs=Date.parse(end.timestamp)+curve.resolutionMinutes*60_000;
    return {startTimestamp:start.timestamp,endTimestampExclusive:Number.isFinite(endMs)?new Date(endMs).toISOString():''};
  };
  const available=ranges.filter(range=>bounds(range));
  if(!available.length)return null;
  const inUse=(range:CiBackupRange)=>{const b=bounds(range)!;return Boolean(applied&&applied.startTimestamp===b.startTimestamp&&applied.endTimestampExclusive===b.endTimestampExclusive);};
  const current=available.find(range=>range.label===chosen)??available.find(inUse)??available[0];
  const build=(range:CiBackupRange):CiBackupCurveSelection=>({method,...bounds(range)!,...(method==='manual'?{manualPowerKw:fromKva(Number(power))}:{})});
  const resolve=(range:CiBackupRange)=>{try{return {preview:resolveBackupCurve(build(range),curve),error:null};}catch(cause){return {preview:null,error:cause instanceof Error?cause.message:'Seleção inválida.'};}};
  const time=(timestamp:string|number)=>new Date(timestamp).toLocaleTimeString('pt-BR',{timeZone:curve.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const selection=build(current);
  const {preview,error}=resolve(current);
  const selectionKey=`${selection.startTimestamp}|${selection.endTimestampExclusive}|${method}|${power}`;
  const touch=()=>setAppliedKey(null);

  return <section className="space-y-3 rounded-lg border bg-muted/10 p-3" aria-label="Backup a partir da curva">
    <span className="flex items-center gap-1 text-xs"><span className="font-medium">Backup a partir da curva</span><InfoTooltip label="Sobre o backup a partir da curva"><TooltipList items={[
      <><strong>Faixa:</strong> escolha Carga ou Descarga como referência das cargas críticas; apenas uma vale por projeto.</>,
      <><strong>Perfil:</strong> mantém as variações do consumo selecionado.</>,
      <><strong>Média:</strong> usa potência constante e mantém a exigência do pico observado.</>,
      <><strong>Máxima:</strong> usa o pico como potência constante.</>,
      <><strong>Manual:</strong> informe a carga protegida. Ajuste a potência total de partida em Backup.</>,
      <><strong>Prévia:</strong> valores antes da margem de segurança e das perdas.</>,
    ]}/></InfoTooltip></span>
    <div role="group" aria-label="Faixa para o backup" className="grid gap-2 sm:grid-cols-2">
      {available.map(range=>{
        const b=bounds(range)!, selected=range.label===current.label, summary=resolve(range).preview;
        return <button key={range.label} type="button" aria-pressed={selected} onClick={()=>{setChosen(range.label);touch();}} className={cn('rounded-md border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',selected?'border-primary bg-primary/5':'border-border hover:bg-muted/40')}>
          <span className="flex items-center justify-between gap-2"><span className="font-semibold">{range.label} <span className="font-normal text-muted-foreground">{time(b.startTimestamp)}–{time(b.endTimestampExclusive)}</span></span>{inUse(range)&&<Badge variant="outline">Em uso</Badge>}</span>
          <span className="mt-0.5 block text-muted-foreground">{summary?`${summary.durationHours.toFixed(2)} h · ${toKva(summary.continuousPowerKw).toFixed(2)} kVA${Math.abs(summary.requiredPeakKw-summary.continuousPowerKw)>1e-6?` · pico ${toKva(summary.requiredPeakKw).toFixed(2)} kVA`:''} · ${summary.energyKwh.toFixed(2)} kWh`:'—'}</span>
        </button>;
      })}
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-44 flex-1 space-y-1 text-xs sm:max-w-xs"><label htmlFor={methodId}>Método</label><IconSelect id={methodId} label="Método de backup" className="w-full" value={method} onValueChange={value=>{setMethod(value as CiBackupCurveSelection['method']);touch();}} options={[
        {value:'profile',label:backupSelectionMethods.profile,icon:<ChartNoAxesCombined/>},
        {value:'average',label:backupSelectionMethods.average,icon:<Gauge/>},
        {value:'maximum',label:backupSelectionMethods.maximum,icon:<TrendingUp/>},
        {value:'manual',label:backupSelectionMethods.manual,icon:<Pencil/>},
      ]}/></div>
      {method==='manual'&&<label className="space-y-1 text-xs">Potência protegida (kVA)<Input aria-label="Potência manual do backup" type="number" min={0} step="any" value={power} onChange={event=>{setPower(event.target.value);touch();}}/></label>}
      <Button type="button" size="sm" disabled={!preview} onClick={()=>{onApply(selection);setAppliedKey(selectionKey);}}>Usar {current.label} para backup</Button>
    </div>
    {method==='manual'&&<p className="text-xs text-muted-foreground">Somente a potência declarada será protegida.</p>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {appliedKey===selectionKey&&<p role="status" className="text-xs">Backup atualizado pelo {current.label}. Os valores acompanham as alterações da curva.</p>}
  </section>;
}
