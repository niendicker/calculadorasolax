// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
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
}

vi.mock('uplot', () => ({
  default: class FakeUPlot {
    root = document.createElement('div');
    over = document.createElement('div');
    scales = { x: { min: 0, max: 1 } };
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
      };
      instances.push(this.record);
    }
    // A simple, deterministic linear mapping (not uPlot's real scale math —
    // that's the library's own concern) so selection tests can pick distinct
    // pixel positions and assert on the resulting index range.
    posToVal(px: number) {
      return px / 10;
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

beforeEach(() => {
  instances.length = 0;
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
