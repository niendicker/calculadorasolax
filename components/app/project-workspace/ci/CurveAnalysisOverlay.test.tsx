// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CurveAnalysisOverlay, CurveReferenceReadout } from './CurveAnalysisOverlay';
import { CiAcPowerProvider } from './ci-ac-power';

const geometry = { left: 0, top: 0, width: 400, height: 200, xMin: 0, xMax: 20, yMin: 0, yMax: 100 };

function Harness({ onSelect = vi.fn(), onPower = vi.fn() }) {
  const [range, setRange] = useState({ startIndex: 2, endIndex: 8 });
  const [referenceKw, setReferenceKw] = useState(40);
  return <CiAcPowerProvider powerFactor={.8}><CurveAnalysisOverlay geometry={geometry} length={21} ranges={[{ range, label: 'período A' }]} onRangeChange={(_, next) => { setRange(next); onSelect(next); }} referenceKw={referenceKw} onReferenceChange={value => { setReferenceKw(value); onPower(value); }} formatIndex={index => `${index * 15} min`}/></CiAcPowerProvider>;
}

describe('curve analysis controls', () => {
  it('adjusts the selected boundary by keyboard without creating another selection', () => {
    const selected = vi.fn();
    render(<Harness onSelect={selected}/>);
    const start = screen.getByRole('slider', { name: 'Início do período A' });
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(start).toHaveAttribute('aria-valuenow', '3');
    expect(start).toHaveAttribute('aria-valuetext', '45 min');
    fireEvent.keyDown(start, { key: 'End' });
    expect(selected).toHaveBeenLastCalledWith({ startIndex: 8, endIndex: 8 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Fim do período A' }), { key: 'Home' });
    expect(selected).toHaveBeenLastCalledWith({ startIndex: 8, endIndex: 8 });
  });

  it('drags a boundary in the visible scale and restores it when the gesture is canceled', () => {
    const selected = vi.fn();
    render(<Harness onSelect={selected}/>);
    const start = screen.getByRole('slider', { name: 'Início do período A' });
    vi.spyOn(start.parentElement!.parentElement!, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(start, { pointerId: 1, clientX: 50 });
    fireEvent.pointerMove(start, { pointerId: 1, clientX: 110 });
    expect(selected).toHaveBeenLastCalledWith({ startIndex: 5, endIndex: 8 });
    fireEvent.pointerCancel(start, { pointerId: 1 });
    expect(selected).toHaveBeenLastCalledWith({ startIndex: 2, endIndex: 8 });
  });

  it('changes apparent reference power by keyboard while emitting active kW', () => {
    const changed = vi.fn();
    render(<Harness onPower={changed}/>);
    const reference = screen.getByRole('slider', { name: 'Linha de referência' });
    expect(reference).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(reference, { key: 'ArrowUp' });
    expect(changed).toHaveBeenLastCalledWith(40.8);
    expect(Number(reference.getAttribute('aria-valuenow'))).toBeCloseTo(51);
    fireEvent.keyDown(reference, { key: 'ArrowDown', shiftKey: true });
    expect(changed.mock.calls.at(-1)![0]).toBeCloseTo(36.8);
  });

  it('drags the reference vertically and preserves interval selections', () => {
    const changed = vi.fn(), selected = vi.fn();
    render(<Harness onPower={changed} onSelect={selected}/>);
    const reference = screen.getByRole('slider', { name: 'Linha de referência' });
    vi.spyOn(reference.parentElement!.parentElement!, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(reference, { pointerId: 3, clientY: 140 });
    fireEvent.pointerMove(reference, { pointerId: 3, clientY: 70 });
    fireEvent.pointerUp(reference, { pointerId: 3, clientY: 70 });
    expect(changed).toHaveBeenLastCalledWith(75);
    expect(selected).not.toHaveBeenCalled();
  });

  it('keeps excess energy in kWh and converts excess power using project FP', () => {
    render(<CiAcPowerProvider powerFactor={.8}><CurveReferenceReadout values={[20,60,40,80]} referenceKw={40} resolutionMinutes={15} selected/></CiAcPowerProvider>);
    const status = screen.getByRole('status', { name: 'Medições acima da referência' });
    expect(status).toHaveTextContent('Seleção');
    expect(status).toHaveTextContent('30 min');
    expect(status).toHaveTextContent('Excedente máximo 50 kVA');
    expect(status).toHaveTextContent('Energia excedente 15 kWh');
  });
});
