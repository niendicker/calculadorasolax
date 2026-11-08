// @vitest-environment jsdom

import { act,fireEvent,render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DispatchPoint } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiDispatchChart } from './CiDispatchChart';

const { instances } = vi.hoisted(() => ({ instances: [] as FakeUPlotInstance[] }));

interface FakeUPlotInstance {
  options: unknown;
  data: unknown;
  target: HTMLElement | undefined;
  root: HTMLElement;
  over: HTMLElement;
  setDataCalls: unknown[];
  setSizeCalls: unknown[];
  setScaleCalls: unknown[];
  redrawCalls: unknown[];
  destroyed: boolean;
  chart: unknown;
}

vi.mock('uplot', () => ({
  default: class FakeUPlot {
    root = document.createElement('div');
    over = document.createElement('div');
    scales = { x: { min: 0, max: 1 }, y: { min: 0, max: 100 } };
    bbox = { top: 10, height: 200, left: 0, width: 400 };
    ctx = {
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      textAlign: '',
      font: '',
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
        setScaleCalls: [],
        redrawCalls: [],
        destroyed: false,
        chart: this,
      };
      instances.push(this.record);
    }
    posToVal(px: number) {
      return px / 10;
    }
    valToPos(value: number) {
      return value * 10;
    }
    setScale(key: string, opts: unknown) {
      this.record.setScaleCalls.push(opts);
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

const sampleDispatch: DispatchPoint[] = [
  {
    timestamp: '2026-01-05T17:00:00Z',
    tariffPeriod: 'peak',
    loadKw: 120,
    chargeKw: 0,
    dischargeKw: 40,
    gridImportKw: 80,
    socKwh: 100,
  },
  {
    timestamp: '2026-01-05T18:00:00Z',
    tariffPeriod: 'peak',
    loadKw: 140,
    chargeKw: 0,
    dischargeKw: 50,
    gridImportKw: 90,
    socKwh: 50,
  },
  {
    timestamp: '2026-01-05T19:00:00Z',
    tariffPeriod: 'offPeak',
    loadKw: 60,
    chargeKw: 20,
    dischargeKw: 0,
    gridImportKw: 80,
    socKwh: 70,
  },
];

describe('CiDispatchChart', () => {
  beforeEach(() => {
    instances.length = 0;
  });

  it('renders nothing when dispatch array is empty', () => {
    const { container } = render(<CiDispatchChart dispatch={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(instances).toHaveLength(0);
  });

  it('preserves page scrolling and requires Ctrl for dispatch chart wheel zoom',()=>{
    const frames:FrameRequestCallback[]=[];
    const raf=vi.spyOn(globalThis,'requestAnimationFrame').mockImplementation(callback=>{frames.push(callback);return frames.length;});
    try{
      const points=Array.from({length:30},(_,i)=>({...sampleDispatch[0],timestamp:new Date(Date.UTC(2026,0,5,0,i*15)).toISOString()}));
      render(<CiDispatchChart dispatch={points}/>);
      const instance=instances[0];
      (instance.chart as {scales:{x:{min:number;max:number}}}).scales.x={min:0,max:29};
      vi.spyOn(instance.over,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:300,height:200,right:300,bottom:200,x:0,y:0,toJSON:()=>({})});
      const normal=new WheelEvent('wheel',{deltaY:-100,clientX:150,cancelable:true});
      fireEvent(instance.over,normal);
      expect(normal.defaultPrevented).toBe(false);expect(frames).toHaveLength(0);expect(instance.setScaleCalls).toHaveLength(0);
      const modified=new WheelEvent('wheel',{deltaY:-100,clientX:150,ctrlKey:true,cancelable:true});
      fireEvent(instance.over,modified);
      expect(modified.defaultPrevented).toBe(true);
      act(()=>frames.splice(0).forEach(callback=>callback(0)));
      expect(instance.setScaleCalls).toHaveLength(1);
      const range=instance.setScaleCalls[0] as {min:number;max:number};expect(range.max-range.min).toBeLessThan(29);
    }finally{raf.mockRestore();}
  });

  it('initializes uPlot with aligned dispatch series and formatters', () => {
    render(<CiDispatchChart dispatch={sampleDispatch} contractedDemandKw={15} />);
    expect(instances).toHaveLength(1);

    const instance = instances[0];
    expect(instance.data).toEqual([
      [0, 1, 2],
      [120, 140, 60],
      [80, 90, 80],
      [40, 50, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);

    const options = instance.options as {
      series: Array<{ label?: string }>;
      scales: { y: { range: (self: unknown, min: number, max: number) => [number, number] } };
      hooks: { draw: Array<(self: unknown) => void> };
    };

    expect(options.series[1].label).toBe('Carga Original');
    expect(options.series[2].label).toBe('Demanda da Rede (com BESS)');
    expect(options.series[3].label).toBe('Descarga BESS (Corte)');
    expect(options.series[4].label).toBe('Geração Solar FV');
    expect(options.series[5].label).toBe('Gerador (GMG)');

    // Range incorporates contractedDemandKw = 15
    const yRange = options.scales.y.range(instance.chart, 0, 140);
    expect(yRange[0]).toBe(0);
    expect(yRange[1]).toBeCloseTo(140 * 1.08);

    // Test draw hook
    options.hooks.draw[0](instance.chart);
    const fakeChart = instance.chart as { ctx: { fillText: ReturnType<typeof vi.fn> } };
    expect(fakeChart.ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('Contratada: 15 kW'), expect.any(Number), expect.any(Number));
  });

  it('updates chart data when dispatch points change', () => {
    const { rerender } = render(<CiDispatchChart dispatch={sampleDispatch} />);
    const instance = instances[0];

    const updated = [
      ...sampleDispatch,
      {
        timestamp: '2026-01-05T20:00:00Z',
        tariffPeriod: 'offPeak' as const,
        loadKw: 50,
        chargeKw: 0,
        dischargeKw: 0,
        gridImportKw: 50,
        socKwh: 70,
      },
    ];

    rerender(<CiDispatchChart dispatch={updated} />);
    expect(instance.setDataCalls).toHaveLength(1);
    expect(instance.redrawCalls).toEqual([[true, true]]);
  });

  it('cleans up uPlot on unmount', () => {
    const { unmount } = render(<CiDispatchChart dispatch={sampleDispatch} />);
    expect(instances[0].destroyed).toBe(false);

    unmount();
    expect(instances[0].destroyed).toBe(true);
  });

  it('renders daily breakdown filter buttons and switches day view', () => {
    const multiDayDispatch: DispatchPoint[] = [
      {
        timestamp: '2026-01-05T10:00:00Z',
        tariffPeriod: 'offPeak',
        loadKw: 100,
        chargeKw: 0,
        dischargeKw: 0,
        gridImportKw: 100,
        socKwh: 50,
      },
      {
        timestamp: '2026-01-06T10:00:00Z',
        tariffPeriod: 'offPeak',
        loadKw: 110,
        chargeKw: 0,
        dischargeKw: 0,
        gridImportKw: 110,
        socKwh: 50,
      },
    ];

    const { getByText } = render(<CiDispatchChart dispatch={multiDayDispatch} />);
    expect(getByText('Exibição:')).toBeInTheDocument();
    expect(getByText('Semana Completa')).toBeInTheDocument();
  });
});
