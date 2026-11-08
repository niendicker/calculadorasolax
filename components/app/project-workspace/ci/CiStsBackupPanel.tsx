'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { loadCiStsCatalog } from '@/lib/data/ci-sts-repository';
import { automaticStsSelection } from '@/supabase/functions/_shared/commercial-industrial/automatic-sts';
import { isApprovedStsRule, validateStsSelection } from '@/supabase/functions/_shared/commercial-industrial/sts';
import type { CiStsCatalog, CiStsSelection } from '@/supabase/functions/_shared/commercial-industrial/sts-types';
import type { CiBackupConfig, CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';

export function CiStsBackupPanel({options,backup,onChange}: {options: CommercialIndustrialOptions; backup: CiBackupConfig; onChange: (partial: Partial<CiBackupConfig>)=>void}) {
  const passageId = useId();
  const sts=automaticStsSelection(backup.sts);
  const requested=backup.enabled;
  const [loaded,setLoaded]=useState<{key:string;catalog:CiStsCatalog;pcsId:string|null;bessId:string|null}|null>(null);
  const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
  const [attempt,setAttempt]=useState(0);
  const modular=options.bessSystem?.kind==='modular';
  const automatic=options.bessSystem?.kind==='automatic';
  const compatibilityId=options.bessSystem?.kind==='modular'?options.bessSystem.compatibilityId:null;
  const solutionKey=options.bessSystem?.kind==='solution'?options.bessSystem.solutionKey:null;
  const model=options.bessSystem?.kind==='model'?options.bessSystem:null;
  const modelPcsId=model?.sourceKind==='assembly'?model.pcsId:null;
  const bessId=model?.sourceKind==='cabinet'?model.productId:options.bessProductId;
  const targetKey=JSON.stringify([modular,automatic,compatibilityId,bessId,modelPcsId,options.lineVoltageV,solutionKey,attempt]);
  useEffect(()=>{
    if(!requested)return;
    let alive=true;
    const pcsLookup=solutionKey
      ? Promise.all([import('@/lib/data/ci-generated-solutions-repository'),import('@/lib/supabase/client')]).then(([repo,client])=>repo.queryCiGeneratedSolutions(client.createClient(),{solutionKey,minPowerKw:0,minEnergyKwh:0,applications:[]})).then(data=>({pcsId:data.solutions[0]?.transferTarget.pcsId??null,bessId:data.solutions[0]?.transferTarget.bessProductId??null}))
      : modular
      ? import('@/lib/data/ci-modular-catalog-repository').then(m=>m.loadCiModularCatalog()).then(data=>data.rules.find(r=>r.id===compatibilityId)?.pcs_id??null).then(pcsId=>({pcsId,bessId:null}))
      : Promise.resolve({pcsId:modelPcsId,bessId:bessId??null});
    // Publish both lookups together: a later STS response must never hide a PCS error.
    Promise.all([loadCiStsCatalog(),pcsLookup]).then(([catalog,target])=>{
      if(alive){setLoaded({key:targetKey,catalog,...target});setFailure(null);}
    }).catch(e=>{
      if(alive)setFailure({key:targetKey,message:e instanceof Error?e.message:'Não foi possível carregar STS e composição.'});
    });
    return()=>{alive=false;};
  },[requested,modular,compatibilityId,targetKey,solutionKey,bessId,modelPcsId]);
  const catalog=loaded?.key===targetKey?loaded.catalog:null;
  const equipmentPcs=loaded?.key===targetKey?loaded.pcsId:null;
  const error=failure?.key===targetKey?failure.message:'';
  const update=(partial:Partial<CiStsSelection>)=>onChange({sts:automaticStsSelection({...sts,...partial})});
  const rules=catalog?.rules.filter(r=>isApprovedStsRule(r) && r.line_voltage_v===sts?.lineVoltageV && (!options.lineVoltageV||r.line_voltage_v===options.lineVoltageV) && r.frequency_hz===sts?.frequencyHz && (automatic || (equipmentPcs ? r.pcs_id===equipmentPcs : Boolean(loaded?.bessId) && r.bess_product_id===loaded?.bessId)))??[];
  const specs=catalog?.specs.filter(s=>s.active&&s.accessoryActive&&rules.some(r=>r.accessory_id===s.accessory_id))??[];
  const errors=validateStsSelection(sts);
  if (!backup.enabled) return null;
  return <section aria-label="Transferência / STS" className="space-y-4 rounded-xl border bg-muted/10 p-4">
    <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">Transferência / STS</h3><span className="text-xs text-muted-foreground">Seleção automática</span><InfoTooltip label="Sobre a seleção automática de STS">Uma STS por barramento trifásico com neutro e PE. A menor STS aprovada que atende à corrente nominal contínua, tensão, frequência e quantidade de PCS é selecionada, sem presumir sobrecarga. O preço do Portfólio entra no CAPEX. O Nexus inclui EMS; revise o controlador para evitar duplicidade. Transferência de 0 ms não é garantida pelo cálculo.</InfoTooltip></div>
      {error?<div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" onClick={()=>setAttempt(a=>a+1)}>Tentar novamente</Button></div>:!catalog?<p role="status" className="text-xs text-muted-foreground">Carregando STS…</p>:<>
        {specs.length===0&&<p role="status" className="text-xs text-muted-foreground">Nenhuma STS com compatibilidade aprovada para este equipamento. Cadastre em Administração → BESS C&I → STS / Transferência.</p>}
        {specs.length > 0 && <p className="text-xs text-muted-foreground">Modelos com compatibilidade aprovada: {specs.map(spec => spec.model).join(', ')}. A seleção final depende dos limites elétricos.</p>}
      </>}
      <label className="block space-y-1.5 text-xs font-medium">Barramento atendido pela STS<Select aria-label="Barramento atendido pela STS" value={sts.gridBusScope} onChange={e=>update({gridBusScope:e.target.value as CiStsSelection['gridBusScope']})}><option value="installation">Instalação — verificar a curva geral</option><option value="backup_bus">Somente barramento de backup — passagem declarada</option></Select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium">Tensão entre fases da STS<Select aria-label="Tensão entre fases da STS" value={sts.lineVoltageV} onChange={e=>update({lineVoltageV:Number(e.target.value) as 380|400})}><option value={380}>380 V (220 V fase-neutro)</option><option value={400}>400 V (230 V fase-neutro)</option></Select></label>
        <label className="space-y-1 text-xs font-medium">Frequência da STS<Select aria-label="Frequência da STS" value={sts.frequencyHz} onChange={e=>update({frequencyHz:Number(e.target.value) as 50|60})}><option value={50}>50 Hz</option><option value={60}>60 Hz</option></Select></label>
        <label className="space-y-1 text-xs font-medium">Fator de potência de projeto<Input aria-label="Fator de potência de projeto" type="number" min={0.01} max={1} step={0.01} placeholder="Informe o menor FP esperado" value={sts.powerFactor||''} onChange={e=>update({powerFactor:Number(e.target.value)})}/></label>
        <div className="space-y-1 text-xs font-medium"><span className="flex items-center gap-1"><label htmlFor={passageId}>Máxima passagem pela rede (kW)</label><InfoTooltip label="Sobre a máxima passagem pela STS">Informe o máximo de importação ou exportação pelo gabinete, incluindo recarga do BESS e FV. {sts.gridBusScope==='installation'?'O cálculo também verifica o fluxo líquido da curva geral.':'A curva geral não representa este barramento: declare seu máximo incluindo o FV conectado. O cálculo confronta a declaração com as cargas nominais e o fluxo conhecido do BESS, sem compensar por FV/gerador de localização não informada.'} A margem de backup é aplicada uma vez. O fator de utilização das cargas não reduz a potência nominal exigida.</InfoTooltip></span><Input id={passageId} aria-label="Máxima passagem pela rede (kW)" type="number" min={0} step="any" value={sts.maxGridPassageKw} onChange={e=>update({maxGridPassageKw:Number(e.target.value)})}/></div>
      </div>
      {errors.length>0&&<div role="alert" className="text-xs text-destructive">{errors.map(e=><p key={e}>{e}</p>)}</div>}
  </section>;
}
