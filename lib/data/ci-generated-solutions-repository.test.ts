import {it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {generateCiGroupedSolutions} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import {modularFixture} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import {queryCiGeneratedSolutions,publishCiGeneratedSolutions} from './ci-generated-solutions-repository';
const mock=vi.hoisted(()=>({assemble:vi.fn(),generate:vi.fn()}));
vi.mock('./ci-modular-catalog-repository',()=>({assembleCiEquipmentCatalog:mock.assemble}));
function queryDb(count:number,changed=false){
 const ranges=vi.fn();let currentReads=0;
 const solution=generateCiGroupedSolutions(modularFixture(),[]).solutions[0];
 const from=vi.fn((table:string)=>{
  const q={select:()=>q,eq:()=>q,gte:()=>q,lte:()=>q,contains:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:{id:changed&&currentReads++?'changed':'gen',is_current:true},error:null}),range:async(a:number,b:number)=>{ranges(a,b);return {data:table==='ci_generated_solutions'?Array.from({length:Math.max(0,Math.min(b+1,count)-a)},(_,i)=>({solution:{...solution,key:`key-${a+i}`}})):[],error:null};}};return q;
 });
 return {db:{from} as unknown as SupabaseClient,ranges};
}
it('reads every page with stable ordering and does not truncate at 500',async()=>{
 const {db,ranges}=queryDb(1001);const result=await queryCiGeneratedSolutions(db,{minPowerKw:0,minEnergyKwh:0,applications:[]});expect(result.solutions).toHaveLength(1001);expect(ranges.mock.calls).toEqual([[0,499],[500,999],[1000,1499]]);
});
it('rejects a catalog invalidated during pagination',async()=>{
 const {db}=queryDb(501,true);await expect(queryCiGeneratedSolutions(db,{minPowerKw:0,minEnergyKwh:0,applications:[]})).rejects.toThrow('mudou');
});
it('stages batches and publishes only after every append; cancels a failed draft',async()=>{
 mock.assemble.mockReturnValue({...modularFixture(),rules:[]});
 const rpc=vi.fn(async(name:string)=>({data:name==='ci_solution_source'?{revision:'r1',sources:{products:[]}}:name==='ci_begin_solution_generation'?'gen':null,error:null as null|Error}));
 await expect(publishCiGeneratedSolutions({rpc} as unknown as SupabaseClient)).resolves.toMatchObject({count:0,generationId:'gen'});
 expect(rpc.mock.calls.map(call=>call[0])).toEqual(['ci_solution_source','ci_begin_solution_generation','ci_publish_solution_generation']);
 rpc.mockClear();rpc.mockImplementation(async(name:string)=>({data:name==='ci_solution_source'?{revision:'r1',sources:{products:[]}}:'gen',error:name==='ci_publish_solution_generation'?new Error('stale'):null}));
 await expect(publishCiGeneratedSolutions({rpc} as unknown as SupabaseClient)).rejects.toThrow('stale');expect(rpc.mock.calls.at(-1)?.[0]).toBe('ci_cancel_solution_generation');
});
it('publishes more than one batch without exposing an incomplete generation',async()=>{
 const {cabinetFixture}=await import('@/supabase/functions/_shared/commercial-industrial/grouped-solutions.test-fixtures');
 mock.assemble.mockReturnValue({...modularFixture(),rules:[]});const product={...cabinetFixture(),max_parallel_units:105};
 const batches:number[]=[];const rpc=vi.fn(async(name:string,args?:{p_solutions?:unknown[]})=>{if(name==='ci_append_solution_generation')batches.push(args!.p_solutions!.length);return {data:name==='ci_solution_source'?{revision:'r1',sources:{products:[product]}}:'gen',error:null};});
 const result=await publishCiGeneratedSolutions({rpc} as unknown as SupabaseClient);expect(result.count).toBe(105);expect(batches).toEqual([100,5]);expect(rpc.mock.calls.at(-1)?.[0]).toBe('ci_publish_solution_generation');
});
it('requires regenerated topology instead of silently using a v1 current row',async()=>{
 const {db}=queryDb(1);const from=db.from as unknown as ReturnType<typeof vi.fn>;const original=from.getMockImplementation()! as (table:string)=>{range:(...args:unknown[])=>Promise<unknown>};
 from.mockImplementation((table:string)=>{const q=original(table);if(table==='ci_generated_solutions')q.range=async()=>({data:[{solution:{...generateCiGroupedSolutions(modularFixture(),[]).solutions[0],contractVersion:'ci-grouped-v1',dc:{...generateCiGroupedSolutions(modularFixture(),[]).solutions[0].dc,ports:undefined}}}],error:null});return q;});
 await expect(queryCiGeneratedSolutions(db,{minPowerKw:0,minEnergyKwh:0,applications:[]})).rejects.toThrow('Gere novamente');
});
it('filters every bank, including the largest series count, and matches a fixed asymmetric pattern',async()=>{
 const {aelioPortFixture}=await import('@/supabase/functions/_shared/commercial-industrial/battery-ports.test-fixtures');
 const rows=generateCiGroupedSolutions(aelioPortFixture(),[]).solutions;
 const lte=vi.fn(),eq=vi.fn();
 const from=(table:string)=>{const q={select:()=>q,eq:(...args:unknown[])=>{eq(...args);return q;},gte:()=>q,lte:(...args:unknown[])=>{lte(...args);return q;},order:()=>q,limit:()=>q,maybeSingle:async()=>({data:{id:'gen'},error:null}),range:async()=>({data:table==='ci_generated_solutions'?rows.map(solution=>({solution})):[],error:null})};return q;};
 const result=await queryCiGeneratedSolutions({from} as unknown as SupabaseClient,{minPowerKw:0,minEnergyKwh:0,applications:[],series:{min:7,max:14},parallel:{min:1,max:1},ports:{min:2,max:2},bankPattern:[{series:7,parallelStrings:1},{series:14,parallelStrings:1}]});
 expect(result.solutions).toHaveLength(1);expect(result.solutions[0].counts.batteries).toBe(21);expect(lte).toHaveBeenCalledWith('series_max_count',14);expect(lte).toHaveBeenCalledWith('parallel_max_count',1);
});
