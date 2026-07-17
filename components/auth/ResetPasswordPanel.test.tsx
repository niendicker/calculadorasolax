// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { ResetPasswordPanel } from './ResetPasswordPanel';

const { createClientMock, routerMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));

beforeEach(() => {
  createClientMock.mockReset();
  routerMock.replace.mockReset();
  routerMock.refresh.mockReset();
});

describe('ResetPasswordPanel', () => {
  it('rejects mismatched passwords without calling Supabase', () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    render(<ResetPasswordPanel locale="pt" />);

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'segredo123' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'outrasenha' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar nova senha/ }));

    expect(screen.getByText('As senhas não conferem.')).toBeInTheDocument();
  });

  it('updates the password and redirects to the profile page on success', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue(createSupabaseMock({ auth: { updateUser } }));
    render(<ResetPasswordPanel locale="pt" />);

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'segredo123' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'segredo123' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar nova senha/ }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'segredo123' }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/pt/profile'));
  });

  it('shows the Supabase error message when the update fails', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: 'Sessão expirada' } });
    createClientMock.mockReturnValue(createSupabaseMock({ auth: { updateUser } }));
    render(<ResetPasswordPanel locale="pt" />);

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'segredo123' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'segredo123' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar nova senha/ }));

    await waitFor(() => expect(screen.getByText('Sessão expirada')).toBeInTheDocument());
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
