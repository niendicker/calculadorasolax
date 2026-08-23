// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_LIMITS } from '@/lib/limits';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import type { UserServiceItem, UserStockItem } from '@/lib/types';
import { renderWithShell } from '../test-helpers/render-with-shell';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';
import { MyStockTab } from './MyStockTab';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

// StockProductCard's supplier cost reference fetches supplier offers
// on mount — tests that don't care about that feature just want it to no-op,
// as if the visitor were signed out (getUser resolves to no user, so the
// fetch bails before touching `from`).
beforeEach(() => {
  createClientMock.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
});

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
    userServices: [] as UserServiceItem[],
    onAddService: vi.fn().mockResolvedValue(undefined),
    onUpdateServiceName: vi.fn().mockResolvedValue(undefined),
    onUpdateServiceValue: vi.fn().mockResolvedValue(undefined),
    onRemoveService: vi.fn().mockResolvedValue(undefined),
    marginSettings: { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 },
    onUpdateMarginPercent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const utils = renderWithShell(<MyStockTab {...props} />);
  return { ...utils, props };
}

describe('MyStockTab: listing', () => {
  it('lists items already in stock under their section', () => {
    setup({ userStockItems: [stockItem] });
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.getByLabelText('Meu custo para X1-Hybrid-5.0kW-G4')).toHaveValue(1000);
  });

  it('shows the nickname as the card title, with the model kept as a caption', () => {
    setup({ userStockItems: [stockItem], inverterCatalog: [{ ...inverter, nickname: 'Inversor Residencial 5kW' }] });
    expect(screen.getByText('Inversor Residencial 5kW')).toBeInTheDocument();
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
  });

  it('warns the user once they reach the stock item limit', () => {
    setup({
      userStockItems: Array.from({ length: ACCOUNT_LIMITS.userStockItems }, (_, i) => ({
        ...stockItem,
        id: `s${i}`,
        productModel: `Model ${i}`,
      })),
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Você atingiu o limite de ${ACCOUNT_LIMITS.userStockItems} produtos no seu catálogo`
    );
  });

  it('does not show the limit warning below the limit', () => {
    setup({ userStockItems: [stockItem] });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces the Adicionar card with a clear limit-reached count once at the limit, instead of a generic retry message', () => {
    setup({
      userStockItems: Array.from({ length: ACCOUNT_LIMITS.userStockItems }, (_, i) => ({
        ...stockItem,
        id: `s${i}`,
        productModel: `Model ${i}`,
      })),
    });

    expect(screen.queryByRole('button', { name: 'Adicionar produto' })).not.toBeInTheDocument();
    expect(screen.getByText('Limite atingido')).toBeInTheDocument();
    expect(screen.getByText(`${ACCOUNT_LIMITS.userStockItems}/${ACCOUNT_LIMITS.userStockItems} produtos`, { exact: false })).toBeInTheDocument();
  });

  it('shows an item count on each section tab', () => {
    const secondItem: UserStockItem = { ...stockItem, id: 's2', productType: 'battery', productModel: 'TP-HS3.6' };
    setup({ userStockItems: [stockItem, secondItem] });

    expect(screen.getByRole('tab', { name: /Inversores/ })).toHaveTextContent('1 item');
    expect(screen.getByRole('tab', { name: /Baterias/ })).toHaveTextContent('1 item');
    expect(screen.getByRole('tab', { name: /Acessórios/ })).toHaveTextContent('0 itens');
  });

  it('flags a section tab (and the Produtos tab) when one of its items has no price set yet', () => {
    setup({ userStockItems: [{ ...stockItem, unitValue: 0 }] });

    expect(within(screen.getByRole('tab', { name: /Inversores/ })).getByLabelText('Item sem preço definido')).toBeInTheDocument();
    expect(within(screen.getByRole('tab', { name: /^Produtos/ })).getByLabelText('Item sem preço definido')).toBeInTheDocument();
    expect(within(screen.getByRole('tab', { name: /Baterias/ })).queryByLabelText('Item sem preço definido')).not.toBeInTheDocument();
  });

  it('does not flag any tab once every item in stock has a price', () => {
    setup({ userStockItems: [stockItem] });

    expect(within(screen.getByRole('tab', { name: /Inversores/ })).queryByLabelText('Item sem preço definido')).not.toBeInTheDocument();
    expect(within(screen.getByRole('tab', { name: /^Produtos/ })).queryByLabelText('Item sem preço definido')).not.toBeInTheDocument();
  });

  it('filters the active category by model or nickname', () => {
    const secondItem: UserStockItem = { ...stockItem, id: 's2', productModel: 'X1-Mini-3.0kW' };
    setup({
      userStockItems: [stockItem, secondItem],
      inverterCatalog: [inverter, { ...inverter, id: 'i2', model: 'X1-Mini-3.0kW', nickname: 'Inversor compacto' }],
    });

    fireEvent.change(screen.getByLabelText('Buscar produto no portfólio'), { target: { value: 'compacto' } });

    expect(screen.getByText('Inversor compacto')).toBeInTheDocument();
    expect(screen.queryByText('X1-Hybrid-5.0kW-G4')).not.toBeInTheDocument();
  });

  it('offers a way to restore a no-result search', () => {
    setup({ userStockItems: [stockItem, { ...stockItem, id: 's2', productModel: 'X1-Mini-3.0kW', unitValue: 0 }] });

    fireEvent.change(screen.getByLabelText('Buscar produto no portfólio'), { target: { value: 'não existe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
  });
});

describe('MyStockTab: editing price', () => {
  it('calls onUpdateValue on blur when the value changed', () => {
    const { props } = setup({ userStockItems: [stockItem] });
    const input = screen.getByLabelText('Meu custo para X1-Hybrid-5.0kW-G4');

    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.blur(input);

    expect(props.onUpdateValue).toHaveBeenCalledWith('s1', 1500);
  });

  it('does not call onUpdateValue on blur when the value is unchanged', () => {
    const { props } = setup({ userStockItems: [stockItem] });
    const input = screen.getByLabelText('Meu custo para X1-Hybrid-5.0kW-G4');

    fireEvent.blur(input);

    expect(props.onUpdateValue).not.toHaveBeenCalled();
  });

  it('shows a saved indicator after a successful inline price edit', async () => {
    setup({ userStockItems: [stockItem] });
    const input = screen.getByLabelText('Meu custo para X1-Hybrid-5.0kW-G4');

    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByLabelText('Salvo')).toBeInTheDocument());
  });

  it('surfaces an error instead of silently discarding a failed inline price edit', async () => {
    const onUpdateValue = vi.fn().mockRejectedValue(new Error('boom'));
    setup({ userStockItems: [stockItem], onUpdateValue });
    const input = screen.getByLabelText('Meu custo para X1-Hybrid-5.0kW-G4');

    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByText('Não foi possível salvar')).toBeInTheDocument());
  });

  it('warns when a stock item still has no price defined', () => {
    setup({ userStockItems: [{ ...stockItem, unitValue: 0 }] });
    expect(screen.getByText(/Defina um preço/)).toBeInTheDocument();
  });

  it('does not warn once a price has been set', () => {
    setup({ userStockItems: [stockItem] });
    expect(screen.queryByText(/Defina um preço/)).not.toBeInTheDocument();
  });

  it('shows an empty-category hint when a section has no items yet', () => {
    setup({ userStockItems: [] });
    expect(screen.getByText(/Seu portfólio ainda não tem inversores/)).toBeInTheDocument();
  });
});

describe('MyStockTab: sale price and supplier cost reference', () => {
  it('shows the resulting sale price based on the category margin', () => {
    setup({ userStockItems: [stockItem], marginSettings: { inverterPercent: 20, batteryPercent: 0, accessoryPercent: 0 } });

    const salePrice = screen.getByText('Preço de venda estimado');
    expect(salePrice.parentElement).toHaveTextContent('R$ 1.200,00');
    expect(salePrice.parentElement).toHaveTextContent('markup de 20%');
  });

  it('does not show a sale price for a product with no price defined yet', () => {
    setup({ userStockItems: [{ ...stockItem, unitValue: 0 }] });
    expect(screen.queryByText(/Preço de venda/)).not.toBeInTheDocument();
  });

  it('shows the cheapest supplier offer as a cost reference', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: {
          suppliers: { data: [{ id: 'sup-1', is_default_for_all: true }], error: null },
          user_supplier_preferences: { data: [], error: null },
          supplier_offers: {
            data: [
              {
                unit_price: 800,
                supplier_product_mappings: { product_type: 'inverter', product_model: 'X1-Hybrid-5.0kW-G4' },
                suppliers: { currency: 'BRL' },
              },
              {
                unit_price: 750,
                supplier_product_mappings: { product_type: 'inverter', product_model: 'X1-Hybrid-5.0kW-G4' },
                suppliers: { currency: 'BRL' },
              },
            ],
            error: null,
          },
        },
      })
    );
    setup({ userStockItems: [stockItem] });

    await waitFor(() => expect(screen.getByText(/Referência de fornecedor: R\$\s*750,00/)).toBeInTheDocument());
  });

  it('does not show a cost reference when no supplier offers that model', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: {
          suppliers: { data: [{ id: 'sup-1', is_default_for_all: true }], error: null },
          user_supplier_preferences: { data: [], error: null },
          supplier_offers: { data: [], error: null },
        },
      })
    );
    setup({ userStockItems: [stockItem] });

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument());
    expect(screen.queryByText(/Referência de fornecedor/)).not.toBeInTheDocument();
  });

  it('does not show a cost reference for a signed-out visitor', () => {
    createClientMock.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    setup({ userStockItems: [stockItem] });

    expect(screen.queryByText(/Referência de fornecedor/)).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));

    const dialog = await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });
    expect(within(dialog).getByRole('tab', { name: 'Monofásico' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(within(dialog).getByText('X1-Hybrid-5.0kW-G4'));

    await waitFor(() =>
      expect(props.onAddToStock).toHaveBeenCalledWith({ productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 0 })
    );
  });

  it('excludes products already in stock from the picker', async () => {
    setup({ userStockItems: [stockItem] });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));

    const dialog = await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });
    expect(within(dialog).getByText('Todos os produtos dessa categoria já estão no seu catálogo.')).toBeInTheDocument();
  });

  it('shows a limit-reached error verbatim when adding fails', async () => {
    const onAddToStock = vi.fn().mockRejectedValue(new Error('Limite de 14 itens no catálogo atingido.'));
    setup({ onAddToStock });

    fireEvent.click(screen.getByRole('tab', { name: /Acessórios/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });
    fireEvent.click(within(dialog).getByText('Smart Meter'));

    await waitFor(() => expect(within(dialog).getByText('Limite de 14 itens no catálogo atingido.')).toBeInTheDocument());
  });
});

const serviceItem: UserServiceItem = {
  id: 'sv1',
  name: 'Instalação',
  unitValue: 500,
  createdAt: '',
  updatedAt: '',
};

describe('MyStockTab: services', () => {
  it('switches to the Serviços section and lists existing services', () => {
    setup({ userServices: [serviceItem] });

    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));

    expect(screen.getByLabelText('Nome do serviço Instalação')).toHaveValue('Instalação');
    expect(screen.getByLabelText('Preço do serviço Instalação')).toHaveValue(500);
  });

  it('adds a new service with name and price', async () => {
    const onAddService = vi.fn().mockResolvedValue(undefined);
    const { props } = setup({ onAddService });

    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar serviço ao catálogo' }));
    fireEvent.change(screen.getByLabelText('Nome do serviço'), { target: { value: 'Frete' } });
    fireEvent.change(screen.getByLabelText('Preço do serviço'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(props.onAddService).toHaveBeenCalledWith({ name: 'Frete', unitValue: 150 }));
  });

  it('updates a service name and price on blur', () => {
    const { props } = setup({ userServices: [serviceItem] });
    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));

    fireEvent.change(screen.getByLabelText('Nome do serviço Instalação'), { target: { value: 'Instalação completa' } });
    fireEvent.blur(screen.getByLabelText('Nome do serviço Instalação'));
    expect(props.onUpdateServiceName).toHaveBeenCalledWith('sv1', 'Instalação completa');

    fireEvent.change(screen.getByLabelText('Preço do serviço Instalação'), { target: { value: '600' } });
    fireEvent.blur(screen.getByLabelText('Preço do serviço Instalação'));
    expect(props.onUpdateServiceValue).toHaveBeenCalledWith('sv1', 600);
  });

  it('removes a service via the confirm popover', async () => {
    const { props } = setup({ userServices: [serviceItem] });
    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Remover serviço Instalação' }));
    const confirmButton = await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(props.onRemoveService).toHaveBeenCalledWith('sv1'));
  });

  it('shows an empty hint when there are no services yet', () => {
    setup({ userServices: [] });
    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));

    expect(screen.getByText(/Você ainda não cadastrou nenhum serviço/)).toBeInTheDocument();
  });

  it('surfaces an error instead of silently discarding a failed inline service price edit', async () => {
    const onUpdateServiceValue = vi.fn().mockRejectedValue(new Error('boom'));
    setup({ userServices: [serviceItem], onUpdateServiceValue });
    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));

    fireEvent.change(screen.getByLabelText('Preço do serviço Instalação'), { target: { value: '600' } });
    fireEvent.blur(screen.getByLabelText('Preço do serviço Instalação'));

    await waitFor(() => expect(screen.getByText('Não foi possível salvar')).toBeInTheDocument());
  });

  it('shows the limit-reached state once at ACCOUNT_LIMITS.userServices', () => {
    const services = Array.from({ length: ACCOUNT_LIMITS.userServices }, (_, i) => ({
      id: `sv${i}`,
      name: `Serviço ${i}`,
      unitValue: 10,
      createdAt: '',
      updatedAt: '',
    }));
    setup({ userServices: services });
    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));

    expect(screen.getByText('Limite atingido')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar serviço ao catálogo' })).not.toBeInTheDocument();
  });
});

describe('MyStockTab: main section tabs', () => {
  it('switches back to Produtos after visiting Serviços', () => {
    setup({ userStockItems: [stockItem] });

    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));
    expect(screen.queryByText('X1-Hybrid-5.0kW-G4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Produtos/ }));
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
  });
});

describe('MyStockTab: image and document preview', () => {
  const inverterWithMedia: InverterCatalogOption = {
    ...inverter,
    imageUrl: 'https://example.com/inverter.png',
    documents: [{ name: 'Manual', url: 'https://example.com/manual.pdf' }],
  };

  it('opens the image preview modal and closes it', () => {
    setup({ userStockItems: [stockItem], inverterCatalog: [inverterWithMedia] });

    fireEvent.click(screen.getByAltText('X1-Hybrid-5.0kW-G4').closest('button')!);

    const dialog = screen.getByRole('dialog', { name: 'X1-Hybrid-5.0kW-G4' });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog', { name: 'X1-Hybrid-5.0kW-G4' })).not.toBeInTheDocument();
  });

  it('opens the document preview modal and closes it', () => {
    setup({ userStockItems: [stockItem], inverterCatalog: [inverterWithMedia] });

    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));

    const dialog = screen.getByRole('dialog', { name: 'Manual' });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog', { name: 'Manual' })).not.toBeInTheDocument();
  });
});

describe('MyStockTab: accessory stock card', () => {
  const accessoryStockItem: UserStockItem = {
    id: 'sa1',
    productType: 'accessory',
    productModel: 'Smart Meter',
    unitValue: 300,
    createdAt: '',
    updatedAt: '',
  };

  it('shows the accessory description, image and documents on its card', () => {
    const accessoryWithMedia: AccessoryCatalogOption = {
      ...accessory,
      imageUrl: 'https://example.com/accessory.png',
      documents: [{ name: 'Ficha técnica', url: 'https://example.com/ficha.pdf' }],
    };
    setup({ userStockItems: [accessoryStockItem], accessoryCatalog: [accessoryWithMedia] });

    fireEvent.click(screen.getByRole('tab', { name: /Acessórios/ }));

    expect(screen.getByText('Medidor inteligente')).toBeInTheDocument();
    expect(screen.getByAltText('Smart Meter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ficha técnica' })).toBeInTheDocument();
  });
});

describe('MyStockTab: adding a service', () => {
  it('does not submit when the value entered is invalid', async () => {
    const onAddService = vi.fn().mockResolvedValue(undefined);
    setup({ onAddService });

    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar serviço ao catálogo' }));
    fireEvent.change(screen.getByLabelText('Nome do serviço'), { target: { value: 'Frete' } });
    fireEvent.change(screen.getByLabelText('Preço do serviço'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onAddService).not.toHaveBeenCalled();
  });

  it('shows a generic error message when adding a service fails for a non-limit reason', async () => {
    const onAddService = vi.fn().mockRejectedValue(new Error('boom'));
    setup({ onAddService });

    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar serviço ao catálogo' }));
    fireEvent.change(screen.getByLabelText('Nome do serviço'), { target: { value: 'Frete' } });
    fireEvent.change(screen.getByLabelText('Preço do serviço'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(screen.getByText('Não foi possível adicionar o serviço. Tente novamente.')).toBeInTheDocument()
    );
  });

  it('closes the add-service form via Cancelar', () => {
    setup();

    fireEvent.click(screen.getByRole('tab', { name: /Serviços/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar serviço ao catálogo' }));
    fireEvent.change(screen.getByLabelText('Nome do serviço'), { target: { value: 'Frete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Nome do serviço')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar serviço ao catálogo' })).toBeInTheDocument();
  });
});

describe('MyStockTab: adding a product from the picker', () => {
  it('shows a generic error message when adding fails for a non-limit reason', async () => {
    const onAddToStock = vi.fn().mockRejectedValue(new Error('boom'));
    setup({ onAddToStock });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });
    fireEvent.click(within(dialog).getByText('X1-Hybrid-5.0kW-G4'));

    await waitFor(() =>
      expect(within(dialog).getByText('Não foi possível adicionar ao catálogo. Tente novamente.')).toBeInTheDocument()
    );
  });

  it('switches between group tabs in the picker', async () => {
    const twoPhaseInverter: InverterCatalogOption = { ...inverter, id: 'i2', model: 'X3-Hybrid-8.0kW', phases: 3 };
    setup({ inverterCatalog: [inverter, twoPhaseInverter] });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });

    expect(within(dialog).queryByText('X3-Hybrid-8.0kW')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Trifásico' }));

    expect(within(dialog).getByRole('tab', { name: 'Trifásico' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByText('X3-Hybrid-8.0kW')).toBeInTheDocument();
    expect(within(dialog).queryByText('X1-Hybrid-5.0kW-G4')).not.toBeInTheDocument();
  });

  it('closes the picker when clicking outside of it', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));
    await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });

    fireEvent.mouseDown(document.body);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Escolha um produto do catálogo' })).not.toBeInTheDocument()
    );
  });

  it('closes the picker when pressing Escape', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));
    await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Escolha um produto do catálogo' })).not.toBeInTheDocument()
    );
  });

  it('does not close the picker when clicking inside it', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Escolha um produto do catálogo' });

    fireEvent.mouseDown(dialog);

    expect(screen.getByRole('dialog', { name: 'Escolha um produto do catálogo' })).toBeInTheDocument();
  });
});

describe('MyStockTab: sell margins', () => {
  it('shows the margin inline within each product category tab, scoped to that category', () => {
    setup({ marginSettings: { inverterPercent: 10, batteryPercent: 20, accessoryPercent: 5 } });

    // "Inversores" is the default tab.
    expect(screen.getByLabelText('Markup de venda')).toHaveValue(10);

    fireEvent.click(screen.getByRole('tab', { name: /Baterias/ }));
    expect(screen.getByLabelText('Markup de venda')).toHaveValue(20);

    fireEvent.click(screen.getByRole('tab', { name: /Acessórios/ }));
    expect(screen.getByLabelText('Markup de venda')).toHaveValue(5);
  });

  it('saves a category margin on blur when it changes', () => {
    const { props } = setup({ marginSettings: { inverterPercent: 10, batteryPercent: 0, accessoryPercent: 0 } });

    const input = screen.getByLabelText('Markup de venda');
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.blur(input);

    expect(props.onUpdateMarginPercent).toHaveBeenCalledWith('inverter', 15);
  });

  it('does not save on blur when the margin value is unchanged', () => {
    const { props } = setup({ marginSettings: { inverterPercent: 10, batteryPercent: 0, accessoryPercent: 0 } });

    const input = screen.getByLabelText('Markup de venda');
    fireEvent.blur(input);

    expect(props.onUpdateMarginPercent).not.toHaveBeenCalled();
  });

  it('surfaces an error instead of silently discarding a failed margin edit', async () => {
    const onUpdateMarginPercent = vi.fn().mockRejectedValue(new Error('boom'));
    setup({ marginSettings: { inverterPercent: 10, batteryPercent: 0, accessoryPercent: 0 }, onUpdateMarginPercent });

    const input = screen.getByLabelText('Markup de venda');
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByText('Não foi possível salvar')).toBeInTheDocument());
  });
});
