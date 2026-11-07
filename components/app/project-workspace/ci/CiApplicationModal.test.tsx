// @vitest-environment jsdom
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { defaultCiOptions } from '@/lib/store/defaults';
import { CiApplicationModal } from './CiApplicationModal';

it('allows configuring generator support without enabling backup and only persists on save',()=>{
  const save=vi.fn();const close=vi.fn();
  render(<CiApplicationModal application="generator" ciOptions={defaultCiOptions} onSave={save} onClose={close}/>);
  const dialog=screen.getByRole('dialog');
  expect(within(dialog).queryByText('Habilitar Backup')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button',{name:'Integrar Gerador'}));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button',{name:'Salvar ajustes'}));
  expect(save).toHaveBeenCalledWith({generator:expect.objectContaining({enabled:true})});
  expect(close).toHaveBeenCalled();
});

it('discards draft changes on cancel and Escape',()=>{
  const save=vi.fn();const close=vi.fn();
  render(<CiApplicationModal application="generator" ciOptions={defaultCiOptions} onSave={save} onClose={close}/>);
  fireEvent.click(screen.getByRole('button',{name:'Integrar Gerador'}));
  fireEvent.keyDown(document,{key:'Escape'});
  expect(close).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  expect(save).not.toHaveBeenCalled();
});

it('traps keyboard focus and restores the opener after closing',async()=>{
  function Controlled(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Abrir gerador</button>{open&&<CiApplicationModal application="generator" ciOptions={defaultCiOptions} onSave={()=>{}} onClose={()=>setOpen(false)}/>}</>;}
  render(<Controlled/>);
  const opener=screen.getByRole('button',{name:'Abrir gerador'});opener.focus();fireEvent.click(opener);
  const first=screen.getByRole('button',{name:'Fechar ajustes sem salvar'});
  const last=screen.getByRole('button',{name:'Salvar ajustes'});
  await waitFor(()=>expect(first).toHaveFocus());
  last.focus();fireEvent.keyDown(document,{key:'Tab'});expect(first).toHaveFocus();
  fireEvent.keyDown(document,{key:'Tab',shiftKey:true});expect(last).toHaveFocus();
  fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(opener).toHaveFocus();
});
