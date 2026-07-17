// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UserStockItem } from '@/lib/types';
import { renderWithShell } from '../test-helpers/render-with-shell';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';
import { MyStockTab } from './MyStockTab';

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

const stockItem: UserStockItem = {
  id: 's1',
  productType: 'inverter',
  productModel: 'X1-Hybrid-5.0kW-G4',
  unitValue: 1000,
  createdAt: '',
  updatedAt: '',
};

function setup(overrides: Partial<Parameters<typeof MyStockTab>[0]> = {}) {
  const props = {
    userStockItems: [] as UserStockItem[],
    inverterCatalog: [inverter],
    batteryCatalog: [battery],
    accessoryCatalog: [accessory],
    onAddToStock: vi.fn().mockResolvedValue(undefined),
    onUpdateValue: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const utils = renderWithShell(<MyStockTab {...props} />);
  return { ...utils, props };
}

describe('MyStockTab: listing', () => {
  it('lists items already in stock under their section', () => {
    setup({ userStockItems: [stockItem] });
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.getByLabelText('Meu preço para X1-Hybrid-5.0kW-G4')).toHaveValue(1000);
  });

  it('hides the search box when there is nothing in stock yet', () => {
    setup();
    expect(screen.queryByPlaceholderText('Pesquisar modelo...')).not.toBeInTheDocument();
  });

  it('filters stock items by search', () => {
    const secondItem: UserStockItem = { ...stockItem, id: 's2', productType: 'battery', productModel: 'TP-HS3.6' };
    setup({ userStockItems: [stockItem, secondItem] });

    fireEvent.change(screen.getByPlaceholderText('Pesquisar modelo...'), { target: { value: 'TP-HS3.6' } });

    expect(screen.queryByText('X1-Hybrid-5.0kW-G4')).not.toBeInTheDocument();
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
  });
});

describe('MyStockTab: editing price', () => {
  it('calls onUpdateValue on blur when the value changed', () => {
    const { props } = setup({ userStockItems: [stockItem] });
    const input = screen.getByLabelText('Meu preço para X1-Hybrid-5.0kW-G4');

    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.blur(input);

    expect(props.onUpdateValue).toHaveBeenCalledWith('s1', 1500);
  });

  it('does not call onUpdateValue on blur when the value is unchanged', () => {
    const { props } = setup({ userStockItems: [stockItem] });
    const input = screen.getByLabelText('Meu preço para X1-Hybrid-5.0kW-G4');

    fireEvent.blur(input);

    expect(props.onUpdateValue).not.toHaveBeenCalled();
  });
});

describe('MyStockTab: removing', () => {
  it('confirms via the delete popover before calling onRemove', async () => {
    const { props } = setup({ userStockItems: [stockItem] });

    fireEvent.click(screen.getByRole('button', { name: 'Remover X1-Hybrid-5.0kW-G4 do meu catálogo' }));
    const confirmButton = await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith('s1'));
  });
});

describe('MyStockTab: adding from the catalog', () => {
  it('opens the picker grouped by phase and adds the chosen inverter', async () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar inversor ao catálogo' }));

    const dialog = await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });
    expect(within(dialog).getByRole('tab', { name: 'Monofásico' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(within(dialog).getByText('X1-Hybrid-5.0kW-G4'));

    await waitFor(() =>
      expect(props.onAddToStock).toHaveBeenCalledWith({ productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 0 })
    );
  });

  it('excludes products already in stock from the picker', async () => {
    setup({ userStockItems: [stockItem] });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar inversor ao catálogo' }));

    const dialog = await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });
    expect(within(dialog).getByText('Todos os produtos desse filtro já estão no seu catálogo.')).toBeInTheDocument();
  });

  it('shows a limit-reached error verbatim when adding fails', async () => {
    const onAddToStock = vi.fn().mockRejectedValue(new Error('Limite de 10 itens no catálogo atingido.'));
    setup({ onAddToStock });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar acessório ao catálogo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });
    fireEvent.click(within(dialog).getByText('Smart Meter'));

    await waitFor(() => expect(within(dialog).getByText('Limite de 10 itens no catálogo atingido.')).toBeInTheDocument());
  });
});
