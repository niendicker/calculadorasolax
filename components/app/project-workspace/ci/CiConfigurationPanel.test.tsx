// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultCiOptions } from '@/lib/store/defaults';
import type { CiBessProductRecord } from '@/lib/data/ci-bess-products-repository';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiConfigurationPanel } from './CiConfigurationPanel';

const { listActiveCiBessProducts } = vi.hoisted(() => ({ listActiveCiBessProducts: vi.fn() }));
vi.mock('@/lib/data/ci-bess-products-repository', () => ({ listActiveCiBessProducts }));

function makeProduct(partial: Partial<CiBessProductRecord> & Pick<CiBessProductRecord, 'id' | 'model'>): CiBessProductRecord {
  return {
    manufacturer: 'Acme',
    description: '',
    active: true,
    module_power_kw: 50,
    module_capacity_kwh: 100,
    efficiency_percent: 95,
    soc_min_percent: 10,
    soc_max_percent: 100,
    warranty_years: 10,
    image_url: null,
    documents: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

function ControlledPanel({ initial }: { initial?: Partial<CommercialIndustrialOptions> }) {
  const [ciOptions, setCiOptions] = useState<CommercialIndustrialOptions>({ ...defaultCiOptions, ...initial });
  return <CiConfigurationPanel ciOptions={ciOptions} onChange={(partial) => setCiOptions((s) => ({ ...s, ...partial }))} />;
}

describe('CiConfigurationPanel', () => {
  it('shows a loading skeleton, then the active products', async () => {
    listActiveCiBessProducts.mockResolvedValue([makeProduct({ id: 'p1', model: 'PowerStack 50' })]);
    render(<ControlledPanel />);
    expect(screen.getByLabelText('Carregando baterias')).toBeInTheDocument();
    expect(await screen.findByText('PowerStack 50')).toBeInTheDocument();
  });

  it('shows an error message when the catalog fails to load', async () => {
    listActiveCiBessProducts.mockRejectedValue(new Error('falha de rede'));
    render(<ControlledPanel />);
    expect(await screen.findByText('falha de rede')).toBeInTheDocument();
  });

  it('shows an empty-catalog message with no active products', async () => {
    listActiveCiBessProducts.mockResolvedValue([]);
    render(<ControlledPanel />);
    expect(await screen.findByText(/Nenhum produto BESS ativo cadastrado/)).toBeInTheDocument();
  });

  it('selects and deselects a product on click', async () => {
    listActiveCiBessProducts.mockResolvedValue([
      makeProduct({ id: 'p1', model: 'PowerStack 50' }),
      makeProduct({ id: 'p2', model: 'VoltCube' }),
    ]);
    render(<ControlledPanel />);
    const card = await screen.findByRole('button', { name: /PowerStack 50/ });
    expect(card).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(card);
    await waitFor(() => expect(card).toHaveAttribute('aria-pressed', 'true'));

    fireEvent.click(card);
    await waitFor(() => expect(card).toHaveAttribute('aria-pressed', 'false'));
  });

  it('shows auto sizing enabled by default, opens advanced customization, and edits values', async () => {
    listActiveCiBessProducts.mockResolvedValue([]);
    render(<ControlledPanel />);
    await screen.findByText(/Nenhum produto BESS ativo cadastrado/);

    expect(screen.getByText('Dimensionamento automático ativado')).toBeInTheDocument();
    expect(screen.getByText(/A calculadora simula cenários de 1 a 6 módulos/)).toBeInTheDocument();

    // Advanced inputs are initially hidden in default auto mode
    expect(screen.queryByLabelText('Mínimo')).not.toBeInTheDocument();

    // Click to expand customization
    fireEvent.click(screen.getByRole('button', { name: /Ajustar faixa ou quantidade fixa/ }));
    expect(screen.getByLabelText('Mínimo')).toHaveValue(1);
    expect(screen.getByLabelText('Máximo')).toHaveValue(6);

    // Edit range
    fireEvent.change(screen.getByLabelText('Mínimo'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Máximo'), { target: { value: '8' } });
    expect(screen.getByLabelText('Mínimo')).toHaveValue(2);
    expect(screen.getByLabelText('Máximo')).toHaveValue(8);

    // Switch to fixed quantity mode
    fireEvent.click(screen.getByRole('button', { name: 'Quantidade fixa' }));
    expect(screen.getByLabelText('Módulos')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Módulos'), { target: { value: '3' } });
    expect(screen.getByLabelText('Módulos')).toHaveValue(3);
    expect(screen.getByText('Quantidade fixa: 3 módulo(s)')).toBeInTheDocument();
  });

  it('triggers onNavigateNext when a product is selected and next button is clicked', async () => {
    const onNavigateNext = vi.fn();
    listActiveCiBessProducts.mockResolvedValue([makeProduct({ id: 'p1', model: 'PowerStack 50' })]);

    const { rerender } = render(
      <CiConfigurationPanel
        ciOptions={{ ...defaultCiOptions, bessProductId: 'p1' }}
        onChange={vi.fn()}
        onNavigateNext={onNavigateNext}
      />
    );

    await screen.findByText('PowerStack 50');

    const nextButton = screen.getByRole('button', { name: /Avançar para Curva de carga/i });
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);
    expect(onNavigateNext).toHaveBeenCalledTimes(1);

    // Disabled when no product selected
    rerender(
      <CiConfigurationPanel
        ciOptions={{ ...defaultCiOptions, bessProductId: null }}
        onChange={vi.fn()}
        onNavigateNext={onNavigateNext}
      />
    );
    expect(screen.getByRole('button', { name: /Avançar para Curva de carga/i })).toBeDisabled();
  });
});
