// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EnergyTariffResult } from '@/lib/tariff/aneel-service';
import { AutomaticTariffPanel } from './AutomaticTariffPanel';

const tariffs: EnergyTariffResult = {
  distributor: 'Distribuidora Teste',
  subgroup: 'B1',
  tariffMode: 'Branca',
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
  source: 'ANEEL',
  fetchedAt: '2026-01-15T12:30:00.000Z',
  tariffs: { peak: 1.35, intermediate: 1.05, offPeak: 0.85 },
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof AutomaticTariffPanel>> = {}) {
  const props: React.ComponentProps<typeof AutomaticTariffPanel> = {
    distributor: '',
    setDistributor: vi.fn(),
    distributors: [],
    loadingDistributors: false,
    accessantAgent: '',
    setAccessantAgent: vi.fn(),
    accessantAgents: [],
    loadingAccessantAgents: false,
    subgroup: '',
    setSubgroup: vi.fn(),
    tariffMode: '',
    setTariffMode: vi.fn(),
    referenceDate: '',
    loadingReferenceDate: false,
    tariffs: null,
    loading: false,
    error: null,
    onFetchTariffs: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...render(<AutomaticTariffPanel {...props} />), props };
}

describe('AutomaticTariffPanel', () => {
  it('shows loading and unavailable-date states while required data is missing', () => {
    renderPanel({ loadingDistributors: true, loadingReferenceDate: true });

    expect(screen.getByPlaceholderText('Carregando...')).toBeDisabled();
    expect(screen.getByText('Carregando distribuidoras...')).toBeInTheDocument();
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar tarifas da ANEEL' })).toBeDisabled();
  });

  it('filters distributors and propagates all selection changes', () => {
    const setDistributor = vi.fn();
    const setAccessantAgent = vi.fn();
    const setSubgroup = vi.fn();
    const setTariffMode = vi.fn();
    const onFetchTariffs = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      distributor: 'ener',
      setDistributor,
      distributors: ['Energisa', 'Enel', 'Copel'],
      accessantAgents: ['Rede Teste'],
      setAccessantAgent,
      setSubgroup,
      setTariffMode,
      subgroup: 'B1',
      tariffMode: 'Branca',
      referenceDate: '2026-01-15',
      onFetchTariffs,
    });

    fireEvent.focus(screen.getByLabelText('Distribuidora *'));
    fireEvent.click(screen.getByRole('button', { name: 'Energisa' }));
    fireEvent.change(screen.getByLabelText('Agente acessante (opcional)'), { target: { value: 'Rede Teste' } });
    fireEvent.change(screen.getByLabelText('Subgrupo tarifário *'), { target: { value: 'B2' } });
    fireEvent.change(screen.getByLabelText('Modalidade tarifária *'), { target: { value: 'Verde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar tarifas da ANEEL' }));

    expect(setDistributor).toHaveBeenCalledWith('Energisa');
    expect(setAccessantAgent).toHaveBeenCalledWith('Rede Teste');
    expect(setSubgroup).toHaveBeenCalledWith('B2');
    expect(setTariffMode).toHaveBeenCalledWith('Verde');
    expect(onFetchTariffs).toHaveBeenCalledOnce();
  });

  it('renders loaded tariffs, errors and the loading fetch state', () => {
    const { rerender, props } = renderPanel({
      distributor: 'Energisa',
      subgroup: 'B1',
      tariffMode: 'Branca',
      referenceDate: '2026-01-15',
      tariffs,
    });

    expect(screen.getByText('Tarifas carregadas com sucesso')).toBeInTheDocument();
    expect(screen.getByText('Distribuidora Teste')).toBeInTheDocument();
    expect(screen.getByText('Válido de:')).toBeInTheDocument();
    expect(screen.getByText('até:')).toBeInTheDocument();
    expect(screen.getByText('Consultado em:')).toBeInTheDocument();

    rerender(<AutomaticTariffPanel {...props} loading tariffs={null} error="Erro ao buscar tarifas" />);
    expect(screen.getByRole('button', { name: 'Buscando tarifas...' })).toBeDisabled();
    expect(screen.getByText('Erro ao buscar tarifas')).toBeInTheDocument();
  });
});
