'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { loadCiAccessoryCatalog, saveCiAccessoryRule } from '@/lib/data/ci-accessories-repository';
import { loadCiModularCatalog, type CiEquipmentCatalog } from '@/lib/data/ci-modular-catalog-repository';
import { listCiBessProducts, type CiBessProductRecord } from '@/lib/data/ci-bess-products-repository';
import type { CiAccessoryRule } from '@/supabase/functions/_shared/commercial-industrial/accessories';
import { CatalogLayout, Field } from '../shared-ui';
import type { CiModularActivity } from './CiModularCatalogEditor';

const empty: Omit<CiAccessoryRule,'id'> = {name:'',accessory_id:'',active:true,pcs_id:null,battery_id:null,bess_product_id:null,compatibility_id:null,backup:null,generator:null,line_voltage_v:null,inclusion:'required',metric:'system',min_count:1,max_count:null,quantity:1,divisor:1,requires_ids:[],excludes_ids:[],reference_document:''};
const metrics = {system:'Por sistema',pcs:'Por PCS',battery:'Por unidade de bateria',string:'Por string',bess:'Por módulo BESS integrado'};

export function CiAccessoryRulesEditor({onActivity}:{onActivity?:(activity:CiModularActivity)=>Promise<void>}) {
 const [catalog,setCatalog]=useState<Awaited<ReturnType<typeof loadCiAccessoryCatalog>> | null>(null);
 const [equipment,setEquipment]=useState<CiEquipmentCatalog | null>(null);
 const [bess,setBess]=useState<CiBessProductRecord[]>([]);
 const [form,setForm]=useState<Omit<CiAccessoryRule,'id'> & {id?:string}>(empty);
 const [open,setOpen]=useState(false);
 const [error,setError]=useState<string | null>(null);
 const [saving,setSaving]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const ref=useRef<HTMLFormElement>(null);
 useEffect(()=>{
  let alive=true;
  Promise.all([loadCiAccessoryCatalog(),loadCiModularCatalog(),listCiBessProducts()]).then(([catalog,equipment,bess])=>{if(alive){setCatalog(catalog);setEquipment(equipment);setBess(bess);}}).catch(cause=>{if(alive)setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as regras.');});
  return ()=>{alive=false;};
 },[attempt]);
 async function save() {
  if(!ref.current?.reportValidity() || !catalog) return;
  setSaving(true);setError(null);
  try {
   if(form.requires_ids.some(id=>form.excludes_ids.includes(id))) throw new Error('Um acessório não pode ser dependência e exclusão na mesma regra.');
   const before=catalog.rules.find(rule=>rule.id===form.id) ?? null;
   const id=await saveCiAccessoryRule(form);
   setOpen(false);
   setCatalog(await loadCiAccessoryCatalog());
   await onActivity?.({entityType:'ci_accessory_rule',action:before ? 'update':'create',targetId:id,targetLabel:form.name,beforeData:before,afterData:form});
  } catch(cause){setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a regra.');}
  finally{setSaving(false);}
 }
 if(!catalog || !equipment) return <div className="space-y-3">{error ? <><p role="alert">{error}</p><Button onClick={()=>{setError(null);setAttempt(value=>value+1);}}>Tentar novamente</Button></> : <p role="status">Carregando regras C&I…</p>}</div>;
 const targets = [
  {key:'pcs_id',label:'PCS',options:equipment.pcs.map(item=>({id:item.inverter_id,model:item.model}))},
  {key:'battery_id',label:'Bateria',options:equipment.batteries.map(item=>({id:item.battery_id,model:item.model}))},
  {key:'compatibility_id',label:'Combinação documentada',options:equipment.rules.map(item=>({id:item.id,model:item.name}))},
  {key:'bess_product_id',label:'BESS integrado',options:bess},
 ] as const;
 return <div className="space-y-4"><p className="text-sm text-muted-foreground">Regras exclusivas C&I. Quantidade = arredondar para cima (contagem ÷ divisor) × quantidade por faixa. Regras sobrepostas usam a maior quantidade por acessório. A STS continua sujeita ao dimensionamento elétrico.</p>
 {error && !open && <p role="alert" className="text-sm text-destructive">{error}</p>}
 <CatalogLayout title="Regras de acessórios C&I" count={catalog.rules.length} formOpen={open} formTitle={form.id ? 'Editar regra C&I':'Nova regra C&I'} newLabel="Nova regra C&I" onNew={()=>{setForm({...empty});setError(null);setOpen(true);}} onClose={()=>{if(!saving)setOpen(false);}} form={<form ref={ref} onSubmit={event=>{event.preventDefault();void save();}} className="space-y-4">
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  <Field label="Nome da regra"><Input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></Field>
  <Field label="Acessório C&I"><Select required value={form.accessory_id} onChange={event=>setForm({...form,accessory_id:event.target.value,requires_ids:[],excludes_ids:[]})}><option value="">Selecione</option>{catalog.products.map(item=><option key={item.id} value={item.id}>{item.model}{item.active ? '':' · Inativo'}</option>)}</Select></Field>
  <div className="grid gap-3 sm:grid-cols-2">{targets.map(({key,label,options})=><Field key={key} label={label}><Select value={form[key] ?? ''} onChange={event=>setForm({...form,[key]:event.target.value || null,...(key==='bess_product_id' && event.target.value ? {pcs_id:null,battery_id:null,compatibility_id:null}:key!=='bess_product_id' && event.target.value ? {bess_product_id:null}:{})})}><option value="">Qualquer / não restringir</option>{options.map(item=><option key={item.id} value={item.id}>{item.model}</option>)}</Select></Field>)}</div>
  <div className="grid gap-3 sm:grid-cols-2">{(['backup','generator'] as const).map(key=><Field key={key} label={key==='backup' ? 'Condição: backup':'Condição: gerador'}><Select value={form[key]===null ? 'any':String(form[key])} onChange={event=>setForm({...form,[key]:event.target.value==='any' ? null:event.target.value==='true'})}><option value="any">Indiferente</option><option value="true">Habilitado</option><option value="false">Desabilitado</option></Select></Field>)}
  <Field label="Tensão da rede"><Select value={form.line_voltage_v ?? ''} onChange={event=>setForm({...form,line_voltage_v:event.target.value ? Number(event.target.value):null})}><option value="">Indiferente</option><option value="380">380 V</option><option value="400">400 V</option></Select></Field>
  <Field label="Inclusão"><Select value={form.inclusion} onChange={event=>setForm({...form,inclusion:event.target.value as CiAccessoryRule['inclusion']})}><option value="required">Obrigatório</option><option value="optional">Opcional, selecionado no projeto</option><option value="bundled">Incluso, sem cobrança adicional</option></Select></Field>
  <Field label="Contagem para faixa e quantidade"><Select value={form.metric} onChange={event=>setForm({...form,metric:event.target.value as CiAccessoryRule['metric']})}>{Object.entries(metrics).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
  {(['min_count','max_count','quantity','divisor'] as const).map(key=><Field key={key} label={{min_count:'Contagem mínima',max_count:'Contagem máxima (vazio = sem limite)',quantity:'Quantidade por faixa',divisor:'Divisor da contagem'}[key]}><Input type="number" required={key!=='max_count'} min={key==='max_count' ? form.min_count:1} step={1} value={form[key] ?? ''} onChange={event=>setForm({...form,[key]:event.target.value ? Number(event.target.value):key==='max_count' ? null:0})}/></Field>)}</div>
  {(['requires_ids','excludes_ids'] as const).map(key=><fieldset key={key} className="space-y-2 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">{key==='requires_ids' ? 'Exige também (deve ter regra aplicável)':'Incompatível com'}</legend>{catalog.products.filter(item=>item.id!==form.accessory_id).map(item=><label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form[key].includes(item.id)} onChange={event=>setForm({...form,[key]:event.target.checked ? [...form[key],item.id]:form[key].filter(id=>id!==item.id)})}/>{item.model}</label>)}</fieldset>)}
  <Field label="Documento de referência / revisão e justificativa"><Input required value={form.reference_document} onChange={event=>setForm({...form,reference_document:event.target.value})}/></Field>
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={event=>setForm({...form,active:event.target.checked})}/>Ativa</label>
  <Button type="submit" disabled={saving}>{saving ? 'Salvando…':'Salvar'}</Button>
 </form>} items={catalog.rules.map(rule=>({id:rule.id,title:rule.name,badges:[rule.active ? 'Ativa':'Inativa',rule.inclusion==='required' ? 'Obrigatório':rule.inclusion==='optional' ? 'Opcional':'Incluso'],description:catalog.products.find(item=>item.id===rule.accessory_id)?.model,details:[['Quantidade',`${rule.quantity} × teto(contagem ÷ ${rule.divisor})`],['Base',metrics[rule.metric]],['Referência',rule.reference_document]],onEdit:()=>{setForm(rule);setError(null);setOpen(true);}}))}/></div>;
}
