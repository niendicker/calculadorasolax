'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { loadCiStsCatalog } from '@/lib/data/ci-sts-repository';
import { isApprovedStsRule, validateStsSelection } from '@/supabase/functions/_shared/commercial-industrial/sts';
import type { CiStsCatalog, CiStsSelection } from '@/supabase/functions/_shared/commercial-industrial/sts-types';
import type { CiBackupConfig, CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';

export function CiStsBackupPanel({options,backup,onChange}: {options: CommercialIndustrialOptions; backup: CiBackupConfig; onChange: (partial: Partial<CiBackupConfig>)=>void}) {
  const sts=backup.sts;
  const requested=Boolean(sts);
  const [loaded,setLoaded]=useState<{key:string;catalog:CiStsCatalog;pcsId:string|null}|null>(null);
  const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
  const [attempt,setAttempt]=useState(0);
  const modular=options.bessSystem?.kind==='modular';
  const compatibilityId=options.bessSystem?.kind==='modular'?options.bessSystem.compatibilityId:null;
  const targetKey=JSON.stringify([modular,compatibilityId,options.bessProductId,attempt]);
  useEffect(()=>{
    if(!requested)return;
    let alive=true;
    const pcsLookup=modular
      ? import('@/lib/data/ci-modular-catalog-repository').then(m=>m.loadCiModularCatalog()).then(data=>data.rules.find(r=>r.id===compatibilityId)?.pcs_id??null)
      : Promise.resolve(null);
    // Publish both lookups together: a later STS response must never hide a PCS error.
    Promise.all([loadCiStsCatalog(),pcsLookup]).then(([catalog,pcsId])=>{
      if(alive){setLoaded({key:targetKey,catalog,pcsId});setFailure(null);}
    }).catch(e=>{
      if(alive)setFailure({key:targetKey,message:e instanceof Error?e.message:'Não foi possível carregar STS e composição.'});
    });
    return()=>{alive=false;};
  },[requested,modular,compatibilityId,targetKey]);
  const catalog=loaded?.key===targetKey?loaded.catalog:null;
  const equipmentPcs=loaded?.key===targetKey?loaded.pcsId:null;
  const error=failure?.key===targetKey?failure.message:'';
  const update=(partial:Partial<CiStsSelection>)=>{if(sts)onChange({sts:{...sts,...partial}});};
  const rules=catalog?.rules.filter(r=>isApprovedStsRule(r) && r.line_voltage_v===sts?.lineVoltageV && r.frequency_hz===sts?.frequencyHz && (modular ? r.pcs_id===equipmentPcs : r.bess_product_id===options.bessProductId))??[];
  const specs=catalog?.specs.filter(s=>s.active&&s.accessoryActive&&rules.some(r=>r.accessory_id===s.accessory_id))??[];
  const errors=sts?validateStsSelection(sts):[];
  return <section aria-label="Transferência / STS" className="space-y-4 rounded-xl border bg-muted/10 p-4">
    <div><h3 className="text-sm font-semibold">Transferência / STS</h3><p className="mt-1 text-xs text-muted-foreground">Uma STS por barramento trifásico com neutro e PE. Seleção por corrente nominal contínua e compatibilidade aprovada, sem sobrecarga.</p></div>
    <label className="block space-y-1.5 text-xs font-medium">Seleção de STS<Select aria-label="Seleção de STS" value={sts?.mode??'none'} onChange={e=>{if(e.target.value==='none')onChange({sts:undefined});else onChange({sts:{gridBusScope:'installation',accessoryId:null,lineVoltageV:380,frequencyHz:60,powerFactor:0,maxGridPassageKw:0,...sts,mode:e.target.value as CiStsSelection['mode']}});}}><option value="none">Sem STS externa — transferência não avaliada</option><option value="auto">Selecionar automaticamente</option><option value="manual">Selecionar manualmente</option></Select></label>
    {sts&&<>
      {error?<div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" onClick={()=>setAttempt(a=>a+1)}>Tentar novamente</Button></div>:!catalog?<p role="status" className="text-xs text-muted-foreground">Carregando STS…</p>:<>
        {specs.length===0&&<p role="status" className="text-xs text-muted-foreground">Nenhuma STS com compatibilidade aprovada para este equipamento. Cadastre em Administração → BESS C&I → STS / Transferência.</p>}
        {sts.mode==='manual'&&<label className="block space-y-1.5 text-xs font-medium">Modelo STS<Select aria-label="Modelo STS" value={sts.accessoryId??''} onChange={e=>update({accessoryId:e.target.value||null})}><option value="">Selecione uma STS</option>{specs.map(s=><option key={s.accessory_id} value={s.accessory_id}>{s.model} · até {rules.find(r=>r.accessory_id===s.accessory_id)?.max_pcs} PCS/unidades</option>)}</Select></label>}
        {sts.mode==='manual'&&sts.accessoryId&&!specs.some(s=>s.accessory_id===sts.accessoryId)&&<p role="alert" className="text-xs text-destructive">A STS salva está indisponível ou sem compatibilidade aprovada. Selecione outra para recalcular.</p>}
      </>}
      <label className="block space-y-1.5 text-xs font-medium">Barramento atendido pela STS<Select aria-label="Barramento atendido pela STS" value={sts.gridBusScope} onChange={e=>update({gridBusScope:e.target.value as CiStsSelection['gridBusScope']})}><option value="installation">Instalação — verificar a curva geral</option><option value="backup_bus">Somente barramento de backup — passagem declarada</option></Select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium">Tensão entre fases da STS<Select aria-label="Tensão entre fases da STS" value={sts.lineVoltageV} onChange={e=>update({lineVoltageV:Number(e.target.value) as 380|400})}><option value={380}>380 V (220 V fase-neutro)</option><option value={400}>400 V (230 V fase-neutro)</option></Select></label>
        <label className="space-y-1 text-xs font-medium">Frequência da STS<Select aria-label="Frequência da STS" value={sts.frequencyHz} onChange={e=>update({frequencyHz:Number(e.target.value) as 50|60})}><option value={50}>50 Hz</option><option value={60}>60 Hz</option></Select></label>
        <label className="space-y-1 text-xs font-medium">Fator de potência de projeto<Input aria-label="Fator de potência de projeto" type="number" min={0.01} max={1} step={0.01} placeholder="Informe o menor FP esperado" value={sts.powerFactor||''} onChange={e=>update({powerFactor:Number(e.target.value)})}/></label>
        <label className="space-y-1 text-xs font-medium">Máxima passagem pela rede (kW)<Input aria-label="Máxima passagem pela rede (kW)" type="number" min={0} step="any" value={sts.maxGridPassageKw} onChange={e=>update({maxGridPassageKw:Number(e.target.value)})}/></label>
      </div>
      <p className="text-xs text-muted-foreground">Informe o máximo previsto de importação ou exportação pelo gabinete, incluindo carregamento do BESS e FV. {sts.gridBusScope==='installation'?'O cálculo também verifica o fluxo líquido da curva geral.':'A curva geral não representa este barramento: declare seu máximo incluindo o FV conectado. O cálculo confronta a declaração com as cargas nominais e o fluxo conhecido do BESS, sem compensar por FV/gerador de localização não informada.'} A margem de backup é aplicada uma única vez. O fator de utilização das cargas não reduz a potência nominal exigida da STS.</p>
      <p className="text-xs text-muted-foreground">A menor STS elegível será selecionada em cada cenário. Preço do Portfólio entra no CAPEX. O Nexus inclui EMS; revise o controlador exigido para evitar duplicidade. Os 0 ms do datasheet são condicionais e não são garantidos pelo cálculo.</p>
      {errors.length>0&&<div role="alert" className="text-xs text-destructive">{errors.map(e=><p key={e}>{e}</p>)}</div>}
    </>}
  </section>;
}
