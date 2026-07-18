// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UserStockItem } from '@/lib/types';
import { renderWithShell } from '../test-helpers/render-with-shell';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';
import { CatalogTab } from './CatalogTab';

const inverter: InverterCatalogOption = {
  id: 'i1',
  model: 'X1-Hybrid-5.0kW-G4',
  topology: 'HV',
  phases: 1,
  standardPowerKva: 5,
  peakPowerKva: 7,
  maxPowerPerPhaseW: null,
  imageUrl: null,
  documents: [],
  flags: [],
};

const battery: BatteryCatalogOption = {
  id: 'b1',
  model: 'TP-HS3.6',
  capacityKwh: 3.6,
  topology: 'HV',
  standardPowerKw: 1.8,
  peakPowerKw: 2.5,
  minSocPercent: 10,
  imageUrl: null,
  documents: [],
};

const accessory: AccessoryCatalogOption = {
  id: 'a1',
  model: 'Smart Meter',
  description: 'Medidor inteligente',
  imageUrl: null,
  documents: [],
};

function setup(overrides: Partial<Parameters<typeof CatalogTab>[0]> = {}) {
  const props = {
    initialLoading: false,
    inverterCatalog: [inverter],
    batteryCatalog: [battery],
    accessoryCatalog: [accessory],
    userStockItems: [] as UserStockItem[],
    onAddToStock: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const utils = renderWithShell(<CatalogTab {...props} />);
  return { ...utils, props };
}

describe('CatalogTab: sections', () => {
  it('shows inverters by default, grouped by phase count', () => {
    setup();
    expect(screen.getByText('Monofásico')).toBeInTheDocument();
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
  });

  it('switches to batteries and accessories', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Acessórios/ }));
    expect(screen.getByText('Smart Meter')).toBeInTheDocument();
  });

  it('shows an empty state per section when the catalog is empty', () => {
    setup({ inverterCatalog: [] });
    expect(screen.getByText('Nenhum inversor cadastrado.')).toBeInTheDocument();
  });

  it('filters the active section by search', () => {
    setup({ inverterCatalog: [inverter, { ...inverter, id: 'i2', model: 'X3-Hybrid-10.0kW-G4' }] });

    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar modelo...' }));
    fireEvent.change(screen.getByPlaceholderText('Pesquisar modelo...'), { target: { value: 'X1' } });

    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.queryByText('X3-Hybrid-10.0kW-G4')).not.toBeInTheDocument();
  });

  it('shows a search-specific empty state when nothing matches', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar modelo...' }));
    fireEvent.change(screen.getByPlaceholderText('Pesquisar modelo...'), { target: { value: 'inexistente' } });
    expect(screen.getByText('Nenhum inversor encontrado para essa pesquisa.')).toBeInTheDocument();
  });
});

describe('CatalogTab: stock control', () => {
  it('adds a product to the user catalog', async () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao meu catálogo' }));

    await waitFor(() =>
      expect(props.onAddToStock).toHaveBeenCalledWith({ productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 0 })
    );
  });

  it('shows "No catálogo" instead of the add button once already in stock', () => {
    setup({
      userStockItems: [
        { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 0, createdAt: '', updatedAt: '' },
      ],
    });

    expect(screen.getByText('No catálogo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar ao meu catálogo' })).not.toBeInTheDocument();
  });

  it('shows a limit-reached error verbatim when adding fails', async () => {
    const onAddToStock = vi.fn().mockRejectedValue(new Error('Limite de 10 itens no catálogo atingido.'));
    setup({ onAddToStock });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao meu catálogo' }));

    await waitFor(() => expect(screen.getByText('Limite de 10 itens no catálogo atingido.')).toBeInTheDocument());
  });
});
