// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserLoadCatalogItem } from '@/lib/types';
import { UserLoadCatalogItemMenu } from './UserLoadCatalogItemMenu';

const item: UserLoadCatalogItem = {
  id: 'u1',
  name: 'Bomba dágua',
  powerW: 750,
  ipInRatio: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Opções de Bomba dágua' }));
}

beforeEach(() => {
  // getBoundingClientRect isn't implemented in jsdom; the popover positioning
  // effect reads it from both the trigger and the popover itself.
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    top: 100,
    bottom: 120,
    left: 50,
    right: 80,
    width: 30,
    height: 20,
    x: 50,
    y: 100,
    toJSON: () => ({}),
  })) as unknown as typeof Element.prototype.getBoundingClientRect;
});

describe('UserLoadCatalogItemMenu', () => {
  it('toggles the menu open and closed via the trigger button', async () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openMenu();
    expect(await screen.findByRole('dialog', { name: 'Opções de Bomba dágua' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opções de Bomba dágua' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Opções de Bomba dágua' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('navigates to the edit view, saves changes, and closes the menu', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn();
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    openMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Bomba renomeada' } });
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '900' } });
    fireEvent.change(screen.getByLabelText('IP/IN'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('u1', { name: 'Bomba renomeada', powerW: 900, ipInRatio: 2 })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('falls back to the existing powerW/ipInRatio when the edited values are not valid numbers', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn();
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    openMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('IP/IN'), { target: { value: '' } });
    // Power stays a valid non-empty string ("750") so Salvar remains enabled;
    // only IP/IN is cleared to hit the `Number(editIpIn) || 1` fallback.
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('u1', { name: 'Bomba dágua', powerW: 750, ipInRatio: 1 })
    );
  });

  it('disables Salvar when the name or power is empty', async () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    openMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('cancels out of the edit view back to the menu', async () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    openMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('navigates to the confirm-delete view, deletes, and closes the menu', async () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    openMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(screen.getByText('Remover carga?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancels out of the confirm-delete view back to the menu', async () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    openMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText('Remover carga?')).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('closes the menu on Escape and resets back to the menu view on reopen', async () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    openMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    openMenu();
    // Reopening resets to the menu view, not the edit view left open before.
    expect(await screen.findByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('stays open on a mousedown inside the popover, but closes on one outside it', async () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    openMenu();
    const dialog = await screen.findByRole('dialog');
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('ignores non-Escape key presses while the menu is open', async () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(<UserLoadCatalogItemMenu item={item} onUpdate={onUpdate} onRemove={onRemove} />);

    openMenu();
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
