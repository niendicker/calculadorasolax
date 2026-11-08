'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/tooltip';
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
  const methodId = useId();
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
      <div className="min-w-44 flex-1 space-y-1 text-xs"><span className="flex items-center gap-1"><label htmlFor={methodId}>Como usar o {label}</label><InfoTooltip label={`Sobre o método de backup do ${label}`}>Perfil selecionado preserva as variações do consumo; média e máxima usam uma potência constante. Na média, o pico observado continua sendo exigido. Potência manual declara apenas a carga protegida; ajuste a potência total na partida em Configurar backup. Os valores da prévia são anteriores à margem e às perdas.</InfoTooltip></span><Select id={methodId} aria-label={`Método de backup do ${label}`} value={method} onChange={event=>{setMethod(event.target.value as CiBackupCurveSelection['method']);setApplied(false);}}>{Object.entries(backupSelectionMethods).map(([value,text])=><option key={value} value={value}>{text}</option>)}</Select></div>
      {method==='manual'&&<label className="space-y-1 text-xs">Potência protegida (kW)<Input aria-label={`Potência manual do ${label}`} type="number" min={0} step="any" value={power} onChange={event=>{setPower(event.target.value);setApplied(false);}}/></label>}
      <Button type="button" size="sm" disabled={!preview} onClick={()=>{onApply(selection);setApplied(true);}}>Usar {label} para backup</Button>
    </div>
    {preview&&<p className="text-xs text-muted-foreground">{preview.durationHours.toFixed(2)} h · potência contínua {preview.continuousPowerKw.toFixed(2)} kW · pico {preview.requiredPeakKw.toFixed(2)} kW · energia {preview.energyKwh.toFixed(2)} kWh (sem margem/perdas).</p>}
    {method==='manual'&&<p className="text-xs text-muted-foreground">Somente a potência declarada será protegida.</p>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {applied&&<p role="status" className="text-xs">Backup atualizado pelo {label}. Os valores acompanham as alterações da curva.</p>}
  </section>;
}
