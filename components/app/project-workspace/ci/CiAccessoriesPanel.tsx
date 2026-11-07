'use client';

import { useEffect, useState } from 'react';
import { loadCiAccessoryCatalog } from '@/lib/data/ci-accessories-repository';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { Button } from '@/components/ui/button';

export function CiAccessoriesPanel({ciOptions,onChange}:{ciOptions:CommercialIndustrialOptions;onChange:(partial:Partial<CommercialIndustrialOptions>)=>void}) {
 const [catalog,setCatalog]=useState<Awaited<ReturnType<typeof loadCiAccessoryCatalog>> | null>(null);
 const [error,setError]=useState<string | null>(null);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true;loadCiAccessoryCatalog().then(data=>{if(alive)setCatalog(data);}).catch(cause=>{if(alive)setError(cause instanceof Error ? cause.message:'Não foi possível carregar os acessórios C&I.');});return ()=>{alive=false;};},[attempt]);
 const selected=ciOptions.selectedAccessoryIds ?? [];
 const automatic=ciOptions.bessSystem?.kind==='automatic'||ciOptions.bessSystem?.kind==='solution';
 const modular=ciOptions.bessSystem?.kind==='modular' ? ciOptions.bessSystem:null;
 const optional=catalog?.products.filter(product=>product.active && catalog.rules.some(rule=>rule.active && rule.inclusion==='optional' && rule.accessory_id===product.id && (automatic || !rule.bess_product_id || (!modular && rule.bess_product_id===ciOptions.bessProductId)) && (automatic || !rule.compatibility_id || rule.compatibility_id===modular?.compatibilityId) && (rule.backup===null || rule.backup===Boolean(ciOptions.backup?.enabled)) && (rule.generator===null || rule.generator===Boolean(ciOptions.generator?.enabled)))) ?? [];
 return <section className="space-y-3 rounded-xl border p-4"><h3 className="text-sm font-semibold">Acessórios C&I</h3><p className="text-xs text-muted-foreground">Os obrigatórios e inclusos são definidos pelas regras de cada composição. Selecione os opcionais desejados; a aplicação e as quantidades serão conferidas no cálculo.</p>
 {error ? <div role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={()=>{setError(null);setAttempt(value=>value+1);}}>Tentar novamente</Button></div> : !catalog ? <p role="status" className="text-sm">Carregando acessórios…</p> : optional.length===0 ? <p className="text-sm text-muted-foreground">Nenhum acessório opcional cadastrado para esta configuração.</p> : optional.map(product=><label key={product.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(product.id)} onChange={event=>onChange({selectedAccessoryIds:event.target.checked ? [...selected,product.id]:selected.filter(id=>id!==product.id)})}/>{product.model}</label>)}
 {selected.some(id=>!optional.some(product=>product.id===id)) && <Button variant="ghost" onClick={()=>onChange({selectedAccessoryIds:selected.filter(id=>optional.some(product=>product.id===id))})}>Limpar opcionais fora desta configuração</Button>}
 </section>;
}
