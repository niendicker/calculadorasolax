'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { describeCiGenerationInvalidation, type CiSolutionGeneration } from '@/lib/data/ci-generated-solutions-repository';

export function CiGeneratedSolutionsEditor(){
  const [generation,setGeneration]=useState<CiSolutionGeneration|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function reload(){
    setLoading(true);setError(null);
    try{const response=await fetch('/api/admin/ci-solutions/generate');const data=await response.json();if(!response.ok)throw new Error(data.error);setGeneration(data.generation);}
    catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível consultar as soluções.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    let active=true;
    fetch('/api/admin/ci-solutions/generate').then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);return data.generation as CiSolutionGeneration|null;})
      .then(data=>{if(active)setGeneration(data);})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Não foi possível consultar as soluções.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  async function generate(){
    setBusy(true);setError(null);
    try{const response=await fetch('/api/admin/ci-solutions/generate',{method:'POST'});const data=await response.json();if(!response.ok)throw new Error(data.error);await reload();}
    catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível gerar as soluções.');}
    finally{setBusy(false);}
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Soluções C&I geradas</h2><p className="mt-1 max-w-2xl text-xs text-muted-foreground">Combinações de gabinetes e montagens aprovadas com o mesmo contrato CC/CA. Os projetos consultam a geração publicada, sem recalcular combinações durante a busca.</p></div><Button disabled={busy||loading} onClick={generate}>{busy?'Gerando e publicando…':'Gerar soluções'}</Button></div>
    {error&&<div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={reload}>Tentar novamente</Button></div>}
    {loading?<p role="status" className="text-sm">Consultando geração…</p>:<div className="rounded-lg border p-4 text-sm"><p className="font-semibold">{generation?.is_current?'Geração publicada e atual':'Catálogo sem geração atual — gere novamente após concluir as alterações'}</p>{generation&&<><p className="mt-1 text-xs text-muted-foreground">{generation.expected_count} soluções · publicação {generation.published_at?new Date(generation.published_at).toLocaleString('pt-BR'):'pendente'}</p>{describeCiGenerationInvalidation(generation)&&<p className="mt-2 text-xs">{describeCiGenerationInvalidation(generation)} Invalidação: {new Date(generation.invalidated_at!).toLocaleString('pt-BR')}.</p>}</>}</div>}
    {Boolean(generation?.diagnostics?.length)&&<div className="rounded-lg border p-3 text-sm"><p className="font-medium">Fichas excluídas da geração</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{generation!.diagnostics.map((message,index)=><li key={index}>{message}</li>)}</ul></div>}
    <p className="text-xs text-muted-foreground">Alterações nas fichas ou nas aprovações invalidam as soluções para novos cálculos. Salvar sem mudar os dados mantém a geração atual. Uma nova geração só substitui a anterior quando todos os lotes estão completos; estudos históricos são preservados.</p>
  </section>;
}
