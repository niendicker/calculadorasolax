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

  it('shows the fixed-quantity input by default and updates it', async () => {
    listActiveCiBessProducts.mockResolvedValue([]);
    render(<ControlledPanel />);
    await screen.findByText(/Nenhum produto BESS ativo cadastrado/);

    const moduleInput = screen.getByLabelText('Módulos');
    expect(moduleInput).toHaveValue(1);
    fireEvent.change(moduleInput, { target: { value: '4' } });
    expect(moduleInput).toHaveValue(4);
  });

  it('switches to the auto range and edits min/max modules', async () => {
    listActiveCiBessProducts.mockResolvedValue([]);
    render(<ControlledPanel />);
    await screen.findByText(/Nenhum produto BESS ativo cadastrado/);

    fireEvent.click(screen.getByRole('button', { name: 'Faixa automática' }));
    expect(screen.queryByLabelText('Módulos')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mínimo'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Máximo'), { target: { value: '8' } });
    expect(screen.getByLabelText('Mínimo')).toHaveValue(2);
    expect(screen.getByLabelText('Máximo')).toHaveValue(8);
  });
});
