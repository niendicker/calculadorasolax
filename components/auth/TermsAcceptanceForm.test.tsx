// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { TermsAcceptanceForm } from './TermsAcceptanceForm';

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

describe('TermsAcceptanceForm', () => {
  it('disables "Aceitar e continuar" until the checkbox is checked', () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    render(<TermsAcceptanceForm locale="pt" redirectTo="/pt" />);

    const acceptButton = screen.getByRole('button', { name: /Aceitar e continuar/ });
    expect(acceptButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(acceptButton).toBeEnabled();
  });

  it('records acceptance and redirects once accepted', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: null, error: null } } })
    );
    render(<TermsAcceptanceForm locale="pt" redirectTo="/pt" />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Aceitar e continuar/ }));

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/pt'));
  });

  it('redirects to login instead when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));
    render(<TermsAcceptanceForm locale="pt" redirectTo="/pt/wizard" />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Aceitar e continuar/ }));

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(`/pt/login?redirect=${encodeURIComponent('/pt/wizard')}`)
    );
  });

  it('shows the Supabase error message when saving acceptance fails', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: null, error: { message: 'db down' } } } })
    );
    render(<TermsAcceptanceForm locale="pt" redirectTo="/pt" />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Aceitar e continuar/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('db down'));
  });

  it('signs out and redirects to login', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue(createSupabaseMock({ auth: { signOut } }));
    render(<TermsAcceptanceForm locale="pt" redirectTo="/pt" />);

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(routerMock.replace).toHaveBeenCalledWith('/pt/login');
  });
});
