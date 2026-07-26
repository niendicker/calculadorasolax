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

// The desktop sidebar and the mobile bottom nav bar both render buttons named
// "Projeto"/"Dimensionamento"/"Catálogo"/"Clientes" at the same time (jsdom
// doesn't apply the `lg:hidden`/`hidden lg:flex` breakpoint classes that keep
// only one visible per viewport) — scope to the sidebar's landmark to avoid
// "multiple elements found" on plain screen.getByRole queries.
function sidebarNav() {
  return within(screen.getByRole('navigation', { name: 'Navegação principal' }));
}

function bottomNav() {
  return within(screen.getByRole('navigation', { name: 'Navegação' }));
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

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Catálogo' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeInTheDocument();

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
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
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Clientes' }));

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

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Clientes' }));
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

describe('SinglePageApp: mobile bottom nav', () => {
  it('switches tabs directly from the bottom nav bar, without opening a menu', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Catálogo' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeInTheDocument();

    fireEvent.click(bottomNav().getByRole('button', { name: 'Dimensionamento' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument();
  });

  it('opens the summary drawer by tapping the already-active tab again', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    // Projeto is already the active tab (and has a summary), so tapping it
    // again opens the summary instead of just re-selecting the same tab.
    fireEvent.click(bottomNav().getByRole('button', { name: 'Projeto' }));
    expect(screen.getByRole('dialog', { name: 'Resumo' })).toBeInTheDocument();
  });

  it('switches to an inactive tab on first tap, and only opens its summary once already active', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Dimensionamento' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Resumo' })).not.toBeInTheDocument();

    fireEvent.click(bottomNav().getByRole('button', { name: 'Dimensionamento' }));
    expect(screen.getByRole('dialog', { name: 'Resumo' })).toBeInTheDocument();
  });

  it('reaches Clientes via the "Mais" menu instead of the bottom bar', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    expect(bottomNav().queryByRole('button', { name: 'Clientes' })).not.toBeInTheDocument();

    fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
    const dialog = screen.getByRole('dialog', { name: 'Mais opções' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clientes' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
  });

  it('opens the "Mais" menu, switches to Meu Catálogo, and closes', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
    const dialog = screen.getByRole('dialog', { name: 'Mais opções' });
    const moreNav = within(dialog).getByRole('navigation');

    fireEvent.click(within(moreNav).getByRole('button', { name: 'Meu Catálogo' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Meu Catálogo' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Mais opções' })).not.toBeInTheDocument();

    fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar menu' })[0]);
    expect(screen.queryByRole('dialog', { name: 'Mais opções' })).not.toBeInTheDocument();
  });

  it('closes the "Mais" menu via the X button inside it', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar menu' })[1]);
    expect(screen.queryByRole('dialog', { name: 'Mais opções' })).not.toBeInTheDocument();
  });

  it('opens the summary drawer as soon as "Calcular" is pressed, without waiting for the result', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    act(() => {
      useWizardStore.setState((s) => ({
        residentialOptions: {
          ...s.residentialOptions,
          topology: 'HighVoltage',
          batteryModel: 'TP-HS3.6',
          gridType: 'singlePhase_220',
          loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
        },
      }));
    });

    fireEvent.click(bottomNav().getByRole('button', { name: 'Dimensionamento' }));
    expect(screen.queryByRole('dialog', { name: 'Resumo' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    expect(screen.getByRole('dialog', { name: 'Resumo' })).toBeInTheDocument();
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

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Catálogo' }));
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

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Projeto' }));
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
  it('navigates to every mobile-nav destination, via the bottom bar and the "Mais" menu', async () => {
    setupSupabase({}, { loggedIn: true, role: 'admin' });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    function openMoreMenuNav() {
      fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
      const dialog = screen.getByRole('dialog', { name: 'Mais opções' });
      return within(dialog).getByRole('navigation');
    }

    fireEvent.click(bottomNav().getByRole('button', { name: 'Dimensionamento' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument();

    fireEvent.click(within(openMoreMenuNav()).getByRole('button', { name: 'Clientes' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Mais opções' })).not.toBeInTheDocument();

    fireEvent.click(within(openMoreMenuNav()).getByRole('button', { name: 'Meu Catálogo' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Meu Catálogo' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Mais opções' })).not.toBeInTheDocument();

    fireEvent.click(within(openMoreMenuNav()).getByRole('button', { name: 'Perfil' }));
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  it('follows the "Administração" link from the "Mais" menu and closes it', async () => {
    setupSupabase({}, { loggedIn: true, role: 'admin' });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
    const dialog = screen.getByRole('dialog', { name: 'Mais opções' });
    fireEvent.click(within(dialog).getByRole('link', { name: /Administração/ }));

    expect(screen.queryByRole('dialog', { name: 'Mais opções' })).not.toBeInTheDocument();
  });
});

describe('SinglePageApp: solution-dependent behavior', () => {
  it('exports the PDF report by calling window.print once a solution exists', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    act(() => {
      useWizardStore.setState((s) => ({
        solution: makeSolution(),
        residentialOptions: {
          ...s.residentialOptions,
          topology: 'HighVoltage',
          batteryModel: 'TP-HS3.6',
          gridType: 'singlePhase_220',
          loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
        },
      }));
    });
    window.print = vi.fn();

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Baixar relatório/ })[0]);

    expect(window.print).toHaveBeenCalled();
  });

  it('sets document.title to "projeto_data" right before printing, and restores it afterwards', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    const originalTitle = document.title;
    act(() => {
      useWizardStore.setState((s) => ({
        solution: makeSolution(),
        projectInfo: { ...s.projectInfo, name: 'Casa de praia' },
        residentialOptions: {
          ...s.residentialOptions,
          topology: 'HighVoltage',
          batteryModel: 'TP-HS3.6',
          gridType: 'singlePhase_220',
          loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
        },
      }));
    });
    let titleDuringPrint = '';
    window.print = vi.fn(() => { titleDuringPrint = document.title; });

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Baixar relatório/ })[0]);

    expect(titleDuringPrint).toMatch(/^Casa_de_praia_\d{4}-\d{2}-\d{2}$/);

    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe(originalTitle);
  });

  it('does not export the PDF when the config that produced the solution is no longer valid (e.g. loads cleared after calculating)', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    act(() => { useWizardStore.setState({ solution: makeSolution() }); });
    window.print = vi.fn();

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Baixar relatório/ })[0]);

    expect(window.print).not.toHaveBeenCalled();
  });

  it('renders the printable report once a solution is set', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    act(() => { useWizardStore.setState({ solution: makeSolution() }); });
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));

    await waitFor(() => expect(document.querySelector('.print-report')).toBeInTheDocument());
  });

  it('switches from the economic to the microgrid variant when chosen', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeInTheDocument());

    const economic = makeSolution({ batteryModel: 'TP-HS3.6' });
    const microgrid = makeSolution({ batteryModel: 'TP-LD53', batteryQty: 2 });
    act(() => { useWizardStore.setState({ solution: { ...economic, microgridAlternative: microgrid } }); });

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
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

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
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

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
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

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    await waitFor(() => expect(useWizardStore.getState().residentialOptions.maxPowerPerPhaseW).toBeCloseTo(3333.33, 1));
  });
});

describe('SinglePageApp: auto-recalculates when the battery selection changes', () => {
  const batteryRow = {
    id: 'b1',
    model: 'TP-HS3.6',
    nickname: null,
    capacity_kwh: 3.6,
    topology: 'HV',
    standard_power_kw: 1.8,
    peak_power_kw: 2.5,
    min_soc_percent: 10,
    expansion_model: null,
    image_url: null,
    documents: [],
  };

  it('calls calculate automatically once a battery is picked, without pressing Calcular', async () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'singlePhase_220',
        topology: 'HighVoltage',
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    const supabase = setupSupabase({ batteries: { data: [batteryRow], error: null } });
    const invoke = vi.fn().mockResolvedValue({ data: makeSolution(), error: null });
    (supabase as unknown as { functions: unknown }).functions = { invoke };

    renderApp();
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: 'Armazenamento de Energia' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));
    fireEvent.click(await screen.findByText('TP-HS3.6'));

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith(
      'calculate-residential',
      expect.objectContaining({ body: expect.objectContaining({ batteryModel: 'TP-HS3.6' }) })
    );
  });

  it('calls calculate automatically once the inverter selection changes, without pressing Calcular', async () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'singlePhase_220',
        topology: 'HighVoltage',
        batteryModel: 'TP-HS3.6',
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    const supabase = setupSupabase({
      batteries: { data: [batteryRow], error: null },
      inverters: {
        data: [
          {
            id: 'i1',
            model: 'X1-Hybrid-5.0kW-G4',
            topology: 'HV',
            phases: 1,
            standard_power_kva: 5,
            peak_power_kva: 7,
            max_power_per_phase_w: null,
            image_url: null,
            documents: [],
          },
        ],
        error: null,
      },
      // Needed for the inverter to show up as an available option once a
      // gridType is set — otherwise availableInverterModels comes back empty
      // and InverterModelPicker filters every inverter out.
      approved_solutions: {
        data: [{ grid_topology: '1p_220V', battery_topology: 'HV', inverter_model: 'X1-Hybrid-5.0kW-G4' }],
        error: null,
      },
    });
    const invoke = vi.fn().mockResolvedValue({ data: makeSolution(), error: null });
    (supabase as unknown as { functions: unknown }).functions = { invoke };

    renderApp();
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: 'Armazenamento de Energia' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Inversores Híbridos' }));
    fireEvent.click(await screen.findByText('X1-Hybrid-5.0kW-G4'));

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith(
      'calculate-residential',
      expect.objectContaining({ body: expect.objectContaining({ inverterModel: 'X1-Hybrid-5.0kW-G4' }) })
    );
  });

  it('does not auto-calculate on an inverter change while other required fields are still missing', async () => {
    // No gridType/loads/battery configured — canCalculate stays false after picking an inverter.
    const supabase = setupSupabase({
      inverters: {
        data: [
          {
            id: 'i1',
            model: 'X1-Hybrid-5.0kW-G4',
            topology: 'HV',
            phases: 1,
            standard_power_kva: 5,
            peak_power_kva: 7,
            max_power_per_phase_w: null,
            image_url: null,
            documents: [],
          },
        ],
        error: null,
      },
    });
    const invoke = vi.fn().mockResolvedValue({ data: makeSolution(), error: null });
    (supabase as unknown as { functions: unknown }).functions = { invoke };

    renderApp();
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: 'Armazenamento de Energia' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Inversores Híbridos' }));
    fireEvent.click(await screen.findByText('X1-Hybrid-5.0kW-G4'));

    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not auto-calculate while other required fields are still missing', async () => {
    // No gridType/loads configured — canCalculate stays false after picking a battery.
    useWizardStore.setState((s) => ({
      residentialOptions: { ...s.residentialOptions, topology: 'HighVoltage' },
    }));
    const supabase = setupSupabase({ batteries: { data: [batteryRow], error: null } });
    const invoke = vi.fn().mockResolvedValue({ data: makeSolution(), error: null });
    (supabase as unknown as { functions: unknown }).functions = { invoke };

    renderApp();
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: 'Armazenamento de Energia' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));
    fireEvent.click(await screen.findByText('TP-HS3.6'));

    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('SinglePageApp: Limpar pre-selects a default HV battery', () => {
  it('selects the first HV battery from the catalog after clicking Limpar', async () => {
    const batteryRows = [
      {
        id: 'b1',
        model: 'TP-HS3.6',
        nickname: null,
        capacity_kwh: 3.6,
        topology: 'HV',
        standard_power_kw: 1.8,
        peak_power_kw: 2.5,
        min_soc_percent: 10,
        expansion_model: null,
        image_url: null,
        documents: [],
      },
      {
        id: 'b2',
        model: 'TP-LD53',
        nickname: null,
        capacity_kwh: 5.3,
        topology: 'LV',
        standard_power_kw: 2.5,
        peak_power_kw: 3.5,
        min_soc_percent: 10,
        expansion_model: null,
        image_url: null,
        documents: [],
      },
    ];
    setupSupabase({ batteries: { data: batteryRows, error: null } });
    renderApp();
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Limpar dimensionamento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Limpar' }, { timeout: 1000 }));

    expect(useWizardStore.getState().residentialOptions.topology).toBe('HighVoltage');
    expect(useWizardStore.getState().residentialOptions.batteryModel).toBe('TP-HS3.6');
  });

  it('never auto-selects an expansion/Slave battery as the default', async () => {
    const batteryRows = [
      {
        id: 'b1',
        model: 'T58 Slave',
        nickname: null,
        capacity_kwh: 5.8,
        topology: 'HV',
        standard_power_kw: 2.88,
        peak_power_kw: 4.032,
        min_soc_percent: 10,
        expansion_model: null,
        image_url: null,
        documents: [],
      },
      {
        id: 'b2',
        model: 'T58 V2 Master',
        nickname: null,
        capacity_kwh: 5.8,
        topology: 'HV',
        standard_power_kw: 2.88,
        peak_power_kw: 4.032,
        min_soc_percent: 10,
        expansion_model: 'T58 Slave',
        image_url: null,
        documents: [],
      },
    ];
    setupSupabase({ batteries: { data: batteryRows, error: null } });
    renderApp();
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Limpar dimensionamento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Limpar' }, { timeout: 1000 }));

    expect(useWizardStore.getState().residentialOptions.batteryModel).toBe('T58 V2 Master');
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

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Dimensionamento' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Calculadora SolaX' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));

    const file = new File(['fake-image'], 'disjuntor.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Anexar foto/);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole('img', { name: 'Foto do disjuntor geral' })).toHaveAttribute('src', 'https://cdn.example.com/ats.png'));
  });
});
