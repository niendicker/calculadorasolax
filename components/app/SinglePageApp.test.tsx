// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';
import { SinglePageApp } from './SinglePageApp';

const { createClientMock, routerMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));

const userRow = { id: 'user-1', email: 'user@example.com', user_metadata: {} };

function profileRow(role: 'admin' | 'user' = 'user') {
  return {
    id: 'user-1',
    email: 'user@example.com',
    full_name: 'Fulano',
    phone: '',
    role,
    company_name: '',
    company_address: '',
    company_logo_url: '',
  };
}

function setupSupabase(
  overrides: Record<string, { data: unknown; error: null } | { data: null; error: { message: string } }> = {},
  { loggedIn = false, role = 'user' as 'admin' | 'user' }: { loggedIn?: boolean; role?: 'admin' | 'user' } = {}
) {
  const supabase = createSupabaseMock({
    user: loggedIn ? userRow : null,
    tableResults: {
      load_catalog: { data: [], error: null },
      batteries: { data: [], error: null },
      inverters: { data: [], error: null },
      accessories: { data: [], error: null },
      approved_solutions: { data: [], error: null },
      load_presets: { data: [], error: null },
      profiles: { data: loggedIn ? profileRow(role) : null, error: null },
      projects: { data: [], error: null },
      clients: { data: [], error: null },
      user_load_catalog: { data: [], error: null },
      user_load_presets: { data: [], error: null },
      user_stock_items: { data: [], error: null },
      ...overrides,
    },
  });
  createClientMock.mockReturnValue(supabase);
  return supabase;
}

function renderApp() {
  return render(
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <SinglePageApp />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  createClientMock.mockReset();
  routerMock.push.mockReset();
  routerMock.replace.mockReset();
  routerMock.refresh.mockReset();
  resetWizardStore();
  Element.prototype.scrollTo = vi.fn();
});

describe('SinglePageApp: initial load and navigation', () => {
  it('shows the Projeto tab by default and switches tabs via the sidebar', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument();
  });

  it('shows an "Administração" link only for admin profiles', async () => {
    setupSupabase({}, { loggedIn: true, role: 'admin' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Administração/ })).toHaveAttribute('href', '/pt/admin');
  });

  it('hides the "Administração" link for regular users', async () => {
    setupSupabase({}, { loggedIn: true, role: 'user' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /Administração/ })).not.toBeInTheDocument();
  });
});

describe('SinglePageApp: login-gated navigation', () => {
  it('redirects to login when opening Clientes without a profile', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Clientes' }));

    expect(routerMock.push).toHaveBeenCalledWith('/pt/login?redirect=/pt');
  });

  it('redirects to login when opening Perfil without a profile', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));

    expect(routerMock.push).toHaveBeenCalledWith('/pt/login?redirect=/pt');
  });

  it('opens Clientes and Perfil in-app when a profile is present', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clientes' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });
});

describe('SinglePageApp: sign out', () => {
  it('signs out and redirects to login', async () => {
    const supabase = setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
    expect(routerMock.replace).toHaveBeenCalledWith('/pt/login');
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it('does not show a "Sair" button for a logged-out visitor', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
  });
});

describe('SinglePageApp: mobile menu', () => {
  it('opens, switches tabs, and closes', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    const mobileNav = within(dialog).getByRole('navigation');

    fireEvent.click(within(mobileNav).getByRole('button', { name: 'Catálogo' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar menu' })[0]);
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });
});

describe('SinglePageApp: account data error', () => {
  it('shows a retry banner when account-scoped data fails to load, and clears it on retry', async () => {
    setupSupabase({ projects: { data: null, error: { message: 'db down' } } }, { loggedIn: true });
    renderApp();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar seus clientes, projetos ou cargas salvas. Verifique sua conexão e tente novamente.')).toBeInTheDocument()
    );

    setupSupabase({}, { loggedIn: true });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() =>
      expect(
        screen.queryByText('Não foi possível carregar seus clientes, projetos ou cargas salvas. Verifique sua conexão e tente novamente.')
      ).not.toBeInTheDocument()
    );
  });
});

describe('SinglePageApp: summary panel', () => {
  it('shows the empty-state message on tabs without a summary, and hides it on Projeto', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());
    expect(screen.queryByText('Nenhum resumo disponível para esta seção.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));
    await waitFor(() => expect(screen.getByText('Nenhum resumo disponível para esta seção.')).toBeInTheDocument());
  });
});
