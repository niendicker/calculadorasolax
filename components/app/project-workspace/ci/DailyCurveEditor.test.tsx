// @vitest-environment jsdom

import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DailyCurveEditor } from './DailyCurveEditor';

const FLAT_24 = new Array(24).fill(50);

function getSlider(hour: number) {
  return screen.getByRole('slider', { name: `Potência às ${hour}h` });
}

describe('DailyCurveEditor', () => {
  it('renders one slider per hour of the day', () => {
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
    expect(screen.getAllByRole('slider')).toHaveLength(24);
    expect(getSlider(0)).toHaveAttribute('aria-valuenow', '50');
    expect(getSlider(23)).toHaveAttribute('aria-valuenow', '50');
  });

  it('shows the point tooltip only while focused and preserves selection on blur', () => {
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
    expect(screen.queryByText('12:00 · 50.0 kW')).not.toBeInTheDocument();
    fireEvent.focus(getSlider(12));
    const badgeText = screen.getByText('12:00 · 50.0 kW');
    expect(badgeText).toBeInTheDocument();

    const rect = badgeText.previousElementSibling as SVGRectElement;
    expect(rect).toBeInTheDocument();
    expect(rect).toHaveAttribute('width', '108');
    expect(rect).toHaveAttribute('height', '20');
    fireEvent.blur(getSlider(12));
    expect(screen.queryByText('12:00 · 50.0 kW')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Horário selecionado')).toHaveValue('12');
  });

  it('dragging a point updates its value via onChange, coalesced to one call per frame', async () => {
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

    fireEvent.pointerDown(point, { pointerId: 1, clientY: 20 }); // near the top -> near max kW
    fireEvent.pointerMove(point, { pointerId: 1, clientY: 200 }); // near the bottom -> near 0 kW
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
    // For FLAT_24 (all 50 kW), maxKw is 50. Capped at 50, never runaway to 100/200/500
    expect(lastCall[12]).toBe(50);
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

    // Initial scale is 50 kW (from FLAT_24 max 50)
    expect(point).toHaveAttribute('aria-valuemax', '50');
    expect(screen.getByText('50 kW')).toBeInTheDocument();

    // Drag to top and release -> scale doubles to 100 kW
    fireEvent.pointerDown(point, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(point, { pointerId: 1, clientY: -20 });
    fireEvent.pointerUp(point, { pointerId: 1, clientY: -20 });

    expect(point).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('100 kW')).toBeInTheDocument();

    // Drag to top of new scale (100 kW) and release -> doubles again to 200 kW
    fireEvent.pointerDown(point, { pointerId: 2, clientY: 0 });
    fireEvent.pointerMove(point, { pointerId: 2, clientY: -20 });
    fireEvent.pointerUp(point, { pointerId: 2, clientY: -20 });

    expect(point).toHaveAttribute('aria-valuemax', '200');
    expect(screen.getByText('200 kW')).toBeInTheDocument();

    // Dragging down to bottom/middle and releasing does NOT double the scale
    fireEvent.pointerDown(point, { pointerId: 3, clientY: 100 });
    fireEvent.pointerMove(point, { pointerId: 3, clientY: 150 });
    fireEvent.pointerUp(point, { pointerId: 3, clientY: 150 });

    expect(point).toHaveAttribute('aria-valuemax', '200');
  });

  it('ArrowUp/ArrowDown on a focused point nudges its value by 1 kW (5 with Shift)', async () => {
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

  it('ignores pointermove for a point that never captured the pointer', () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    const untouched = getSlider(3);

    fireEvent.pointerMove(untouched, { pointerId: 1, clientY: 5 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('expands laterally on large screens to fill available container width', () => {
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
      expect(svg).toHaveAttribute('viewBox', '0 0 1000 235');

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
  it('uses smoothing by default without exposing a mode toggle', () => {
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

    // The first 5 kW belong entirely to the dragged point. The excess uses
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

    // Nudge hour 12 up to 65 kW (above initial 50, but still below hour 11 at 80)
    // 50 + 3 * 5 = 65 kW
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

    // Now drag/nudge hour 12 further up to 90 kW (passing hour 11's initial 80 kW)
    // 65 + 5 * 5 = 90 kW
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

    // Nudge hour 12 down to 40 kW (below initial 50, but still above hour 13 at 30)
    // 50 - 2 * 5 = 40 kW
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

    // Now nudge hour 12 down to 20 kW (passing hour 13's 30 kW going down)
    // 40 - 4 * 5 = 20 kW
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

  it('triggers onSaveAsCustomModel when user enters name and clicks save', () => {
    const onSave = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onSaveAsCustomModel={onSave} />);

    expect(screen.getByText('Salvar como modelo')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Salvar como modelo'));

    const input = screen.getByPlaceholderText('Nome do modelo...');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Turno Noturno 100kW' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith('Turno Noturno 100kW', FLAT_24, FLAT_24);
  });
});


describe('DailyCurveEditor — 15-minute profile and viewport navigation', () => {
  it('edits a quarter-hour independently and exposes 96 time slots', () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={onChange} />);
    expect(screen.getAllByRole('slider')).toHaveLength(96);
    fireEvent.change(screen.getByLabelText('Horário selecionado'), { target: { value: '41' } });
    fireEvent.change(screen.getByLabelText('Potência ativa'), { target: { value: '85' } });
    const values = onChange.mock.calls.at(-1)![0];
    expect(values).toHaveLength(96);
    expect(values[41]).toBe(85);
    expect(values[40]).toBe(50);
    expect(screen.getByRole('slider', { name: 'Potência às 10:15' })).toHaveAttribute('aria-valuenow', '85');
  });

  it('zooms and pans the viewport without changing the profile, then resets to the full day', () => {
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

  it('offers interval inputs without requiring a keyboard modifier or editing data',()=>{
    const select=vi.fn(),change=vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={change} onSelectRange={select}/>);
    fireEvent.click(screen.getByRole('button',{name:'Selecionar intervalo'}));
    fireEvent.change(screen.getByLabelText('Início do intervalo diário'),{target:{value:'32'}});
    fireEvent.change(screen.getByLabelText('Fim do intervalo diário'),{target:{value:'39'}});
    fireEvent.click(screen.getByRole('button',{name:'Marcar intervalo'}));
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

  it('preserves undo when the parent echoes a changed 96-point pattern', () => {
    const original = new Array(96).fill(50);
    function Controlled() {
      const [values, setValues] = useState(original);
      return <DailyCurveEditor hourlyKw={values} onChange={setValues} />;
    }
    render(<Controlled />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar curva' }));
    expect(screen.getByLabelText('Potência ativa')).toHaveValue(0);
    fireEvent.click(screen.getByRole('button', { name: /Desfazer/ }));
    expect(screen.getByLabelText('Potência ativa')).toHaveValue(50);
    expect(screen.getAllByRole('slider')).toHaveLength(96);
  });
});

describe('daily editor solar comparison', () => {
  it('dims the other series when selecting solar or consumption and preserves consumption edits', () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={Array(96).fill(100)} solarKw={Array(96).fill(75)} onChange={onChange} />);
    expect(screen.getByTestId('daily-solar-series')).toHaveAttribute('opacity', '0.2');
    fireEvent.click(screen.getByRole('button', { name: 'Geração FV' }));
    expect(screen.getByTestId('daily-consumption-series')).toHaveAttribute('opacity', '0.2');
    expect(screen.getByTestId('daily-solar-series')).toHaveAttribute('opacity', '1');
    expect(screen.getByLabelText('Geração FV selecionada')).toHaveValue(75);
    expect(screen.getByLabelText('Geração FV selecionada')).toHaveAttribute('readonly');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('slider', { name: 'Geração FV às 10:15' }));
    expect(screen.getByLabelText('Horário selecionado')).toHaveValue('41');
    fireEvent.click(screen.getByRole('button', { name: 'Consumo' }));
    expect(screen.getByTestId('daily-consumption-series')).toHaveAttribute('opacity', '1');
    fireEvent.change(screen.getByLabelText('Potência ativa'), { target: { value: '110' } });
    expect(onChange.mock.calls.at(-1)![0][41]).toBe(110);
  });
});


describe('editing daily PV points', () => {
  it('edits, smooths, clears and restores PV independently from consumption', () => {
    const onLoad = vi.fn();
    const onSolar = vi.fn();
    function Editable() {
      const [solar, setSolar] = useState(Array(96).fill(75));
      return <DailyCurveEditor hourlyKw={Array(96).fill(100)} solarKw={solar} onChange={onLoad} onSolarChange={kw => {onSolar(kw); setSolar(kw);}} />;
    }
    render(<Editable />);
    fireEvent.click(screen.getByRole('button', { name: 'Geração FV' }));
    fireEvent.change(screen.getByLabelText('Geração FV selecionada'), { target: { value: '90' } });
    expect(onSolar.mock.calls.at(-1)![0][48]).toBe(90);
    expect(screen.getByLabelText('Geração FV selecionada')).not.toHaveAttribute('readonly');
    expect(onLoad).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Geração FV às 12:00' }), { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Geração FV às 12:00' }), { key: 'ArrowUp', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar curva' }));
    expect(onSolar.mock.calls.at(-1)![0].every((value: number) => value === 0)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onSolar.mock.calls.at(-1)![0][48]).toBe(100);
    expect(onSolar.mock.calls.at(-1)![0][47]).toBeGreaterThan(75);
    expect(onLoad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Consumo' }));
    expect(screen.getByLabelText('Potência ativa')).toHaveValue(100);
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
  fireEvent.click(screen.getByRole('button', { name: 'Geração FV' }));
  for (let index = 0; index < 4; index++) fireEvent.keyDown(screen.getByRole('slider', { name: 'Geração FV às 12:00' }), { key: 'ArrowUp', shiftKey: true });
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(changed(onSolar.mock.calls.at(-1)![0])).toEqual([47, 48, 49]);
});


it('hides the FV tooltip when its point loses focus, including when using the lateral editor', () => {
  render(<DailyCurveEditor hourlyKw={Array(96).fill(100)} solarKw={Array(96).fill(75)} onSolarChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Geração FV' }));
  expect(screen.queryByText('12:00 · 75.0 kW FV')).not.toBeInTheDocument();
  const point = screen.getByRole('slider', { name: 'Geração FV às 12:00' });
  fireEvent.focus(point);
  expect(screen.getByText('12:00 · 75.0 kW FV')).toBeInTheDocument();
  fireEvent.blur(point);
  fireEvent.focus(screen.getByLabelText('Geração FV selecionada'));
  expect(screen.queryByText('12:00 · 75.0 kW FV')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Geração FV selecionada')).toHaveValue(75);
});

describe('DailyCurveEditor — editing tools', () => {
  it('displays real-time energetic KPIs and jumps to peak demand', () => {
    const values = new Array(96).fill(40);
    values[53] = 120; // 13:15 peak demand
    render(<DailyCurveEditor hourlyKw={values} onChange={vi.fn()} />);

    expect(screen.getByText('Consumo Diário Total')).toBeInTheDocument();
    expect(screen.getByText('Demanda de Pico (Consumo)')).toBeInTheDocument();
    expect(screen.getByText('120,0')).toBeInTheDocument();

    const jumpBtn = screen.getByRole('button', { name: /às 13:15/ });
    expect(jumpBtn).toBeInTheDocument();

    fireEvent.click(jumpBtn);
    expect(screen.getByLabelText('Horário selecionado')).toHaveValue('53');
    expect(screen.getByLabelText('Potência ativa')).toHaveValue(120);
  });

  it('provides quick stepper buttons (-5, -1, +1, +5 kW) in the inspector', () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '+5 kW' }));
    expect(screen.getByLabelText('Potência ativa')).toHaveValue(55);
    expect(onChange.mock.calls.at(-1)![0][48]).toBe(55);

    fireEvent.click(screen.getByRole('button', { name: '-1 kW' }));
    expect(screen.getByLabelText('Potência ativa')).toHaveValue(54);
    expect(onChange.mock.calls.at(-1)![0][48]).toBe(54);
  });

  it('performs batch editing across a time range', () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={onChange} />);

    // Configure batch to fix value 80 kW
    fireEvent.change(screen.getByLabelText('Operação'), { target: { value: 'set' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '32' } }); // 08:00
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '40' } }); // 10:00

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar à faixa selecionada' }));

    const updated = onChange.mock.calls.at(-1)![0];
    for (let i = 32; i <= 40; i++) {
      expect(updated[i]).toBe(80);
    }
    expect(updated[31]).toBe(50);
    expect(updated[41]).toBe(50);
  });

  it('supports undo and redo stack across edits', () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={onChange} />);

    const undoBtn = screen.getByRole('button', { name: /Desfazer/ });
    const redoBtn = screen.getByRole('button', { name: /Refazer/ });

    expect(undoBtn).toBeDisabled();
    expect(redoBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '+5 kW' }));
    expect(screen.getByLabelText('Potência ativa')).toHaveValue(55);
    expect(undoBtn).not.toBeDisabled();

    fireEvent.click(undoBtn);
    expect(screen.getByLabelText('Potência ativa')).toHaveValue(50);
    expect(redoBtn).not.toBeDisabled();

    fireEvent.click(redoBtn);
    expect(screen.getByLabelText('Potência ativa')).toHaveValue(55);
  });

  it('renders peak tariff band (18h-21h) and quick zoom presets', () => {
    render(<DailyCurveEditor hourlyKw={new Array(96).fill(50)} onChange={vi.fn()} />);

    expect(screen.getByText('Ponta (18h–21h)')).toBeInTheDocument();

    const solarZoomBtn = screen.getByRole('button', { name: 'Solar (6h–18h)' });
    fireEvent.click(solarZoomBtn);
    const range = screen.getByRole('status', { name: 'Período visível no gráfico diário' });
    expect(range.textContent).toContain('06:00');

    const fullZoomBtn = screen.getByRole('button', { name: '24h' });
    fireEvent.click(fullZoomBtn);
    expect(screen.getByRole('status', { name: 'Período visível no gráfico diário' }).textContent).toContain('00:00');
  });

  it('harmonizes isolated peaks with moving average smoothing button', () => {
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

it('restores and redoes clearing the curve through the same history', () => {
  render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Limpar curva' }));
  expect(screen.getByLabelText('Potência ativa')).toHaveValue(0);
  fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
  expect(screen.getByLabelText('Potência ativa')).toHaveValue(50);
  expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
  expect(screen.getByLabelText('Potência ativa')).toHaveValue(0);
});

it('keeps all editing tools disabled for read-only solar generation', () => {
  const onChange = vi.fn();
  render(<DailyCurveEditor hourlyKw={FLAT_24} solarKw={FLAT_24} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Geração FV' }));
  for (const name of ['Harmonizar picos', 'Limpar curva', '+5 kW', 'Aplicar à faixa selecionada']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  expect(onChange).not.toHaveBeenCalled();
});

it('does not cap batch edits at an arbitrary power limit', () => {
  const onChange = vi.fn();
  render(<DailyCurveEditor hourlyKw={new Array(24).fill(1500)} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar à faixa selecionada' }));
  expect(onChange.mock.calls.at(-1)![0][8]).toBe(1650);
});
