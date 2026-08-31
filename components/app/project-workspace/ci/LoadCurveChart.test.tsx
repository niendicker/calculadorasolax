// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadCurvePoint } from '@/supabase/functions/_shared/commercial-industrial/types';
import { LoadCurveChart } from './LoadCurveChart';

// jsdom has no real <canvas> 2D context, so the real uPlot would throw as
// soon as it tries to draw. This fake tracks just enough (constructor args,
// setData/setSize/destroy calls) to verify LoadCurveChart's own wiring —
// not uPlot's rendering, which is out of scope for a unit test here.
const { instances } = vi.hoisted(() => ({ instances: [] as FakeUPlotInstance[] }));

interface FakeUPlotInstance {
  options: unknown;
  data: unknown;
  target: HTMLElement | undefined;
  root: HTMLElement;
  setDataCalls: unknown[];
  setSizeCalls: unknown[];
  destroyed: boolean;
}

vi.mock('uplot', () => ({
  default: class FakeUPlot {
    root = document.createElement('div');
    private record: FakeUPlotInstance;

    constructor(options: unknown, data: unknown, target?: HTMLElement) {
      target?.appendChild(this.root);
      this.record = { options, data, target, root: this.root, setDataCalls: [], setSizeCalls: [], destroyed: false };
      instances.push(this.record);
    }
    setData(data: unknown) {
      this.record.setDataCalls.push(data);
    }
    setSize(size: unknown) {
      this.record.setSizeCalls.push(size);
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
    render(<LoadCurveChart points={samplePoints} />);

    expect(instances).toHaveLength(1);
    expect(instances[0].data).toEqual([
      [0, 1, 2],
      [10, 12, 8],
    ]);
  });

  it('mounts the chart into its own container element', () => {
    const { container } = render(<LoadCurveChart points={samplePoints} />);
    expect(instances[0].target).toBe(container.firstChild);
  });

  it('calls setData (not a full recreate) when points change after mount', () => {
    const { rerender } = render(<LoadCurveChart points={samplePoints} />);

    const updatedPoints = [...samplePoints, point('2026-01-05T00:45:00Z', 20)];
    rerender(<LoadCurveChart points={updatedPoints} />);

    expect(instances).toHaveLength(1); // no new instance created, same one updated
    expect(instances[0].setDataCalls.at(-1)).toEqual([
      [0, 1, 2, 3],
      [10, 12, 8, 20],
    ]);
  });

  it('destroys the chart on unmount', () => {
    const { unmount } = render(<LoadCurveChart points={samplePoints} />);
    const instance = instances.at(-1)!;

    unmount();

    expect(instance.destroyed).toBe(true);
  });

  it('renders nothing when there are no points', () => {
    const { container } = render(<LoadCurveChart points={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(instances).toHaveLength(0);
  });
});
