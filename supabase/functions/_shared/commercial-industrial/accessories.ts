/** C&I-only accessory rules. Electrical STS selection remains authoritative. */
export type CiAccessoryMetric = 'system' | 'pcs' | 'battery' | 'string' | 'bess';
export interface CiAccessoryRule {
  id: string; name: string; accessory_id: string; active: boolean;
  pcs_id: string | null; battery_id: string | null; bess_product_id: string | null; compatibility_id: string | null;
  backup: boolean | null; generator: boolean | null; line_voltage_v: number | null;
  inclusion: 'required' | 'optional' | 'bundled'; metric: CiAccessoryMetric;
  min_count: number; max_count: number | null; quantity: number; divisor: number;
  requires_ids: string[]; excludes_ids: string[]; reference_document: string;
}
export interface CiAccessoryContext {
  products: { id: string; model: string; active: boolean }[];
  rules: CiAccessoryRule[]; prices: Record<string, number | undefined>; selectedIds: string[]; stsIds: string[];
}
export interface CiAccessoryTarget {
  pcsId?: string; batteryId?: string; bessProductId?: string; compatibilityId?: string;
  pcs: number; battery: number; string: number; bess: number;
  backup: boolean; generator: boolean; lineVoltageV?: number;
}
export interface CiAccessoryItem {
  productId: string; model: string; quantity: number; unitPriceBrl: number; totalBrl: number;
  bundled: boolean; reasons: string[]; ruleIds: string[];
}
export interface CiAccessoryEvaluation { items: CiAccessoryItem[]; additionalCostBrl: number; valid: boolean; warnings: string[] }
export function ciAccessoryRuleMatches(rule: CiAccessoryRule, target: CiAccessoryTarget): boolean {
  const count = rule.metric === 'system' ? 1 : target[rule.metric];
  return rule.active && (!rule.pcs_id || rule.pcs_id === target.pcsId) && (!rule.battery_id || rule.battery_id === target.batteryId)
    && (!rule.bess_product_id || rule.bess_product_id === target.bessProductId) && (!rule.compatibility_id || rule.compatibility_id === target.compatibilityId)
    && (rule.backup === null || rule.backup === target.backup) && (rule.generator === null || rule.generator === target.generator)
    && (rule.line_voltage_v === null || rule.line_voltage_v === target.lineVoltageV)
    && count >= rule.min_count && (rule.max_count === null || count <= rule.max_count);
}
/** Existing controller/STS entries are included once; bundled rules can waive a controller cost explicitly. */
export function evaluateCiAccessories(context: CiAccessoryContext | undefined, target: CiAccessoryTarget, existing: CiAccessoryItem[] = []): CiAccessoryEvaluation {
  if (!context) return { items: existing, additionalCostBrl: 0, valid: true, warnings: [] };
  const rules = context.rules.filter(rule => ciAccessoryRuleMatches(rule,target));
  const selected = new Set(context.selectedIds);
  const items = new Map(existing.map(item => [item.productId,{...item,reasons:[...item.reasons],ruleIds:[...item.ruleIds]}]));
  const warnings: string[] = [];
  for (const rule of rules) {
    if (rule.inclusion === 'optional' && !selected.has(rule.accessory_id)) continue;
    const product = context.products.find(product => product.id === rule.accessory_id && product.active);
    if (!product) {warnings.push(`Acessório indisponível: ${rule.name}.`);continue;}
    // A generic rule can require a particular STS, but cannot create an electrically unchecked STS.
    if (context.stsIds.includes(product.id) && !items.has(product.id)) {warnings.push(`A regra ${rule.name} exige a STS ${product.model}; configure uma STS compatível com as cargas.`);continue;}
    const count = rule.metric === 'system' ? 1 : target[rule.metric];
    const quantity = Math.ceil(count / rule.divisor) * rule.quantity;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error(`Quantidade inválida na regra ${rule.name}.`);
    if (context.stsIds.includes(product.id) && quantity !== 1) {warnings.push(`A quantidade da STS ${product.model} deve ser definida pelo seletor elétrico.`);continue;}
    const previous = items.get(product.id);
    const bundled = rule.inclusion === 'bundled' || previous?.bundled === true;
    // STS cost is always owned by its electrical selector, regardless of generic inclusion rules.
    if (context.stsIds.includes(product.id) && bundled) {warnings.push(`A STS ${product.model} deve ser precificada pelo seletor elétrico.`);continue;}
    const unitPriceBrl = bundled ? 0 : previous?.unitPriceBrl ?? context.prices[product.id];
    const resolvedPrice = unitPriceBrl ?? 0;
    const qty = Math.max(quantity, previous?.quantity ?? 0);
    items.set(product.id,{productId:product.id,model:product.model,quantity:qty,bundled,unitPriceBrl:resolvedPrice,totalBrl:bundled ? 0 : qty*resolvedPrice,reasons:[...(previous?.reasons ?? []),`${rule.name}${rule.reference_document ? ` · ${rule.reference_document}` : ''}`],ruleIds:[...(previous?.ruleIds ?? []),rule.id]});
  }
  for (const id of selected) if (!items.has(id)) warnings.push(`O acessório opcional ${context.products.find(product=>product.id===id)?.model ?? id} não é aplicável a esta composição.`);
  for (const rule of rules) {
    if (!items.get(rule.accessory_id)?.ruleIds.includes(rule.id)) continue;
    for (const id of rule.requires_ids) if (!items.has(id)) warnings.push(`${rule.name}: falta o acessório dependente ${context.products.find(p=>p.id===id)?.model ?? id}.`);
    for (const id of rule.excludes_ids) if (items.has(id)) warnings.push(`${rule.name}: incompatível com ${context.products.find(p=>p.id===id)?.model ?? id}.`);
  }
  const result = [...items.values()].map(item => {
    if (item.bundled) return {...item,unitPriceBrl:0,totalBrl:0};
    const unitPriceBrl = context.stsIds.includes(item.productId) ? item.unitPriceBrl : context.prices[item.productId];
    if (typeof unitPriceBrl !== 'number' || !Number.isFinite(unitPriceBrl) || unitPriceBrl < 0) throw new Error(`Defina o preço de ${item.model} em Acessórios C&I no Portfólio.`);
    return {...item,unitPriceBrl,totalBrl:item.quantity*unitPriceBrl};
  });
  const additionalCostBrl = result.reduce((sum,item)=>sum+item.totalBrl,0)-existing.reduce((sum,item)=>sum+item.totalBrl,0);
  if (!Number.isFinite(additionalCostBrl)) throw new Error('Custo de acessórios excede o limite numérico.');
  return {items:result,additionalCostBrl,valid:warnings.length===0,warnings};
}
