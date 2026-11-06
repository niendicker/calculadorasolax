import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCiAccessoryContext, saveCiAccessoryRule } from './ci-accessories-repository';
const mocks=vi.hoisted(()=>({createClient:vi.fn()}));
vi.mock('@/lib/supabase/client',()=>({createClient:mocks.createClient}));
beforeEach(()=>vi.clearAllMocks());
function client(price: number | null = 250, error: string | null = null) {
 const calls:{table:string;where:Record<string,unknown>}[]=[];
 const tables:Record<string,unknown[]>={ci_accessories:[{id:'ci',model:'Mesmo nome',active:true}],ci_accessory_rules:[],ci_sts_specs:[],user_stock_items:[{product_model:'Mesmo nome',unit_value:price}]};
 const db={auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'owner'}},error:null})},from:(table:string)=>{
  const call={table,where:{}};calls.push(call);
  const result={data:tables[table],error:error ? {message:error}:null};
  const q={select:()=>q,order:()=>q,eq:(key:string,value:unknown)=>{(call.where as Record<string,unknown>)[key]=value;return q;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};
  return q;
 }} as unknown as SupabaseClient;
 return {db,calls};
}
describe('C&I accessory context',()=>{
 it('loads only independent C&I catalogs and scopes prices to the authenticated owner and category',async()=>{
  const {db,calls}=client();
  const result=await loadCiAccessoryContext(db,['ci']);
  expect(result.prices).toEqual({ci:250});expect(result.selectedIds).toEqual(['ci']);
  expect(calls).toEqual(expect.arrayContaining([{table:'user_stock_items',where:{user_id:'owner',product_type:'ci_accessory'}}]));
  expect(calls.some(call=>['accessories','accessory_rules'].includes(call.table))).toBe(false);
 });
 it('preserves deliberate zero and absent price separately',async()=>{
  expect((await loadCiAccessoryContext(client(0).db)).prices.ci).toBe(0);
  expect((await loadCiAccessoryContext(client(null).db)).prices.ci).toBeUndefined();
 });
 it('rejects inaccessible catalog, signed-out users and stale optional IDs',async()=>{
  await expect(loadCiAccessoryContext(client(0,'denied').db)).rejects.toThrow('denied');
  const {db}=client();vi.mocked(db.auth.getUser).mockResolvedValue({data:{user:null},error:null} as never);
  await expect(loadCiAccessoryContext(db)).rejects.toThrow('sessão');
  await expect(loadCiAccessoryContext(client().db,['residential-id'])).rejects.toThrow('removido ou desativado');
 });
 it('propagates denied administrative writes',async()=>{
  mocks.createClient.mockReturnValue({from:()=>({upsert:()=>({select:()=>({single:()=>Promise.resolve({data:null,error:{message:'denied'}})})})})});
  await expect(saveCiAccessoryRule({} as never)).rejects.toThrow('denied');
 });
});
