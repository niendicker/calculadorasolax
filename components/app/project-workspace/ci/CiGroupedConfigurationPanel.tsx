'use client';
import {useEffect,useId,useState} from 'react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {CiAcPowerFactorInput,useCiAcPower} from './ci-ac-power';
import {InfoTooltip} from '@/components/ui/tooltip';
import {Select} from '@/components/ui/select';
import {createClient} from '@/lib/supabase/client';
import {formatKwh} from '../../helpers';
import {queryCiGeneratedSolutions} from '@/lib/data/ci-generated-solutions-repository';
import {buildCiModelOptions,ciModelVoltageLabel} from '@/lib/data/ci-model-options';
import type {CiApplication,CiGroupedSolution} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import type {CiModelSelection,CommercialIndustrialOptions} from '@/supabase/functions/_shared/commercial-industrial/types';
import {CiAccessoriesPanel} from './CiAccessoriesPanel';

const APPLICATION_LABELS:Record<CiApplication,string>={peak_shaving:'Peak Shaving',load_shifting:'Load Shifting',backup:'Backup',solar:'Solar FV',generator:'Gerador'};
const APPLICATION_ORDER:CiApplication[]=['peak_shaving','load_shifting','backup','solar','generator'];

/** Facts the generation already holds about one selected model, read from its single-unit solutions. */
function describeSelection(solutions:CiGroupedSolution[],model:CiModelSelection){
  const matching=solutions.filter(solution=>solution.source.kind===model.sourceKind&&(model.sourceKind==='cabinet'?solution.source.id===model.productId:solution.accessoryTarget.pcsId===model.pcsId&&solution.accessoryTarget.batteryId===model.batteryId));
  const single=matching.filter(solution=>solution.counts.units===1);
  if(!single.length)return null;
  const range=(values:number[])=>({min:Math.min(...values),max:Math.max(...values)});
  return {
    title:single[0].components.filter(c=>c.productType!=='ci_accessory').map(c=>c.model).join(' + '),
    powerKw:range(single.map(s=>s.ac.dischargePowerKw)),
    energyKwh:range(single.map(s=>s.storage.usableEnergyKwh)),
    maxUnits:Math.max(...matching.map(s=>s.counts.units)),
    voltages:[...new Set(matching.flatMap(s=>s.ac.lineVoltagesV??[]))].sort((a,b)=>a-b),
    applications:APPLICATION_ORDER.filter(app=>matching.some(s=>s.applications.includes(app))),
  };
}

export function CiGroupedConfigurationPanel({ciOptions,onChange,onNavigatePrev,onNavigateNext}:{ciOptions:CommercialIndustrialOptions;onChange:(partial:Partial<CommercialIndustrialOptions>)=>void;onNavigatePrev?:()=>void;onNavigateNext?:()=>void}){
  const powerFactorId=useId();
  const [solutions,setSolutions]=useState<CiGroupedSolution[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  const {formatPower}=useCiAcPower(ciOptions.acPowerFactor);
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
  const selectionComplete=model.sourceKind==='cabinet'?Boolean(model.productId):Boolean(model.pcsId&&model.batteryId);
  const incompatible=Boolean(voltage&&selectedVoltages&&!selectedVoltages.includes(voltage));
  const ready=Boolean(voltage&&selectedVoltages?.includes(voltage)&&!loading&&!error);
  const primaryOptions=model.sourceKind==='cabinet'?catalog.cabinets:pcsOptions;
  const unavailable=voltage?primaryOptions.filter(item=>!item.voltages.includes(voltage)).length:0;
  const noneAtVoltage=Boolean(voltage&&primaryOptions.length&&unavailable===primaryOptions.length);
  const sheet=saved?.kind==='model'&&selectionComplete?describeSelection(solutions,model):null;
  const accessoryTargets=saved?.kind==='model'?solutions.filter(solution=>voltage&&solution.ac.lineVoltagesV?.includes(voltage)&&solution.source.kind===model.sourceKind&&(model.sourceKind==='cabinet'?solution.source.id===model.productId:solution.accessoryTarget.pcsId===model.pcsId&&solution.accessoryTarget.batteryId===model.batteryId)).map(solution=>({...solution.accessoryTarget,backup:Boolean(ciOptions.backup?.enabled),generator:Boolean(ciOptions.generator?.enabled),lineVoltageV:voltage})):undefined;
  const pending=loading||error||ready||incompatible?null:!voltage?'Selecione a tensão para avançar.':model.sourceKind==='cabinet'?'Selecione o modelo para avançar.':'Selecione o PCS/Inversor e a bateria para avançar.';
  const unitLabel=model.sourceKind==='cabinet'?'unidade':'PCS';
  const formatRange=(range:{min:number;max:number},format:(value:number)=>string)=>range.min===range.max?format(range.min):`${format(range.min)} a ${format(range.max)}`;
  function select(next:CiModelSelection,extra:Partial<CommercialIndustrialOptions>={}){onChange({bessSystem:next,bessProductId:null,...extra});}
  function changeVoltage(next:220|380){
    const compatible=selectedVoltages?.includes(next);
    select(compatible?model:model.sourceKind==='cabinet'?{kind:'model',sourceKind:'cabinet',productId:null}:{kind:'model',sourceKind:'assembly',pcsId:null,batteryId:null},{lineVoltageV:next});
  }
  return <div className="space-y-5">
    <div><h2 className="text-base font-semibold">Configuração BESS</h2><p className="mt-1 text-xs text-muted-foreground">Escolha a rede e o equipamento base. As quantidades e o arranjo saem da curva de carga, da estratégia e das aplicações.</p></div>
    <section className="space-y-3">
      <p className="text-sm font-semibold">Rede do projeto</p>
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">Tensão CA entre fases<Select aria-label="Tensão CA entre fases" value={voltage??''} onChange={event=>changeVoltage(Number(event.target.value) as 220|380)}><option value="" disabled>Selecione a tensão</option><option value={380}>380 V</option><option value={220}>220 V</option></Select></label>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-1">
            <label htmlFor={powerFactorId}>Fator de potência CA do projeto</label>
            <InfoTooltip label="Sobre o fator de potência CA">Converte as potências CA apresentadas em kVA: kVA = kW ÷ FP. Energia, tarifas e limites ativos continuam calculados em kW e kWh. Potências CC e baterias mantêm suas unidades. O gerador e a STS usam seus próprios fatores documentados. Projetos anteriores começam com FP 1.</InfoTooltip>
          </div>
          <CiAcPowerFactorInput id={powerFactorId} label="Fator de potência CA do projeto" value={ciOptions.acPowerFactor??1} onChange={value=>onChange({acPowerFactor:value})} />
        </div>
      </div>
    </section>
    <section className="space-y-3">
      <p className="text-sm font-semibold">Equipamento</p>
      <div className="space-y-1 text-sm"><p id="ci-equipment-kind">Tipo de equipamento</p><div role="group" aria-labelledby="ci-equipment-kind" className="flex flex-wrap gap-2"><Button variant={model.sourceKind==='cabinet'?'default':'outline'} aria-pressed={model.sourceKind==='cabinet'} onClick={()=>select({kind:'model',sourceKind:'cabinet',productId:null})}>BESS integrado</Button><Button variant={model.sourceKind==='assembly'?'default':'outline'} aria-pressed={model.sourceKind==='assembly'} onClick={()=>select({kind:'model',sourceKind:'assembly',pcsId:null,batteryId:null})}>PCS/Inversor + bateria</Button></div></div>
      {loading&&<p role="status" className="text-sm">Consultando modelos compatíveis…</p>}
      {error&&<div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={()=>{setError(null);setLoading(true);setAttempt(a=>a+1);}}>Tentar novamente</Button></div>}
      {!loading&&!error&&!solutions.length&&<p role="alert" className="text-sm">Nenhum modelo possui soluções na geração atual. Peça ao administrador para conferir as compatibilidades e gerar as soluções.</p>}
      <div className="max-w-2xl space-y-2">
        {model.sourceKind==='cabinet'?<label className="block space-y-1 text-sm">Modelo BESS integrado<Select aria-label="Modelo BESS integrado" disabled={loading||!voltage} value={model.productId??''} onChange={event=>select({...model,productId:event.target.value||null})}><option value="">Selecione um modelo</option>{catalog.cabinets.map(item=><option key={item.productId} value={item.productId} disabled={!voltage||!item.voltages.includes(voltage)}>{item.model} · {ciModelVoltageLabel(item.voltages,voltage)}</option>)}</Select></label>:<div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-sm">Modelo PCS/Inversor<Select aria-label="Modelo PCS/Inversor" disabled={loading||!voltage} value={model.pcsId??''} onChange={event=>select({...model,pcsId:event.target.value||null,batteryId:null})}><option value="">Selecione um PCS/Inversor</option>{pcsOptions.map(item=><option key={item.id} value={item.id} disabled={!voltage||!item.voltages.includes(voltage)}>{item.model} · {ciModelVoltageLabel(item.voltages,voltage)}</option>)}</Select></label><label className="block space-y-1 text-sm">Modelo de bateria compatível<Select aria-label="Modelo de bateria compatível" disabled={loading||!voltage||!model.pcsId} value={model.batteryId??''} onChange={event=>select({...model,batteryId:event.target.value||null})}><option value="">Selecione uma bateria</option>{batteries.map(item=><option key={item.batteryId} value={item.batteryId} disabled={!voltage||!item.voltages.includes(voltage)}>{item.batteryModel} · {ciModelVoltageLabel(item.voltages,voltage)}</option>)}</Select></label></div>}
        {!loading&&!noneAtVoltage&&unavailable>0&&<p className="text-xs text-muted-foreground">{unavailable===1?'1 modelo não documentado':`${unavailable} modelos não documentados`} em {voltage} V ficam desabilitados. Somente combinações da geração aprovada são listadas.</p>}
        {!loading&&noneAtVoltage&&<p role="alert" className="text-sm text-destructive">Nenhum modelo documentado em {voltage} V. Selecione {voltage===220?380:220} V ou peça ao administrador para documentar a tensão no cadastro e gerar as soluções.</p>}
        {!loading&&incompatible&&<p role="alert" className="text-sm text-destructive">Os modelos selecionados não possuem operação aprovada em {voltage} V. Escolha modelos compatíveis.</p>}
        {saved&&saved.kind!=='model'&&<p className="text-xs text-muted-foreground">Este projeto tem uma configuração anterior. Selecione os modelos para dimensionar automaticamente suas quantidades.</p>}
      </div>
      {sheet&&<section aria-label={`Ficha de ${sheet.title}`} className="max-w-2xl space-y-2 rounded-xl border p-4 text-sm">
        <p className="font-semibold">{sheet.title}</p>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Potência CA de descarga</dt><dd>{formatRange(sheet.powerKw,kw=>formatPower(kw))} por {unitLabel}</dd>
          <dt className="text-muted-foreground">Energia útil</dt><dd>{formatRange(sheet.energyKwh,kwh=>formatKwh(kwh,1))} por {unitLabel}</dd>
          <dt className="text-muted-foreground">Paralelo aprovado</dt><dd>até {sheet.maxUnits} {unitLabel}{sheet.maxUnits>1&&unitLabel==='unidade'?'s':''}</dd>
          <dt className="text-muted-foreground">Tensões documentadas</dt><dd>{sheet.voltages.length?`${sheet.voltages.join(' / ')} V`:'não documentadas'}</dd>
        </dl>
        <div className="flex flex-wrap gap-1" aria-label="Aplicações suportadas">{sheet.applications.map(app=><Badge key={app} variant="outline">{APPLICATION_LABELS[app]}</Badge>)}</div>
        <p className="text-xs text-muted-foreground">O resultado escolhe a quantidade e o arranjo que atendem integralmente ao projeto e depois calcula os indicadores financeiros.</p>
      </section>}
    </section>
    <CiAccessoriesPanel ciOptions={ciOptions} onChange={onChange} targets={accessoryTargets}/>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">{onNavigatePrev&&<Button variant="outline" onClick={onNavigatePrev}>Voltar para Visão geral</Button>}<div className="ml-auto flex flex-wrap items-center gap-3">{pending&&onNavigateNext&&<p role="status" className="text-xs text-muted-foreground">{pending}</p>}{onNavigateNext&&<Button disabled={!ready} onClick={onNavigateNext}>Avançar para Curvas e aplicações</Button>}</div></div>
  </div>;
}
