// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartPopupMenu } from './ChartPopupMenu';

function Harness() {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState('main');
  const [selected, setSelected] = useState(false);
  return <><button ref={trigger} onClick={()=>{setOpen(true);setLevel('main');}}>Opções</button>{open && <ChartPopupMenu x={0} y={0} level={level} title={level==='main'?'Gráfico':'Dias'} actions={level==='main'?[
    {id:'days',label:'Vincular dias',onSelect:()=>setLevel('days')},
    {id:'disabled',label:'Indisponível',disabled:true,onSelect:()=>{}},
  ]:[{id:'mon',label:'Segunda',selected,onSelect:()=>setSelected(value=>!value)}]} onBack={level==='main'?undefined:()=>setLevel('main')} onClose={()=>setOpen(false)} returnFocus={trigger}/>}</>;
}

describe('chart popup navigation',()=>{
  it('opens submenus and returns to the main list',()=>{
    render(<Harness/>);
    fireEvent.click(screen.getByRole('button',{name:'Opções'}));
    fireEvent.click(screen.getByRole('button',{name:'Vincular dias'}));
    expect(screen.queryByRole('button',{name:'Vincular dias'})).not.toBeInTheDocument();
    const monday=screen.getByRole('button',{name:'Segunda'});
    fireEvent.click(monday);
    expect(monday).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('dialog',{name:'Dias'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Voltar ao menu do gráfico'}));
    expect(screen.queryByRole('button',{name:'Segunda'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Vincular dias'}));
    expect(screen.getByRole('button',{name:'Segunda'})).toHaveAttribute('aria-pressed','true');
  });
  it('contains keyboard focus, skips disabled actions, and restores focus on Escape',()=>{
    render(<Harness/>);
    const trigger=screen.getByRole('button',{name:'Opções'});
    fireEvent.click(trigger);
    expect(screen.getByRole('button',{name:'Vincular dias'})).toHaveFocus();
    fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'});
    expect(screen.getByRole('button',{name:'Fechar menu do gráfico'})).toHaveFocus();
    fireEvent.keyDown(document.activeElement!,{key:'Tab'});
    expect(screen.getByRole('button',{name:'Vincular dias'})).toHaveFocus();
    fireEvent.keyDown(document.activeElement!,{key:'Escape'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it('clamps the popup to the viewport and dismisses on outside press',()=>{
    render(<Harness/>);
    fireEvent.click(screen.getByRole('button',{name:'Opções'}));
    const dialog=screen.getByRole('dialog');
    expect(dialog).toHaveStyle({left:'8px',top:'8px'});
    fireEvent.pointerDown(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
