'use client';

import { FieldHelpLabel } from '../field-help';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { loadCiStsCatalog, saveCiStsSpec, saveCiStsRule } from '@/lib/data/ci-sts-repository';
import { loadCiModularCatalog, type CiEquipmentCatalog } from '@/lib/data/ci-modular-catalog-repository';
import { listCiBessProducts, type CiBessProductRecord } from '@/lib/data/ci-bess-products-repository';
import type { CiStsSpec, CiStsRule, CiStsCatalog } from '@/supabase/functions/_shared/commercial-industrial/sts-types';
import { isApprovedStsRule } from '@/supabase/functions/_shared/commercial-industrial/sts';
import { CatalogLayout, Field, InlineOptionTabs } from '../shared-ui';
import type { CiModularActivity } from './CiModularCatalogEditor';

const emptySpec: CiStsSpec = { accessory_id: '', active: true, rated_current_380v_a: 0, rated_current_400v_a: 0, frequency_hz: [50,60], ems_included: false, reference_document: '', revision: '' };
const emptyRule: Omit<CiStsRule,'id'> = {accessory_id:'', pcs_id:null, bess_product_id:null,max_pcs:1,line_voltage_v:380,frequency_hz:60,active:true,approval_status:'draft',reference_document:'',revision:'',communication_profile:'',firmware:''};
const nexus = [ ['ZERO-125',189.4,181.2], ['ZERO-250',378.8,362.3], ['ZERO-500',757.6,724.6], ['ZERO-750',1136,1087], ['ZERO-1250',1893.9,1811.6] ] as const;
export function CiStsCatalogEditor({onActivity}: {onActivity?: (activity: CiModularActivity) => Promise<void>}) {
  const [section,setSection] = useState<'specs'|'rules'>('specs');
  const [data,setData] = useState<{sts: CiStsCatalog; equipment: CiEquipmentCatalog; integrated: CiBessProductRecord[]} | null>(null);
  const [error,setError] = useState<string|null>(null);
  const [status,setStatus] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [open,setOpen] = useState(false);
  const [saving,setSaving] = useState(false);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [spec,setSpec] = useState<CiStsSpec>(emptySpec);
  const [rule,setRule] = useState<Omit<CiStsRule,'id'>>(emptyRule);
  const [target,setTarget] = useState<'pcs'|'integrated'>('pcs');
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let alive=true;
    Promise.all([loadCiStsCatalog(),loadCiModularCatalog(),listCiBessProducts()]).then(([sts,equipment,integrated])=>{if(alive){setData({sts,equipment,integrated});setError(null);}}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Não foi possível carregar STS.');});
    return()=>{alive=false;};
  },[attempt]);
  useEffect(() => {
    if (open && error) formRef.current?.querySelector<HTMLElement>('[role="alert"]')?.scrollIntoView?.({block:'nearest'});
  }, [open,error]);
  const text = (label:string,value:string,change:(v:string)=>void,required=true)=><Field label={label}><Input aria-label={label} required={required} value={value} onChange={e=>change(e.target.value)} /></Field>;
  const number = (label:string,value:number,change:(v:number)=>void,integer=false)=><Field label={label}><Input aria-label={label} type="number" required min={integer?1:0.000001} step={integer?1:'any'} value={value||''} onChange={e=>change(Number(e.target.value))} /></Field>;
  const check = (label:string,value:boolean,change:(v:boolean)=>void)=><label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={label} checked={value} onChange={e=>change(e.target.checked)} /><FieldHelpLabel label={label} /></label>;
  async function save() {
    if(!data || !formRef.current?.reportValidity())return;
    setSaving(true);setError(null);
    try {
      let id:string;
      if(section==='specs'){
        if(!spec.frequency_hz.length)throw new Error('Selecione ao menos uma frequência.');
        await saveCiStsSpec(spec);id=spec.accessory_id;
      }else{
        if(rule.active && rule.approval_status==='approved'){
          if(!isApprovedStsRule({...rule,id:editingId??'new'}))throw new Error('Complete documento, revisão, comunicação, firmware e o limite de PCS para aprovar.');
          const pcs=data.equipment.pcs.find(p=>p.inverter_id===rule.pcs_id);
          if(rule.pcs_id && (!pcs?.active || !pcs.supports_backup || rule.max_pcs>pcs.max_parallel_units))throw new Error('O limite de PCS deve respeitar o paralelismo de um PCS ativo e apto a backup.');
          if(rule.bess_product_id && !data.integrated.some(b=>b.id===rule.bess_product_id && b.active))throw new Error('Selecione um BESS integrado ativo.');
          if(!data.sts.specs.some(s=>s.accessory_id===rule.accessory_id && s.active && s.accessoryActive && s.frequency_hz.includes(rule.frequency_hz)))throw new Error('A STS deve estar ativa e suportar a frequência aprovada.');
        }
        id=await saveCiStsRule({...rule,...(editingId?{id:editingId}:{})});
      }
      await onActivity?.({entityType:section==='specs'?'ci_sts':'ci_sts_compatibility',action:editingId?'update':'create',targetId:id,targetLabel:section==='specs'?data.equipment.accessories.find(a=>a.id===id)?.model??'STS':'Compatibilidade STS',beforeData:section==='specs'?data.sts.specs.find(s=>s.accessory_id===editingId)??null:data.sts.rules.find(r=>r.id===editingId)??null,afterData:section==='specs'?spec:rule});
      setOpen(false);setStatus('Cadastro STS salvo.');setAttempt(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar STS.');}finally{setSaving(false);}
  }
  if(!data)return <div className="space-y-3 rounded-lg border p-4"><p role={error?'alert':'status'}>{error??'Carregando STS e compatibilidades…'}</p>{error&&<Button variant="outline" onClick={()=>setAttempt(v=>v+1)}>Tentar novamente</Button>}</div>;
  const model = (id:string)=>data.equipment.accessories.find(a=>a.id===id)?.model??'Acessório indisponível';
  return <div className="space-y-4">
    <InlineOptionTabs value={section} onChange={s=>{setSection(s);setOpen(false);setError(null);}} options={[{value:'specs',label:'Fichas STS'},{value:'rules',label:'Compatibilidades STS'}]} />
    <p className="text-sm text-muted-foreground">Uma STS por barramento trifásico com neutro e PE. Use correntes nominais contínuas, sem sobrecarga. Quantidade máxima de PCS exige aprovação específica; não é inferida pelo modelo Nexus.</p>
    {error&&!open&&<p role="alert" className="text-sm text-destructive">{error}</p>}{status&&<p role="status" className="text-sm">{status}</p>}
    <CatalogLayout title={section==='specs'?'STS C&I':'Compatibilidades STS'} count={section==='specs'?data.sts.specs.length:data.sts.rules.length} formOpen={open} formTitle={section==='specs'?'Ficha técnica STS':'Compatibilidade STS'} newLabel={section==='specs'?'Cadastrar STS':'Nova compatibilidade STS'} onNew={()=>{setSpec(emptySpec);setRule(emptyRule);setTarget('pcs');setEditingId(null);setError(null);setOpen(true);}} onClose={()=>{if(!saving)setOpen(false);}} form={<form ref={formRef} onSubmit={e=>{e.preventDefault();void save();}} className="space-y-4">
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <Field label="Acessório STS"><Select aria-label="Acessório STS" required disabled={section==='specs'&&editingId!==null} value={section==='specs'?spec.accessory_id:rule.accessory_id} onChange={e=>section==='specs'?setSpec({...spec,accessory_id:e.target.value}):setRule({...rule,accessory_id:e.target.value})}><option value="">Selecione o acessório</option>{(section==='specs'?data.equipment.accessories:data.sts.specs.map(s=>({id:s.accessory_id,model:s.model,active:s.active&&s.accessoryActive}))).map(a=><option key={a.id} value={a.id}>{a.model}{a.active?'':' · Inativo'}</option>)}</Select></Field>
      {section==='specs'?<>
        <p className="text-xs text-muted-foreground">Cadastre o modelo antes em C&I → Acessórios. Esta ficha acrescenta seus limites C&amp;I.</p>
        <Field label="Preencher a partir do datasheet Nexus"><Select aria-label="Preencher a partir do datasheet Nexus" defaultValue="" onChange={e=>{const item=nexus.find(n=>n[0]===e.target.value);if(item)setSpec({...spec,rated_current_380v_a:item[1],rated_current_400v_a:item[2],frequency_hz:[50,60],ems_included:true,reference_document:'SolaX NEXUS ZERO Datasheet-En-V1.1 20251226 · 650.00114.00 · p. 2',revision:'V1.1'});}}><option value="">Preencher manualmente</option>{nexus.map(n=><option key={n[0]}>{n[0]}</option>)}</Select></Field>
        <div className="grid gap-3 sm:grid-cols-2">{number('Corrente nominal em 380 V (A)',spec.rated_current_380v_a,v=>setSpec({...spec,rated_current_380v_a:v}))}{number('Corrente nominal em 400 V (A)',spec.rated_current_400v_a,v=>setSpec({...spec,rated_current_400v_a:v}))}</div>
        <p className="text-xs text-muted-foreground">Tensão entre fases: 380/400 V. Não usar a corrente do disjuntor como capacidade da STS. O preenchimento Nexus não aprova uma compatibilidade.</p>
        {[50,60].map(hz=><div key={hz}>{check(`${hz} Hz`,spec.frequency_hz.includes(hz),v=>setSpec({...spec,frequency_hz:v?[...spec.frequency_hz,hz]:spec.frequency_hz.filter(f=>f!==hz)}))}</div>)}
        {check('EMS integrado',spec.ems_included,v=>setSpec({...spec,ems_included:v}))}
        {text('Documento da ficha STS',spec.reference_document,v=>setSpec({...spec,reference_document:v}))}{text('Revisão da ficha STS',spec.revision,v=>setSpec({...spec,revision:v}))}{check('STS ativa',spec.active,v=>setSpec({...spec,active:v}))}
      </>:<>
        <Field label="Tipo de equipamento"><Select aria-label="Tipo de equipamento" value={target} onChange={e=>{setTarget(e.target.value as typeof target);setRule({...rule,pcs_id:null,bess_product_id:null});}}><option value="pcs">PCS modular</option><option value="integrated">BESS integrado</option></Select></Field>
        <Field label="Equipamento compatível"><Select aria-label="Equipamento compatível" required value={rule.pcs_id??rule.bess_product_id??''} onChange={e=>setRule({...rule,pcs_id:target==='pcs'?e.target.value:null,bess_product_id:target==='integrated'?e.target.value:null})}><option value="">Selecione o equipamento</option>{(target==='pcs'?data.equipment.pcs.map(p=>({id:p.inverter_id,model:p.model})):data.integrated).map(p=><option key={p.id} value={p.id}>{p.model}</option>)}</Select></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Tensão aprovada entre fases"><Select aria-label="Tensão aprovada entre fases" value={rule.line_voltage_v} onChange={e=>setRule({...rule,line_voltage_v:Number(e.target.value) as 380|400})}><option value={380}>380 V</option><option value={400}>400 V</option></Select></Field><Field label="Frequência aprovada"><Select aria-label="Frequência aprovada" value={rule.frequency_hz} onChange={e=>setRule({...rule,frequency_hz:Number(e.target.value) as 50|60})}><option value={50}>50 Hz</option><option value={60}>60 Hz</option></Select></Field></div>
        {number(target==='pcs'?'Máximo de PCS por STS':'Máximo de unidades BESS por STS',rule.max_pcs,v=>setRule({...rule,max_pcs:v}),true)}
        <Field label="Aprovação STS"><Select aria-label="Aprovação STS" value={rule.approval_status} onChange={e=>setRule({...rule,approval_status:e.target.value as CiStsRule['approval_status']})}><option value="draft">Rascunho</option><option value="approved">Aprovada</option><option value="revoked">Revogada</option></Select></Field>
        {text('Documento da compatibilidade STS',rule.reference_document,v=>setRule({...rule,reference_document:v}),rule.approval_status==='approved')}{text('Revisão da compatibilidade STS',rule.revision,v=>setRule({...rule,revision:v}),rule.approval_status==='approved')}{text('Comunicação / EMS / PCS',rule.communication_profile,v=>setRule({...rule,communication_profile:v}),rule.approval_status==='approved')}{text('Firmware aprovado',rule.firmware,v=>setRule({...rule,firmware:v}),rule.approval_status==='approved')}{check('Compatibilidade STS ativa',rule.active,v=>setRule({...rule,active:v}))}
      </>}
      <Button type="submit" disabled={saving}>{saving?'Salvando…':'Salvar'}</Button>
    </form>} items={section==='specs'?data.sts.specs.map(s=>({id:s.accessory_id,title:model(s.accessory_id),badges:[s.active&&s.accessoryActive?'Ativa':'Inativa'],details:[['Corrente 380 / 400 V',`${s.rated_current_380v_a} / ${s.rated_current_400v_a} A`],['EMS',s.ems_included?'Integrado':'Externo'],['Revisão',s.revision]],onEdit:()=>{const {model:_model,accessoryActive:_active,...value}=s;void _model;void _active;setSpec(value);setEditingId(s.accessory_id);setError(null);setOpen(true);}})):data.sts.rules.map(r=>({id:r.id,title:model(r.accessory_id),badges:[r.active?r.approval_status:'Inativa'],description:data.equipment.pcs.find(p=>p.inverter_id===r.pcs_id)?.model??data.integrated.find(b=>b.id===r.bess_product_id)?.model??'Equipamento indisponível',details:[['Rede aprovada',`${r.line_voltage_v} V · ${r.frequency_hz} Hz`],['Quantidade máxima por STS',String(r.max_pcs)],['Revisão',r.revision||'Pendente']],onEdit:()=>{const {id,...value}=r;setRule(value);setTarget(r.pcs_id?'pcs':'integrated');setEditingId(id);setError(null);setOpen(true);}}))} />
  </div>;
}
