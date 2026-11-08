'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { getCiSolutionGeneration, queryCiGeneratedSolutions } from '@/lib/data/ci-generated-solutions-repository';
import type { CiGroupedSolution } from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiAccessoriesPanel } from './CiAccessoriesPanel';

export function CiGroupedConfigurationPanel({ciOptions,onChange,onNavigatePrev,onNavigateNext}:{ciOptions:CommercialIndustrialOptions;onChange:(partial:Partial<CommercialIndustrialOptions>)=>void;onNavigatePrev?:()=>void;onNavigateNext?:()=>void}){
  const saved=ciOptions.bessSystem;
  const fixed=saved?.kind==='solution';
  const automatic=saved?.kind==='automatic'||!saved&&!ciOptions.bessProductId;
  const min=saved?.kind==='automatic'?saved:{kind:'automatic' as const,minPowerKw:0,minEnergyKwh:0};
  const [solutions,setSolutions]=useState<CiGroupedSolution[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [count,setCount]=useState<number|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [query,setQuery]=useState('');
  useEffect(()=>{
    let alive=true;
    getCiSolutionGeneration(undefined,true).then(g=>{if(alive){setCount(g?.expected_count??0);if(!g)setError('Peça ao administrador para gerar as soluções C&I aprovadas antes de calcular.');}}).catch(cause=>{if(alive)setError(cause instanceof Error?cause.message:'Não foi possível consultar o catálogo gerado.');});
    return()=>{alive=false;};
  },[attempt]);
  useEffect(()=>{
    if(!fixed)return;
    let alive=true;
    queryCiGeneratedSolutions(createClient(),{minPowerKw:0,minEnergyKwh:0,applications:[]}).then(data=>{if(alive)setSolutions(data.solutions);}).catch(cause=>{if(alive)setError(cause instanceof Error?cause.message:'Não foi possível consultar as soluções.');});
    return()=>{alive=false;};
  },[fixed,attempt]);
  const selectedSolution=fixed?solutions.find(s=>s.key===saved.solutionKey):undefined;
  const advance=()=>{if(automatic&&!saved)onChange({bessSystem:min,bessProductId:null});onNavigateNext?.();};
  return <div className="space-y-4">
    <div><h2 className="text-sm font-semibold">Soluções agrupadas C&I</h2><p className="mt-1 text-xs text-muted-foreground">Gabinetes e montagens usam o mesmo catálogo e os mesmos limites CC/CA. A curva e a estratégia definem a necessidade; o motor consulta as soluções publicadas e confirma o atendimento antes de avaliar o financeiro.</p></div>
    <div className="flex flex-wrap gap-2"><Button variant={automatic?'default':'outline'} aria-pressed={automatic} onClick={()=>onChange({bessSystem:min,bessProductId:null})}>Busca automática</Button><Button variant={fixed?'default':'outline'} aria-pressed={fixed} onClick={()=>onChange({bessSystem:{kind:'solution',solutionKey:''},bessProductId:null})}>Fixar solução gerada</Button></div>
    {error&&<div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={()=>{setError(null);setAttempt(a=>a+1);}}>Tentar novamente</Button></div>}
    {count!==null&&<p className="text-xs text-muted-foreground">{count} soluções na geração atual.</p>}
    {fixed?<div className="space-y-3"><label className="block space-y-1 text-sm">Buscar por modelo<Input value={query} onChange={e=>setQuery(e.target.value)} aria-label="Buscar solução gerada"/></label><label className="block space-y-1 text-sm">Solução gerada<Select aria-label="Solução gerada" value={saved.solutionKey} onChange={e=>onChange({bessSystem:{kind:'solution',solutionKey:e.target.value},bessProductId:null})}><option value="">Selecione uma solução</option>{solutions.filter(s=>s.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(solution=><option key={solution.key} value={solution.key}>{solution.label} · {solution.ac.dischargePowerKw.toFixed(1)} kW / {solution.storage.usableEnergyKwh.toFixed(1)} kWh úteis</option>)}</Select></label></div>:automatic?<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Mínimos adicionais (opcional)</summary><p className="my-2 text-xs text-muted-foreground">Os requisitos são derivados da curva, estratégia e backup. Estes valores apenas acrescentam um mínimo; zero mantém o dimensionamento derivado.</p><div className="grid gap-3 sm:grid-cols-2">{([['minPowerKw','Potência mínima adicional (kW)'],['minEnergyKwh','Energia útil mínima adicional (kWh)']] as const).map(([key,label])=><label className="space-y-1 text-sm" key={key}>{label}<Input type="number" min={0} step="any" value={min[key]} onChange={e=>onChange({bessSystem:{...min,[key]:Number(e.target.value)},bessProductId:null})}/></label>)}</div></details>:<p className="rounded-lg border p-3 text-sm">Este projeto possui uma configuração específica antiga. Ela será consultada no catálogo gerado com as quantidades salvas. Use Busca automática para comparar todas as soluções que atendem ao projeto.</p>}
    {selectedSolution&&<div className="space-y-1 rounded-lg border p-3 text-xs"><p className="break-words font-semibold">{selectedSolution.label}</p><p>Carga/descarga CA: {selectedSolution.ac.chargePowerKw.toFixed(1)}/{selectedSolution.ac.dischargePowerKw.toFixed(1)} kW · Energia útil: {selectedSolution.storage.usableEnergyKwh.toFixed(1)} kWh.</p><p>{selectedSolution.dc.buses} banco(s) CC independentes · {selectedSolution.dc.voltageMinV}–{selectedSolution.dc.voltageMaxV} V. Os limites CA são totais do agrupamento.</p></div>}
    <CiAccessoriesPanel ciOptions={ciOptions} onChange={onChange}/>
    <div className="flex flex-wrap justify-between gap-2 border-t pt-3">{onNavigatePrev&&<Button variant="outline" onClick={onNavigatePrev}>Voltar para Visão geral</Button>}{onNavigateNext&&<Button disabled={fixed&&!saved.solutionKey} onClick={advance}>Avançar para Curvas e aplicações</Button>}</div>
  </div>;
}
