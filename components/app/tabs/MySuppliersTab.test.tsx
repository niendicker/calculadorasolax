// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithShell } from '../test-helpers/render-with-shell';
import { MySuppliersTab } from './MySuppliersTab';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

type QueryResult<T = unknown> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => Promise.resolve(result),
    insert: () => builder,
    delete: () => builder,
    then: (resolve: (value: QueryResult) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const supplierA = { id: 'sup-a', name: 'Fornecedor A', description: 'Distribuidor nacional', order_mode: 'both', is_default_for_all: false };
const supplierB = { id: 'sup-b', name: 'Fornecedor B', description: null, order_mode: 'quote', is_default_for_all: false };
const defaultSupplier = { id: 'sup-default', name: 'Fornecedor Padrão', description: null, order_mode: 'direct', is_default_for_all: true };

function setupSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  suppliers = [supplierA, supplierB] as Record<string, unknown>[],
  suppliersError = null as { message: string } | null,
  maxUserSuppliers = 2,
  preferences = [] as { supplier_id: string }[],
  overrideFrom,
}: {
  user?: { id: string } | null;
  suppliers?: Record<string, unknown>[];
  suppliersError?: { message: string } | null;
  maxUserSuppliers?: number;
  preferences?: { supplier_id: string }[];
  overrideFrom?: (table: string, builder: Record<string, unknown>) => Record<string, unknown>;
} = {}) {
  const from = vi.fn((table: string) => {
    let builder: Record<string, unknown>;
    if (table === 'suppliers') builder = makeQueryBuilder(suppliersError ? { data: null, error: suppliersError } : { data: suppliers, error: null });
    else if (table === 'app_settings') builder = makeQueryBuilder({ data: { max_user_suppliers: maxUserSuppliers }, error: null });
    else if (table === 'user_supplier_preferences') builder = makeQueryBuilder({ data: preferences, error: null });
    else builder = makeQueryBuilder({ data: null, error: null });
    return overrideFrom ? overrideFrom(table, builder) : builder;
  });
  const supabase = { from, auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } };
  createClientMock.mockReturnValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MySuppliersTab: loading and access', () => {
  it('prompts sign-in when there is no authenticated user', async () => {
    setupSupabase({ user: null });
    renderWithShell(<MySuppliersTab />);
    expect(await screen.findByText('Entre na sua conta para escolher fornecedores.')).toBeInTheDocument();
  });

  it('shows the load error message when fetching suppliers fails', async () => {
    setupSupabase({ suppliersError: { message: 'load failed' } });
    renderWithShell(<MySuppliersTab />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('load failed'));
  });
});

describe('MySuppliersTab: default suppliers', () => {
  it('lists default suppliers separately as locked/non-selectable', async () => {
    setupSupabase({ suppliers: [supplierA, defaultSupplier] });
    renderWithShell(<MySuppliersTab />);
    await screen.findByText('Fornecedor Padrão');
    expect(screen.getByText('Padrão')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Fornecedor Padrão/ })).not.toBeInTheDocument();
  });
});

describe('MySuppliersTab: selecting preferred suppliers', () => {
  it('shows the configured quota and current selection count', async () => {
    setupSupabase({ maxUserSuppliers: 3, preferences: [{ supplier_id: 'sup-a' }] });
    renderWithShell(<MySuppliersTab />);
    expect(await screen.findByText('Seus fornecedores preferidos (1/3)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Fornecedor A/ })).toBeChecked();
  });

  it('adds a supplier preference when checked', async () => {
    const supabase = setupSupabase();
    renderWithShell(<MySuppliersTab />);
    const checkbox = await screen.findByRole('checkbox', { name: /Fornecedor A/ });
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(supabase.from).toHaveBeenCalledWith('user_supplier_preferences');
  });

  it('removes a supplier preference when unchecked', async () => {
    setupSupabase({ preferences: [{ supplier_id: 'sup-a' }] });
    renderWithShell(<MySuppliersTab />);
    const checkbox = await screen.findByRole('checkbox', { name: /Fornecedor A/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });

  it('blocks new selections once the quota is reached, disabling the option and explaining why', async () => {
    setupSupabase({ maxUserSuppliers: 1, preferences: [{ supplier_id: 'sup-a' }] });
    renderWithShell(<MySuppliersTab />);
    const otherCheckbox = await screen.findByRole('checkbox', { name: /Fornecedor B/ });
    expect(otherCheckbox).toBeDisabled();
    fireEvent.click(otherCheckbox);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Limite de 1 fornecedores atingido.'));
    expect(otherCheckbox).not.toBeChecked();
  });

  it('shows an error message when persisting a selection fails', async () => {
    setupSupabase({
      overrideFrom: (table, builder) => {
        if (table === 'user_supplier_preferences') {
          builder.insert = () => Promise.resolve({ data: null, error: { message: 'insert failed' } });
        }
        return builder;
      },
    });
    renderWithShell(<MySuppliersTab />);
    const checkbox = await screen.findByRole('checkbox', { name: /Fornecedor A/ });
    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('insert failed'));
    expect(checkbox).not.toBeChecked();
  });
});
