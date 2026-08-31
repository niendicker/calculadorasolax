// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultCiOptions } from '@/lib/store/defaults';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiLoadCurvePanel } from './CiLoadCurvePanel';

// jsdom has no real <canvas> 2D context, so the real uPlot would throw as
// soon as it tries to draw — mock it the same way other tests here mock
// heavy/unsupported dependencies (e.g. buildProjectQuotePdfBlob in
// SinglePageApp.test.tsx) instead of trying to make canvas work in jsdom.
// LoadCurveChart.test.tsx covers the chart itself in more detail.
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
    setData() {}
    setSize() {}
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
  it('defaults to 15 min resolution and America/Sao_Paulo', () => {
    render(<ControlledPanel />);
    expect(screen.getByRole('button', { name: '15 min' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Fuso horário')).toHaveValue('America/Sao_Paulo');
  });

  it('imports a valid CSV and shows the normalized summary', async () => {
    render(<ControlledPanel />);
    fireEvent.click(screen.getByRole('button', { name: '60 min' }));

    const csv = 'timestamp,powerKw\n2026-01-01T00:00:00Z,10\n2026-01-01T01:00:00Z,20\n2026-01-01T02:00:00Z,15\n';
    await importFile(csv);

    expect(await screen.findByText('Resumo')).toBeInTheDocument();
    expect(screen.getByText('20.00 kW')).toBeInTheDocument(); // pico
    expect(screen.getByText('10.00 kW')).toBeInTheDocument(); // mínima
    expect(screen.getByText(/3 \/ 672 pontos · resolução 60 min/)).toBeInTheDocument();
  });

  it('shows errors for an invalid CSV and never surfaces a summary', async () => {
    render(<ControlledPanel />);
    await importFile('not,a,valid,curve\n1,2,3,4\n');

    expect(await screen.findByText('Não foi possível importar o arquivo')).toBeInTheDocument();
    expect(screen.queryByText('Resumo')).not.toBeInTheDocument();
  });

  it('removes an imported curve', async () => {
    render(<ControlledPanel />);
    fireEvent.click(screen.getByRole('button', { name: '60 min' }));
    await importFile('timestamp,powerKw\n2026-01-01T00:00:00Z,10\n2026-01-01T01:00:00Z,20\n');
    await screen.findByText('Resumo');

    fireEvent.click(screen.getByRole('button', { name: 'Remover curva' }));
    await waitFor(() => expect(screen.queryByText('Resumo')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Remover curva' })).not.toBeInTheDocument();
  });
});
