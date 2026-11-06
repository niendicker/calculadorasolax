import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { CiAccessoryContext, CiAccessoryRule } from '@/supabase/functions/_shared/commercial-industrial/accessories';

export async function loadCiAccessoryCatalog(client?: SupabaseClient) {
 const db=client ?? createClient();
 const [products,rules,sts]=await Promise.all([db.from('ci_accessories').select('id,model,active').order('model'),db.from('ci_accessory_rules').select('*').order('name'),db.from('ci_sts_specs').select('accessory_id')]);
 for(const result of [products,rules,sts]) if(result.error) throw new Error(result.error.message);
 return {products:(products.data ?? []) as CiAccessoryContext['products'],rules:(rules.data ?? []) as CiAccessoryRule[],stsIds:(sts.data ?? []).map(item=>item.accessory_id as string)};
}
export async function loadCiAccessoryContext(db: SupabaseClient, selectedIds: string[] = []): Promise<CiAccessoryContext> {
 const catalog=await loadCiAccessoryCatalog(db);
 const {data:auth,error:authError}=await db.auth.getUser();
 if(authError || !auth.user) throw new Error('Sua sessão expirou. Entre novamente para calcular.');
 const {data,error}=await db.from('user_stock_items').select('product_model,unit_value').eq('user_id',auth.user.id).eq('product_type','ci_accessory');
 if(error) throw new Error(error.message);
 const prices:CiAccessoryContext['prices']={};
 for(const product of catalog.products) {const price=data?.find(row=>row.product_model===product.model)?.unit_value; if(price!==null && price!==undefined) prices[product.id]=Number(price);}
 for(const id of selectedIds) if(!catalog.products.some(product=>product.id===id && product.active)) throw new Error('Um acessório opcional selecionado foi removido ou desativado. Revise a configuração C&I.');
 return {...catalog,prices,selectedIds};
}
export async function saveCiAccessoryRule(input: Omit<CiAccessoryRule,'id'> & {id?:string}) {
 const {data,error}=await createClient().from('ci_accessory_rules').upsert(input).select('id').single();
 if(error) throw new Error(error.message);
 return data.id;
}
