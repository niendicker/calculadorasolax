import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { CiStsCatalog, CiStsContext, CiStsSpec, CiStsRule } from '@/supabase/functions/_shared/commercial-industrial/sts-types';
import { isApprovedStsRule } from '@/supabase/functions/_shared/commercial-industrial/sts';

export async function loadCiStsCatalog(client?: SupabaseClient): Promise<CiStsCatalog> {
  const db = client ?? createClient();
  const [specs, rules, accessories] = await Promise.all([
    db.from('ci_sts_specs').select('*'), db.from('ci_sts_compatibility_rules').select('*'),
    db.from('ci_accessories').select('id,model,active').order('model'),
  ]);
  for (const result of [specs,rules,accessories]) if (result.error) throw new Error(result.error.message);
  const models = new Map((accessories.data ?? []).map(a => [a.id,a]));
  return {
    specs: ((specs.data ?? []) as CiStsSpec[]).map(s => ({...s, model: models.get(s.accessory_id)?.model ?? 'Acessório indisponível', accessoryActive: models.get(s.accessory_id)?.active ?? false})),
    rules: (rules.data ?? []) as CiStsRule[],
  };
}
export async function saveCiStsSpec(spec: CiStsSpec) {
  const {error} = await createClient().from('ci_sts_specs').upsert(spec);
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
    const {data,error} = await db.from('user_stock_items').select('unit_value').eq('user_id',auth.user!.id).eq('product_type','ci_accessory').eq('product_model',s.model).maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.unit_value !== null && data?.unit_value !== undefined) prices[s.accessory_id] = Number(data.unit_value);
  }));
  return {catalog,target,prices,controllerAccessoryId};
}
