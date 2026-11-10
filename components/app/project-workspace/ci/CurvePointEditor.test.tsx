// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CurvePointEditor } from './CurvePointEditor';
import { CiAcPowerProvider } from './ci-ac-power';

const points = Array.from({length:5},(_,index)=>({timestamp:`2026-01-05T${String(index).padStart(2,'0')}:00:00Z`,powerKw:20}));
function setup(draw = false) {
  const onEdit=vi.fn();
  render(<CiAcPowerProvider powerFactor={.8}><CurvePointEditor geometry={{left:0,top:0,width:400,height:200,xMin:0,xMax:4,yMin:0,yMax:100}} points={points} onEdit={onEdit} label="Consumo" timezone="UTC" draw={draw}/></CiAcPowerProvider>);
  const surface=screen.getByRole('group',{name:'Edição de Consumo'});
  vi.spyOn(surface,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:400,height:200} as DOMRect);
  return {surface,onEdit};
}

describe('weekly point editing',()=>{
  it('commits an interpolated brush gesture as one undoable edit',()=>{
    const {surface,onEdit}=setup(true);
    fireEvent.pointerDown(surface,{button:0,pointerId:1,clientX:100,clientY:160});
    fireEvent.pointerMove(surface,{pointerId:1,clientX:300,clientY:80});
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.pointerUp(surface,{pointerId:1,clientX:300,clientY:80});
    expect(onEdit).toHaveBeenCalledExactlyOnceWith([{index:1,powerKw:20},{index:2,powerKw:40},{index:3,powerKw:60}]);
  });
  it('cancels touch gestures without changing recorded data',()=>{
    const {surface,onEdit}=setup(true);
    fireEvent.pointerDown(surface,{button:0,pointerId:2,clientX:100,clientY:100});
    fireEvent.pointerMove(surface,{pointerId:2,clientX:200,clientY:80});
    fireEvent.pointerCancel(surface,{pointerId:2});
    fireEvent.pointerUp(surface,{pointerId:2,clientX:200,clientY:80});
    expect(onEdit).not.toHaveBeenCalled();
  });
  it('keeps a dragged point at its original time even if the pointer moves horizontally',()=>{
    const {surface,onEdit}=setup();
    const point=screen.getAllByRole('slider')[1];
    fireEvent.pointerDown(point,{button:0,pointerId:3,clientX:100,clientY:160});
    fireEvent.pointerUp(surface,{pointerId:3,clientX:300,clientY:80});
    expect(onEdit).toHaveBeenCalledExactlyOnceWith([{index:1,powerKw:60}]);
    fireEvent.keyDown(point,{key:'ArrowUp',shiftKey:true});
    expect(onEdit).toHaveBeenLastCalledWith([{index:1,powerKw:24}]);
  });
});
