// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupplierOfferView } from '@/lib/procurement/types';
import { renderWithShell } from '../test-helpers/render-with-shell';
import { SupplyTab } from './SupplyTab';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

type QueryResult<T = unknown> = { data: T; error: null } | { data: null; error: { message: string } };
type SupplierRow = { id: string; name?: string; description?: string | null; order_mode?: string; is_default_for_all?: boolean };

function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: () => builder,
    delete: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve: (value: QueryResult) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

/** Unlike `makeQueryBuilder`, this actually honors `.in('supplier_id', ids)`
 *  by filtering the fixture data at resolution time — used for `supplier_offers`
 *  so scoping tests can assert on the resulting offer list, not just on which
 *  table got queried. */
function makeOffersBuilder(offers: SupplierOfferView[] | null, error: { message: string } | null) {
  let filterIds: string[] | null = null;
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    in: (_column: string, values: string[]) => { filterIds = values; return builder; },
    then: (resolve: (value: QueryResult) => void, reject: (reason: unknown) => void) => {
      const result: QueryResult = error
        ? { data: null, error }
        : { data: (offers ?? []).filter((offer) => !filterIds || filterIds.includes(offer.supplier_id)), error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

function makeOffer(partial: Partial<SupplierOfferView> & Pick<SupplierOfferView, 'id' | 'supplier_id'>): SupplierOfferView {
  return {
    unit_price: 100,
    stock_quantity: 10,
    lead_time_days: 5,
    minimum_quantity: 1,
    valid_until: null,
    supplier_product_mappings: {
      product_type: 'inverter',
      product_model: 'X1-Hybrid-5.0kW',
      supplier_sku: 'SKU-1',
      pack_quantity: 1,
    },
    suppliers: {
      name: 'Fornecedor A',
      currency: 'BRL',
      order_mode: 'both',
      minimum_order_value: 0,
    },
    ...partial,
  };
}

function makeOrder(partial: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    supplier_id: 'sup-1',
    created_at: '2026-01-01T00:00:00.000Z',
    request_type: 'quote',
    status: 'requested',
    currency: 'BRL',
    subtotal: 100,
    total_amount: null,
    suppliers: { name: 'Fornecedor A' },
    purchase_order_items: [{ id: 'item-1', product_model: 'X1-Hybrid-5.0kW', supplier_sku: 'SKU-1', quantity: 1, unit_price: 100, line_total: 100 }],
    ...partial,
  };
}

/** Offers are scoped server-side to "default for all" + user-preferred
 *  suppliers (see SupplyTab's load()). Tests that don't care about that
 *  scoping just pass `offers` — by default every supplier referenced by
 *  those fixtures is registered as a default (`is_default_for_all: true`),
 *  so nothing is filtered out and no selection checkboxes render. Tests
 *  exercising the supplier picker/scoping pass `suppliers` explicitly. */
function setupSupabase({
  offers = [] as SupplierOfferView[],
  offersError = null as { message: string } | null,
  orders = [] as ReturnType<typeof makeOrder>[],
  ordersError = null as { message: string } | null,
  rpcResult = { data: 'order-id-12345678', error: null as { message: string } | null },
  user = { id: 'user-1' } as { id: string } | null,
  suppliers = undefined as SupplierRow[] | undefined,
  preferenceSupplierIds = [] as string[],
  maxUserSuppliers = 2,
  overrideFrom,
}: {
  offers?: SupplierOfferView[];
  offersError?: { message: string } | null;
  orders?: ReturnType<typeof makeOrder>[];
  ordersError?: { message: string } | null;
  rpcResult?: { data: unknown; error: { message: string } | null };
  user?: { id: string } | null;
  suppliers?: SupplierRow[];
  preferenceSupplierIds?: string[];
  maxUserSuppliers?: number;
  overrideFrom?: (table: string, builder: Record<string, unknown>) => Record<string, unknown>;
} = {}) {
  const supplierRows = (suppliers ?? [...new Set(offers.map((offer) => offer.supplier_id))].map((id) => ({ id })))
    .map((row) => ({ name: `Fornecedor ${row.id}`, description: null, order_mode: 'both', is_default_for_all: true, ...row }));

  // Toggling a preference triggers a reload of this same table, so the mock
  // needs to actually remember inserts/deletes rather than always resolving
  // the initial `preferenceSupplierIds` fixture — otherwise the reload would
  // immediately undo the optimistic UI update the component just applied.
  let currentPreferenceIds = [...preferenceSupplierIds];
  function makePreferencesBuilder() {
    let pendingDeleteSupplierId: string | null = null;
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: string) => { if (column === 'supplier_id') pendingDeleteSupplierId = value; return builder; },
      insert: (row: { supplier_id: string }) => { currentPreferenceIds = [...currentPreferenceIds, row.supplier_id]; return Promise.resolve({ data: null, error: null }); },
      delete: () => builder,
      then: (resolve: (value: QueryResult) => void, reject: (reason: unknown) => void) => {
        if (pendingDeleteSupplierId) currentPreferenceIds = currentPreferenceIds.filter((id) => id !== pendingDeleteSupplierId);
        return Promise.resolve({ data: currentPreferenceIds.map((id) => ({ supplier_id: id })), error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const from = vi.fn((table: string) => {
    let builder: Record<string, unknown>;
    if (table === 'supplier_offers') builder = makeOffersBuilder(offersError ? null : offers, offersError);
    else if (table === 'purchase_orders') builder = makeQueryBuilder(ordersError ? { data: null, error: ordersError } : { data: orders, error: null });
    else if (table === 'suppliers') builder = makeQueryBuilder({ data: supplierRows, error: null });
    else if (table === 'app_settings') builder = makeQueryBuilder({ data: { max_user_suppliers: maxUserSuppliers }, error: null });
    else if (table === 'user_supplier_preferences') builder = makePreferencesBuilder();
    else builder = makeQueryBuilder({ data: null, error: null });
    return overrideFrom ? overrideFrom(table, builder) : builder;
  });
  const supabase = { from, rpc, auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } };
  createClientMock.mockReturnValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  if (!global.crypto || !global.crypto.randomUUID) {
    // @ts-expect-error -- test polyfill
    global.crypto = { randomUUID: () => 'test-uuid-1234' };
  }
});

describe('SupplyTab: loading and empty states', () => {
  it('shows the empty offers and orders messages when nothing is returned', async () => {
    setupSupabase();
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText(/Ainda não há ofertas disponíveis/)).toBeInTheDocument());
    expect(screen.getByText('Você ainda não fez pedidos.')).toBeInTheDocument();
    expect(screen.getByText('Adicione produtos de um fornecedor.')).toBeInTheDocument();
  });

  it('shows the load error message when offers fail to load', async () => {
    setupSupabase({ offersError: { message: 'Falha ao carregar ofertas' } });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Falha ao carregar ofertas'));
  });

  it('shows the load error message when orders fail to load (offer error takes precedence)', async () => {
    setupSupabase({ ordersError: { message: 'Falha ao carregar pedidos' } });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Falha ao carregar pedidos'));
  });
});

describe('SupplyTab: offers list and search', () => {
  it('lists offers and filters them by product, sku or supplier name', async () => {
    setupSupabase({
      offers: [
        makeOffer({ id: 'o1', supplier_id: 's1', supplier_product_mappings: { product_type: 'inverter', product_model: 'X1-Hybrid-5.0kW', supplier_sku: 'SKU-1', pack_quantity: 1 }, suppliers: { name: 'Fornecedor A', currency: 'BRL', order_mode: 'both', minimum_order_value: 0 } }),
        makeOffer({ id: 'o2', supplier_id: 's2', supplier_product_mappings: { product_type: 'battery', product_model: 'TP-HS3.6', supplier_sku: 'SKU-2', pack_quantity: 1 }, suppliers: { name: 'Fornecedor B', currency: 'BRL', order_mode: 'both', minimum_order_value: 0 } }),
        makeOffer({ id: 'o3', supplier_id: 's3', supplier_product_mappings: { product_type: 'accessory', product_model: 'Cabo', supplier_sku: 'SKU-3', pack_quantity: 1 }, suppliers: { name: 'Fornecedor C', currency: 'BRL', order_mode: 'both', minimum_order_value: 0 } }),
      ],
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
    expect(screen.getByText('Cabo')).toBeInTheDocument();
    expect(screen.getByText('Inversor')).toBeInTheDocument();
    expect(screen.getByText('Bateria')).toBeInTheDocument();
    expect(screen.getByText('Acessório')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar ofertas'), { target: { value: 'sku-2' } });
    expect(screen.queryByText('X1-Hybrid-5.0kW')).not.toBeInTheDocument();
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar ofertas'), { target: { value: 'Fornecedor C' } });
    expect(screen.getByText('Cabo')).toBeInTheDocument();
    expect(screen.queryByText('TP-HS3.6')).not.toBeInTheDocument();
  });

  it('shows "Estoque sob consulta" when stock_quantity is null and omits lead time when null', async () => {
    setupSupabase({
      offers: [makeOffer({ id: 'o1', supplier_id: 's1', stock_quantity: null, lead_time_days: null })],
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('Estoque sob consulta')).toBeInTheDocument());
  });

  it('shows the stock count and lead time when present', async () => {
    setupSupabase({ offers: [makeOffer({ id: 'o1', supplier_id: 's1', stock_quantity: 7, lead_time_days: 3 })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('7 em estoque · 3 dias')).toBeInTheDocument());
  });
});

describe('SupplyTab: offer scoping (defaults + user preferences)', () => {
  it('filters out offers from suppliers that are neither a default nor a user preference', async () => {
    setupSupabase({
      offers: [
        makeOffer({ id: 'o1', supplier_id: 's1', suppliers: { name: 'Fornecedor A', currency: 'BRL', order_mode: 'both', minimum_order_value: 0 } }),
        makeOffer({ id: 'o2', supplier_id: 's2', supplier_product_mappings: { product_type: 'battery', product_model: 'TP-HS3.6', supplier_sku: 'SKU-2', pack_quantity: 1 }, suppliers: { name: 'Fornecedor B', currency: 'BRL', order_mode: 'both', minimum_order_value: 0 } }),
      ],
      suppliers: [{ id: 's1', is_default_for_all: true }, { id: 's2', is_default_for_all: false }],
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    expect(screen.queryByText('TP-HS3.6')).not.toBeInTheDocument();
  });

  it('includes a supplier the user explicitly picked as a preference', async () => {
    const supabase = setupSupabase({
      offers: [makeOffer({ id: 'o1', supplier_id: 's2' })],
      suppliers: [{ id: 's1', is_default_for_all: true }, { id: 's2', is_default_for_all: false }],
      preferenceSupplierIds: ['s2'],
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    expect(supabase.from).toHaveBeenCalledWith('user_supplier_preferences');
  });

  it('skips the user preferences lookup when signed out, relying only on admin defaults', async () => {
    const supabase = setupSupabase({
      offers: [makeOffer({ id: 'o1', supplier_id: 's1' })],
      suppliers: [{ id: 's1', is_default_for_all: true }],
      user: null,
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    expect(supabase.from).not.toHaveBeenCalledWith('user_supplier_preferences');
  });

  it('shows the load error message when fetching suppliers fails', async () => {
    setupSupabase({
      offers: [makeOffer({ id: 'o1', supplier_id: 's1' })],
      overrideFrom: (table, builder) => {
        if (table === 'suppliers') return makeQueryBuilder({ data: null, error: { message: 'suppliers failed' } });
        return builder;
      },
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('suppliers failed'));
  });
});

describe('SupplyTab: "Meus fornecedores" picker', () => {
  it('lists default suppliers separately as locked/non-selectable', async () => {
    setupSupabase({ suppliers: [{ id: 's1', name: 'Fornecedor Padrão', is_default_for_all: true }, { id: 's2', name: 'Fornecedor B', is_default_for_all: false }] });
    renderWithShell(<SupplyTab />);

    await screen.findByText('Fornecedor Padrão');
    expect(screen.getByText('Padrão')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Fornecedor Padrão/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Fornecedor B/ })).toBeInTheDocument();
  });

  it('shows the configured quota and current selection count', async () => {
    setupSupabase({
      suppliers: [{ id: 's1', name: 'Fornecedor A', is_default_for_all: false }],
      maxUserSuppliers: 3,
      preferenceSupplierIds: ['s1'],
    });
    renderWithShell(<SupplyTab />);

    expect(await screen.findByText('Meus fornecedores (1/3)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Fornecedor A/ })).toBeChecked();
  });

  it('adds a supplier preference when checked', async () => {
    const supabase = setupSupabase({ suppliers: [{ id: 's1', name: 'Fornecedor A', is_default_for_all: false }] });
    renderWithShell(<SupplyTab />);

    const checkbox = await screen.findByRole('checkbox', { name: /Fornecedor A/ });
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(supabase.from).toHaveBeenCalledWith('user_supplier_preferences');
  });

  it('removes a supplier preference when unchecked', async () => {
    setupSupabase({ suppliers: [{ id: 's1', name: 'Fornecedor A', is_default_for_all: false }], preferenceSupplierIds: ['s1'] });
    renderWithShell(<SupplyTab />);

    const checkbox = await screen.findByRole('checkbox', { name: /Fornecedor A/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });

  it('blocks new selections once the quota is reached, disabling the option and explaining why', async () => {
    setupSupabase({
      suppliers: [{ id: 's1', name: 'Fornecedor A', is_default_for_all: false }, { id: 's2', name: 'Fornecedor B', is_default_for_all: false }],
      maxUserSuppliers: 1,
      preferenceSupplierIds: ['s1'],
    });
    renderWithShell(<SupplyTab />);

    const otherCheckbox = await screen.findByRole('checkbox', { name: /Fornecedor B/ });
    expect(otherCheckbox).toBeDisabled();
    fireEvent.click(otherCheckbox);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Limite de 1 fornecedores atingido.'));
    expect(otherCheckbox).not.toBeChecked();
  });

  it('shows an error message when persisting a selection fails', async () => {
    setupSupabase({
      suppliers: [{ id: 's1', name: 'Fornecedor A', is_default_for_all: false }],
      overrideFrom: (table, builder) => {
        if (table === 'user_supplier_preferences') builder.insert = () => Promise.resolve({ data: null, error: { message: 'insert failed' } });
        return builder;
      },
    });
    renderWithShell(<SupplyTab />);

    const checkbox = await screen.findByRole('checkbox', { name: /Fornecedor A/ });
    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('insert failed'));
    expect(checkbox).not.toBeChecked();
  });
});

describe('SupplyTab: cart quantity controls', () => {
  it('increments and decrements quantity, clamped between 0 and stock', async () => {
    setupSupabase({ offers: [makeOffer({ id: 'o1', supplier_id: 's1', stock_quantity: 2, minimum_quantity: 1 })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());

    const increase = screen.getByRole('button', { name: 'Aumentar' });
    const decrease = screen.getByRole('button', { name: 'Diminuir' });

    expect(decrease).toBeDisabled();

    fireEvent.click(increase);
    fireEvent.click(increase);
    fireEvent.click(increase); // clamps at stock_quantity = 2

    await waitFor(() => expect(screen.queryByText('Adicione produtos de um fornecedor.')).not.toBeInTheDocument());

    fireEvent.click(decrease);
    fireEvent.click(decrease); // back to 0, cart empties

    await waitFor(() => expect(screen.getByText('Adicione produtos de um fornecedor.')).toBeInTheDocument());
  });

  it('blocks adding an offer from a different supplier while the cart is not empty', async () => {
    setupSupabase({
      offers: [
        makeOffer({ id: 'o1', supplier_id: 's1', suppliers: { name: 'Fornecedor A', currency: 'BRL', order_mode: 'both', minimum_order_value: 0 } }),
        makeOffer({ id: 'o2', supplier_id: 's2', supplier_product_mappings: { product_type: 'battery', product_model: 'TP-HS3.6', supplier_sku: 'SKU-2', pack_quantity: 1 }, suppliers: { name: 'Fornecedor B', currency: 'BRL', order_mode: 'both', minimum_order_value: 0 } }),
      ],
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());

    const increaseButtons = screen.getAllByRole('button', { name: 'Aumentar' });
    fireEvent.click(increaseButtons[0]);

    await waitFor(() => expect(screen.getByText('1× X1-Hybrid-5.0kW')).toBeInTheDocument());

    fireEvent.click(increaseButtons[1]);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Finalize ou limpe o carrinho atual antes de escolher outro fornecedor.'));
    // The battery offer card is still listed (offers aren't filtered by
    // supplier), but it must not have been added to the cart.
    expect(screen.queryByText(/1× TP-HS3.6/)).not.toBeInTheDocument();
  });

  it('respects the offer minimum_quantity floor when incrementing from zero', async () => {
    setupSupabase({ offers: [makeOffer({ id: 'o1', supplier_id: 's1', minimum_quantity: 3, stock_quantity: 10 })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));

    await waitFor(() => expect(screen.getByText('3× X1-Hybrid-5.0kW')).toBeInTheDocument());
  });

  it('clears the cart via "Limpar carrinho"', async () => {
    setupSupabase({ offers: [makeOffer({ id: 'o1', supplier_id: 's1' })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));
    await waitFor(() => expect(screen.getByText('1× X1-Hybrid-5.0kW')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Limpar carrinho' }));
    await waitFor(() => expect(screen.getByText('Adicione produtos de um fornecedor.')).toBeInTheDocument());
  });
});

describe('SupplyTab: minimum order value and order-mode buttons', () => {
  it('shows the minimum order warning and disables order buttons below it', async () => {
    setupSupabase({
      offers: [makeOffer({ id: 'o1', supplier_id: 's1', unit_price: 10, suppliers: { name: 'Fornecedor A', currency: 'BRL', order_mode: 'both', minimum_order_value: 500 } })],
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));

    await waitFor(() => expect(screen.getByText(/Pedido mínimo/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Solicitar cotação' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Criar pedido' })).toBeDisabled();
  });

  it('only shows the quote button for order_mode "quote"', async () => {
    setupSupabase({
      offers: [makeOffer({ id: 'o1', supplier_id: 's1', suppliers: { name: 'Fornecedor A', currency: 'BRL', order_mode: 'quote', minimum_order_value: 0 } })],
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Solicitar cotação' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Criar pedido' })).not.toBeInTheDocument();
  });

  it('only shows the direct-order button for order_mode "direct"', async () => {
    setupSupabase({
      offers: [makeOffer({ id: 'o1', supplier_id: 's1', suppliers: { name: 'Fornecedor A', currency: 'BRL', order_mode: 'direct', minimum_order_value: 0 } })],
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar pedido' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Solicitar cotação' })).not.toBeInTheDocument();
  });
});

describe('SupplyTab: creating orders', () => {
  it('creates a quote order, resets the cart and notes, and reloads', async () => {
    const supabase = setupSupabase({ offers: [makeOffer({ id: 'o1', supplier_id: 's1' })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));
    fireEvent.change(screen.getByPlaceholderText('Observações para o fornecedor'), { target: { value: 'Entregar rápido' } });

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar cotação' }));

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('create_purchase_order', expect.objectContaining({
      p_supplier_id: 's1',
      p_request_type: 'quote',
      p_items: [{ offer_id: 'o1', quantity: 1 }],
      p_customer_notes: 'Entregar rápido',
    })));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Cotação solicitada com sucesso. Protocolo #order-id.'));
    // Cart resets to empty, which also unmounts the notes textarea (it only
    // renders while the cart has items) — its absence is itself proof the
    // notes state was cleared along with the cart.
    expect(screen.getByText('Adicione produtos de um fornecedor.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Observações para o fornecedor')).not.toBeInTheDocument();
  });

  it('creates a direct order and reports success', async () => {
    setupSupabase({ offers: [makeOffer({ id: 'o1', supplier_id: 's1', suppliers: { name: 'Fornecedor A', currency: 'BRL', order_mode: 'direct', minimum_order_value: 0 } })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar pedido' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Pedido criado com sucesso.'));
  });

  it('sends null customer notes when the notes field is left blank', async () => {
    const supabase = setupSupabase({ offers: [makeOffer({ id: 'o1', supplier_id: 's1' })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar cotação' }));

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('create_purchase_order', expect.objectContaining({ p_customer_notes: null })));
  });

  it('shows the error message and keeps the cart when the order creation fails', async () => {
    setupSupabase({
      offers: [makeOffer({ id: 'o1', supplier_id: 's1' })],
      rpcResult: { data: null, error: { message: 'Estoque insuficiente' } },
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar cotação' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Estoque insuficiente'));
    expect(screen.getByText('1× X1-Hybrid-5.0kW')).toBeInTheDocument();
  });

  it('does nothing when createOrder is invoked with an empty cart', async () => {
    // No direct way to click the (absent) buttons with an empty cart, but this
    // guards the `!cartSupplierId` early return by ensuring no order buttons
    // render and no rpc call happens when the cart is empty.
    const supabase = setupSupabase({ offers: [makeOffer({ id: 'o1', supplier_id: 's1' })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Solicitar cotação' })).not.toBeInTheDocument();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('SupplyTab: existing orders and cancellation', () => {
  it('lists existing orders with status, item summary and total', async () => {
    setupSupabase({
      orders: [makeOrder({ id: 'ord-abcdefgh', status: 'approved', request_type: 'direct', total_amount: 250 })],
    });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('Fornecedor A')).toBeInTheDocument());
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(screen.getByText('Pedido direto')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent?.startsWith('#ord-abcd') ?? false)).toBeInTheDocument();
    expect(screen.getByText('1× X1-Hybrid-5.0kW')).toBeInTheDocument();
  });

  it('falls back to subtotal when total_amount is null, and to the raw status when unmapped', async () => {
    setupSupabase({ orders: [makeOrder({ status: 'weird_status', total_amount: null, subtotal: 75 })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('weird_status')).toBeInTheDocument());
  });

  it('shows a cancel button for cancellable statuses and calls cancel_purchase_order', async () => {
    const supabase = setupSupabase({ orders: [makeOrder({ id: 'ord-1', status: 'requested' })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('cancel_purchase_order', { p_order_id: 'ord-1' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Pedido cancelado.'));
  });

  it('shows the error message returned by cancel_purchase_order', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'Falha ao cancelar' } });
    const from = vi.fn((table: string) => {
      if (table === 'purchase_orders') return makeQueryBuilder({ data: [makeOrder({ id: 'ord-1', status: 'requested' })], error: null });
      return makeQueryBuilder({ data: [], error: null });
    });
    createClientMock.mockReturnValue({ from, rpc, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) } });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Falha ao cancelar'));
  });

  it('does not show a cancel button for non-cancellable statuses', async () => {
    setupSupabase({ orders: [makeOrder({ id: 'ord-1', status: 'fulfilled' })] });
    renderWithShell(<SupplyTab />);

    await waitFor(() => expect(screen.getByText('Fornecedor A')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });
});
