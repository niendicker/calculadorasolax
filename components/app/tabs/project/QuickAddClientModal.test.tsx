// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Client } from '@/lib/types';
import { QuickAddClientModal } from './QuickAddClientModal';

function makeClient(): Client {
  return {
    id: 'client-1',
    name: 'Maria Silva',
    email: '',
    phone: '(11) 99999-9999',
    document: '',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('QuickAddClientModal', () => {
  it('does not render while closed and opens with an empty form', async () => {
    const props = { open: false, onClose: vi.fn(), onAdd: vi.fn(), onCreated: vi.fn() };
    const { rerender } = render(<QuickAddClientModal {...props} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<QuickAddClientModal {...props} open />);
    expect(await screen.findByRole('dialog', { name: 'Novo cliente' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome/)).toHaveValue('');
    expect(screen.getByLabelText('Telefone')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Salvar cliente' })).toBeDisabled();
  });

  it('formats the phone and creates a client with the minimal payload', async () => {
    const onAdd = vi.fn().mockResolvedValue(makeClient());
    const onCreated = vi.fn();
    render(<QuickAddClientModal open onClose={vi.fn()} onAdd={onAdd} onCreated={onCreated} />);

    fireEvent.change(await screen.findByLabelText(/Nome/), { target: { value: 'Maria Silva' } });
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11999999999' } });
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 99999-9999');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(makeClient()));
    expect(onAdd).toHaveBeenCalledWith({ name: 'Maria Silva', phone: '(11) 99999-9999', email: '', document: '', notes: '' });
  });

  it('closes from cancel, backdrop and Escape', async () => {
    const onClose = vi.fn();
    render(<QuickAddClientModal open onClose={onClose} onAdd={vi.fn()} onCreated={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: 'Novo cliente' });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(dialog);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('shows the limit error and re-enables saving after a failed request', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Limite de 50 clientes atingido.'));
    render(<QuickAddClientModal open onClose={vi.fn()} onAdd={onAdd} onCreated={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/Nome/), { target: { value: 'Cliente no limite' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cliente' }));

    expect(await screen.findByText('Limite de 50 clientes atingido.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar cliente' })).not.toBeDisabled();
  });

  it('uses a generic message for unexpected failures', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Falha de rede'));
    render(<QuickAddClientModal open onClose={vi.fn()} onAdd={onAdd} onCreated={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/Nome/), { target: { value: 'Cliente' } });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(await screen.findByText('Não foi possível salvar o cliente. Tente novamente.')).toBeInTheDocument();
  });
});
