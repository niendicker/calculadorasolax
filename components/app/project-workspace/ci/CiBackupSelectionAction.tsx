'use client';

import { useCiAcPower } from './ci-ac-power';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InfoTooltip, TooltipList } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { IconSelect } from '@/components/ui/icon-select';
import { ChartNoAxesCombined, Gauge, TrendingUp, Pencil } from 'lucide-react';
import { resolveBackupCurve } from '@/supabase/functions/_shared/commercial-industrial/backup-curve';
import type { CiBackupCurveSelection, LoadCurve } from '@/supabase/functions/_shared/commercial-industrial/types';

export const backupSelectionMethods = {
  profile: 'Perfil selecionado',
  average: 'Potência média',
  maximum: 'Potência máxima',
  manual: 'Potência manual',
} as const;

export function CiBackupSelectionAction({curve,startIndex,endIndex,label,onApply}:{
  curve: LoadCurve; startIndex:number; endIndex:number; label:string;
  onApply:(selection:CiBackupCurveSelection)=>void;
}) {
  const { toKva, fromKva } = useCiAcPower();

  const methodId = useId();
  const [method,setMethod]=useState<CiBackupCurveSelection['method']>('profile');
  const [power,setPower]=useState('');
  const [applied,setApplied]=useState(false);
  const start=curve.points[startIndex];
  const end=curve.points[endIndex];
  if (!start || !end) return null;
  const endMs=Date.parse(end.timestamp)+curve.resolutionMinutes*60_000;
  const selection:CiBackupCurveSelection={method,startTimestamp:start.timestamp,endTimestampExclusive:Number.isFinite(endMs)?new Date(endMs).toISOString():'',...(method==='manual'?{manualPowerKw:fromKva(Number(power))}:{})};
  let preview:ReturnType<typeof resolveBackupCurve>|null=null;
  let error:string|null=null;
  try { preview=resolveBackupCurve(selection,curve); }
  catch(cause) { error=cause instanceof Error?cause.message:'Seleção inválida.'; }
  return <section className="space-y-3 rounded-lg border bg-muted/10 p-3" aria-label={`Backup do ${label}`}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-44 flex-1 space-y-1 text-xs"><span className="flex items-center gap-1"><label htmlFor={methodId}>Como usar o {label}</label><InfoTooltip label={`Sobre o método de backup do ${label}`}><TooltipList items={[
        <><strong>Perfil:</strong> mantém as variações do consumo selecionado.</>,
        <><strong>Média:</strong> usa potência constante e mantém a exigência do pico observado.</>,
        <><strong>Máxima:</strong> usa o pico como potência constante.</>,
        <><strong>Manual:</strong> informe a carga protegida. Ajuste a potência total de partida em Backup.</>,
        <><strong>Prévia:</strong> valores antes da margem de segurança e das perdas.</>,
      ]}/></InfoTooltip></span><IconSelect id={methodId} label={`Método de backup do ${label}`} className="w-full" value={method} onValueChange={value=>{setMethod(value as CiBackupCurveSelection['method']);setApplied(false);}} options={[
        {value:'profile',label:backupSelectionMethods.profile,icon:<ChartNoAxesCombined/>},
        {value:'average',label:backupSelectionMethods.average,icon:<Gauge/>},
        {value:'maximum',label:backupSelectionMethods.maximum,icon:<TrendingUp/>},
        {value:'manual',label:backupSelectionMethods.manual,icon:<Pencil/>},
      ]}/></div>
      {method==='manual'&&<label className="space-y-1 text-xs">Potência protegida (kVA)<Input aria-label={`Potência manual do ${label}`} type="number" min={0} step="any" value={power} onChange={event=>{setPower(event.target.value);setApplied(false);}}/></label>}
      <Button type="button" size="sm" disabled={!preview} onClick={()=>{onApply(selection);setApplied(true);}}>Usar {label} para backup</Button>
    </div>
    {preview&&<p className="text-xs text-muted-foreground">{preview.durationHours.toFixed(2)} h · potência contínua {toKva(preview.continuousPowerKw).toFixed(2)} kVA · pico {toKva(preview.requiredPeakKw).toFixed(2)} kVA · energia {preview.energyKwh.toFixed(2)} kWh (sem margem/perdas).</p>}
    {method==='manual'&&<p className="text-xs text-muted-foreground">Somente a potência declarada será protegida.</p>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {applied&&<p role="status" className="text-xs">Backup atualizado pelo {label}. Os valores acompanham as alterações da curva.</p>}
  </section>;
}
