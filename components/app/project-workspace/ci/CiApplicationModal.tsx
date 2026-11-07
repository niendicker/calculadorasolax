'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { resolveBackupCurve } from '@/supabase/functions/_shared/commercial-industrial/backup-curve';
import { CiBackupPanel } from './CiBackupPanel';
import { CiSolarPanel } from './CiSolarPanel';

export type CiApplication = 'solar' | 'generator' | 'backup';
const titles:Record<CiApplication,string>={solar:'Configurar FV',generator:'Configurar gerador',backup:'Configurar backup'};

export function CiApplicationModal({application,ciOptions,onSave,onClose}:{
  application:CiApplication;ciOptions:CommercialIndustrialOptions;
  onSave:(changes:Partial<CommercialIndustrialOptions>)=>void;onClose:()=>void;
}) {
  const [changes,setChanges]=useState<Partial<CommercialIndustrialOptions>>({});
  const ref=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  useEffect(()=>{closeRef.current=onClose;},[onClose]);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const focusable=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')??[]);
    const frame=requestAnimationFrame(()=>focusable()[0]?.focus());
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current();}
      if(event.key!=='Tab')return;
      const items=focusable();if(!items.length)return;
      if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
    };
    document.addEventListener('keydown',keydown);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  const draft={...ciOptions,...changes};
  let error:string|null=null;
  if(application==='backup'&&draft.backup?.enabled&&draft.backup.curveSelection){
    try{resolveBackupCurve(draft.backup.curveSelection,draft.loadCurve);}
    catch(cause){error=cause instanceof Error?cause.message:'Seleção de backup inválida.';}
  }
  const update=(partial:Partial<CommercialIndustrialOptions>)=>setChanges(current=>({...current,...partial}));
  if(typeof document==='undefined')return null;
  return createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[1px]">
    <button type="button" className="absolute inset-0 cursor-default" aria-label={`Cancelar ${titles[application].toLowerCase()}`} onClick={onClose}/>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="ci-application-title" className="relative my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b p-4"><h2 id="ci-application-title" className="text-base font-semibold">{titles[application]}</h2><Button variant="ghost" size="icon-sm" aria-label="Fechar ajustes sem salvar" onClick={onClose}><X className="h-4 w-4"/></Button></header>
      <div className="min-h-0 overflow-y-auto p-4">{application==='solar'?<CiSolarPanel embedded ciOptions={draft} onChange={update}/>:<CiBackupPanel section={application} ciOptions={draft} onChange={update}/>}</div>
      <footer className="space-y-2 border-t p-4">{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={Boolean(error)} onClick={()=>{onSave(changes);onClose();}}>Salvar ajustes</Button></div></footer>
    </div>
  </div>,document.body);
}
