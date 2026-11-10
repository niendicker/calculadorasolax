import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/database.types';
import type { CiStsCatalog, CiStsContext, CiStsSpec, CiStsRule } from '@/supabase/functions/_shared/commercial-industrial/sts-types';
import { isApprovedStsRule } from '@/supabase/functions/_shared/commercial-industrial/sts';

export async function loadCiStsCatalog(client?: SupabaseClient): Promise<CiStsCatalog> {
  const db = client ?? createClient();
  const [specs, rules, accessories] = await Promise.all([
    db.from('ci_sts_specs').select('*'), db.from('ci_sts_compatibility_rules').select('*'),
    db.from('ci_sts_products').select('id,model,active').order('model'),
  ]);
  for (const result of [specs,rules,accessories]) if (result.error) throw new Error(result.error.message);
  const models = new Map((accessories.data ?? []).map(a => [a.id,a]));
  return {
    specs: ((specs.data ?? []) as CiStsSpec[]).map(s => ({...s, model: models.get(s.accessory_id)?.model ?? 'STS indisponível', accessoryActive: models.get(s.accessory_id)?.active ?? false})),
    rules: (rules.data ?? []) as CiStsRule[],
  };
}
export type CiStsProductRow = { id: string; model: string; nickname: string | null; description: string | null; active: boolean; warranty_years: number; image_url: string | null; documents: Json };
/** Saves the STS product and its electrical ratings atomically; the id is preserved on edit. */
export async function saveCiStsProduct(product: Omit<CiStsProductRow,'id'>, limits: CiStsSpec, id?: string | null): Promise<{product: CiStsProductRow; limits: CiStsSpec}> {
  const {data,error} = await createClient().rpc('save_ci_sts', {p_product: product as unknown as Json, p_limits: limits as unknown as Json, p_id: id ?? null});
  if (error) throw new Error(error.message);
  return data as unknown as {product: CiStsProductRow; limits: CiStsSpec};
}
export async function loadCiStsProducts(client?: SupabaseClient): Promise<CiStsProductRow[]> {
  const {data,error} = await (client ?? createClient()).from('ci_sts_products').select('*').order('model');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CiStsProductRow[];
}
export async function deleteCiSts(id: string) {
  const {error} = await createClient().rpc('delete_ci_sts', {p_id: id});
  if (error) throw new Error(error.message);
}
export async function saveCiStsRule(rule: Omit<CiStsRule,'id'> & {id?: string}) {
  const {data,error} = await createClient().from('ci_sts_compatibility_rules').upsert(rule).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}
export async function loadCiStsContext(db: SupabaseClient, target: CiStsContext['target'], controllerAccessoryId?: string | null): Promise<CiStsContext> {
  const catalog = await loadCiStsCatalog(db);
  const {data:auth,error} = await db.auth.getUser();
  if (error || !auth.user) throw new Error('Sua sessão expirou. Entre novamente para calcular.');
  const ids = new Set(catalog.rules.filter(r => isApprovedStsRule(r) && (target.pcsId ? r.pcs_id === target.pcsId : r.bess_product_id === target.bessProductId)).map(r => r.accessory_id));
  const prices: CiStsContext['prices'] = {};
  await Promise.all(catalog.specs.filter(s => s.active && s.accessoryActive && ids.has(s.accessory_id)).map(async s => {
    const {data,error} = await db.from('user_stock_items').select('unit_value').eq('user_id',auth.user!.id).eq('product_type','ci_sts').eq('product_model',s.model).maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.unit_value !== null && data?.unit_value !== undefined) prices[s.accessory_id] = Number(data.unit_value);
  }));
  return {catalog,target,prices,controllerAccessoryId};
}
