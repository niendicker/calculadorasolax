// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildManualDayCurve } from '@/supabase/functions/_shared/commercial-industrial/manual-day-curve';
import { defaultCiOptions } from '@/lib/store/defaults';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiLoadCurvePanel } from './CiLoadCurvePanel';

// Fake uPlot for jsdom (same mock pattern as LoadCurveChart.test.tsx)
vi.mock('uplot', () => ({
  default: class FakeUPlot {
    root = document.createElement('div');
    over = document.createElement('div');
    scales = { x: { min: 0, max: 671 }, y: { min: 0, max: 120 } };
    options: { hooks?: { draw?: ((self: unknown)=>void)[]; setScale?: ((self:unknown,key:string)=>void)[] } };
    constructor(opts: typeof this.options, data: number[][], target?: HTMLElement) {
      this.options=opts;
      this.scales.x.max=data[0].length-1;
      this.over.getBoundingClientRect=()=>({left:0,top:0,width:600,height:200} as DOMRect);
      this.root.appendChild(this.over);
      target?.appendChild(this.root);
    }
    posToVal(px:number,scale:string) { return scale==='y'?120-px/200*120:this.scales.x.min+px/600*(this.scales.x.max-this.scales.x.min); }
    valToPos(value:number,scale:string) { return scale==='y'?(120-value)/120*200:(value-this.scales.x.min)/(this.scales.x.max-this.scales.x.min)*600; }
    setScale(key: 'x', range: { min:number;max:number }) { this.scales[key]=range; this.options.hooks?.setScale?.forEach(hook=>hook(this,key)); this.redraw(); }
    setSelect() {}
    setData() {}
    setSize() {}
    redraw() { /* Geometry sync follows explicit range state changes in the chart. */ }
    destroy() { this.root.remove(); }
  },
}));

function ControlledPanel({ initial }: { initial?: Partial<CommercialIndustrialOptions> }) {
  const [ciOptions, setCiOptions] = useState<CommercialIndustrialOptions>({ ...defaultCiOptions, ...initial });
  return <CiLoadCurvePanel ciOptions={ciOptions} onChange={(partial) => setCiOptions((s) => ({ ...s, ...partial }))} />;
}

function openData() {
  const trigger = screen.getByRole('button', { name: 'Configurar dados' });
  if (trigger.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger);
}

function csvFile(content: string) {
  return new File([content], 'curva.csv', { type: 'text/csv' });
}

async function importFile(content: string) {
  openData();
  const input = screen.getByLabelText(/Importar CSV|Trocar arquivo/i, { selector: 'input' });
  fireEvent.change(input, { target: { files: [csvFile(content)] } });
}

describe('CiLoadCurvePanel', () => {
  it('defaults to 15 min resolution and America/Sao_Paulo, offering only the two Brazilian timezones', async () => {
    render(<ControlledPanel />);
    expect(screen.getByText(/672 pontos · 15 min/)).toBeInTheDocument();
    openData();
    const tzSelect = screen.getByRole('combobox', { name: 'Fuso horário' });
    expect(tzSelect).toHaveTextContent('Brasília (UTC-3)');
    fireEvent.click(tzSelect);
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Brasília (UTC-3)');
    expect(options[1]).toHaveTextContent('Manaus / Cuiabá (UTC-4)');
    fireEvent.pointerDown(options[1], {pointerType:'mouse'});
    fireEvent.click(options[1]);
    await waitFor(() => expect(tzSelect).toHaveTextContent('Manaus / Cuiabá (UTC-4)'));
  });

  it('renders unified period range selector button and opens custom calendar dropdown', () => {
    render(<ControlledPanel />);
    openData();
    const triggerBtn = screen.getByRole('button', { name: /Selecionar período/i });
    expect(triggerBtn).toBeInTheDocument();
    expect(triggerBtn).toHaveTextContent(/\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}/);
    expect(triggerBtn).toHaveTextContent('7 dias');

    // Click trigger to open custom calendar popover
    fireEvent.click(triggerBtn);
    expect(screen.getByRole('dialog', { name: /Calendário de seleção de período/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument();
  });

  it('renders Curva de carga heading without redundant Dimensionamento BESS header line', () => {
    render(<ControlledPanel />);
    expect(screen.queryByText('Dimensionamento BESS')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Curvas e aplicações' })).toBeInTheDocument();
  });

  it('imports a valid CSV and shows the weekly preview with measurements', async () => {
    render(<ControlledPanel />);
    const csv = 'timestamp,powerKva\n2026-01-01T00:00:00Z,10\n2026-01-01T01:00:00Z,20\n2026-01-01T02:00:00Z,15\n';
    await importFile(csv);
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar' }, { timeout: 4000 }));

    expect(screen.getByRole('button', { name: 'Configurar dados' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/3 pontos · 60 min/)).toBeInTheDocument();
    expect(screen.queryByText('Demanda máxima')).not.toBeInTheDocument();
  });

  it('shows errors for an invalid CSV and does not apply the curve', async () => {
    render(<ControlledPanel />);
    await importFile('not,a,valid,curve\n1,2,3,4\n');

    expect(await screen.findByText('Não foi possível importar o arquivo')).toBeInTheDocument();
  });

  it('removes an imported curve when requested', async () => {
    render(<ControlledPanel />);
    await importFile('timestamp,powerKva\n2026-01-01T00:00:00Z,10\n2026-01-01T01:00:00Z,20\n');
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText(/2 pontos/)).toBeVisible();
    openData();

    const removeBtn = screen.getByRole('button', { name: /Remover/i });
    fireEvent.click(removeBtn);

    await waitFor(
      () => {
        expect(screen.getByText(/Nenhuma curva de carga disponível para exibição/i)).toBeInTheDocument();
      },
      { timeout: 4000 }
    );
  });

  describe('csv export and template downloads', () => {
    it('downloads the sample template CSV', async () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:template');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

      render(<ControlledPanel />);
      openData();
      const btn = screen.getByRole('button', { name: /Baixar modelo/i });
      fireEvent.click(btn);

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:template');
    });

    it('exports the currently configured load curve as CSV', async () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:export');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

      render(<ControlledPanel />);
      await screen.findByRole('heading',{name:'Consumo e geração'});

      openData();
      const exportBtn = screen.getByRole('button', { name: /Exportar/i });
      fireEvent.click(exportBtn);

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:export');
    });
  });

  describe('wizard navigation', () => {
    it('calls onNavigatePrev and onNavigateNext when clicked', async () => {
      const onNavigatePrev = vi.fn();
      const onNavigateNext = vi.fn();

      render(
        <CiLoadCurvePanel
          ciOptions={defaultCiOptions}
          onChange={vi.fn()}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={onNavigateNext}
        />
      );

      const prevBtn = screen.getByRole('button', { name: /Voltar para/i });
      fireEvent.click(prevBtn);
      expect(onNavigatePrev).toHaveBeenCalledOnce();

      // Next button disabled when existing load curve prop is null
      const nextBtn = screen.getByRole('button', { name: /Avançar para Tarifa/i });
      expect(nextBtn).toBeDisabled();
    });
  });
});

describe('weekly curve workspace', () => {
  function manualCurve() {
    const result = buildManualDayCurve(Array(96).fill(50), Array(96).fill(20), {
      resolutionMinutes: 15, timezone: 'America/Manaus', periodStart: '2026-01-05', periodEnd: '2026-01-11',
    }, 'custom');
    if (!result.ok) throw new Error('Invalid fixture');
    return result.curve;
  }

  async function editMonday() {
    const days = await screen.findByRole('group', { name: 'Dias visíveis' });
    fireEvent.click(within(days).getByRole('button', { name: /seg/ }));
    return screen.findByRole('slider', { name: /Consumo · seg.*12:00/ });
  }

  function openPopup(label: string) {
    fireEvent.click(screen.getByRole('button', {name:'Opções do gráfico'}));
    fireEvent.click(screen.getByRole('button', {name:label}));
  }
  function chooseCurveAction(label: string) {
    openPopup('Editar curva');
    fireEvent.click(screen.getByRole('button', {name:label}));
  }
  function linkDays(names: RegExp[]) {
    openPopup('Vincular dias');
    names.forEach(name=>fireEvent.click(within(screen.getByRole('dialog',{name:'Vincular dias'})).getByRole('button',{name})));
    fireEvent.keyDown(screen.getByRole('dialog',{name:'Vincular dias'}),{key:'Escape'});
  }

  it('starts with one weekly chart and keeps file actions secondary', async () => {
    render(<ControlledPanel initial={{ loadCurve: manualCurve() }} />);
    expect(await screen.findByRole('group', { name: 'Dias visíveis' })).toBeInTheDocument();
    expect(screen.getByLabelText('Resumo dos dados da curva')).toHaveTextContent('Perfil manual · 05/01/2026 a 11/01/2026 · 15 min');
    expect(screen.getAllByTestId('period-chart-surface')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Dia' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Dia de referência')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todos os dias' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Mover janela do tempo' })).toBeInTheDocument();
    openData();
    const settings = screen.getByRole('region', { name: 'Configuração dos dados da curva' });
    expect(screen.getByRole('button', { name: 'Configurar dados' })).toHaveAttribute('aria-controls', settings.id);
    expect(within(settings).getByRole('heading', { name: 'Período e fuso' })).toBeVisible();
    expect(within(settings).getByRole('heading', { name: 'Arquivos CSV' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar dados' }));
    expect(settings).not.toBeVisible();
    expect(screen.getByLabelText('Resumo dos dados da curva')).toBeVisible();
  });

  it('synchronizes day filters and timeline without changing project data', async () => {
    const onChange = vi.fn();
    render(<CiLoadCurvePanel ciOptions={{ ...defaultCiOptions, loadCurve: manualCurve() }} onChange={onChange} />);
    const days = await screen.findByRole('group', { name: 'Dias visíveis' });
    fireEvent.click(within(days).getByRole('button', { name: /qua/ }));
    expect(screen.getByRole('slider', { name: 'Início da janela do tempo' })).toHaveAttribute('aria-valuenow', '192');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Mover janela do tempo' }), { key: 'ArrowRight', shiftKey: true });
    expect(within(days).getByRole('button', { name: /qui/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(days).getByRole('button', { name: /qua/ })).toHaveAttribute('aria-pressed', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('links only subsequent edits, persists per-date changes, and supports undo/redo', async () => {
    const saved = manualCurve();
    const onSave = vi.fn();
    function Panel() {
      const [options,setOptions] = useState<CommercialIndustrialOptions>({ ...defaultCiOptions, loadCurve: saved });
      return <CiLoadCurvePanel ciOptions={options} onChange={partial=>{onSave(partial);setOptions(previous=>({...previous,...partial}));}} />;
    }
    const view = render(<Panel/>);
    await editMonday();
    const point = () => screen.getByRole('slider', { name: /Consumo · seg.*12:00/ });
    linkDays([/seg/,/qua/]);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(point(), { key: 'ArrowUp', shiftKey: true });
    await waitFor(()=>expect(onSave).toHaveBeenCalled());
    const updated = onSave.mock.calls.at(-1)![0].loadCurve;
    expect(updated.points[48].powerKw).toBe(55);
    expect(updated.points[240].powerKw).toBe(55);
    expect(updated.points[144].powerKw).toBe(50);
    expect(updated.points[49].powerKw).toBe(50);
    expect(screen.getByRole('combobox', {name:'Perfil base'})).toHaveTextContent('Personalizado');
    chooseCurveAction('Desfazer');
    await waitFor(()=>expect(point()).toHaveAttribute('aria-valuenow','50'));
    chooseCurveAction('Refazer');
    await waitFor(()=>expect(point()).toHaveAttribute('aria-valuenow','55'));
    view.unmount();
    render(<ControlledPanel initial={{ loadCurve: updated }}/>);
    expect(await editMonday()).toHaveAttribute('aria-valuenow','55');
    openData();
    fireEvent.click(screen.getByRole('combobox', {name:'Fuso horário'}));
    const zone = await screen.findByRole('option', {name:'Brasília (UTC-3)'});
    fireEvent.pointerDown(zone, {pointerType:'mouse'});
    fireEvent.click(zone);
    expect(await editMonday()).toHaveAttribute('aria-valuenow','55');
  }, 15000);

  it('keeps grouped days independent of navigation and allows editing CSV at its original resolution', async () => {
    const curve = { ...manualCurve(), source: 'csv' as const, manualConfig: undefined };
    const onChange = vi.fn();
    render(<CiLoadCurvePanel ciOptions={{ ...defaultCiOptions, loadCurve: curve }} onChange={onChange}/>);
    await editMonday();
    linkDays([/seg/,/ter/,/qua/,/qui/,/sex/]);
    const days = screen.getByRole('group', { name: 'Dias visíveis' });
    fireEvent.click(within(days).getByRole('button', { name: /ter/ }));
    expect(screen.getByRole('button',{name:/Editando juntos: seg.*ter.*qua/})).toBeInTheDocument();
    fireEvent.click(within(days).getByRole('button', { name: /seg/ }));
    fireEvent.keyDown(screen.getByRole('slider', { name: /Consumo · seg.*12:00/ }), { key: 'ArrowUp' });
    const edited = onChange.mock.calls.at(-1)![0].loadCurve;
    expect(edited.source).toBe('csv');
    expect(edited.resolutionMinutes).toBe(curve.resolutionMinutes);
    expect(edited.points.map((p: {timestamp:string})=>p.timestamp)).toEqual(curve.points.map(p=>p.timestamp));
    expect(edited.points[48].powerKw).toBe(51);
    expect(edited.points[5*96+48].powerKw).toBe(20);
  });

  it('edits PV without changing imported consumption', async () => {
    const curve = { ...manualCurve(), source: 'csv' as const, manualConfig: undefined };
    const onChange = vi.fn();
    render(<CiLoadCurvePanel ciOptions={{ ...defaultCiOptions, loadCurve: curve, solar: { ...defaultCiOptions.solar!, enabled:true,installedPowerKwp:50 } }} onChange={onChange}/>);
    await editMonday();
    chooseCurveAction('Fotovoltaico');
    fireEvent.keyDown(screen.getByRole('slider',{name:/Fotovoltaico · seg.*12:00/}),{key:'ArrowUp'});
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.every(([partial])=>!('loadCurve' in partial))).toBe(true);
    expect(onChange.mock.calls.at(-1)![0].solar.generationCurve.manualConfig).toBeUndefined();
  });
});
