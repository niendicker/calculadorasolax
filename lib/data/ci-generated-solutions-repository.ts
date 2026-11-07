import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { assembleCiEquipmentCatalog, type CiCatalogRows } from './ci-modular-catalog-repository';
import { assertCiGroupedSolution, generateCiGroupedSolutions, type CiCabinetSource, type CiGroupedSolution, type CiApplication } from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';

export interface CiSolutionGeneration {id:string;source_revision:string;expected_count:number;status:'draft'|'published'|'cancelled';is_current:boolean;published_at:string|null;invalidated_at:string|null;invalidation_reason:string|null;diagnostics:string[]}
export class CiSolutionCatalogError extends Error {readonly code='ci_catalog';}
const PAGE_SIZE=500;

export async function getCiSolutionGeneration(db:SupabaseClient=createClient(),currentOnly=false):Promise<CiSolutionGeneration|null>{
  let query=db.from('ci_solution_generations').select('*').eq('status','published');
  if(currentOnly)query=query.eq('is_current',true);
  const {data,error}=await query.order('published_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw new CiSolutionCatalogError(`Não foi possível consultar a geração de soluções C&I: ${error.message}`);
  return data as CiSolutionGeneration|null;
}

export async function publishCiGeneratedSolutions(db:SupabaseClient){
  const {data:source,error:sourceError}=await db.rpc('ci_solution_source');
  if(sourceError)throw new Error(sourceError.message);
  if(!source?.revision||!source.sources)throw new Error('Snapshot do catálogo C&I inválido.');
  const rows=source.sources as CiCatalogRows&{products:CiCabinetSource[]};
  const {solutions,diagnostics}=generateCiGroupedSolutions(assembleCiEquipmentCatalog(rows),rows.products);
  const {data:generationId,error:beginError}=await db.rpc('ci_begin_solution_generation',{p_source_revision:source.revision,p_expected_count:solutions.length});
  if(beginError)throw new Error(beginError.message);
  try{
    for(let index=0;index<solutions.length;index+=100){
      const {error}=await db.rpc('ci_append_solution_generation',{p_generation_id:generationId,p_solutions:solutions.slice(index,index+100)});
      if(error)throw new Error(error.message);
    }
    const {error}=await db.rpc('ci_publish_solution_generation',{p_generation_id:generationId,p_diagnostics:diagnostics});
    if(error)throw new Error(error.message);
  }catch(cause){
    try { await db.rpc('ci_cancel_solution_generation',{p_generation_id:generationId}); } catch { /* Preserve the publication failure; an abandoned draft is never visible. */ }
    throw cause;
  }
  return {generationId,count:solutions.length,diagnostics,sourceRevision:source.revision};
}

export interface CiSolutionQuery {
  minPowerKw:number;minEnergyKwh:number;applications:CiApplication[];
  sourceKind?:'assembly'|'cabinet';sourceId?:string;solutionKey?:string;
  units?:{min:number;max:number};series?:{min:number;max:number};parallel?:{min:number;max:number};
}
export async function queryCiGeneratedSolutions(db:SupabaseClient,filter:CiSolutionQuery){
  const generation=await getCiSolutionGeneration(db,true);
  if(!generation)throw new CiSolutionCatalogError('O catálogo de soluções C&I está ausente ou desatualizado. Peça ao administrador para gerar as soluções aprovadas.');
  const solutions:CiGroupedSolution[]=[];
  for(let offset=0;;offset+=PAGE_SIZE){
    let query=db.from('ci_generated_solutions').select('solution').eq('generation_id',generation.id).gte('discharge_power_kw',Math.max(0,filter.minPowerKw-1e-6)).gte('usable_energy_kwh',Math.max(0,filter.minEnergyKwh-1e-6));
    if(filter.applications.length)query=query.contains('applications',filter.applications);
    if(filter.sourceKind)query=query.eq('source_kind',filter.sourceKind);
    if(filter.sourceId)query=query.eq('source_id',filter.sourceId);
    if(filter.solutionKey)query=query.eq('solution_key',filter.solutionKey);
    for(const [key,range] of [['unit_count',filter.units],['series_count',filter.series],['parallel_count',filter.parallel]] as const){if(range)query=query.gte(key,range.min).lte(key,range.max);}
    const {data,error}=await query.order('solution_key',{ascending:true}).range(offset,offset+PAGE_SIZE-1);
    if(error)throw new CiSolutionCatalogError(`Falha ao consultar soluções C&I: ${error.message}`);
    for(const row of data??[]){const solution=row.solution as CiGroupedSolution;assertCiGroupedSolution(solution);solutions.push(solution);}
    if((data??[]).length<PAGE_SIZE)break;
  }
  await assertCiGenerationCurrent(db,generation.id);
  return {generation,solutions};
}

export async function assertCiGenerationCurrent(db:SupabaseClient,id:string){
  const current=await getCiSolutionGeneration(db,true);
  if(current?.id!==id)throw new CiSolutionCatalogError('O catálogo mudou durante a consulta. Atualize a geração e calcule novamente.');
}
