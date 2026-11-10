// @vitest-environment jsdom

import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DailyCurveEditor } from './DailyCurveEditor';

const FLAT_24 = new Array(24).fill(50);

function getSlider(hour: number) {
  return screen.getByRole('slider', { name: `Potência às ${hour}h` });
}


function selectedPoint(solar = false) {
  return screen.getAllByRole('slider').find(point => point.getAttribute('tabindex') === '0' && point.getAttribute('aria-label')?.startsWith(solar ? 'Fotovoltaico' : 'Potência'))!;
}

async function editPoint(value: number, solar = false) {
  const point = selectedPoint(solar);
  let current = Number(point.getAttribute('aria-valuenow'));
  while (Math.abs(value - current) >= 1) {
    const delta = value - current;
    const shiftKey = Math.abs(delta) >= 5;
    fireEvent.keyDown(point, { key: delta > 0 ? 'ArrowUp' : 'ArrowDown', shiftKey });
    current = Number(point.getAttribute('aria-valuenow'));
  }
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
}

describe('DailyCurveEditor', () => {
  it('renders one slider per hour of the day', async () => {
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
    expect(screen.getAllByRole('slider')).toHaveLength(24);
    expect(getSlider(0)).toHaveAttribute('aria-valuenow', '50');
    expect(getSlider(23)).toHaveAttribute('aria-valuenow', '50');
  });

  it('shows the point tooltip only while focused and preserves selection on blur', async () => {
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
    expect(screen.queryByText('12:00 · 50.0 kVA')).not.toBeInTheDocument();
    fireEvent.focus(getSlider(12));
    const badgeText = screen.getByText('12:00 · 50.0 kVA');
    expect(badgeText).toBeInTheDocument();

    const rect = badgeText.previousElementSibling as SVGRectElement;
    expect(rect).toBeInTheDocument();
    expect(rect).toHaveAttribute('width', '108');
    expect(rect).toHaveAttribute('height', '20');
    fireEvent.blur(getSlider(12));
    expect(screen.queryByText('12:00 · 50.0 kVA')).not.toBeInTheDocument();
    expect(selectedPoint()).toHaveAttribute('data-hour', '12');
  });

  it('dragging a point publishes its final value via onChange once on release', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    const point = getSlider(12);

    // jsdom's getBoundingClientRect is all zeros by default; the editor's
    // viewBox->pixel math divides by rect.height, so give it a real size.
    vi.spyOn(point.closest('svg')!, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      width: 640,
      height: 220,
      right: 640,
      bottom: 220,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(point, { pointerId: 1, clientY: 20 }); // near the top -> near max kVA
    fireEvent.pointerMove(point, { pointerId: 1, clientY: 200 }); // near the bottom -> near 0 kVA
    fireEvent.pointerUp(point, { pointerId: 1, clientY: 200 });

    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(onChange).toHaveBeenCalledTimes(1);
    const lastCall = onChange.mock.calls.at(-1)![0] as number[];
    expect(lastCall).toHaveLength(24);
    expect(lastCall[12]).toBeLessThan(10); // dragged down near the bottom
    expect(lastCall[11]).toBeLessThan(50); // immediate neighbor follows the drag
    expect(lastCall[10]).toBe(50); // further points stay untouched
  });

  it('caps dragged value at maxKw when dragged past the top of the scale without oscillating', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    const point = getSlider(12);

    vi.spyOn(point.closest('svg')!, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      width: 640,
      height: 220,
      right: 640,
      bottom: 220,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Drag way above the top of the chart (negative clientY)
    fireEvent.pointerDown(point, { pointerId: 1, clientY: -50 });
    fireEvent.pointerMove(point, { pointerId: 1, clientY: -100 });
    fireEvent.pointerUp(point, { pointerId: 1, clientY: -100 });

    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)![0] as number[];
    // The 15% headroom is frozen throughout the gesture.
    expect(lastCall[12]).toBe(57.5);
  });

  it('doubles the scale when a point is dragged to the top of the scale upon release', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    const point = getSlider(12);

    vi.spyOn(point.closest('svg')!, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      width: 640,
      height: 220,
      right: 640,
      bottom: 220,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Initial scale reserves 15% above the data.
    expect(point).toHaveAttribute('aria-valuemax', '57.5');

    // Drag to top and release -> scale doubles to 100 kVA
    fireEvent.pointerDown(point, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(point, { pointerId: 1, clientY: -20 });
    fireEvent.pointerUp(point, { pointerId: 1, clientY: -20 });

    expect(point).toHaveAttribute('aria-valuemax', '115');

    // Drag to top of new scale (100 kVA) and release -> doubles again to 200 kVA
    fireEvent.pointerDown(point, { pointerId: 2, clientY: 0 });
    fireEvent.pointerMove(point, { pointerId: 2, clientY: -20 });
    fireEvent.pointerUp(point, { pointerId: 2, clientY: -20 });

    expect(point).toHaveAttribute('aria-valuemax', '230');

    // Dragging down to bottom/middle and releasing does NOT double the scale
    fireEvent.pointerDown(point, { pointerId: 3, clientY: 100 });
    fireEvent.pointerMove(point, { pointerId: 3, clientY: 150 });
    fireEvent.pointerUp(point, { pointerId: 3, clientY: 150 });

    expect(point).toHaveAttribute('aria-valuemax', '230');
  });

  it('ArrowUp/ArrowDown on a focused point nudges its value by 1 kVA (5 with Shift)', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    const point = getSlider(6);

    fireEvent.keyDown(point, { key: 'ArrowUp' });
    fireEvent.keyDown(point, { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(point, { key: 'ArrowDown' });

    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)![0] as number[];
    expect(lastCall[6]).toBeCloseTo(55, 5); // 50 +1 +5 -1
  });

  it('ignores pointermove for a point that never captured the pointer', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    const untouched = getSlider(3);

    fireEvent.pointerMove(untouched, { pointerId: 1, clientY: 5 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('expands laterally on large screens to fill available container width', async () => {
    let resizeCallback: (() => void) | undefined;
    const OriginalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class MockResizeObserver {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    try {
      const { container } = render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
      const chartWrapper = screen.getByTestId('daily-chart-container');
      expect(chartWrapper).toBeInTheDocument();

      // Simulate resizing to large screen (1000px)
      Object.defineProperty(chartWrapper, 'clientWidth', { configurable: true, value: 1000 });
      act(() => {
        resizeCallback?.();
      });

      const svg = container.querySelector('svg[role="group"]');
      expect(svg).toHaveAttribute('viewBox', '0 0 1000 320');

      // Hour 23 slider cx should be near right edge: 54 + (1000 - 68) = 986
      const hour23 = getSlider(23);
      expect(hour23).toHaveAttribute('cx', '986');
    } finally {
      global.ResizeObserver = OriginalResizeObserver;
    }
  });
});

function mockSvgRect(point: HTMLElement) {
  vi.spyOn(point.closest('svg')!, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    left: 0,
    width: 640,
    height: 220,
    right: 640,
    bottom: 220,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe('DailyCurveEditor — suavização padrão', () => {
  it('uses smoothing by default without exposing a mode toggle', async () => {
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Suavizar/i })).not.toBeInTheDocument();
    expect(getSlider(12)).toHaveAttribute('r', '8');
  });

  it('in Suave mode, gives the dragged point priority and tapers only the excess into neighbors', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);

    const point = getSlider(12);
    mockSvgRect(point);
    fireEvent.pointerDown(point, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(point, { pointerId: 1, clientY: 100 });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    const delta = result[12] - 50;
    expect(delta).not.toBe(0);

    // The first 5 kVA belong entirely to the dragged point. The excess uses
    // the raised-cosine falloff: weight(1)=0.5, weight(2)=0.
    const adjacentDelta = Math.sign(delta) * Math.max(0, Math.abs(delta) - 5);
    expect(result[11]).toBe(Math.round((50 + adjacentDelta * 0.5) * 10) / 10);
    expect(result[13]).toBe(Math.round((50 + adjacentDelta * 0.5) * 10) / 10);
    expect(result[10]).toBe(Math.round((50 + adjacentDelta * 0) * 10) / 10);
    expect(result[14]).toBe(Math.round((50 + adjacentDelta * 0) * 10) / 10);
    expect(result[9]).toBe(50); // distance 3 -> weight 0
    expect(result[15]).toBe(50);
    expect(result[0]).toBe(50); // well outside the radius
  });

  it('the brush falloff wraps past midnight', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);

    const point = getSlider(23);
    mockSvgRect(point);
    fireEvent.pointerDown(point, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(point, { pointerId: 1, clientY: 100 });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    const delta = result[23] - 50;
    expect(delta).not.toBe(0);

    // Hour 0 is 1h from 23h going forward through midnight, hour 1 is 2h, hour 2 is 3h.
    const adjacentDelta = Math.sign(delta) * Math.max(0, Math.abs(delta) - 5);
    expect(result[0]).toBe(Math.round((50 + adjacentDelta * 0.5) * 10) / 10);
    expect(result[1]).toBe(Math.round((50 + adjacentDelta * 0) * 10) / 10);
    expect(result[2]).toBe(50);
  });

  it('does not move neighbors for a sub-threshold keyboard nudge in Suave mode', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);

    fireEvent.keyDown(getSlider(12), { key: 'ArrowUp' });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(51);
    expect(result[11]).toBe(50);
    expect(result[9]).toBe(50);
  });

  it('starts moving neighbors only after the smooth threshold is exceeded', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);

    fireEvent.keyDown(getSlider(12), { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(getSlider(12), { key: 'ArrowUp' });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(56);
    expect(result[11]).toBeCloseTo(50.5, 1); // (56 - 50) - 5, then × 0.5
    expect(result[10]).toBeCloseTo(50, 1);
    expect(result[9]).toBe(50);
  });

  it('moving UP in Suave mode only drags neighbors below, and pulls neighbors above only after passing them', async () => {
    const onChange = vi.fn();
    const initial = new Array(24).fill(50);
    initial[11] = 80; // above hour 12
    initial[13] = 30; // below hour 12
    render(<DailyCurveEditor hourlyKw={initial} onChange={onChange} />);

    // Nudge hour 12 up to 65 kVA (above initial 50, but still below hour 11 at 80)
    // 50 + 3 * 5 = 65 kVA
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(getSlider(12), { key: 'ArrowUp', shiftKey: true });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(65);
    // Hour 13 (below, was 30) is pulled up: 30 + (65 - 50 - 5) * 0.5 = 35
    expect(result[13]).toBeCloseTo(35, 1);
    // Hour 11 (above, was 80) is NOT pulled up because hour 12 (65) hasn't passed it yet
    expect(result[11]).toBe(80);

    // Now drag/nudge hour 12 further up to 90 kVA (passing hour 11's initial 80 kVA)
    // 65 + 5 * 5 = 90 kVA
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(getSlider(12), { key: 'ArrowUp', shiftKey: true });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(90);
    // Now that hour 12 (90) passed hour 11 (80), hour 11 became below and is pulled along:
    // 80 + (90 - 80) * 0.5 = 85
    expect(result[11]).toBeCloseTo(85, 1);
  });

  it('moving DOWN in Suave mode only drags neighbors above, and pulls neighbors below only after passing them', async () => {
    const onChange = vi.fn();
    const initial = new Array(24).fill(50);
    initial[11] = 80; // above hour 12
    initial[13] = 30; // below hour 12
    render(<DailyCurveEditor hourlyKw={initial} onChange={onChange} />);

    // Nudge hour 12 down to 40 kVA (below initial 50, but still above hour 13 at 30)
    // 50 - 2 * 5 = 40 kVA
    for (let i = 0; i < 2; i++) {
      fireEvent.keyDown(getSlider(12), { key: 'ArrowDown', shiftKey: true });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(40);
    // Hour 11 (above, was 80) is pulled down: 80 - (50 - 40 - 5) * 0.5 = 77.5
    expect(result[11]).toBeCloseTo(77.5, 1);
    // Hour 13 (below, was 30) is NOT pulled down because hour 12 (40) hasn't dropped below it
    expect(result[13]).toBe(30);

    // Now nudge hour 12 down to 20 kVA (passing hour 13's 30 kVA going down)
    // 40 - 4 * 5 = 20 kVA
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(getSlider(12), { key: 'ArrowDown', shiftKey: true });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(20);
    // Now that hour 12 (20) passed below hour 13 (30), hour 13 is pulled down:
    // 30 - (30 - 20) * 0.5 = 25
    expect(result[13]).toBeCloseTo(25, 1);
  });


});


describe('DailyCurveEditor — 15-minute profile and viewport navigation', () => {
  it('edits a quarter-hour independently and exposes 96 time slots', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={onChange} />);
    expect(screen.getAllByRole('slider')).toHaveLength(96);
    fireEvent.click(screen.getByRole('slider', { name: 'Potência às 10:15' }));
    await editPoint(85, false);
    const values = onChange.mock.calls.at(-1)![0];
    expect(values).toHaveLength(96);
    expect(values[41]).toBe(85);
    expect(values[39]).toBe(50);
    expect(screen.getByRole('slider', { name: 'Potência às 10:15' })).toHaveAttribute('aria-valuenow', '85');
  });

  it('zooms and pans the viewport without changing the profile, then resets to the full day', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar gráfico diário' }));
    expect(screen.getAllByRole('slider').length).toBeLessThan(96);
    const range = screen.getByRole('status', { name: 'Período visível no gráfico diário' });
    const initialRange = range.textContent;
    const svg = screen.getByRole('group', { name: /Editor da curva diária/ });
    mockSvgRect(svg);
    fireEvent.pointerDown(svg, { button: 0, pointerId: 9, clientX: 300 });
    fireEvent.pointerMove(svg, { pointerId: 9, clientX: 200 });
    fireEvent.pointerUp(svg, { pointerId: 9 });
    expect(range.textContent).not.toBe(initialRange);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: -100, clientX: 300 });
    expect(screen.getAllByRole('slider').length).toBeLessThan(48);
    fireEvent.click(screen.getByRole('button', { name: 'Ver dia inteiro' }));
    expect(screen.getAllByRole('slider')).toHaveLength(96);
  });

  it('preserves normal page scrolling and zooms only with Ctrl without editing consumption',()=>{
    const onChange=vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={onChange}/>);
    const svg=screen.getByRole('group',{name:/Editor da curva diária/});mockSvgRect(svg);
    const normal=new WheelEvent('wheel',{deltaY:-100,clientX:300,bubbles:true,cancelable:true});
    fireEvent(svg,normal);
    expect(normal.defaultPrevented).toBe(false);
    expect(screen.getAllByRole('slider')).toHaveLength(96);
    const modified=new WheelEvent('wheel',{deltaY:-100,clientX:300,ctrlKey:true,bubbles:true,cancelable:true});
    fireEvent(svg,modified);
    expect(modified.defaultPrevented).toBe(true);
    expect(screen.getAllByRole('slider').length).toBeLessThan(96);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects an interval over an editable point with Shift without modifying either series',()=>{
    const change=vi.fn(),solar=vi.fn(),select=vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} solarKw={new Array(96).fill(10)} onChange={change} onSolarChange={solar} onSelectRange={select}/>);
    const svg=screen.getByRole('group',{name:/Editor da curva diária/});mockSvgRect(svg);
    const point=screen.getByRole('slider',{name:'Potência às 10:00'});
    fireEvent.pointerDown(point,{button:0,pointerId:3,clientX:180,clientY:100,shiftKey:true});
    fireEvent.pointerMove(svg,{pointerId:3,clientX:340,clientY:120});
    expect(screen.getByTestId('daily-interval-band')).toBeInTheDocument();
    fireEvent.pointerUp(svg,{pointerId:3,clientX:340,clientY:120});
    expect(select).toHaveBeenCalledWith(expect.objectContaining({startIndex:expect.any(Number),endIndex:expect.any(Number)}));
    expect(select.mock.calls[0][0].endIndex).toBeGreaterThan(select.mock.calls[0][0].startIndex);
    expect(change).not.toHaveBeenCalled();expect(solar).not.toHaveBeenCalled();
  });

  it('selects directly on the graph without time inputs, modifiers or editing data',()=>{
    const select=vi.fn(),change=vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={change} onSelectRange={select}/>);
    fireEvent.click(screen.getByRole('button',{name:'Selecionar'}));
    expect(screen.queryByLabelText('Início do intervalo diário')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fim do intervalo diário')).not.toBeInTheDocument();
    const svg=screen.getByRole('group',{name:/Seleção de intervalo da curva diária/});mockSvgRect(svg);
    const x=(index:number)=>54+index/95*(640-54-14);
    fireEvent.pointerDown(svg,{button:0,pointerId:4,clientX:x(32),clientY:100});
    fireEvent.pointerMove(svg,{pointerId:4,clientX:x(39),clientY:100});
    fireEvent.pointerUp(svg,{pointerId:4,clientX:x(39),clientY:100});
    expect(select).toHaveBeenCalledWith({startIndex:32,endIndex:39});expect(change).not.toHaveBeenCalled();
  });

  it('edits a PV-only pattern without changing imported consumption or showing invented consumption metrics',()=>{
    const solar=vi.fn(),consumption=vi.fn();
    render(<DailyCurveEditor solarOnly hourlyKw={new Array(96).fill(0)} solarKw={new Array(96).fill(10)} onChange={consumption} onSolarChange={solar}/>);
    expect(screen.getByRole('button',{name:'Consumo'})).toBeDisabled();
    expect(screen.queryByRole('region',{name:'Resumo energético do dia'})).not.toBeInTheDocument();
    expect(screen.queryByTestId('daily-consumption-series')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Limpar curva'}));
    expect(solar).toHaveBeenCalled();expect(consumption).not.toHaveBeenCalled();
  });

  it('preserves undo when the parent echoes a changed 96-point pattern', async () => {
    const original = new Array(96).fill(50);
    function Controlled() {
      const [values, setValues] = useState(original);
      return <DailyCurveEditor hourlyKw={values} onChange={setValues} />;
    }
    render(<Controlled />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar curva' }));
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(0));
    fireEvent.click(screen.getByRole('button', { name: /Desfazer/ }));
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(50));
    expect(screen.getAllByRole('slider')).toHaveLength(96);
  });
});

describe('daily editor solar comparison', () => {
  it('dims the other series when selecting solar or consumption and preserves consumption edits', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={Array(96).fill(100)} solarKw={Array(96).fill(75)} onChange={onChange} />);
    expect(screen.getByTestId('daily-solar-series')).toHaveAttribute('opacity', '0.2');
    fireEvent.click(screen.getByRole('button', { name: 'Fotovoltaico' }));
    expect(screen.getByTestId('daily-consumption-series')).toHaveAttribute('opacity', '0.2');
    expect(screen.getByTestId('daily-solar-series')).toHaveAttribute('opacity', '1');
    expect(selectedPoint(true)).toHaveAttribute('aria-valuenow', String(75));
    expect(selectedPoint(true)).toHaveAttribute('aria-readonly', 'true');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('slider', { name: 'Fotovoltaico às 10:15' }));
    expect(selectedPoint(true)).toHaveAttribute('data-solar-point', '41');
    fireEvent.click(screen.getByRole('button', { name: 'Consumo' }));
    expect(screen.getByTestId('daily-consumption-series')).toHaveAttribute('opacity', '1');
    await editPoint(110, false);
    expect(onChange.mock.calls.at(-1)![0][41]).toBe(110);
  });
});


describe('editing daily PV points', () => {
  it('edits, smooths, clears and restores PV independently from consumption', async () => {
    const onLoad = vi.fn();
    const onSolar = vi.fn();
    function Editable() {
      const [solar, setSolar] = useState(Array(96).fill(75));
      return <DailyCurveEditor hourlyKw={Array(96).fill(100)} solarKw={solar} onChange={onLoad} onSolarChange={kw => {onSolar(kw); setSolar(kw);}} />;
    }
    render(<Editable />);
    fireEvent.click(screen.getByRole('button', { name: 'Fotovoltaico' }));
    await editPoint(90, true);
    expect(onSolar.mock.calls.at(-1)![0][48]).toBe(90);
    expect(selectedPoint(true)).toHaveAttribute('aria-readonly', 'false');
    expect(onLoad).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Fotovoltaico às 12:00' }), { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Fotovoltaico às 12:00' }), { key: 'ArrowUp', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar curva' }));
    expect(onSolar.mock.calls.at(-1)![0].every((value: number) => value === 0)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onSolar.mock.calls.at(-1)![0][48]).toBe(100);
    expect(onSolar.mock.calls.at(-1)![0][47]).toBeGreaterThan(75);
    expect(onLoad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Consumo' }));
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(100));
  });
});


it('limits 15-minute smoothing to the two immediate neighbors for both load and PV', async () => {
  const onLoad = vi.fn();
  const onSolar = vi.fn();
  render(<DailyCurveEditor hourlyKw={Array(96).fill(50.123)} solarKw={Array(96).fill(50.123)} onChange={onLoad} onSolarChange={onSolar} />);
  for (let index = 0; index < 4; index++) fireEvent.keyDown(screen.getByRole('slider', { name: 'Potência às 12:00' }), { key: 'ArrowUp', shiftKey: true });
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  const changed = (values: number[]) => values.flatMap((value, index) => value !== 50.123 ? [index] : []);
  expect(changed(onLoad.mock.calls.at(-1)![0])).toEqual([47, 48, 49]);
  fireEvent.click(screen.getByRole('button', { name: 'Fotovoltaico' }));
  for (let index = 0; index < 4; index++) fireEvent.keyDown(screen.getByRole('slider', { name: 'Fotovoltaico às 12:00' }), { key: 'ArrowUp', shiftKey: true });
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(changed(onSolar.mock.calls.at(-1)![0])).toEqual([47, 48, 49]);
});


it('hides the FV tooltip when its point loses focus, when using graph controls', async () => {
  render(<DailyCurveEditor hourlyKw={Array(96).fill(100)} solarKw={Array(96).fill(75)} onSolarChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Fotovoltaico' }));
  expect(screen.queryByText('12:00 · 75.0 kVA FV')).not.toBeInTheDocument();
  const point = screen.getByRole('slider', { name: 'Fotovoltaico às 12:00' });
  fireEvent.focus(point);
  expect(screen.getByText('12:00 · 75.0 kVA FV')).toBeInTheDocument();
  fireEvent.blur(point);
  fireEvent.focus(screen.getByRole('button', { name: 'Visualização' }));
  expect(screen.queryByText('12:00 · 75.0 kVA FV')).not.toBeInTheDocument();
  expect(selectedPoint(true)).toHaveAttribute('aria-valuenow', String(75));
});

describe('DailyCurveEditor — editing tools', () => {
  it('keeps keyboard edits separate from selecting an interval', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(24).fill(50)} onChange={onChange} onSelectRange={vi.fn()} />);
    const point = getSlider(12);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    expect(screen.queryByRole('spinbutton', { name: 'Potência ativa' })).not.toBeInTheDocument();
    fireEvent.keyDown(point, { key: 'ArrowUp' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(50));
    fireEvent.keyDown(point, { key: 'ArrowUp' });
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(51));
  });

  it('returns to point editing if a cleared curve can no longer provide interval selection', async () => {
    const onChange = vi.fn();
    const props = { hourlyKw: FLAT_24, onChange };
    const { rerender } = render(<DailyCurveEditor {...props} onSelectRange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    rerender(<DailyCurveEditor {...props} />);
    expect(getSlider(12)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Selecionar' })).not.toBeInTheDocument();
    await editPoint(55, false);
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([55]));
  });







  it('supports undo and redo stack across edits', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={onChange} />);

    const undoBtn = screen.getByRole('button', { name: /Desfazer/ });
    const redoBtn = screen.getByRole('button', { name: /Refazer/ });

    expect(undoBtn).toBeDisabled();
    expect(redoBtn).toBeDisabled();

    await editPoint(55);
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(55));
    expect(undoBtn).not.toBeDisabled();

    fireEvent.click(undoBtn);
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(50));
    expect(redoBtn).not.toBeDisabled();

    fireEvent.click(redoBtn);
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(55));
  });

  it('renders peak tariff band (18h-21h) and quick zoom presets', async () => {
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={vi.fn()} />);

    expect(screen.getByText('Ponta (18h–21h)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Visualização' }));
    const solarZoomBtn = screen.getByRole('button', { name: 'Solar (6h–18h)' });
    fireEvent.click(solarZoomBtn);
    const range = screen.getByRole('status', { name: 'Período visível no gráfico diário' });
    expect(range.textContent).toContain('06:00');

    const fullZoomBtn = screen.getByRole('button', { name: '24h' });
    fireEvent.click(fullZoomBtn);
    expect(screen.getByRole('status', { name: 'Período visível no gráfico diário' }).textContent).toContain('00:00');
  });

  it('harmonizes isolated peaks with moving average smoothing button', async () => {
    const onChange = vi.fn();
    const noisy = new Array(96).fill(50);
    noisy[48] = 100; // spike at 12:00
    render(<DailyCurveEditor hourlyKw={noisy} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Harmonizar picos' }));
    const smoothed = onChange.mock.calls.at(-1)![0];
    expect(smoothed[48]).toBeLessThan(100);
    expect(smoothed[48]).toBeGreaterThan(50);
  });
});

it('restores and redoes clearing the curve through the same history', async () => {
  render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Limpar curva' }));
  expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(0));
  fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
  expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(50));
  expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
  expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(0));
});

it('keeps all editing tools disabled for read-only solar generation', async () => {
  const onChange = vi.fn();
  render(<DailyCurveEditor hourlyKw={FLAT_24} solarKw={FLAT_24} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Fotovoltaico' }));
  for (const name of ['Harmonizar picos', 'Limpar curva']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  expect(onChange).not.toHaveBeenCalled();
});



describe('drag preview and project publication', () => {
  function mockDragRect(point: HTMLElement) {
    vi.spyOn(point.closest('svg')!, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, width: 640, height: 220, right: 640, bottom: 220,
      x: 0, y: 0, toJSON: () => ({}),
    });
  }

  async function paintFrame() {
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  }

  it('can start dragging the solar curve directly without first switching series', async () => {
    const onLoad = vi.fn();
    const onSolar = vi.fn();
    render(<DailyCurveEditor hourlyKw={Array(96).fill(100)} solarKw={Array(96).fill(75)} onChange={onLoad} onSolarChange={onSolar} />);
    const point = screen.getByRole('slider', { name: 'Fotovoltaico às 12:00' });
    mockDragRect(point);
    fireEvent.pointerDown(point, { pointerId: 6, clientY: 80 });
    await paintFrame();
    expect(selectedPoint(true)).not.toHaveAttribute('aria-valuenow', String(75));
    expect(onSolar).not.toHaveBeenCalled();
    fireEvent.pointerMove(point, { pointerId: 6, clientY: 180 });
    fireEvent.pointerUp(point, { pointerId: 6 });
    expect(onSolar).toHaveBeenCalledTimes(1);
    expect(onSolar.mock.calls[0][0][48]).toBeLessThan(75);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('previews over multiple frames without rebuilding the project and publishes the final movement on release', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    const point = getSlider(12);
    mockDragRect(point);
    fireEvent.pointerDown(point, { pointerId: 7, clientY: 80 });
    await paintFrame();
    expect(selectedPoint(false)).not.toHaveAttribute('aria-valuenow', String(50));
    expect(onChange).not.toHaveBeenCalled();
    const first = point.getAttribute('aria-valuenow');
    fireEvent.pointerMove(point, { pointerId: 7, clientY: 140 });
    await paintFrame();
    expect(point.getAttribute('aria-valuenow')).not.toBe(first);
    expect(onChange).not.toHaveBeenCalled();
    // This final movement must be committed even before its RAF can run.
    fireEvent.pointerMove(point, { pointerId: 7, clientY: 200 });
    fireEvent.pointerUp(point, { pointerId: 7, clientY: 200 });
    const final = onChange.mock.calls[0][0] as number[];
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(final[12]).toBeLessThan(10);
    expect(final[10]).toBe(50);
    await paintFrame();
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(50));
    fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(final[12]));
  });

  it('publishes cancelled or lost-capture solar gestures once without changing consumption', async () => {
    const onLoad = vi.fn();
    const onSolar = vi.fn();
    render(<DailyCurveEditor hourlyKw={Array(96).fill(100)} solarKw={Array(96).fill(75)} onChange={onLoad} onSolarChange={onSolar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fotovoltaico' }));
    const point = screen.getByRole('slider', { name: 'Fotovoltaico às 12:00' });
    mockDragRect(point);
    fireEvent.pointerDown(point, { pointerId: 8, clientY: 80 });
    fireEvent.pointerMove(point, { pointerId: 8, clientY: 160 });
    await paintFrame();
    expect(onSolar).not.toHaveBeenCalled();
    fireEvent.pointerCancel(point, { pointerId: 8 });
    fireEvent.lostPointerCapture(point, { pointerId: 8 });
    expect(onSolar).toHaveBeenCalledTimes(1);
    expect(onLoad).not.toHaveBeenCalled();
    expect(onSolar.mock.calls[0][0][48]).toBeLessThan(75);
    await paintFrame();
    expect(onSolar).toHaveBeenCalledTimes(1);
    onSolar.mockClear();
    fireEvent.pointerDown(point, { pointerId: 9, clientY: 100 });
    fireEvent.pointerMove(point, { pointerId: 9, clientY: 180 });
    await paintFrame();
    expect(onSolar).not.toHaveBeenCalled();
    fireEvent.lostPointerCapture(point, { pointerId: 9 });
    expect(onSolar).toHaveBeenCalledTimes(1);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('does not publish a stale unfinished gesture after the editor is removed', async () => {
    const onChange = vi.fn();
    const { unmount } = render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    const point = getSlider(12);
    mockDragRect(point);
    fireEvent.pointerDown(point, { pointerId: 9, clientY: 80 });
    fireEvent.pointerMove(point, { pointerId: 9, clientY: 200 });
    unmount();
    expect(onChange).not.toHaveBeenCalled();
    await paintFrame();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('discards a stale draft when an external profile replaces the edited dataset', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    const point = getSlider(12);
    mockDragRect(point);
    fireEvent.pointerDown(point, { pointerId: 10, clientY: 80 });
    rerender(<DailyCurveEditor hourlyKw={Array(24).fill(20)} onChange={onChange} />);
    fireEvent.pointerMove(point, { pointerId: 10, clientY: 200 });
    fireEvent.pointerUp(point, { pointerId: 10 });
    await paintFrame();
    expect(onChange).not.toHaveBeenCalled();
    expect(selectedPoint(false)).toHaveAttribute('aria-valuenow', String(20));
  });
});

it('shows only backup beside the taller graph, without point or batch panels', () => {
  render(<DailyCurveEditor hourlyKw={FLAT_24} selectionActions={<button>Configurar backup da seleção</button>} />);
  expect(screen.getByRole('region', { name: 'Backup da seleção' })).toContainElement(screen.getByRole('button', { name: 'Configurar backup da seleção' }));
  expect(screen.queryByText('Ponto selecionado')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ajuste em bloco de horário' })).not.toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: /Editor da curva diária/ })).toHaveAttribute('viewBox', '0 0 640 320');
});

it('edits apparent CA power at nonunity FP while preserving active energy and emitted kW', async () => {
  const { CiAcPowerProvider } = await import('./ci-ac-power');
  const onChange = vi.fn();
  render(<CiAcPowerProvider powerFactor={0.8}><DailyCurveEditor hourlyKw={Array(24).fill(80)} onChange={onChange} /></CiAcPowerProvider>);
  const point = getSlider(12);
  expect(point).toHaveAttribute('aria-valuenow', '100');
  expect(point).toHaveAttribute('aria-valuetext', '100.0 kVA');
  fireEvent.keyDown(point, { key: 'ArrowUp' });
  expect(point).toHaveAttribute('aria-valuenow', '101');
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(onChange.mock.calls.at(-1)![0][12]).toBeCloseTo(80.8, 10);
});

describe('Ctrl + Shift freehand editing', () => {
  function canvas() {
    const svg = screen.getByRole('group', { name: /curva diária/ });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, width: 640, height: 320, right: 640, bottom: 320, toJSON: () => ({}) });
    return svg;
  }
  const x = (index: number, count = 24) => 54 + index / (count - 1) * 572;
  const y = (kw: number, maximum = 57.5) => 26 + (1 - kw / maximum) * 268;
  async function frame() { await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); }); }

  it('draws through skipped points with one publication and one undo, taking priority over interval selection', async () => {
    const changed=vi.fn(), select=vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={changed} onSelectRange={select}/>);
    fireEvent.click(screen.getByRole('button',{name:'Selecionar'}));
    const svg=canvas();
    fireEvent.pointerDown(svg,{button:0,pointerId:20,ctrlKey:true,shiftKey:true,clientX:x(4),clientY:y(10)});
    expect(svg.hasPointerCapture(20)).toBe(true);
    await frame();
    expect(getSlider(4)).toHaveAttribute('aria-valuenow','10');
    expect(changed).not.toHaveBeenCalled();
    fireEvent.pointerMove(svg,{pointerId:20,clientX:x(8),clientY:y(30)});
    await frame();
    expect(getSlider(6)).toHaveAttribute('aria-valuenow','20');
    expect(changed).not.toHaveBeenCalled();
    // Include the final location even when no animation frame has painted it.
    fireEvent.pointerUp(svg,{pointerId:20,clientX:x(9),clientY:y(35)});
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0][0].slice(4,10)).toEqual([10,15,20,25,30,35]);
    expect(changed.mock.calls[0][0][3]).toBe(50);
    expect(changed.mock.calls[0][0][10]).toBe(50);
    expect(select).not.toHaveBeenCalled();
    await frame();
    expect(changed).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:'Desfazer'}));
    expect(changed.mock.calls.at(-1)![0]).toEqual(FLAT_24);
    expect(screen.getByRole('button',{name:'Desfazer'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Refazer'}));
    expect(changed.mock.calls.at(-1)![0].slice(4,10)).toEqual([10,15,20,25,30,35]);
  });

  it('starts over a point, follows reverse motion and backtracking, and ignores a second pointer', () => {
    const changed=vi.fn(), select=vi.fn();
    render(<DailyCurveEditor hourlyKw={Array(24).fill(80)} onChange={changed} onSelectRange={select}/>);
    const svg=canvas();
    fireEvent.pointerDown(getSlider(10),{button:0,pointerId:21,ctrlKey:true,shiftKey:true,clientX:x(10),clientY:y(20,100)});
    fireEvent.pointerMove(svg,{pointerId:22,clientX:x(0),clientY:y(0,100)});
    fireEvent.pointerUp(svg,{pointerId:22,clientX:x(0),clientY:y(0,100)});
    expect(changed).not.toHaveBeenCalled();
    fireEvent.pointerMove(svg,{pointerId:21,clientX:x(3),clientY:y(90,100)});
    fireEvent.pointerUp(svg,{pointerId:21,clientX:x(7),clientY:y(50,100)});
    const values=changed.mock.calls[0][0];
    expect(values.slice(3,11)).toEqual([90,80,70,60,50,40,30,20]);
    expect(values[2]).toBe(80);expect(values[11]).toBe(80);
    expect(changed).toHaveBeenCalledTimes(1);expect(select).not.toHaveBeenCalled();
  });

  it('can start directly on FV and updates only FV in active kW at project FP', async () => {
    const {CiAcPowerProvider}=await import('./ci-ac-power');
    const changed=vi.fn(), solar=vi.fn();
    render(<CiAcPowerProvider powerFactor={.8}><DailyCurveEditor hourlyKw={Array(96).fill(100)} solarKw={Array(96).fill(50)} onChange={changed} onSolarChange={solar}/></CiAcPowerProvider>);
    const svg=canvas(), point=screen.getByRole('slider',{name:'Fotovoltaico às 08:00'});
    fireEvent.pointerDown(point,{button:0,pointerId:23,ctrlKey:true,shiftKey:true,clientX:x(32,96),clientY:y(50,115)});
    fireEvent.pointerMove(svg,{pointerId:23,clientX:x(40,96),clientY:y(70,115)});
    await frame();
    expect(screen.getByRole('button',{name:'Fotovoltaico'})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('slider',{name:'Fotovoltaico às 10:00'})).toHaveAttribute('aria-valuenow','87.5');
    expect(solar).not.toHaveBeenCalled();
    fireEvent.pointerUp(svg,{pointerId:23,clientX:x(40,96),clientY:y(70,115)});
    expect(solar).toHaveBeenCalledTimes(1);
    expect(solar.mock.calls[0][0][40]).toBe(70);
    expect(solar.mock.calls[0][0][36]).toBe(60);
    expect(solar.mock.calls[0][0][31]).toBe(50);
    expect(solar.mock.calls[0][0][41]).toBe(50);
    expect(changed).not.toHaveBeenCalled();
  });

  it('respects the zoomed time window and keeps Ctrl+scroll from changing it during drawing', () => {
    const changed=vi.fn();
    render(<DailyCurveEditor hourlyKw={Array(96).fill(80)} onChange={changed}/>);
    fireEvent.click(screen.getByRole('button',{name:'Ampliar gráfico diário'}));
    const svg=canvas();
    const visible=screen.getByRole('status',{name:'Período visível no gráfico diário'}).textContent;
    const x32=Number(screen.getByRole('slider',{name:'Potência às 08:00'}).getAttribute('cx'));
    const x36=Number(screen.getByRole('slider',{name:'Potência às 09:00'}).getAttribute('cx'));
    fireEvent.pointerDown(svg,{button:0,pointerId:24,ctrlKey:true,shiftKey:true,clientX:x32,clientY:y(40,100)});
    const wheel=new WheelEvent('wheel',{ctrlKey:true,deltaY:-100,clientX:x32,bubbles:true,cancelable:true});
    fireEvent(svg,wheel);expect(wheel.defaultPrevented).toBe(true);
    fireEvent.pointerUp(svg,{pointerId:24,clientX:x36,clientY:y(60,100)});
    const values=changed.mock.calls[0][0];
    expect(values[32]).toBe(40);expect(values[34]).toBe(50);expect(values[36]).toBe(60);
    expect(values[31]).toBe(80);expect(values[37]).toBe(80);
    expect(screen.getByRole('status',{name:'Período visível no gráfico diário'}).textContent).toBe(visible);
  });

  it('keeps read-only FV untouched instead of selecting an interval or editing consumption', () => {
    const changed=vi.fn(), select=vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} solarKw={Array(24).fill(25)} onChange={changed} onSelectRange={select}/>);
    fireEvent.click(screen.getByRole('button',{name:'Fotovoltaico'}));
    const svg=canvas();
    fireEvent.pointerDown(svg,{button:0,pointerId:25,ctrlKey:true,shiftKey:true,clientX:x(4),clientY:y(10)});
    fireEvent.pointerMove(svg,{pointerId:25,clientX:x(8),clientY:y(30)});
    fireEvent.pointerUp(svg,{pointerId:25,clientX:x(8),clientY:y(30)});
    expect(changed).not.toHaveBeenCalled();expect(select).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'Desfazer'})).toBeDisabled();
    expect(screen.getByRole('slider',{name:'Fotovoltaico às 08:00'})).toHaveAttribute('aria-valuenow','25');
  });

  it.each(['pointerCancel','lostPointerCapture'] as const)('finishes %s once without losing the last draft', async event => {
    const changed=vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={changed}/>);
    const svg=canvas();
    fireEvent.pointerDown(svg,{button:0,pointerId:26,ctrlKey:true,shiftKey:true,clientX:x(4),clientY:y(10)});
    fireEvent.pointerMove(svg,{pointerId:26,clientX:x(8),clientY:y(30)});
    fireEvent[event](svg,{pointerId:26});
    fireEvent.lostPointerCapture(svg,{pointerId:26});
    await frame();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0][0].slice(4,9)).toEqual([10,15,20,25,30]);
  });

  it('discards a pending stroke when a different external profile replaces the curve', async () => {
    const changed=vi.fn();
    const {rerender}=render(<DailyCurveEditor hourlyKw={Array(24).fill(80)} onChange={changed}/>);
    const svg=canvas();
    fireEvent.pointerDown(svg,{button:0,pointerId:27,ctrlKey:true,shiftKey:true,clientX:x(4),clientY:y(10,100)});
    rerender(<DailyCurveEditor hourlyKw={Array(24).fill(20)} onChange={changed}/>);
    fireEvent.pointerMove(svg,{pointerId:27,clientX:x(8),clientY:y(30,100)});
    fireEvent.pointerUp(svg,{pointerId:27,clientX:x(8),clientY:y(30,100)});
    await frame();
    expect(changed).not.toHaveBeenCalled();
    expect(getSlider(12)).toHaveAttribute('aria-valuenow','20');
    expect(Number(getSlider(12).getAttribute('cy'))).toBeCloseTo(26 + (1 - 20 / 23) * 268);
  });
});
