// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CurveTimeline } from './CurveTimeline';
import type { CurveRangeSelection } from './LoadCurveChart';

const days = [{date:'2026-01-05',label:'Segunda',pattern:'weekday' as const,indices:Array.from({length:50},(_,i)=>i),minutes:[]},{date:'2026-01-06',label:'Terça',pattern:'weekday' as const,indices:Array.from({length:51},(_,i)=>50+i),minutes:[]}];
function setup() {
  const changed=vi.fn();
  function Harness() {
    const [range,setRange]=useState<CurveRangeSelection>({startIndex:10,endIndex:30});
    return <CurveTimeline days={days} length={101} range={range} onChange={next=>{setRange(next);changed(next);}}/>;
  }
  render(<Harness/>);
  const start=screen.getByRole('slider',{name:'Início da janela do tempo'});
  vi.spyOn(start.parentElement!.parentElement!,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:500,height:48} as DOMRect);
  return {changed,start,surface:start.parentElement!.parentElement!};
}

describe('curve timeline',()=>{
  it('moves the window while preserving its width and clamping to the data bounds',()=>{
    const {changed,surface}=setup();
    fireEvent.pointerDown(screen.getByRole('slider',{name:'Mover janela do tempo'}),{pointerId:1,clientX:50});
    fireEvent.pointerMove(surface,{pointerId:1,clientX:1000});
    fireEvent.pointerUp(surface,{pointerId:1});
    expect(changed).toHaveBeenLastCalledWith({startIndex:80,endIndex:100});
  });
  it('resizes one edge and restores the prior window when a gesture is canceled',()=>{
    const {changed,surface,start}=setup();
    fireEvent.pointerDown(start,{pointerId:2,clientX:50});
    fireEvent.pointerMove(surface,{pointerId:2,clientX:75});
    expect(changed).toHaveBeenLastCalledWith({startIndex:15,endIndex:30});
    fireEvent.pointerCancel(surface,{pointerId:2});
    expect(changed).toHaveBeenLastCalledWith({startIndex:10,endIndex:30});
  });
  it('supports keyboard navigation and prevents crossing the opposite edge',()=>{
    const {changed,start}=setup();
    fireEvent.keyDown(start,{key:'ArrowRight',shiftKey:true});
    expect(changed).toHaveBeenLastCalledWith({startIndex:29,endIndex:30});
    fireEvent.keyDown(screen.getByRole('slider',{name:'Fim da janela do tempo'}),{key:'ArrowLeft'});
    expect(changed).toHaveBeenLastCalledWith({startIndex:29,endIndex:30});
  });
});
