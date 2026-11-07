'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
  const [method,setMethod]=useState<CiBackupCurveSelection['method']>('profile');
  const [power,setPower]=useState('');
  const [applied,setApplied]=useState(false);
  const start=curve.points[startIndex];
  const end=curve.points[endIndex];
  if (!start || !end) return null;
  const endMs=Date.parse(end.timestamp)+curve.resolutionMinutes*60_000;
  const selection:CiBackupCurveSelection={method,startTimestamp:start.timestamp,endTimestampExclusive:Number.isFinite(endMs)?new Date(endMs).toISOString():'',...(method==='manual'?{manualPowerKw:Number(power)}:{})};
  let preview:ReturnType<typeof resolveBackupCurve>|null=null;
  let error:string|null=null;
  try { preview=resolveBackupCurve(selection,curve); }
  catch(cause) { error=cause instanceof Error?cause.message:'Seleção inválida.'; }
  return <section className="space-y-3 rounded-lg border bg-muted/10 p-3" aria-label={`Backup do ${label}`}>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-44 flex-1 space-y-1 text-xs">Como usar o {label}<Select aria-label={`Método de backup do ${label}`} value={method} onChange={event=>{setMethod(event.target.value as CiBackupCurveSelection['method']);setApplied(false);}}>{Object.entries(backupSelectionMethods).map(([value,text])=><option key={value} value={value}>{text}</option>)}</Select></label>
      {method==='manual'&&<label className="space-y-1 text-xs">Potência protegida (kW)<Input aria-label={`Potência manual do ${label}`} type="number" min={0} step="any" value={power} onChange={event=>{setPower(event.target.value);setApplied(false);}}/></label>}
      <Button type="button" size="sm" disabled={!preview} onClick={()=>{onApply(selection);setApplied(true);}}>Usar {label} para backup</Button>
    </div>
    {preview&&<p className="text-xs text-muted-foreground">{preview.durationHours.toFixed(2)} h · potência contínua {preview.continuousPowerKw.toFixed(2)} kW · pico {preview.requiredPeakKw.toFixed(2)} kW · energia {preview.energyKwh.toFixed(2)} kWh, antes da margem e das perdas.</p>}
    {method==='average'&&<p className="text-xs text-muted-foreground">O pico observado continua sendo exigido, mesmo usando a média para a carga constante.</p>}
    {method==='manual'&&<p className="text-xs text-muted-foreground">O patamar declara a carga protegida; o restante do consumo não está coberto. A potência total na partida é ajustada em Configurar backup.</p>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {applied&&<p role="status" className="text-xs">Backup atualizado pelo {label}. Os valores acompanham as alterações da curva.</p>}
  </section>;
}
