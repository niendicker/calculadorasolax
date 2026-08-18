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
  imageUrl: 'https://example.com/inverter.png',
  documents: [{ name: 'Manual', url: 'https://example.com/manual.pdf' }],
  flags: [],
};

const threePhaseInverter: InverterCatalogOption = {
  ...inverter,
  id: 'i3',
  model: 'X3-Hybrid-10.0kW-G4',
  phases: 3,
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

const masterBattery: BatteryCatalogOption = {
  ...battery,
  id: 'b2',
  model: 'TP-HS5.8',
  expansionModel: 'TP-HS5.8-EXP',
};

const expansionBattery: BatteryCatalogOption = {
  ...battery,
  id: 'b3',
  model: 'TP-HS5.8-EXP',
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

  it('shows the nickname as the card title, with the model kept as a caption', () => {
    setup({ inverterCatalog: [{ ...inverter, nickname: 'Inversor Residencial 5kW' }] });
    expect(screen.getByText('Inversor Residencial 5kW')).toBeInTheDocument();
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
  });

  it('groups multiple inverter phase counts and singularizes "1 fase"', () => {
    setup({ inverterCatalog: [inverter, threePhaseInverter] });
    expect(screen.getByText('Monofásico')).toBeInTheDocument();
    expect(screen.getByText('Trifásico')).toBeInTheDocument();
    expect(screen.getByText('1 fase')).toBeInTheDocument();
    expect(screen.getByText('3 fases')).toBeInTheDocument();
  });

  it('subdivides inverters within a phase group by topology (HV / LV / both)', () => {
    const lvInverter: InverterCatalogOption = { ...inverter, id: 'i2', model: 'X1-LV-3.0kW', topology: 'LV' };
    const bothInverter: InverterCatalogOption = { ...inverter, id: 'i4', model: 'X1-Flex-5.0kW', topology: 'BOTH' };
    setup({ inverterCatalog: [inverter, lvInverter, bothInverter] });

    expect(screen.getByText('Alta tensão (HV)')).toBeInTheDocument();
    expect(screen.getByText('Baixa tensão (LV)')).toBeInTheDocument();
    expect(screen.getByText('Ambas as tensões (HV/LV)')).toBeInTheDocument();
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.getByText('X1-LV-3.0kW')).toBeInTheDocument();
    expect(screen.getByText('X1-Flex-5.0kW')).toBeInTheDocument();
  });

  it('subdivides batteries by topology (HV / LV)', () => {
    const lvBattery: BatteryCatalogOption = { ...battery, id: 'b4', model: 'TP-LV-5.0', topology: 'LV' };
    setup({ batteryCatalog: [battery, lvBattery] });
    fireEvent.click(screen.getByRole('tab', { name: /Baterias/ }));

    expect(screen.getByText('Alta tensão (HV)')).toBeInTheDocument();
    expect(screen.getByText('Baixa tensão (LV)')).toBeInTheDocument();
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
    expect(screen.getByText('TP-LV-5.0')).toBeInTheDocument();
  });

  it('switches to batteries and accessories', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: /Baterias/ }));
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Acessórios/ }));
    expect(screen.getByText('Smart Meter')).toBeInTheDocument();
  });

  it('shows an empty state per section when the catalog is empty', () => {
    setup({ inverterCatalog: [] });
    expect(screen.getByText('Nenhum inversor cadastrado.')).toBeInTheDocument();
  });

  it('shows empty states for batteries and accessories when empty', () => {
    setup({ batteryCatalog: [], accessoryCatalog: [] });

    fireEvent.click(screen.getByRole('tab', { name: /Baterias/ }));
    expect(screen.getByText('Nenhuma bateria cadastrada.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Acessórios/ }));
    expect(screen.getByText('Nenhum acessório cadastrado.')).toBeInTheDocument();
  });

  it('marks a battery with an expansion model as Master and its expansion as Expansão', () => {
    setup({ batteryCatalog: [masterBattery, expansionBattery] });
    fireEvent.click(screen.getByRole('tab', { name: /Baterias/ }));

    expect(screen.getByText('Master')).toBeInTheDocument();
    expect(screen.getByText('Expansão')).toBeInTheDocument();
  });

  it('shows the loading skeleton while loading', () => {
    setup({ initialLoading: true });
    expect(screen.getByLabelText('Carregando baterias')).toBeInTheDocument();
  });
});

describe('CatalogTab: preview modals', () => {
  it('opens and closes the image preview for a product with an image', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'X1-Hybrid-5.0kW-G4' }));
    const dialog = screen.getByRole('dialog', { name: 'X1-Hybrid-5.0kW-G4' });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens and closes the document preview for a product with attachments', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));
    const dialog = screen.getByRole('dialog', { name: 'Manual' });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    const onAddToStock = vi.fn().mockRejectedValue(new Error('Limite de 14 itens no catálogo atingido.'));
    setup({ onAddToStock });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao meu catálogo' }));

    await waitFor(() => expect(screen.getByText('Limite de 14 itens no catálogo atingido.')).toBeInTheDocument());
  });

  it('shows a generic error message for any other failure', async () => {
    const onAddToStock = vi.fn().mockRejectedValue(new Error('boom'));
    setup({ onAddToStock });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao meu catálogo' }));

    await waitFor(() =>
      expect(screen.getByText('Não foi possível adicionar ao catálogo. Tente novamente.')).toBeInTheDocument()
    );
  });
});

describe('CatalogTab: missing power specs', () => {
  it('falls back to "-" when inverter power specs are null', () => {
    setup({ inverterCatalog: [{ ...inverter, standardPowerKva: null, peakPowerKva: null }] });
    expect(screen.getByText('Potência: - kVA · pico - kVA')).toBeInTheDocument();
  });

  it('falls back to "-" when battery power specs are null', () => {
    setup({ batteryCatalog: [{ ...battery, standardPowerKw: null, peakPowerKw: null }] });
    fireEvent.click(screen.getByRole('tab', { name: /Baterias/ }));
    expect(screen.getByText('Potência: - kW · pico - kW')).toBeInTheDocument();
  });
});
