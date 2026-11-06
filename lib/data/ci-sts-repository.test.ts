import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCiStsCatalog,loadCiStsContext,saveCiStsSpec,saveCiStsRule } from './ci-sts-repository';
import { stsFixture } from '@/supabase/functions/_shared/commercial-industrial/sts.test-fixtures';
const mocks=vi.hoisted(()=>({createClient:vi.fn()}));
vi.mock('@/lib/supabase/client',()=>({createClient:mocks.createClient}));
beforeEach(()=>vi.clearAllMocks());
function db(price:number|null=5000, failure:string|null=null) {
 const fixture=stsFixture();const lookups:Record<string,unknown>[]=[];
 const tables:Record<string,unknown>={ci_sts_specs:fixture.catalog.specs,ci_sts_compatibility_rules:fixture.catalog.rules,ci_accessories:fixture.catalog.specs.map(s=>({id:s.accessory_id,model:s.model,active:true}))};
 const client={auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'owner'}},error:null})},from:(table:string)=>{
  const where:Record<string,unknown>={table};if(table==='user_stock_items')lookups.push(where);
  const result={data:tables[table],error:failure?{message:failure}:null};
  const q={select:()=>q,order:()=>Promise.resolve(result),eq:(key:string,value:unknown)=>{where[key]=value;return q;},maybeSingle:()=>Promise.resolve({data:{unit_value:price},error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};return q;
 }} as unknown as SupabaseClient;
 return{client,lookups};
}
describe('C&I STS catalog and user pricing',()=>{
 it('resolves independent C&I accessory IDs and queries prices scoped to the authenticated owner',async()=>{
  const {client,lookups}=db();
  const context=await loadCiStsContext(client,stsFixture().target);
  expect(context.catalog.specs[0].model).toBe('ZERO-125 teste');
  expect(context.prices.small).toBe(5000);
  expect(lookups).toHaveLength(2);
  expect(lookups.every(q=>q.user_id==='owner'&&q.product_type==='ci_accessory')).toBe(true);
 });
 it('keeps missing price distinct from explicitly registered zero',async()=>{
  expect((await loadCiStsContext(db(null).client,stsFixture().target)).prices.small).toBeUndefined();
  expect((await loadCiStsContext(db(0).client,stsFixture().target)).prices.small).toBe(0);
 });
 it('propagates inaccessible catalog and authentication errors',async()=>{
  await expect(loadCiStsCatalog(db(0,'permission denied').client)).rejects.toThrow('permission denied');
  const {client}=db();vi.mocked(client.auth.getUser).mockResolvedValue({data:{user:null},error:null} as never);
  await expect(loadCiStsContext(client,stsFixture().target)).rejects.toThrow('sessão');
 });
 it('writes to C&I tables only and reports denied writes',async()=>{
  const upsert=vi.fn().mockResolvedValue({error:{message:'denied'}});const from=vi.fn(()=>({upsert}));mocks.createClient.mockReturnValue({from});
  const {model:_model,accessoryActive:_active,...spec}=stsFixture().catalog.specs[0];void _model;void _active;
  await expect(saveCiStsSpec(spec)).rejects.toThrow('denied');
  expect(from).toHaveBeenCalledWith('ci_sts_specs');
  upsert.mockReturnValue({select:()=>({single:()=>Promise.resolve({data:{id:'rule'},error:null})})} as never);
  await expect(saveCiStsRule(stsFixture().catalog.rules[0])).resolves.toBe('rule');
  expect(from).toHaveBeenLastCalledWith('ci_sts_compatibility_rules');
 });
});
