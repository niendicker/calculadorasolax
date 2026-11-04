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

  it('renders expanded floating badge for active/selected point with full hour and kW text', () => {
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
    // Hour 12 is selected by default
    const badgeText = screen.getByText('12:00 · 50.0 kW');
    expect(badgeText).toBeInTheDocument();

    const rect = badgeText.previousElementSibling as SVGRectElement;
    expect(rect).toBeInTheDocument();
    expect(rect).toHaveAttribute('width', '108');
    expect(rect).toHaveAttribute('height', '20');
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
  function getSmoothToggle() {
    return screen.getByRole('button', { name: /Suavizar/i });
  }

  it('defaults to Normal mode', () => {
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
    expect(getSmoothToggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('changes the point style when switching between Normal and Suave', () => {
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={vi.fn()} />);
    const point = getSlider(12);

    expect(point).toHaveAttribute('r', '7');
    expect(point).toHaveAttribute('fill', '#ffffff');
    expect(point).toHaveAttribute('stroke', '#24506b');

    fireEvent.click(getSmoothToggle());

    expect(point).toHaveAttribute('r', '8');
    expect(point).toHaveAttribute('fill', '#24506b');
    expect(point).toHaveAttribute('stroke', '#ffffff');

    fireEvent.click(getSmoothToggle());

    expect(point).toHaveAttribute('r', '7');
    expect(point).toHaveAttribute('fill', '#ffffff');
    expect(point).toHaveAttribute('stroke', '#24506b');
  });

  it('in Suave mode, gives the dragged point priority and tapers only the excess into neighbors', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    fireEvent.click(getSmoothToggle());

    const point = getSlider(12);
    mockSvgRect(point);
    fireEvent.pointerDown(point, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(point, { pointerId: 1, clientY: 100 });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    const delta = result[12] - 50;
    expect(delta).not.toBe(0);

    // The first 5 kW belong entirely to the dragged point. The excess uses
    // the raised-cosine falloff: weight(1)=0.75, weight(2)=0.25, weight(3)=0.
    const adjacentDelta = Math.sign(delta) * Math.max(0, Math.abs(delta) - 5);
    expect(result[11]).toBe(Math.round((50 + adjacentDelta * 0.75) * 10) / 10);
    expect(result[13]).toBe(Math.round((50 + adjacentDelta * 0.75) * 10) / 10);
    expect(result[10]).toBe(Math.round((50 + adjacentDelta * 0.25) * 10) / 10);
    expect(result[14]).toBe(Math.round((50 + adjacentDelta * 0.25) * 10) / 10);
    expect(result[9]).toBe(50); // distance 3 -> weight 0
    expect(result[15]).toBe(50);
    expect(result[0]).toBe(50); // well outside the radius
  });

  it('the brush falloff wraps past midnight', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    fireEvent.click(getSmoothToggle());

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
    expect(result[0]).toBe(Math.round((50 + adjacentDelta * 0.75) * 10) / 10);
    expect(result[1]).toBe(Math.round((50 + adjacentDelta * 0.25) * 10) / 10);
    expect(result[2]).toBe(50);
  });

  it('does not move neighbors for a sub-threshold keyboard nudge in Suave mode', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    fireEvent.click(getSmoothToggle());

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
    fireEvent.click(getSmoothToggle());

    fireEvent.keyDown(getSlider(12), { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(getSlider(12), { key: 'ArrowUp' });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(56);
    expect(result[11]).toBeCloseTo(50.75, 1); // (56 - 50) - 5, then × 0.75
    expect(result[10]).toBeCloseTo(50.25, 1);
    expect(result[9]).toBe(50);
  });

  it('switching back to Normal mode only affects the dragged point again', async () => {
    const onChange = vi.fn();
    render(<DailyCurveEditor hourlyKw={FLAT_24} onChange={onChange} />);
    fireEvent.click(getSmoothToggle());
    fireEvent.click(getSmoothToggle());

    fireEvent.keyDown(getSlider(12), { key: 'ArrowUp' });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(51);
    expect(result[11]).toBe(50);
  });

  it('moving UP in Suave mode only drags neighbors below, and pulls neighbors above only after passing them', async () => {
    const onChange = vi.fn();
    const initial = new Array(24).fill(50);
    initial[11] = 80; // above hour 12
    initial[13] = 30; // below hour 12
    render(<DailyCurveEditor hourlyKw={initial} onChange={onChange} />);
    fireEvent.click(getSmoothToggle());

    // Nudge hour 12 up to 65 kW (above initial 50, but still below hour 11 at 80)
    // 50 + 3 * 5 = 65 kW
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(getSlider(12), { key: 'ArrowUp', shiftKey: true });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(65);
    // Hour 13 (below, was 30) is pulled up: 30 + (65 - 50 - 5) * 0.75 = 37.5
    expect(result[13]).toBeCloseTo(37.5, 1);
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
    // 80 + (90 - 80) * 0.75 = 87.5
    expect(result[11]).toBeCloseTo(87.5, 1);
  });

  it('moving DOWN in Suave mode only drags neighbors above, and pulls neighbors below only after passing them', async () => {
    const onChange = vi.fn();
    const initial = new Array(24).fill(50);
    initial[11] = 80; // above hour 12
    initial[13] = 30; // below hour 12
    render(<DailyCurveEditor hourlyKw={initial} onChange={onChange} />);
    fireEvent.click(getSmoothToggle());

    // Nudge hour 12 down to 40 kW (below initial 50, but still above hour 13 at 30)
    // 50 - 2 * 5 = 40 kW
    for (let i = 0; i < 2; i++) {
      fireEvent.keyDown(getSlider(12), { key: 'ArrowDown', shiftKey: true });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let result = onChange.mock.calls.at(-1)![0] as number[];
    expect(result[12]).toBe(40);
    // Hour 11 (above, was 80) is pulled down: 80 - (50 - 40 - 5) * 0.75 = 76.25
    expect(result[11]).toBeCloseTo(76.25, 1);
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
    // 30 - (30 - 20) * 0.75 = 22.5
    expect(result[13]).toBeCloseTo(22.5, 1);
  });
});
