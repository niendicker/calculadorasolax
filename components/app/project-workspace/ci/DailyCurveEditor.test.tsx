// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(lastCall[11]).toBe(50); // untouched hours stay put
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

describe('DailyCurveEditor — modo de ajuste (Normal/Suave)', () => {
  function getModeButton(label: string) {
    return screen.getByRole('button', { name: label });
  }

  it('defaults to Normal mode', () => {
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
    expect(getModeButton('Normal')).toHaveAttribute('aria-pressed', 'true');
    expect(getModeButton('Suave')).toHaveAttribute('aria-pressed', 'false');
  });

  it('in Suave mode, dragging a point tapers the change into neighbors and stops exactly at the brush radius', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    fireEvent.click(getModeButton('Suave'));

    const point = getSlider(12);
    mockSvgRect(point);
    fireEvent.pointerDown(point, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(point, { pointerId: 1, clientY: 100 });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    const delta = result[12] - 50;
    expect(delta).not.toBe(0);

    // Raised-cosine falloff at BRUSH_RADIUS_HOURS=3: weight(1)=0.75, weight(2)=0.25, weight(3)=0.
    expect(result[11]).toBeCloseTo(50 + delta * 0.75, 1);
    expect(result[13]).toBeCloseTo(50 + delta * 0.75, 1);
    expect(result[10]).toBeCloseTo(50 + delta * 0.25, 1);
    expect(result[14]).toBeCloseTo(50 + delta * 0.25, 1);
    expect(result[9]).toBe(50); // distance 3 -> weight 0
    expect(result[15]).toBe(50);
    expect(result[0]).toBe(50); // well outside the radius
  });

  it('the brush falloff wraps past midnight', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    fireEvent.click(getModeButton('Suave'));

    const point = getSlider(23);
    mockSvgRect(point);
    fireEvent.pointerDown(point, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(point, { pointerId: 1, clientY: 100 });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    const delta = result[23] - 50;
    expect(delta).not.toBe(0);

    // Hour 0 is 1h from 23h going forward through midnight, hour 1 is 2h, hour 2 is 3h.
    expect(result[0]).toBeCloseTo(50 + delta * 0.75, 1);
    expect(result[1]).toBeCloseTo(50 + delta * 0.25, 1);
    expect(result[2]).toBe(50);
  });

  it('keyboard nudges also propagate to neighbors in Suave mode', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    fireEvent.click(getModeButton('Suave'));

    fireEvent.keyDown(getSlider(12), { key: 'ArrowUp' });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(51);
    expect(result[11]).toBeCloseTo(50.75, 1);
    expect(result[9]).toBe(50);
  });

  it('switching back to Normal mode only affects the dragged point again', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    fireEvent.click(getModeButton('Suave'));
    fireEvent.click(getModeButton('Normal'));

    fireEvent.keyDown(getSlider(12), { key: 'ArrowUp' });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(51);
    expect(result[11]).toBe(50);
  });
});
