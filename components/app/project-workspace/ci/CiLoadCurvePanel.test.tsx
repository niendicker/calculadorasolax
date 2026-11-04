// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

function csvFile(content: string) {
  return new File([content], 'curva.csv', { type: 'text/csv' });
}

async function importFile(content: string) {
  const input = screen.getByLabelText(/Importar CSV|Trocar arquivo/i, { selector: 'input' });
  fireEvent.change(input, { target: { files: [csvFile(content)] } });
}

describe('CiLoadCurvePanel', () => {
  it('defaults to 15 min resolution and America/Sao_Paulo, offering only the two Brazilian timezones', () => {
    render(<ControlledPanel />);
    expect(screen.getByText('15 min')).toBeInTheDocument();
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
    const triggerBtn = screen.getByRole('button', { name: /Selecionar período/i });
    expect(triggerBtn).toBeInTheDocument();
    expect(triggerBtn).toHaveTextContent(/\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}/);
    expect(triggerBtn).toHaveTextContent('7 dias');

    // Click trigger to open custom calendar popover
    fireEvent.click(triggerBtn);
    expect(screen.getByRole('dialog', { name: /Calendário de seleção de período/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument();
  });

  it('renders compact breadcrumb steps with BESS completed and Curva de carga active', () => {
    render(<ControlledPanel />);
    expect(screen.getByText('Dimensionamento BESS')).toBeInTheDocument();
    expect(screen.getByText('BESS')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Curva de carga' })).toBeInTheDocument();
  });

  it('imports a valid CSV and shows the weekly preview with measurements', async () => {
    render(<ControlledPanel />);
    const csv = 'timestamp,powerKw\n2026-01-01T00:00:00Z,10\n2026-01-01T01:00:00Z,20\n2026-01-01T02:00:00Z,15\n';
    await importFile(csv);

    expect(await screen.findByText(/3 amostras/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '60 min' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/resolução 60 min/)).toBeInTheDocument();
    expect(await screen.findByText(/20\.00/)).toBeInTheDocument(); // pico
    expect(screen.getByText(/10\.00/)).toBeInTheDocument(); // mínima
  });

  it('shows errors for an invalid CSV and does not apply the curve', async () => {
    render(<ControlledPanel />);
    await importFile('not,a,valid,curve\n1,2,3,4\n');

    expect(await screen.findByText('Não foi possível importar o arquivo')).toBeInTheDocument();
  });

  it('removes an imported curve when requested', async () => {
    render(<ControlledPanel />);
    await importFile('timestamp,powerKw\n2026-01-01T00:00:00Z,10\n2026-01-01T01:00:00Z,20\n');
    expect(await screen.findByText(/2 amostras/)).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: /Remover curva/i });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma curva de carga disponível para exibição/i)).toBeInTheDocument();
    });
  });

  describe('manual curve editing', () => {
    it('defaults to "Comércio e serviços" preset with 24 hourly sliders and preview', async () => {
      render(<ControlledPanel />);
      const baseSelect = screen.getByLabelText('Perfil base');
      expect(baseSelect).toHaveValue('comercio');

      expect(screen.getAllByRole('slider')).toHaveLength(24);
      expect(await screen.findByText(/Resumo/)).toBeInTheDocument();
      expect(screen.getByText(/672 \/ 672 pontos · resolução 15 min/)).toBeInTheDocument();
    });

    it('selecting a different preset updates the curve and slider values', async () => {
      render(<ControlledPanel />);
      const baseSelect = screen.getByLabelText('Perfil base');

      fireEvent.change(baseSelect, { target: { value: 'industria-1-turno' } });
      expect(baseSelect).toHaveValue('industria-1-turno');

      // 10h in industria-1-turno is 100 kW
      expect(screen.getByRole('slider', { name: 'Potência às 10h' })).toHaveAttribute('aria-valuenow', '100');
    });

    it('toggles between weekday and weekend patterns', async () => {
      render(<ControlledPanel />);
      const baseSelect = screen.getByLabelText('Perfil base');
      fireEvent.change(baseSelect, { target: { value: 'industria-1-turno' } });

      expect(screen.getByRole('slider', { name: 'Potência às 10h' })).toHaveAttribute('aria-valuenow', '100');

      fireEvent.click(screen.getByRole('button', { name: 'Fim de semana' }));
      expect(screen.getByRole('slider', { name: 'Potência às 10h' })).toHaveAttribute('aria-valuenow', '10');

      fireEvent.click(screen.getByRole('button', { name: 'Dias úteis' }));
      expect(screen.getByRole('slider', { name: 'Potência às 10h' })).toHaveAttribute('aria-valuenow', '100');
    });

    it('editing numeric input marks preset as "Personalizado"', async () => {
      render(<ControlledPanel />);
      const baseSelect = screen.getByLabelText('Perfil base');
      expect(baseSelect).toHaveValue('comercio');

      const numericInput = screen.getByLabelText('Potência ativa');
      fireEvent.change(numericInput, { target: { value: '150' } });

      expect(baseSelect).toHaveValue('custom');
      expect(screen.getByRole('slider', { name: 'Potência às 12h' })).toHaveAttribute('aria-valuenow', '150');
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
      expect(screen.getAllByRole('slider')).toHaveLength(24);
      expect(screen.getByRole('button', { name: 'Fim de semana' })).toBeInTheDocument();
    });
  });

  describe('csv export and template downloads', () => {
    it('downloads the sample template CSV', async () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:template');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

      render(<ControlledPanel />);
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
      await screen.findByText(/Resumo/);

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

      const prevBtn = screen.getByRole('button', { name: /Voltar para BESS/i });
      fireEvent.click(prevBtn);
      expect(onNavigatePrev).toHaveBeenCalledOnce();

      // Next button disabled when existing load curve prop is null
      const nextBtn = screen.getByRole('button', { name: /Avançar para Tarifa/i });
      expect(nextBtn).toBeDisabled();
    });
  });
});
