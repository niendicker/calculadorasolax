// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadCurvePoint } from '@/supabase/functions/_shared/commercial-industrial/types';
import { LoadCurveChart } from './LoadCurveChart';

// jsdom has no real <canvas> 2D context, so the real uPlot would throw as
// soon as it tries to draw. This fake tracks just enough (constructor args,
// setData/setSize/destroy calls, and the `over` element pan/zoom/selection
// are wired against) to verify LoadCurveChart's own wiring — not uPlot's
// rendering or coordinate math, which is out of scope for a unit test here.
const { instances } = vi.hoisted(() => ({ instances: [] as FakeUPlotInstance[] }));

interface FakeUPlotInstance {
  options: unknown;
  data: unknown;
  target: HTMLElement | undefined;
  root: HTMLElement;
  over: HTMLElement;
  setDataCalls: unknown[];
  setSizeCalls: unknown[];
  setSelectCalls: unknown[];
  setScaleCalls: unknown[];
  redrawCalls: unknown[];
  destroyed: boolean;
  chart: unknown;
}

vi.mock('uplot', () => ({
  default: class FakeUPlot {
    root = document.createElement('div');
    over = document.createElement('div');
    scales = { x: { min: 0, max: 1 } };
    bbox = { top: 10, height: 200 };
    ctx = {
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    private record: FakeUPlotInstance;

    constructor(options: unknown, data: unknown, target?: HTMLElement) {
      target?.appendChild(this.root);
      this.record = {
        options,
        data,
        target,
        root: this.root,
        over: this.over,
        setDataCalls: [],
        setSizeCalls: [],
        setSelectCalls: [],
        setScaleCalls: [],
        redrawCalls: [],
        destroyed: false,
        chart: this,
      };
      instances.push(this.record);
    }
    // A simple, deterministic linear mapping (not uPlot's real scale math —
    // that's the library's own concern) so selection tests can pick distinct
    // pixel positions and assert on the resulting index range.
    posToVal(px: number) {
      return px / 10;
    }
    valToPos(value: number) {
      return value * 10;
    }
    setScale(key: string, opts: unknown) {
      this.record.setScaleCalls.push(opts);
    }
    setSelect(opts: unknown) {
      this.record.setSelectCalls.push(opts);
    }
    setData(data: unknown) {
      this.record.setDataCalls.push(data);
    }
    setSize(size: unknown) {
      this.record.setSizeCalls.push(size);
    }
    redraw(rebuildPaths?: boolean, recalcAxes?: boolean) {
      this.record.redrawCalls.push([rebuildPaths, recalcAxes]);
    }
    destroy() {
      this.record.destroyed = true;
      this.root.remove();
    }
  },
}));

function point(isoTimestamp: string, powerKw: number): LoadCurvePoint {
  return { timestamp: isoTimestamp, powerKw };
}

const samplePoints: LoadCurvePoint[] = [
  point('2026-01-05T00:00:00Z', 10),
  point('2026-01-05T00:15:00Z', 12),
  point('2026-01-05T00:30:00Z', 8),
];

type TestChartOptions = {
  axes: Array<{
    splits: (...args: unknown[]) => number[];
    values: (_self: unknown, ticks: number[]) => string[];
  }>;
  series: Array<{
    value: (_self: unknown, rawValue?: number | null) => string;
    fill?: (self: never) => unknown;
  }>;
  hooks: {
    setScale: Array<(self: never, key: string) => void>;
    draw: Array<(self: never) => void>;
  };
};

let resizeCallback: (() => void) | null = null;
let nextAnimationFrameId = 1;
const animationFrames = new Map<number, FrameRequestCallback>();

function chartOptions(instance: FakeUPlotInstance = instances.at(-1)!): TestChartOptions {
  return instance.options as TestChartOptions;
}

function chartObject(instance: FakeUPlotInstance = instances.at(-1)!) {
  return instance.chart as {
    bbox: { top: number; height: number };
    ctx: { fillRect: ReturnType<typeof vi.fn>; createLinearGradient: ReturnType<typeof vi.fn> };
    scales: { x: { min: number | null; max: number | null } };
  };
}

function mockChartRect(over: HTMLElement, width = 300, height = 240) {
  vi.spyOn(over, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

function flushAnimationFrames() {
  const callbacks = Array.from(animationFrames.values());
  animationFrames.clear();
  callbacks.forEach((callback) => callback(0));
}

beforeEach(() => {
  instances.length = 0;
  resizeCallback = null;
  animationFrames.clear();
  nextAnimationFrameId = 1;
  vi.stubGlobal(
    'ResizeObserver',
    class TestResizeObserver {
      constructor(callback: unknown) {
        resizeCallback = callback as () => void;
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextAnimationFrameId++;
    animationFrames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    animationFrames.delete(id);
  });
});

describe('LoadCurveChart', () => {
  it('creates a uPlot instance with aligned [index[], powerKw[]] data', () => {
    render(<LoadCurveChart points={samplePoints} resolutionMinutes={15} />);

    expect(instances).toHaveLength(1);
    expect(instances[0].data).toEqual([
      [0, 1, 2],
      [10, 12, 8],
    ]);
  });

  it('mounts the chart into its own container element', () => {
    const { container } = render(<LoadCurveChart points={samplePoints} resolutionMinutes={15} />);
    expect(instances[0].target).toBe(container.querySelector('.relative > div'));
  });

  it('calls setData (not a full recreate) when points change after mount', () => {
    const { rerender } = render(<LoadCurveChart points={samplePoints} resolutionMinutes={15} />);

    const updatedPoints = [...samplePoints, point('2026-01-05T00:45:00Z', 20)];
    rerender(<LoadCurveChart points={updatedPoints} resolutionMinutes={15} />);

    expect(instances).toHaveLength(1); // no new instance created, same one updated
    expect(instances[0].setDataCalls.at(-1)).toEqual([
      [0, 1, 2, 3],
      [10, 12, 8, 20],
    ]);
  });

  it('destroys the chart on unmount', () => {
    const { unmount } = render(<LoadCurveChart points={samplePoints} resolutionMinutes={15} />);
    const instance = instances.at(-1)!;

    unmount();

    expect(instance.destroyed).toBe(true);
  });

  it('renders nothing when there are no points', () => {
    const { container } = render(<LoadCurveChart points={[]} resolutionMinutes={15} />);

    expect(container).toBeEmptyDOMElement();
    expect(instances).toHaveLength(0);
  });

  it('configures axis, legend and area-fill formatters for boundary and fallback cases', () => {
    const points = [
      point('2026-01-05T00:00:00', 10),
      point('2026-01-05T01:30:00', 12),
      point('2026-01-06T00:00:00', 8),
    ];
    render(<LoadCurveChart points={points} resolutionMinutes={60} />);

    const instance = instances[0];
    const options = chartOptions(instance);
    const chart = chartObject(instance);
    const axis = options.axes[0];

    expect(axis.splits({}, 0, 0, 2)).toEqual([0, 2]);
    expect(axis.splits({}, 0, 0, 1)).toHaveLength(6);
    expect(axis.splits({}, 0, 1, 1)).toEqual([1]);
    expect(axis.values({}, [0, 1, 2, 99])).toHaveLength(4);
    expect(options.axes[1].values({}, [0, 2.5])).toEqual(['0 kW', '2.5 kW']);
    expect(options.series[0].value({}, 1)).toContain('01:30');
    expect(options.series[1].value({}, null)).toBe('—');
    expect(options.series[1].value({}, 12.345)).toBe('12.35 kW');

    const fill = options.series[1].fill!;
    expect(fill(chart as never)).toBeDefined();
    chart.bbox = { top: Number.NaN, height: Number.NaN };
    expect(fill(chart as never)).toBeDefined();
    expect(chart.ctx.createLinearGradient).toHaveBeenCalledTimes(2);
  });

  it('tracks zoom state and exposes a button to restore the full x range', () => {
    render(<LoadCurveChart points={samplePoints} resolutionMinutes={15} />);

    const instance = instances[0];
    const chart = chartObject(instance);
    const setScale = chartOptions(instance).hooks.setScale[0];

    act(() => {
      chart.scales.x = { min: 0, max: 1 };
      setScale(instance.chart as never, 'y');
      setScale(instance.chart as never, 'x');
    });
    expect(screen.getByRole('button', { name: 'Redefinir zoom' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Redefinir zoom' }));
    expect(instance.setScaleCalls.at(-1)).toEqual({ min: 0, max: 2 });

    act(() => {
      chart.scales.x = { min: 0, max: 2 };
      setScale(instance.chart as never, 'x');
    });
    expect(screen.queryByRole('button', { name: 'Redefinir zoom' })).not.toBeInTheDocument();
  });

  it('pauses wheel zoom updates into one animation frame and clamps both zoom directions', () => {
    const manyPoints = Array.from({ length: 30 }, (_, index) => point(`2026-01-05T${String(index).padStart(2, '0')}:00:00Z`, index + 1));
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);

    const instance = instances[0];
    const chart = chartObject(instance);
    chart.scales.x = { min: 0, max: 29 };
    mockChartRect(instance.over);

    fireEvent.wheel(instance.over, { clientX: 150, deltaY: -100 });
    fireEvent.wheel(instance.over, { clientX: 150, deltaY: 100 });
    expect(instance.setScaleCalls).toHaveLength(0);

    flushAnimationFrames();
    expect(instance.setScaleCalls).toHaveLength(1);
    const range = instance.setScaleCalls[0] as { min: number; max: number };
    expect(range.min).toBeGreaterThanOrEqual(0);
    expect(range.max).toBeLessThanOrEqual(29);
    expect(range.max - range.min).toBeGreaterThan(0);
  });

  it('resets a pending wheel frame on unmount and ignores unavailable x scales', () => {
    const { unmount } = render(<LoadCurveChart points={samplePoints} resolutionMinutes={15} />);
    const instance = instances[0];
    const chart = chartObject(instance);
    mockChartRect(instance.over);

    chart.scales.x = { min: null, max: null };
    fireEvent.wheel(instance.over, { clientX: 100, deltaY: -100 });
    expect(animationFrames.size).toBe(0);

    chart.scales.x = { min: 0, max: 2 };
    fireEvent.wheel(instance.over, { clientX: 100, deltaY: -100 });
    expect(animationFrames.size).toBe(1);
    unmount();
    expect(animationFrames.size).toBe(0);
    flushAnimationFrames();
    expect(instance.setScaleCalls).toHaveLength(0);
  });

  it('resizes the chart and clears pinned selections', () => {
    render(<LoadCurveChart points={samplePoints.concat(point('2026-01-05T00:45:00Z', 20))} resolutionMinutes={15} />);
    const instance = instances[0];
    mockChartRect(instance.over);

    fireEvent.mouseDown(instance.over, { button: 0, shiftKey: true, clientX: 0 });
    fireEvent.mouseMove(document, { clientX: 30 });
    fireEvent.mouseUp(document, { clientX: 30 });
    expect(screen.getByRole('button', { name: /Limpar/ })).toBeInTheDocument();

    const target = instance.target!;
    Object.defineProperty(target, 'clientWidth', { configurable: true, value: 640 });
    act(() => resizeCallback?.());

    expect(instance.setSizeCalls.at(-1)).toEqual({ width: 640, height: 240 });
    expect(instance.setSelectCalls.at(-1)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    expect(screen.queryByRole('button', { name: /Limpar/ })).not.toBeInTheDocument();
  });
});

describe('shift+drag range selection', () => {
  // powerKw = index + 1, so a slice's min/max/energy are easy to predict.
  const manyPoints: LoadCurvePoint[] = Array.from({ length: 30 }, (_, i) => point(`2026-01-05T${String(i).padStart(2, '0')}:00:00Z`, i + 1));

  function mockOverRect(over: HTMLElement) {
    vi.spyOn(over, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 300,
      height: 240,
      right: 300,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }

  it('selects a range and shows its summary stats', () => {
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const over = instances.at(-1)!.over;
    mockOverRect(over);

    // The fake's posToVal(px) = px/10, so clientX 100->250 maps to index 10->25.
    fireEvent.mouseDown(over, { button: 0, shiftKey: true, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 250 });
    fireEvent.mouseUp(document, { clientX: 250 });

    expect(screen.getByText(/\(16 pontos\)/)).toBeInTheDocument(); // indices 10..25 inclusive
    expect(screen.getByText('26.00 kW')).toBeInTheDocument(); // peak, index 25 -> 26
    expect(screen.getByText('11.00 kW')).toBeInTheDocument(); // min, index 10 -> 11
    expect(screen.getByText('296.00 kWh')).toBeInTheDocument(); // sum(11..26) * 1h
  });

  it('a plain click (sub-threshold drag) with shift held clears an existing selection', () => {
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const over = instances.at(-1)!.over;
    mockOverRect(over);

    fireEvent.mouseDown(over, { button: 0, shiftKey: true, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 250 });
    fireEvent.mouseUp(document, { clientX: 250 });
    expect(screen.getByRole('button', { name: /Limpar/ })).toBeInTheDocument();

    fireEvent.mouseDown(over, { button: 0, shiftKey: true, clientX: 100 });
    fireEvent.mouseUp(document, { clientX: 101 });
    expect(screen.queryByRole('button', { name: /Limpar/ })).not.toBeInTheDocument();
  });

  it('"Limpar" clears the selection', () => {
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const over = instances.at(-1)!.over;
    mockOverRect(over);

    fireEvent.mouseDown(over, { button: 0, shiftKey: true, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 250 });
    fireEvent.mouseUp(document, { clientX: 250 });

    fireEvent.click(screen.getByRole('button', { name: /Limpar/ }));
    expect(screen.queryByText(/pontos\)/)).not.toBeInTheDocument();
  });

  it('a plain drag without shift pans instead of selecting', () => {
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const over = instances.at(-1)!.over;
    mockOverRect(over);

    fireEvent.mouseDown(over, { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 250 });
    fireEvent.mouseUp(document, { clientX: 250 });

    expect(screen.queryByText(/pontos\)/)).not.toBeInTheDocument();
  });

  it('clears the selection when the underlying points change', () => {
    const { rerender } = render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const over = instances.at(-1)!.over;
    mockOverRect(over);

    fireEvent.mouseDown(over, { button: 0, shiftKey: true, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 250 });
    fireEvent.mouseUp(document, { clientX: 250 });
    expect(screen.getByRole('button', { name: /Limpar/ })).toBeInTheDocument();

    rerender(<LoadCurveChart points={[...manyPoints, point('2026-01-06T00:00:00Z', 99)]} resolutionMinutes={60} />);
    expect(screen.queryByRole('button', { name: /Limpar/ })).not.toBeInTheDocument();
  });

  function dragSelect(over: HTMLElement, startX: number, endX: number) {
    fireEvent.mouseDown(over, { button: 0, shiftKey: true, clientX: startX });
    fireEvent.mouseMove(document, { clientX: endX });
    fireEvent.mouseUp(document, { clientX: endX });
  }

  it('a second shift+drag pins a comparison period B and shows a side-by-side table with a delta column', () => {
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const over = instances.at(-1)!.over;
    mockOverRect(over);

    dragSelect(over, 100, 250); // A: indices 10..25 -> values 11..26
    dragSelect(over, 10, 50); // B: indices 1..5 -> values 2..6

    expect(screen.getByText(/Período A/)).toBeInTheDocument();
    expect(screen.getByText(/Período B/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Limpar/ })).toHaveLength(2);

    // Peak: A=26, B=6 -> delta -20.00 kW (-76.9%)
    expect(screen.getByText('26.00 kW')).toBeInTheDocument();
    expect(screen.getByText('6.00 kW')).toBeInTheDocument();
    expect(screen.getByText('-20.00 kW (-76.9%)')).toBeInTheDocument();
  });

  it('a third shift+drag replaces only B, leaving A as the fixed baseline', () => {
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const over = instances.at(-1)!.over;
    mockOverRect(over);

    dragSelect(over, 100, 250); // A: values 11..26
    dragSelect(over, 10, 50); // B: values 2..6
    dragSelect(over, 0, 20); // replaces B: indices 0..2 -> values 1..3

    expect(screen.getByText(/Período A/)).toHaveTextContent('seg'); // still the original A range
    expect(screen.getByText('26.00 kW')).toBeInTheDocument(); // A's peak unchanged
    expect(screen.getByText('3.00 kW')).toBeInTheDocument(); // B's new peak
    expect(screen.queryByText('6.00 kW')).not.toBeInTheDocument(); // B's old peak is gone
  });

  it("each period's own Limpar clears just that slot", () => {
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const over = instances.at(-1)!.over;
    mockOverRect(over);

    dragSelect(over, 100, 250); // A
    dragSelect(over, 10, 50); // B

    fireEvent.click(screen.getAllByRole('button', { name: /Limpar/ })[0]); // clears A
    expect(screen.queryByText(/Período/)).not.toBeInTheDocument(); // back to plain single-selection view
    expect(screen.getByText('Seleção:', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('6.00 kW')).toBeInTheDocument(); // B survived
  });

  it('double-click clears both pinned periods', () => {
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const over = instances.at(-1)!.over;
    mockOverRect(over);

    dragSelect(over, 100, 250); // A
    dragSelect(over, 10, 50); // B
    expect(screen.getAllByRole('button', { name: /Limpar/ })).toHaveLength(2);

    fireEvent.dblClick(over);
    expect(screen.queryByRole('button', { name: /Limpar/ })).not.toBeInTheDocument();
  });
});

describe('pan/zoom stability across data updates', () => {
  const manyPoints: LoadCurvePoint[] = Array.from({ length: 30 }, (_, i) => point(`2026-01-05T${String(i).padStart(2, '0')}:00:00Z`, i + 1));

  it('does not call setData/setScale again on initial mount (the constructor call already has the right data)', () => {
    // Regression test: the points-sync effect runs in the same commit as the
    // mount effect that just constructed the chart from this exact data. In
    // real uPlot, calling setData/setScale there re-reads the x-scale before
    // uPlot's own deferred (microtask) commit has applied it, permanently
    // corrupting it to null/null — the chart then draws axes but no line at
    // all. The fake here can't reproduce that corruption (it doesn't model
    // uPlot's internal commit timing), but it can and must verify the actual
    // guard against it: no data/scale calls beyond the constructor on mount.
    // The selections-sync effect's own redraw(false, false) call IS expected
    // here (it always fires once on mount, same as this one) — but that
    // variant calls commit() directly instead of re-reading/writing the
    // x-scale, so it doesn't carry the same corruption risk.
    render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const instance = instances.at(-1)!;

    expect(instance.setDataCalls).toHaveLength(0);
    expect(instance.redrawCalls).toEqual([[false, false]]);
    expect(instance.setScaleCalls).toHaveLength(0);
  });

  it('does not touch the x-scale when a same-length points update happens (e.g. live drag-editing a manual curve)', () => {
    const { rerender } = render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const instance = instances.at(-1)!;

    const tweaked = manyPoints.map((pt, i) => (i === 5 ? { ...pt, powerKw: 999 } : pt));
    rerender(<LoadCurveChart points={tweaked} resolutionMinutes={60} />);

    expect(instance.setDataCalls.at(-1)).toEqual([
      manyPoints.map((_, i) => i),
      tweaked.map((pt) => pt.powerKw),
    ]);
    expect(instance.setScaleCalls).toHaveLength(0); // whatever pan/zoom the user had stays untouched
    expect(instance.redrawCalls.at(-1)).toEqual([true, true]); // still repaints with the new data
  });

  it('resets to the full view when the point count changes (a genuinely different curve)', () => {
    const { rerender } = render(<LoadCurveChart points={manyPoints} resolutionMinutes={60} />);
    const instance = instances.at(-1)!;

    const reshaped = [...manyPoints, point('2026-01-06T00:00:00Z', 5)];
    rerender(<LoadCurveChart points={reshaped} resolutionMinutes={60} />);

    expect(instance.setScaleCalls.at(-1)).toEqual({ min: 0, max: reshaped.length - 1 });
  });
});
