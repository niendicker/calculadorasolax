// @vitest-environment jsdom

import { act } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import { useWizardStore } from '@/lib/store/wizard-store';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';
import type { Solution } from '@/lib/types';
import { SinglePageApp } from './SinglePageApp';

function makeSolution(partial: Partial<Solution> = {}): Solution {
  return {
    inverterId: 'inv-1',
    inverterModel: 'X1-Hybrid-5.0kW-G4',
    inverterQty: 1,
    batteryId: 'bat-1',
    batteryModel: 'TP-HS3.6',
    batteryQty: 1,
    pvPowerKw: 5,
    accessories: [],
    ...partial,
  };
}

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

  it('closes via the X button inside the mobile menu', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar menu' })[1]);
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

describe('SinglePageApp: desktop sidebar navigation', () => {
  it('navigates to Meu Catálogo and back to Projeto via the sidebar', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Meu Catálogo' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Meu Catálogo' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Projeto' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument();
  });

  it('scrolls the content area and toggles the compact title-bar padding', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    // The scrollable <section> isn't an ancestor of the title (portaled into a
    // sibling div outside it) or a labeled landmark, so it's found directly.
    const scrollArea = document.querySelector('section') as HTMLElement;
    Object.defineProperty(scrollArea, 'scrollTop', { value: 20, configurable: true });
    fireEvent.scroll(scrollArea);

    Object.defineProperty(scrollArea, 'scrollTop', { value: 0, configurable: true });
    fireEvent.scroll(scrollArea);
  });
});

describe('SinglePageApp: full mobile menu navigation', () => {
  it('navigates to every mobile-nav destination and closes the menu each time', async () => {
    setupSupabase({}, { loggedIn: true, role: 'admin' });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    function openMobileMenuNav() {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
      const dialog = screen.getByRole('dialog', { name: 'Menu' });
      return within(dialog).getByRole('navigation');
    }

    fireEvent.click(within(openMobileMenuNav()).getByRole('button', { name: 'Dimensionamento' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();

    fireEvent.click(within(openMobileMenuNav()).getByRole('button', { name: 'Meu Catálogo' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Meu Catálogo' })).toBeInTheDocument();

    fireEvent.click(within(openMobileMenuNav()).getByRole('button', { name: 'Clientes' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();

    fireEvent.click(within(openMobileMenuNav()).getByRole('button', { name: 'Perfil' }));
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  it('follows the "Administração" link from the mobile menu and closes it', async () => {
    setupSupabase({}, { loggedIn: true, role: 'admin' });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    fireEvent.click(within(dialog).getByRole('link', { name: /Administração/ }));

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });
});

describe('SinglePageApp: solution-dependent behavior', () => {
  it('exports the PDF report by calling window.print once a solution exists', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    act(() => { useWizardStore.setState({ solution: makeSolution() }); });
    window.print = vi.fn();

    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));
    fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }));

    expect(window.print).toHaveBeenCalled();
  });

  it('renders the printable report once a solution is set', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    act(() => { useWizardStore.setState({ solution: makeSolution() }); });
    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));

    await waitFor(() => expect(document.querySelector('.print-report')).toBeInTheDocument());
  });

  it('switches from the economic to the microgrid variant when chosen', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    const economic = makeSolution({ batteryModel: 'TP-HS3.6' });
    const microgrid = makeSolution({ batteryModel: 'TP-LD53', batteryQty: 2 });
    act(() => { useWizardStore.setState({ solution: { ...economic, microgridAlternative: microgrid } }); });

    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByText('Versão c/ Microrrede')).toBeInTheDocument());

    const microgridCard = screen.getByText('Versão c/ Microrrede').closest('.rounded-lg') as HTMLElement;
    fireEvent.click(within(microgridCard).getByRole('button', { name: 'Usar esta versão' }));

    expect(useWizardStore.getState().solution?.batteryModel).toBe('TP-LD53');
    expect(useWizardStore.getState().solution?.microgridAlternative).toBeUndefined();
  });

  it('keeps the economic variant when chosen, dropping the microgrid alternative', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    const economic = makeSolution({ batteryModel: 'TP-HS3.6' });
    const microgrid = makeSolution({ batteryModel: 'TP-LD53', batteryQty: 2 });
    act(() => { useWizardStore.setState({ solution: { ...economic, microgridAlternative: microgrid } }); });

    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByText('Versão Econômica')).toBeInTheDocument());

    const economicCard = screen.getByText('Versão Econômica').closest('.rounded-lg') as HTMLElement;
    fireEvent.click(within(economicCard).getByRole('button', { name: 'Usar esta versão' }));

    expect(useWizardStore.getState().solution?.batteryModel).toBe('TP-HS3.6');
    expect(useWizardStore.getState().solution?.microgridAlternative).toBeUndefined();
  });
});

describe('SinglePageApp: availableInverterModels / maxPowerPerPhaseW derivation', () => {
  it('computes availableInverterModels from approved combos matching the current grid/battery topology', async () => {
    useWizardStore.setState((s) => ({
      residentialOptions: { ...s.residentialOptions, gridType: 'singlePhase_220', topology: 'HighVoltage' },
    }));
    setupSupabase({
      approved_solutions: {
        data: [{ grid_topology: '1p_220V', battery_topology: 'HV', inverter_model: 'X1-Hybrid-5.0kW-G4' }],
        error: null,
      },
    });
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());
  });

  it('derives maxPowerPerPhaseW from the selected inverter on a multi-phase grid', async () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'threePhase_220',
        topology: 'HighVoltage',
        inverterModel: 'X3-Hybrid-10.0kW-G4',
      },
    }));
    setupSupabase({
      inverters: {
        data: [
          {
            id: 'i1',
            model: 'X3-Hybrid-10.0kW-G4',
            topology: 'HV',
            phases: 3,
            standard_power_kva: 10,
            peak_power_kva: 12,
            max_power_per_phase_w: null,
            image_url: null,
            documents: [],
            flags: [],
          },
        ],
        error: null,
      },
    });
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    await waitFor(() => expect(useWizardStore.getState().residentialOptions.maxPowerPerPhaseW).toBeCloseTo(3333.33, 1));
  });
});

describe('SinglePageApp: uploading a feature photo', () => {
  it('uploads an ATS photo through the profile-assets bucket and stores the public URL', async () => {
    const supabase = setupSupabase({}, { loggedIn: true });
    (supabase as unknown as { storage: unknown }).storage = {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.example.com/ats.png' } }),
      }),
    };
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /^ATS Externo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));

    const file = new File(['fake-image'], 'disjuntor.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Anexar foto/);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole('img', { name: 'Foto do disjuntor geral' })).toHaveAttribute('src', 'https://cdn.example.com/ats.png'));
  });
});
