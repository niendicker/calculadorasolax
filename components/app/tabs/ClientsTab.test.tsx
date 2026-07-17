// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Client } from '@/lib/types';
import { renderWithShell } from '../test-helpers/render-with-shell';
import { ClientsTab } from './ClientsTab';

function makeClient(partial: Partial<Client> & Pick<Client, 'id' | 'name'>): Client {
  return {
    email: '',
    phone: '',
    document: '',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function setup(overrides: Partial<Parameters<typeof ClientsTab>[0]> = {}) {
  const props = {
    clients: [] as Client[],
    onAdd: vi.fn().mockResolvedValue(makeClient({ id: 'new', name: 'Novo Cliente' })),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const utils = renderWithShell(<ClientsTab {...props} />);
  return { ...utils, props };
}

describe('ClientsTab: empty and list states', () => {
  it('shows the empty state when there are no clients', () => {
    setup();
    expect(screen.getByText('Nenhum cliente cadastrado ainda.')).toBeInTheDocument();
  });

  it('lists clients and filters them by search', () => {
    setup({
      clients: [makeClient({ id: 'c1', name: 'Ana' }), makeClient({ id: 'c2', name: 'Beto' })],
    });

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Beto')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Pesquisar cliente...'), { target: { value: 'ana' } });

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Beto')).not.toBeInTheDocument();
  });
});

describe('ClientsTab: add flow', () => {
  it('opens the form via the header button, requires a name, and saves', async () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /Salvar cliente/ });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo Cliente' } });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Novo Cliente' })));
    // Form closes back to the list on success.
    await waitFor(() => expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument());
  });

  it('shows a limit-reached error verbatim and keeps the form open', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Limite de 50 clientes cadastrados atingido.'));
    setup({ onAdd });

    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar cliente/ }));

    await waitFor(() => expect(screen.getByText('Limite de 50 clientes cadastrados atingido.')).toBeInTheDocument());
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  it('shows a generic error message for any other failure', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('boom'));
    setup({ onAdd });

    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar cliente/ }));

    await waitFor(() =>
      expect(screen.getByText('Não foi possível salvar o cliente. Verifique sua conexão e tente novamente.')).toBeInTheDocument()
    );
  });

  it('closes the form without saving on Cancelar', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });
});

describe('ClientsTab: edit flow', () => {
  it('pre-fills the form and calls onUpdate with the id', async () => {
    const client = makeClient({ id: 'c1', name: 'Ana', email: 'ana@x.com' });
    const { props } = setup({ clients: [client] });

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByLabelText('Nome')).toHaveValue('Ana');
    expect(screen.getByLabelText('Email')).toHaveValue('ana@x.com');

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana Editada' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar cliente/ }));

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Ana Editada' }))
    );
  });
});

describe('ClientsTab: remove flow', () => {
  it('confirms via the delete popover before calling onRemove', async () => {
    const client = makeClient({ id: 'c1', name: 'Ana' });
    const { props } = setup({ clients: [client] });

    fireEvent.click(screen.getByRole('button', { name: 'Remover cliente Ana' }));

    const confirmButton = await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith('c1'));
  });
});
