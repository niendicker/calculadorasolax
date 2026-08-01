// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { ProfilePanel } from './ProfilePanel';

const { createClientMock, routerMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));

const initialProfile = {
  id: 'user-1',
  email: 'a@b.com',
  full_name: 'Fulano',
  phone: '11999999999',
  role: 'user' as const,
  company_name: '',
  company_address: '',
  company_logo_url: '',
};

beforeEach(() => {
  createClientMock.mockReset();
  routerMock.replace.mockReset();
  routerMock.refresh.mockReset();
});

describe('ProfilePanel', () => {
  it('renders the current profile values, with email/role read-only', () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    render(<ProfilePanel locale="pt" initialProfile={initialProfile} />);

    expect(screen.getByLabelText('Email')).toHaveValue('a@b.com');
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Tipo de acesso')).toHaveValue('Usuário comum');
    expect(screen.getByLabelText('Nome')).toHaveValue('Fulano');
  });

  it('shows "Administrador" for an admin profile', () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    render(<ProfilePanel locale="pt" initialProfile={{ ...initialProfile, role: 'admin' }} />);
    expect(screen.getByLabelText('Tipo de acesso')).toHaveValue('Administrador');
  });

  it('saves the edited profile and shows a success message', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    render(<ProfilePanel locale="pt" initialProfile={initialProfile} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Fulano Editado' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar perfil/ }));

    await waitFor(() => expect(screen.getByText('Perfil atualizado.')).toBeInTheDocument());
  });

  it('shows the Supabase error message when saving fails', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: null, error: { message: 'coluna inválida' } } } })
    );
    render(<ProfilePanel locale="pt" initialProfile={initialProfile} />);

    fireEvent.click(screen.getByRole('button', { name: /Salvar perfil/ }));

    await waitFor(() => expect(screen.getByText('coluna inválida')).toBeInTheDocument());
  });

  it('updates phone, company name, company address and logo url fields', () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    render(<ProfilePanel locale="pt" initialProfile={initialProfile} />);

    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11888888888' } });
    fireEvent.change(screen.getByLabelText('Nome da empresa'), { target: { value: 'Minha Empresa' } });
    fireEvent.change(screen.getByLabelText('Endereço da empresa'), { target: { value: 'Rua 1, 100' } });
    fireEvent.change(screen.getByLabelText('URL da logomarca'), { target: { value: 'https://x.com/logo.png' } });

    expect(screen.getByLabelText('Telefone')).toHaveValue('11888888888');
    expect(screen.getByLabelText('Nome da empresa')).toHaveValue('Minha Empresa');
    expect(screen.getByLabelText('Endereço da empresa')).toHaveValue('Rua 1, 100');
    expect(screen.getByLabelText('URL da logomarca')).toHaveValue('https://x.com/logo.png');
  });

  it('saves the edited company fields, sending trimmed values to Supabase', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn(() => ({ upsert })),
    });
    render(<ProfilePanel locale="pt" initialProfile={initialProfile} />);

    fireEvent.change(screen.getByLabelText('Nome da empresa'), { target: { value: '  Minha Empresa  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar perfil/ }));

    await waitFor(() => expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'Minha Empresa' })
    ));
  });

  it('signs out and redirects to login', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue(createSupabaseMock({ auth: { signOut } }));
    render(<ProfilePanel locale="pt" initialProfile={initialProfile} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(routerMock.replace).toHaveBeenCalledWith('/pt/login');
  });
});
