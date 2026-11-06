// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (typeof window !== 'undefined') {
    window.matchMedia =
      window.matchMedia ||
      (() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }));

    window.HTMLCanvasElement.prototype.getContext = (() => {
      return {
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: [] }),
        putImageData: () => {},
        createImageData: () => ({}),
        setTransform: () => {},
        translate: () => {},
        drawImage: () => {},
        save: () => {},
        fillText: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        fill: () => {},
        clip: () => {},
        arc: () => {},
        scale: () => {},
        setLineDash: () => {},
        getLineDash: () => [],
        measureText: () => ({ width: 10 }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D;
    }) as unknown as typeof window.HTMLCanvasElement.prototype.getContext;
  }

  global.Path2D =
    global.Path2D ||
    class Path2D {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      rect() {}
    };
});

import uPlot from 'uplot';

describe('uPlot scale protection integration (real uPlot)', () => {
  it('protects x scale against rapid redraw calls before initial microtask commit', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const pointCount = 672;
    const pointsRef = { current: Array.from({ length: pointCount }, (_, i) => ({ powerKw: 50 + (i % 20) })) };

    const options: uPlot.Options = {
      width: 600,
      height: 240,
      scales: {
        x: {
          time: false,
          range: (_self, min, max) => {
            const fullMax = Math.max(pointsRef.current.length - 1, 0);
            return [min ?? 0, max ?? fullMax];
          },
        },
        y: {
          range: (_self, dataMin, dataMax) => [0, dataMax * 1.1],
        },
      },
      series: [
        {},
        {
          label: 'Potência',
          stroke: '#24506b',
        },
      ],
    };

    const data: uPlot.AlignedData = [
      pointsRef.current.map((_, i) => i),
      pointsRef.current.map((p) => p.powerKw),
    ];

    const chart = new uPlot(options, data, el);

    // Simulate immediate synchronous calls that occur during rapid React re-renders / prop sync
    chart.setData(data, false);
    chart.redraw(true, true);
    chart.redraw(false, false);
    chart.redraw();

    // Wait for microtask / animation frame commits
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The scale MUST NOT be [null, null]
    expect(chart.scales.x.min).toBe(0);
    expect(chart.scales.x.max).toBe(pointCount - 1);

    // Further updates must continue to preserve valid coordinates
    chart.setData(data, false);
    chart.redraw(true, true);
    expect(chart.scales.x.min).toBe(0);
    expect(chart.scales.x.max).toBe(pointCount - 1);

    chart.destroy();
    el.remove();
  });

  it('safely handles contractedDemandKw redraw and maintains valid scales', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const pointCount = 96;
    const pointsRef = { current: Array.from({ length: pointCount }, (_, i) => ({ powerKw: 30 })) };
    const contractedDemandKwRef = { current: 50 };

    const options: uPlot.Options = {
      width: 600,
      height: 240,
      scales: {
        x: {
          time: false,
          range: (_self, min, max) => {
            const fullMax = Math.max(pointsRef.current.length - 1, 0);
            return [min ?? 0, max ?? fullMax];
          },
        },
        y: {
          range: (_self, dataMin, dataMax) => {
            const contracted = contractedDemandKwRef.current;
            const targetMax = contracted && contracted > 0 ? Math.max(dataMax, contracted) : dataMax;
            return [Math.min(0, dataMin), targetMax * 1.08];
          },
        },
      },
      series: [{}, { stroke: '#24506b' }],
    };

    const data: uPlot.AlignedData = [
      pointsRef.current.map((_, i) => i),
      pointsRef.current.map((p) => p.powerKw),
    ];

    const chart = new uPlot(options, data, el);

    // Change contracted demand and trigger redraw(false, true)
    contractedDemandKwRef.current = 100;
    chart.redraw(false, true);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chart.scales.x.min).toBe(0);
    expect(chart.scales.x.max).toBe(pointCount - 1);
    expect(chart.scales.y.max).toBeCloseTo(100 * 1.08);

    chart.destroy();
    el.remove();
  });
});
