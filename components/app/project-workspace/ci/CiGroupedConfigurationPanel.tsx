'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {CiAcPowerFactorInput} from './ci-ac-power';
import {InfoTooltip} from '@/components/ui/tooltip';
import {Select} from '@/components/ui/select';
import {createClient} from '@/lib/supabase/client';
import {queryCiGeneratedSolutions} from '@/lib/data/ci-generated-solutions-repository';
import {buildCiModelOptions,ciModelVoltageLabel} from '@/lib/data/ci-model-options';
import type {CiGroupedSolution} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import type {CiModelSelection,CommercialIndustrialOptions} from '@/supabase/functions/_shared/commercial-industrial/types';
import {CiAccessoriesPanel} from './CiAccessoriesPanel';

export function CiGroupedConfigurationPanel({ciOptions,onChange,onNavigatePrev,onNavigateNext}:{ciOptions:CommercialIndustrialOptions;onChange:(partial:Partial<CommercialIndustrialOptions>)=>void;onNavigatePrev?:()=>void;onNavigateNext?:()=>void}){
  const [solutions,setSolutions]=useState<CiGroupedSolution[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let alive=true;
    queryCiGeneratedSolutions(createClient(),{minPowerKw:0,minEnergyKwh:0,applications:[]})
      .then(data=>{if(alive)setSolutions(data.solutions);})
      .catch(cause=>{if(alive)setError(cause instanceof Error?cause.message:'Não foi possível consultar os modelos compatíveis.');})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[attempt]);
  const catalog=buildCiModelOptions(solutions);
  const saved=ciOptions.bessSystem;
  const model:CiModelSelection=saved?.kind==='model'?saved:{kind:'model',sourceKind:'cabinet',productId:ciOptions.bessProductId};
  const voltage=ciOptions.lineVoltageV;
  const pcsOptions=[...new Map(catalog.assemblies.map(item=>[item.pcsId,{id:item.pcsId,model:item.pcsModel,voltages:catalog.assemblies.filter(pair=>pair.pcsId===item.pcsId).flatMap(pair=>pair.voltages).filter((v,i,all)=>all.indexOf(v)===i)}])).values()];
  const batteries=model.sourceKind==='assembly'?catalog.assemblies.filter(item=>item.pcsId===model.pcsId):[];
  const selectedVoltages=model.sourceKind==='cabinet'?catalog.cabinets.find(item=>item.productId===model.productId)?.voltages:batteries.find(item=>item.batteryId===model.batteryId)?.voltages;
  const ready=Boolean(voltage&&selectedVoltages?.includes(voltage)&&!loading&&!error);
  const accessoryTargets=saved?.kind==='model'?solutions.filter(solution=>voltage&&solution.ac.lineVoltagesV?.includes(voltage)&&solution.source.kind===model.sourceKind&&(model.sourceKind==='cabinet'?solution.source.id===model.productId:solution.accessoryTarget.pcsId===model.pcsId&&solution.accessoryTarget.batteryId===model.batteryId)).map(solution=>({...solution.accessoryTarget,backup:Boolean(ciOptions.backup?.enabled),generator:Boolean(ciOptions.generator?.enabled),lineVoltageV:voltage})):undefined;
  function select(next:CiModelSelection,extra:Partial<CommercialIndustrialOptions>={}){onChange({bessSystem:next,bessProductId:null,...extra});}
  function changeVoltage(next:220|380){
    const compatible=selectedVoltages?.includes(next);
    select(compatible?model:model.sourceKind==='cabinet'?{kind:'model',sourceKind:'cabinet',productId:null}:{kind:'model',sourceKind:'assembly',pcsId:null,batteryId:null},{lineVoltageV:next});
  }
  return <div className="space-y-4">
    <div><h2 className="text-sm font-semibold">Configurações BESS</h2><p className="mt-1 text-xs text-muted-foreground">Escolha a tensão e os modelos. A curva de carga, a estratégia e as aplicações determinam as quantidades e o arranjo necessários.</p></div>
    <label className="block max-w-sm space-y-1 text-sm">Tensão CA entre fases<Select aria-label="Tensão CA entre fases" value={voltage??''} onChange={event=>changeVoltage(Number(event.target.value) as 220|380)}><option value="" disabled>Selecione a tensão</option><option value={380}>380 V</option><option value={220}>220 V</option></Select></label>
    <div className="flex max-w-sm items-end gap-2">
      <label className="block flex-1 space-y-1 text-sm">Fator de potência CA do projeto<CiAcPowerFactorInput label="Fator de potência CA do projeto" value={ciOptions.acPowerFactor??1} onChange={value=>onChange({acPowerFactor:value})} /></label>
      <InfoTooltip label="Sobre o fator de potência CA">Converte as potências CA apresentadas em kVA: kVA = kW ÷ FP. Energia, tarifas e limites ativos continuam calculados em kW e kWh. Potências CC e baterias mantêm suas unidades. O gerador e a STS usam seus próprios fatores documentados. Projetos anteriores começam com FP 1.</InfoTooltip>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant={model.sourceKind==='cabinet'?'default':'outline'} aria-pressed={model.sourceKind==='cabinet'} onClick={()=>select({kind:'model',sourceKind:'cabinet',productId:null})}>BESS integrado</Button><Button variant={model.sourceKind==='assembly'?'default':'outline'} aria-pressed={model.sourceKind==='assembly'} onClick={()=>select({kind:'model',sourceKind:'assembly',pcsId:null,batteryId:null})}>PCS/Inversor + bateria</Button></div>
    {loading&&<p role="status" className="text-sm">Consultando modelos compatíveis…</p>}
    {error&&<div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={()=>{setError(null);setLoading(true);setAttempt(a=>a+1);}}>Tentar novamente</Button></div>}
    {!loading&&!error&&!solutions.length&&<p role="alert" className="text-sm">Nenhum modelo possui soluções na geração atual. Peça ao administrador para conferir as compatibilidades e gerar as soluções.</p>}
    {model.sourceKind==='cabinet'?<label className="block space-y-1 text-sm">Modelo BESS integrado<Select aria-label="Modelo BESS integrado" disabled={loading||!voltage} value={model.productId??''} onChange={event=>select({...model,productId:event.target.value||null})}><option value="">Selecione um modelo</option>{catalog.cabinets.map(item=><option key={item.productId} value={item.productId} disabled={!voltage||!item.voltages.includes(voltage)}>{item.model} · {ciModelVoltageLabel(item.voltages,voltage)}</option>)}</Select></label>:<div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-sm">Modelo PCS/Inversor<Select aria-label="Modelo PCS/Inversor" disabled={loading||!voltage} value={model.pcsId??''} onChange={event=>select({...model,pcsId:event.target.value||null,batteryId:null})}><option value="">Selecione um PCS/Inversor</option>{pcsOptions.map(item=><option key={item.id} value={item.id} disabled={!voltage||!item.voltages.includes(voltage)}>{item.model} · {ciModelVoltageLabel(item.voltages,voltage)}</option>)}</Select></label><label className="block space-y-1 text-sm">Modelo de bateria compatível<Select aria-label="Modelo de bateria compatível" disabled={loading||!voltage||!model.pcsId} value={model.batteryId??''} onChange={event=>select({...model,batteryId:event.target.value||null})}><option value="">Selecione uma bateria</option>{batteries.map(item=><option key={item.batteryId} value={item.batteryId} disabled={!voltage||!item.voltages.includes(voltage)}>{item.batteryModel} · {ciModelVoltageLabel(item.voltages,voltage)}</option>)}</Select></label></div>}
    {!loading&&voltage&&selectedVoltages&&!selectedVoltages.includes(voltage)&&<p role="alert" className="text-sm text-destructive">Os modelos selecionados não possuem operação aprovada em {voltage} V. Escolha modelos compatíveis.</p>}
    {saved&&saved.kind!=='model'&&<p className="text-xs text-muted-foreground">Este projeto tem uma configuração anterior. Selecione os modelos para dimensionar automaticamente suas quantidades.</p>}
    <p className="text-xs text-muted-foreground">Somente combinações da geração aprovada são listadas. Modelos incompatíveis com a tensão ficam desabilitados. O resultado apresenta uma solução que atende integralmente ao projeto; depois calcula seus indicadores financeiros.</p>
    <CiAccessoriesPanel ciOptions={ciOptions} onChange={onChange} targets={accessoryTargets}/>
    <div className="flex flex-wrap justify-between gap-2 border-t pt-3">{onNavigatePrev&&<Button variant="outline" onClick={onNavigatePrev}>Voltar para Visão geral</Button>}{onNavigateNext&&<Button disabled={!ready} onClick={onNavigateNext}>Avançar para Curvas e aplicações</Button>}</div>
  </div>;
}
