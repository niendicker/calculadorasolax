// @vitest-environment jsdom

import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    scales = { x: { min: 0, max: 1 } };
    constructor(_opts: unknown, _data: unknown, target?: HTMLElement) {
      target?.appendChild(this.root);
    }
    posToVal() {
      return 0;
    }
    setScale() {}
    setSelect() {}
    setData() {}
    setSize() {}
    redraw() {}
    destroy() {
      this.root.remove();
    }
  },
}));

function ControlledPanel({ initial }: { initial?: Partial<CommercialIndustrialOptions> }) {
  const [ciOptions, setCiOptions] = useState<CommercialIndustrialOptions>({ ...defaultCiOptions, ...initial });
  return <CiLoadCurvePanel ciOptions={ciOptions} onChange={(partial) => setCiOptions((s) => ({ ...s, ...partial }))} />;
}

function openData() {
  const trigger = screen.getByRole('button', { name: 'Período e CSV' });
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
  it('defaults to 15 min resolution and America/Sao_Paulo, offering only the two Brazilian timezones', () => {
    render(<ControlledPanel />);
    expect(screen.getByText(/672 pontos · 15 min/)).toBeInTheDocument();
    openData();
    const tzSelect = screen.getByLabelText('Fuso horário') as HTMLSelectElement;
    expect(tzSelect.value).toBe('America/Sao_Paulo');

    const options = Array.from(tzSelect.querySelectorAll('option'));
    expect(options).toHaveLength(2);
    expect(options[0].value).toBe('America/Sao_Paulo');
    expect(options[0].textContent).toBe('Brasília (UTC-3)');
    expect(options[1].value).toBe('America/Manaus');
    expect(options[1].textContent).toBe('Manaus / Cuiabá (UTC-4)');

    fireEvent.change(tzSelect, { target: { value: 'America/Manaus' } });
    expect(tzSelect.value).toBe('America/Manaus');
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
    fireEvent.click(await screen.findByRole('button', { name: 'Importar dados' }, { timeout: 4000 }));

    expect(screen.getByRole('button', { name: 'Período e CSV' })).toHaveAttribute('aria-expanded', 'false');
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
    fireEvent.click(await screen.findByRole('button', { name: 'Importar dados' }));
    expect(await screen.findByText(/2 pontos/)).toBeVisible();
    openData();

    const removeBtn = screen.getByRole('button', { name: /Remover curva/i });
    fireEvent.click(removeBtn);

    await waitFor(
      () => {
        expect(screen.getByText(/Nenhuma curva de carga disponível para exibição/i)).toBeInTheDocument();
      },
      { timeout: 4000 }
    );
  });

  describe('manual curve editing', () => {
    it('defaults to "Comércio e serviços" preset with 96 quarter-hour sliders and preview', async () => {
      render(<ControlledPanel />);
      const baseSelect = screen.getByLabelText('Perfil base');
      expect(baseSelect).toHaveValue('comercio');

      expect(screen.getAllByRole('slider')).toHaveLength(96);
      expect(await screen.findByRole('heading',{name:'Consumo e geração'})).toBeInTheDocument();
      expect(screen.getByText(/672 pontos · 15 min/)).toBeInTheDocument();
    });

    it('selecting a different preset updates the curve and slider values', async () => {
      render(<ControlledPanel />);
      const baseSelect = screen.getByLabelText('Perfil base');

      fireEvent.change(baseSelect, { target: { value: 'industria-1-turno' } });
      expect(baseSelect).toHaveValue('industria-1-turno');

      // 10h in industria-1-turno is 100 kW
      expect(screen.getByRole('slider', { name: 'Potência às 10:00' })).toHaveAttribute('aria-valuenow', '100');
    });

    it('toggles between weekday and weekend patterns', async () => {
      render(<ControlledPanel />);
      const baseSelect = screen.getByLabelText('Perfil base');
      fireEvent.change(baseSelect, { target: { value: 'industria-1-turno' } });

      expect(screen.getByRole('slider', { name: 'Potência às 10:00' })).toHaveAttribute('aria-valuenow', '100');

      const daySelect = screen.getByLabelText('Dia de referência') as HTMLSelectElement;
      const weekend = [...daySelect.options].find(option => option.text.includes('Fim de semana'))!;
      const weekday = [...daySelect.options].find(option => option.text.includes('Dia útil'))!;
      fireEvent.change(daySelect, { target: { value: weekend.value } });
      expect(screen.getByRole('slider', { name: 'Potência às 10:00' })).toHaveAttribute('aria-valuenow', '10');

      fireEvent.change(daySelect, { target: { value: weekday.value } });
      expect(screen.getByRole('slider', { name: 'Potência às 10:00' })).toHaveAttribute('aria-valuenow', '100');
    });

    it('editing a graph point marks preset as "Personalizado"', async () => {
      render(<ControlledPanel />);
      const baseSelect = screen.getByLabelText('Perfil base');
      expect(baseSelect).toHaveValue('comercio');

      const point = screen.getByRole('slider', { name: 'Potência às 12:00' });
      for (let n = 0; n < 16; n++) fireEvent.keyDown(point, { key: 'ArrowUp', shiftKey: true });
      await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });

      expect(baseSelect).toHaveValue('custom');
      expect(screen.getByRole('slider', { name: 'Potência às 12:00' })).toHaveAttribute('aria-valuenow', '150');
    });

    it('restores manual curve editor with saved presets and hours when reopening the panel', async () => {
      const initialManualCurve = {
        resolutionMinutes: 15 as const,
        timezone: 'America/Sao_Paulo',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-07',
        profileBasis: 'representative_period' as const,
        source: 'manual' as const,
        points: [{ timestamp: '2026-01-01T00:00:00Z', powerKw: 50 }],
        manualConfig: {
          presetId: 'industria-1-turno',
          weekdayKw: [8, 8, 8, 8, 8, 8, 20, 90, 100, 100, 100, 100, 95, 100, 100, 100, 95, 60, 20, 10, 8, 8, 8, 8],
          weekendKw: new Array(24).fill(10),
        },
      };

      render(<ControlledPanel initial={{ loadCurve: initialManualCurve }} />);

      const baseSelect = screen.getByLabelText('Perfil base');
      expect(baseSelect).toHaveValue('industria-1-turno');
      expect(screen.getAllByRole('slider')).toHaveLength(96);
      expect(screen.getByLabelText('Dia de referência')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Fim de semana' })).not.toBeInTheDocument();
    });
  });

  describe('csv export and template downloads', () => {
    it('downloads the sample template CSV', async () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:template');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

      render(<ControlledPanel />);
      openData();
      const btn = screen.getByRole('button', { name: /Baixar CSV modelo/i });
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
      const exportBtn = screen.getByRole('button', { name: /Exportar CSV/i });
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

describe('unified curve workspace', () => {
  it('keeps period and file controls secondary and preserves data when collapsing them', () => {
    render(<ControlledPanel />);
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Fuso horário' })).not.toBeInTheDocument();
    openData();
    fireEvent.change(screen.getByLabelText('Fuso horário'), { target: { value: 'America/Manaus' } });
    fireEvent.click(screen.getByRole('button', { name: 'Período e CSV' }));
    expect(screen.queryByRole('combobox', { name: 'Fuso horário' })).not.toBeInTheDocument();
    openData();
    expect(screen.getByLabelText('Fuso horário')).toHaveValue('America/Manaus');
  });

  it('edits the weekend profile when the saved period contains only weekend days', async () => {
    const built = buildManualDayCurve(Array(96).fill(50), Array(96).fill(20), {
      resolutionMinutes: 15, timezone: 'America/Sao_Paulo', periodStart: '2026-11-07', periodEnd: '2026-11-08',
    }, 'custom');
    if (!built.ok) throw new Error('Invalid fixture');
    const onChange = vi.fn();
    render(<CiLoadCurvePanel ciOptions={{ ...defaultCiOptions, loadCurve: built.curve }} onChange={onChange} />);
    expect(screen.getByLabelText('Dia de referência')).toHaveValue('2026-11-07');
    const point = screen.getByRole('slider', { name: 'Potência às 12:00' });
    expect(point).toHaveAttribute('aria-valuenow', '20');
    for (let n = 0; n < 3; n++) fireEvent.keyDown(point, { key: 'ArrowUp', shiftKey: true });
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    const curve = onChange.mock.calls.at(-1)![0].loadCurve;
    expect(curve.manualConfig.weekendKw[48]).toBe(35);
    expect(curve.manualConfig.weekdayKw[48]).toBe(50);
  });

  function manualCurve() {
    const result = buildManualDayCurve(Array(96).fill(50), Array(96).fill(20), {
      resolutionMinutes: 30, timezone: 'America/Manaus', periodStart: '2026-01-05', periodEnd: '2026-01-11',
    }, 'custom');
    if (!result.ok) throw new Error('Invalid test curve');
    return result.curve;
  }

  function markMorning() {
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar intervalo' }));
    const svg = screen.getByRole('group', { name: /Seleção de intervalo da curva diária/ });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, width: 640, height: 235, right: 640, bottom: 235, toJSON: () => ({}) });
    const x = (index: number) => 54 + index / 95 * (640 - 54 - 14);
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: x(32), clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: x(39), clientY: 100 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: x(39), clientY: 100 });
  }

  it('applies the selected reference day to backup and preserves it when switching views', async () => {
    const onChange = vi.fn();
    const curve = manualCurve();
    render(<CiLoadCurvePanel ciOptions={{ ...defaultCiOptions, loadCurve: curve }} onChange={onChange} canAccessCiBackup />);
    expect(screen.queryByText('Prévia da semana')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Dia de referência'), { target: { value: '2026-01-07' } });
    markMorning();
    const apply = await screen.findByRole('button', { name: 'Usar período A para backup' });
    expect(within(screen.getByRole('complementary', { name: 'Ações da seleção' })).getByRole('button', { name: 'Usar período A para backup' })).toBe(apply);
    expect(screen.queryByLabelText('Início do intervalo diário')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fim do intervalo diário')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Método de backup do período A'), { target: { value: 'maximum' } });
    fireEvent.click(apply);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      backup: expect.objectContaining({ autonomyHours: 2, targetPowerKw: 50, curveSelection: {
        method: 'maximum', startTimestamp: '2026-01-07T12:00:00.000Z', endTimestampExclusive: '2026-01-07T14:00:00.000Z',
      } }),
    }));
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Período' }));
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dia' }));
    expect(screen.getByRole('button', { name: 'Usar período A para backup' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Dia de referência'), { target: { value: '2026-01-08' } });
    expect(screen.queryByRole('button', { name: 'Usar período A para backup' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers interval comparison without backup actions to users without access', async () => {
    const onChange = vi.fn();
    render(<CiLoadCurvePanel ciOptions={{ ...defaultCiOptions, loadCurve: manualCurve() }} onChange={onChange} />);
    markMorning();
    expect(await screen.findByRole('region',{name:'Resumo do intervalo selecionado'})).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /para backup/ })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('preserves imported samples while viewing days, exporting, and editing only PV', async () => {
    const curve = { ...manualCurve(), source: 'csv' as const, manualConfig: undefined };
    const onChange = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue('blob:full-curve');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    render(<CiLoadCurvePanel ciOptions={{ ...defaultCiOptions, loadCurve: curve, solar: { ...defaultCiOptions.solar!, enabled: true, installedPowerKwp: 50 } }} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Período' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Dia' }));
    fireEvent.change(screen.getByLabelText('Dia de referência'), { target: { value: '2026-01-08' } });
    expect(onChange).not.toHaveBeenCalled();
    openData();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const text = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    expect(text.split('\n')).toHaveLength(curve.points.length + 1);
    expect(text).toContain(curve.points.at(-1)!.timestamp);
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil FV' }));
    expect(screen.getByRole('button', { name: 'Consumo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar curva' }));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.every(([partial]) => !('loadCurve' in partial))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Período' }));
    expect(screen.getByText(/336 pontos/)).toBeInTheDocument();
  });
});
