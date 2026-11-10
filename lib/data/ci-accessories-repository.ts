import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { CiAccessoryContext, CiAccessoryRule } from '@/supabase/functions/_shared/commercial-industrial/accessories';

export async function loadCiAccessoryCatalog(client?: SupabaseClient) {
 const db=client ?? createClient();
 const [products,rules,sts]=await Promise.all([db.from('ci_accessories').select('id,model,active').order('model'),db.from('ci_accessory_rules').select('*').order('name'),db.from('ci_sts_products').select('id,model,active').order('model')]);
 for(const result of [products,rules,sts]) if(result.error) throw new Error(result.error.message);
 // STS has its own catalog, but accessory rules may still require its presence; the engine tells them apart by stsIds.
 const stsProducts=(sts.data ?? []) as CiAccessoryContext['products'];
 return {products:[...((products.data ?? []) as CiAccessoryContext['products']),...stsProducts],rules:(rules.data ?? []) as CiAccessoryRule[],stsIds:stsProducts.map(item=>item.id)};
}
export async function loadCiAccessoryContext(db: SupabaseClient, selectedIds: string[] = []): Promise<CiAccessoryContext> {
 const catalog=await loadCiAccessoryCatalog(db);
 const {data:auth,error:authError}=await db.auth.getUser();
 if(authError || !auth.user) throw new Error('Sua sessão expirou. Entre novamente para calcular.');
 const {data,error}=await db.from('user_stock_items').select('product_type,product_model,unit_value').eq('user_id',auth.user.id).in('product_type',['ci_accessory','ci_sts']);
 if(error) throw new Error(error.message);
 const prices:CiAccessoryContext['prices']={};
 for(const product of catalog.products) {const type=catalog.stsIds.includes(product.id) ? 'ci_sts' : 'ci_accessory';const price=data?.find(row=>row.product_type===type && row.product_model===product.model)?.unit_value; if(price!==null && price!==undefined) prices[product.id]=Number(price);}
 for(const id of selectedIds) if(!catalog.products.some(product=>product.id===id && product.active)) throw new Error('Um acessório opcional selecionado foi removido ou desativado. Revise a configuração C&I.');
 return {...catalog,prices,selectedIds};
}
export async function saveCiAccessoryRule(input: Omit<CiAccessoryRule,'id'> & {id?:string}) {
 const {data,error}=await createClient().from('ci_accessory_rules').upsert(input).select('id').single();
 if(error) throw new Error(error.message);
 return data.id;
}
