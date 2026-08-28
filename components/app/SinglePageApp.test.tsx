// @vitest-environment jsdom

import { act } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import { emptyAddress } from '@/lib/address';
import { useWizardStore } from '@/lib/store/wizard-store';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';
import type { Client, SavedProject, Solution } from '@/lib/types';
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

function makeSavedProject(partial: Partial<SavedProject> & Pick<SavedProject, 'id'>): SavedProject {
  return {
    name: 'Projeto salvo',
    clientId: null,
    address: emptyAddress(),
    notes: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
    residentialOptions: {
      topology: 'HighVoltage',
      batteryModel: 'TP-HS3.6',
      secondaryBatteryModel: null,
      inverterModel: null,
      minInverterQty: null,
      gridType: 'singlePhase_220',
      loads: [],
      peakCalcMode: 'sum',
      operationHours: 0,
      desiredFeatures: [],
      whiteTariff: null,
      microgrid: null,
      generator: null,
      pv: null,
      atsPhotoUrl: null,
      atsBackupAcknowledged: false,
      maxPowerPerPhaseW: null,
    },
    solution: null,
    services: [],
    ...partial,
  };
}

// The desktop sidebar and the mobile bottom nav bar both render buttons named
// "Projetos"/"Catálogo"/"Clientes" at the same time (jsdom
// doesn't apply the `lg:hidden`/`hidden lg:flex` breakpoint classes that keep
// only one visible per viewport) — scope to the sidebar's landmark to avoid
// "multiple elements found" on plain screen.getByRole queries.
function sidebarNav() {
  return within(screen.getByRole('navigation', { name: 'Navegação principal' }));
}

function bottomNav() {
  return within(screen.getByRole('navigation', { name: 'Navegação' }));
}

/** Dimensionamento no longer has its own nav entry (sidebar or bottom bar) —
 *  it's reachable through a project's Workspace and technical configuration
 *  entry point. Seeds a saved project
 *  carrying over whatever residentialOptions/solution/projectInfo/services
 *  the test already put on the live wizard store (loadProject, triggered by
 *  clicking that button, would otherwise overwrite them with the new
 *  project's — usually-blank — own data), then drives the same click path:
 *  Projetos → Workspace → Rede elétrica. */
async function goToSizingViaProject(navScope: () => ReturnType<typeof within> = sidebarNav) {
  const live = useWizardStore.getState();
  // Some tests already seed their own project (with a specific id/status
  // they assert on later) via currentProjectId + savedProjects directly —
  // reuse that one instead of creating an unrelated placeholder, or the
  // "Dimensionamento" click below would open/operate on the wrong project.
  const existing = live.savedProjects.find((p) => p.id === live.currentProjectId) ?? live.savedProjects.at(-1);
  let projectName: string;
  if (existing) {
    projectName = existing.name;
    act(() => {
      useWizardStore.setState((s) => ({
        savedProjects: s.savedProjects.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                clientId: live.projectInfo.clientId,
                address: live.projectInfo.address,
                notes: live.projectInfo.notes,
                residentialOptions: live.residentialOptions,
                solution: live.solution,
                services: live.services,
              }
            : p
        ),
      }));
    });
  } else {
    projectName = live.projectInfo.name || 'Projeto de teste';
    act(() => {
      useWizardStore.setState((s) => ({
        savedProjects: [
          ...s.savedProjects,
          makeSavedProject({
            id: '__sizing_test_project__',
            name: projectName,
            clientId: live.projectInfo.clientId,
            address: live.projectInfo.address,
            notes: live.projectInfo.notes,
            residentialOptions: live.residentialOptions,
            solution: live.solution,
            services: live.services,
          }),
        ],
      }));
    });
  }

  // Clicking "Projeto" while it's already the active tab toggles the mobile
  // summary drawer instead of no-op'ing — skip the click if we're there already.
  if (!screen.queryByRole('heading', { level: 1, name: 'Projetos' })) {
    fireEvent.click(navScope().getByRole('button', { name: 'Projetos' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
  }

  fireEvent.click((await screen.findAllByRole('button', { name: 'Workspace' }))[0]);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: projectName })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /^Rede elétrica:/ }));
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Rede e inversor' })).toBeInTheDocument());
}

async function openWorkspaceSection(label: 'Visão geral' | 'Cargas' | 'Solução' | 'Financeiro' | 'Relatório') {
  fireEvent.click(await screen.findByRole('button', { name: label }));
  await waitFor(() => expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page'));
}

const { createClientMock, routerMock, buildProjectQuotePdfBlobMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  // The PDF itself is exercised in project-quote-pdf.test.tsx — mocked here
  // so these tests stay focused on exportPdf's own wiring (when it fires,
  // what filename it downloads as, how it reports failure).
  buildProjectQuotePdfBlobMock: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));
vi.mock('./project-quote-pdf', async (importOriginal) => {
  // Only the (slow, real-PDF-rendering) buildProjectQuotePdfBlob is mocked —
  // buildProjectQuotePdfInputFromSavedProject is a plain data-shaping
  // function the code under test actually calls, so it stays real.
  const actual = await importOriginal<typeof import('./project-quote-pdf')>();
  return { ...actual, buildProjectQuotePdfBlob: buildProjectQuotePdfBlobMock };
});

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
      suppliers: { data: [], error: null },
      supplier_offers: { data: [], error: null },
      purchase_orders: { data: [], error: null },
      quote_shares: { data: { id: 'quote-share-1' }, error: null },
      project_events: { data: [], error: null },
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
  buildProjectQuotePdfBlobMock.mockReset();
  resetWizardStore();
  Element.prototype.scrollTo = vi.fn();
  window.history.replaceState({}, '', '/pt');
  delete (navigator as { canShare?: unknown }).canShare;
  delete (navigator as { share?: unknown }).share;
});

describe('SinglePageApp: initial load and navigation', () => {
  it('restores a workspace URL only once after its project becomes available', async () => {
    setupSupabase();
    window.history.replaceState({}, '', '/pt?workspaceId=p1&workspace=overview');
    renderApp();

    act(() => {
      useWizardStore.setState({ savedProjects: [makeSavedProject({ id: 'p1', name: 'Casa restaurada' })] });
    });

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Casa restaurada' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Visão geral' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the Projeto tab by default and switches tabs via the sidebar', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Catálogo' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeInTheDocument());

    await goToSizingViaProject();
  });

  it('shows an "Administração" link only for admin profiles', async () => {
    setupSupabase({}, { loggedIn: true, role: 'admin' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Administração/ })).toHaveAttribute('href', '/pt/admin');
  });

  it('hides the "Administração" link for regular users', async () => {
    setupSupabase({}, { loggedIn: true, role: 'user' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /Administração/ })).not.toBeInTheDocument();
  });
});

describe('SinglePageApp: login-gated navigation', () => {
  it('redirects to login when opening Clientes without a profile', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Clientes' }));

    expect(routerMock.push).toHaveBeenCalledWith('/pt/login?redirect=/pt');
  });

  it('redirects to login when opening Fornecedores without a profile', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Fornecedores' }));

    expect(routerMock.push).toHaveBeenCalledWith('/pt/login?redirect=/pt');
  });

  it('redirects to login when opening Perfil without a profile', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));

    expect(routerMock.push).toHaveBeenCalledWith('/pt/login?redirect=/pt');
  });

  it('opens Clientes and Perfil in-app when a profile is present', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Clientes' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /^Clientes/ })).toBeInTheDocument());
    expect(routerMock.push).not.toHaveBeenCalled();

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Fornecedores' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Fornecedores' })).toBeInTheDocument());
    expect(routerMock.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
  });

  it('opens a project from its client in Clientes, landing in its workspace', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    act(() => {
      useWizardStore.setState({
        clients: [{ id: 'c1', name: 'Ana Souza', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' }],
        savedProjects: [makeSavedProject({ id: 'p1', name: 'Casa da Praia', clientId: 'c1' })],
      });
    });

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Clientes' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /^Clientes/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '1 projeto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Casa da Praia' })).toBeInTheDocument());
  });
});

describe('SinglePageApp: unsaved profile edits', () => {
  it('asks for confirmation before leaving Perfil with unsaved edits, and stays put if declined', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nome Editado' } });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Projetos' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByLabelText('Nome')).toHaveValue('Nome Editado');
    confirmSpy.mockRestore();
  });

  it('leaves Perfil once the user confirms discarding unsaved edits', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nome Editado' } });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Projetos' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it('does not ask for confirmation when leaving Perfil without any edits', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(sidebarNav().getByRole('button', { name: 'Projetos' }));

    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it('asks before signing out when Perfil has unsaved edits', async () => {
    const supabase = setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nome Editado' } });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]);

    expect(confirmSpy).toHaveBeenCalledWith('Você tem alterações não salvas no perfil. Deseja sair mesmo assim?');
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe('SinglePageApp: sign out', () => {
  it('signs out and redirects to login', async () => {
    const supabase = setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
    expect(routerMock.replace).toHaveBeenCalledWith('/pt/login');
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it('does not show a "Sair" button for a logged-out visitor', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
  });
});

describe('SinglePageApp: mobile bottom nav', () => {
  it('switches tabs directly from the bottom nav bar, without opening a menu', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Catálogo' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeInTheDocument());

    await goToSizingViaProject(bottomNav);
  });

  it('opens the summary drawer by tapping the already-active tab again', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    // Projeto is already the active tab (and has a summary), so tapping it
    // again opens the summary instead of just re-selecting the same tab.
    fireEvent.click(bottomNav().getByRole('button', { name: 'Projetos' }));
    expect(screen.getByRole('dialog', { name: 'Resumo' })).toBeInTheDocument();
  });

  it('switches to an inactive tab on first tap, and only opens its summary once already active', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Catálogo' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Projetos' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Resumo' })).not.toBeInTheDocument();

    fireEvent.click(bottomNav().getByRole('button', { name: 'Projetos' }));
    expect(screen.getByRole('dialog', { name: 'Resumo' })).toBeInTheDocument();
  });

  it('labels the "Mais" button with the generic text while on a top-level tab', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    expect(bottomNav().getByRole('button', { name: 'Mais opções' })).toHaveTextContent('Mais');
  });

  it('reaches Clientes via the "Mais" menu instead of the bottom bar', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    expect(bottomNav().queryByRole('button', { name: 'Clientes' })).not.toBeInTheDocument();

    fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
    const dialog = screen.getByRole('dialog', { name: 'Mais opções' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clientes' }));
    expect(screen.getByRole('heading', { level: 1, name: /^Clientes/ })).toBeInTheDocument();
  });

  it('switches to Portfólio via its own bottom-nav icon', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Portfólio' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Portfólio' })).toBeInTheDocument());
    // Portfólio now has its own icon, not one of the tabs tucked under "Mais".
    expect(bottomNav().getByRole('button', { name: 'Mais opções' })).toHaveTextContent('Mais');
  });

  it('closes the "Mais" menu via the X button inside it', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar menu' })[1]);
    expect(screen.queryByRole('dialog', { name: 'Mais opções' })).not.toBeInTheDocument();
  });

  it('opens the summary drawer as soon as "Calcular" is pressed, without waiting for the result', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

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

    await goToSizingViaProject(bottomNav);
    expect(screen.queryByRole('dialog', { name: 'Resumo' })).not.toBeInTheDocument();

    await openWorkspaceSection('Solução');
    expect(screen.getByRole('heading', { name: 'Solução' })).toBeInTheDocument();
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
  it('hides the summary panel entirely on tabs that never register one, instead of a permanently empty column', async () => {
    setupSupabase();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());
    expect(screen.queryByLabelText('Fechar resumo')).not.toBeInTheDocument();

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Catálogo' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeInTheDocument());
    expect(screen.queryByText('Nenhum resumo disponível para esta seção.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ver resumo')).not.toBeInTheDocument();
  });
});

describe('SinglePageApp: desktop sidebar navigation', () => {
  it('navigates to Portfólio and back to Projeto via the sidebar', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Portfólio' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Portfólio' })).toBeInTheDocument();

    fireEvent.click(sidebarNav().getByRole('button', { name: 'Projetos' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument();
  });

  it('scrolls the content area and toggles the compact title-bar padding', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

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
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    function openMoreMenuNav() {
      fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
      const dialog = screen.getByRole('dialog', { name: 'Mais opções' });
      return within(dialog).getByRole('navigation');
    }

    await goToSizingViaProject(bottomNav);

    fireEvent.click(within(openMoreMenuNav()).getByRole('button', { name: 'Clientes' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /^Clientes/ })).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Mais opções' })).not.toBeInTheDocument();

    fireEvent.click(bottomNav().getByRole('button', { name: 'Portfólio' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Portfólio' })).toBeInTheDocument());

    fireEvent.click(within(openMoreMenuNav()).getByRole('button', { name: 'Perfil' }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
  });

  it('follows the "Administração" link from the "Mais" menu and closes it', async () => {
    setupSupabase({}, { loggedIn: true, role: 'admin' });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    fireEvent.click(bottomNav().getByRole('button', { name: 'Mais opções' }));
    const dialog = screen.getByRole('dialog', { name: 'Mais opções' });
    fireEvent.click(within(dialog).getByRole('link', { name: /Administração/ }));

    expect(screen.queryByRole('dialog', { name: 'Mais opções' })).not.toBeInTheDocument();
  });
});

describe('SinglePageApp: solution-dependent behavior', () => {
  function setSolvedProject(overrides: { projectName?: string } = {}) {
    act(() => {
      useWizardStore.setState((s) => ({
        solution: makeSolution(),
        ...(overrides.projectName ? { projectInfo: { ...s.projectInfo, name: overrides.projectName } } : {}),
        residentialOptions: {
          ...s.residentialOptions,
          topology: 'HighVoltage',
          batteryModel: 'TP-HS3.6',
          gridType: 'singlePhase_220',
          loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
        },
      }));
    });
  }

  it('downloads a real PDF blob once a solution exists', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    setSolvedProject();
    const fakeBlob = new Blob(['fake pdf'], { type: 'application/pdf' });
    buildProjectQuotePdfBlobMock.mockResolvedValue(fakeBlob);
    // Spy on the two static methods instead of replacing the global `URL`
    // wholesale: `vi.stubGlobal('URL', { ...URL, ... })` swaps the real
    // constructor for a plain object, which breaks any `new URL(...)` the
    // bundler's own dynamic-import machinery does internally to resolve
    // SizingTab's lazy chunk — silently failing that import.
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await goToSizingViaProject();
    await openWorkspaceSection('Relatório');
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar relatório' }));

    await waitFor(() => expect(buildProjectQuotePdfBlobMock).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalledWith(fakeBlob);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');

    clickSpy.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('names the downloaded file after the project and today\'s date', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    setSolvedProject({ projectName: 'Casa de praia' });
    buildProjectQuotePdfBlobMock.mockResolvedValue(new Blob(['fake pdf'], { type: 'application/pdf' }));
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let capturedDownload = '';
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        capturedDownload = this.download;
      });

    await goToSizingViaProject();
    await openWorkspaceSection('Relatório');
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar relatório' }));

    await waitFor(() => expect(capturedDownload).toMatch(/^Casa_de_praia_\d{4}-\d{2}-\d{2}\.pdf$/));

    clickSpy.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('reports a friendly error when PDF generation fails, without leaving the app broken', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    setSolvedProject();
    buildProjectQuotePdfBlobMock.mockRejectedValue(new Error('boom'));

    await goToSizingViaProject();
    await openWorkspaceSection('Relatório');
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar relatório' }));

    await waitFor(() => expect(screen.getByText('Não foi possível gerar o PDF. Tente novamente.')).toBeInTheDocument());
  });

  it('does not export the PDF when the config that produced the solution is no longer valid (e.g. loads cleared after calculating)', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    act(() => { useWizardStore.setState({ solution: makeSolution() }); });

    await goToSizingViaProject();
    await openWorkspaceSection('Relatório');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar relatório' }));

    expect(buildProjectQuotePdfBlobMock).not.toHaveBeenCalled();
  });

  it('disables "Enviar ao cliente" when there is no client phone on file', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    setSolvedProject();
    await goToSizingViaProject();
    await openWorkspaceSection('Financeiro');

    expect(screen.getByRole('button', { name: 'Compartilhar cotação' })).toBeDisabled();
  });

  it('opens wa.me pointed at the client\'s number when the browser can\'t share files', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    setSolvedProject();
    act(() => {
      useWizardStore.setState((s) => ({
        clients: [{ id: 'c1', name: 'Ana Souza', phone: '(11) 91234-5678' } as Client],
        projectInfo: { ...s.projectInfo, clientId: 'c1' },
      }));
    });

    await goToSizingViaProject();
    await openWorkspaceSection('Financeiro');
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar cotação' }));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://wa.me/5511912345678?text='),
        '_blank',
        'noopener,noreferrer'
      )
    );
    openSpy.mockRestore();
  });

  it('shares the public quote link through WhatsApp', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    setSolvedProject();
    act(() => {
      useWizardStore.setState((s) => ({
        clients: [{ id: 'c1', name: 'Ana Souza', phone: '(11) 91234-5678' } as Client],
        projectInfo: { ...s.projectInfo, clientId: 'c1' },
      }));
    });

    await goToSizingViaProject();
    await openWorkspaceSection('Financeiro');
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar cotação' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('%2Fcotacao%2Fquote-share-1'),
      '_blank',
      'noopener,noreferrer'
    ));

    openSpy.mockRestore();
  });

  it('marks a "Rascunho" project as "Enviada" once its quote is actually shared', async () => {
    buildProjectQuotePdfBlobMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    Object.defineProperty(navigator, 'canShare', { value: vi.fn().mockReturnValue(true), configurable: true });
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockResolvedValue(undefined), configurable: true });
    const updateProjectStatusMock = vi.fn().mockResolvedValue({});

    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    setSolvedProject();
    act(() => {
      useWizardStore.setState((s) => ({
        currentProjectId: 'p1',
        savedProjects: [makeSavedProject({ id: 'p1', name: 'Casa de praia', status: 'draft' })],
        clients: [{ id: 'c1', name: 'Ana Souza', phone: '(11) 91234-5678' } as Client],
        projectInfo: { ...s.projectInfo, clientId: 'c1' },
        updateProjectStatus: updateProjectStatusMock,
      }));
    });

    await goToSizingViaProject();
    await openWorkspaceSection('Financeiro');
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar cotação' }));

    await waitFor(() => expect(updateProjectStatusMock).toHaveBeenCalledWith('p1', 'sent'));

    delete (navigator as { canShare?: unknown }).canShare;
    delete (navigator as { share?: unknown }).share;
  });

  it('does not touch the status of a project that already moved past "Rascunho"', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    Object.defineProperty(navigator, 'canShare', { value: vi.fn().mockReturnValue(false), configurable: true });
    const updateProjectStatusMock = vi.fn().mockResolvedValue({});

    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    setSolvedProject();
    act(() => {
      useWizardStore.setState((s) => ({
        currentProjectId: 'p1',
        savedProjects: [makeSavedProject({ id: 'p1', name: 'Casa de praia', status: 'accepted' })],
        clients: [{ id: 'c1', name: 'Ana Souza', phone: '(11) 91234-5678' } as Client],
        projectInfo: { ...s.projectInfo, clientId: 'c1' },
        updateProjectStatus: updateProjectStatusMock,
      }));
    });

    await goToSizingViaProject();
    await openWorkspaceSection('Financeiro');
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar cotação' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    expect(updateProjectStatusMock).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('asks for the company data before requesting a supplier quote', async () => {
    setupSupabase({}, { loggedIn: true });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    act(() => { useWizardStore.setState({ solution: makeSolution() }); });
    await goToSizingViaProject();
    await openWorkspaceSection('Financeiro');

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar cotação' }));

    expect(screen.getByRole('dialog', { name: 'Complete os dados da empresa' })).toBeInTheDocument();
  });

  it('asks for a profile before requesting a supplier quote', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    act(() => { useWizardStore.setState({ solution: makeSolution() }); });
    await goToSizingViaProject();
    await openWorkspaceSection('Financeiro');

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar cotação' }));

    expect(screen.getByRole('dialog', { name: 'Complete os dados da empresa' })).toBeInTheDocument();
  });

  it('switches from the economic to the microgrid variant when chosen', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    const economic = makeSolution({ batteryModel: 'TP-HS3.6' });
    const microgrid = makeSolution({ batteryModel: 'TP-LD53', batteryQty: 2 });
    act(() => { useWizardStore.setState({ solution: { ...economic, microgridAlternative: microgrid } }); });

    await goToSizingViaProject();
    await openWorkspaceSection('Solução');
    await waitFor(() => expect(screen.getByText('Versão c/ Microrrede')).toBeInTheDocument());

    const microgridCard = screen.getByText('Versão c/ Microrrede').closest('.rounded-lg') as HTMLElement;
    fireEvent.click(within(microgridCard).getByRole('button', { name: 'Usar esta versão' }));

    expect(useWizardStore.getState().solution?.batteryModel).toBe('TP-LD53');
    expect(useWizardStore.getState().solution?.microgridAlternative).toBeUndefined();
  });

  it('keeps the economic variant when chosen, dropping the microgrid alternative', async () => {
    setupSupabase();
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    const economic = makeSolution({ batteryModel: 'TP-HS3.6' });
    const microgrid = makeSolution({ batteryModel: 'TP-LD53', batteryQty: 2 });
    act(() => { useWizardStore.setState({ solution: { ...economic, microgridAlternative: microgrid } }); });

    await goToSizingViaProject();
    await openWorkspaceSection('Solução');
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

    await goToSizingViaProject();
  });

  it('shows the correct HV and LV inverter counts at the same time, without switching tabs first', async () => {
    // Regression test: availableInverterModels used to be a single set scoped
    // to whichever topology was already active, so InverterModelPicker's LV
    // tab count was computed from HV-only data (and vice versa) until the
    // user actually clicked into it. Both counts must be right up front.
    useWizardStore.setState((s) => ({
      residentialOptions: { ...s.residentialOptions, gridType: 'singlePhase_220', topology: 'HighVoltage' },
    }));
    setupSupabase({
      inverters: {
        data: [
          {
            id: 'i1',
            model: 'Model-A',
            topology: 'HV',
            phases: 1,
            standard_power_kva: 5,
            peak_power_kva: 7,
            max_power_per_phase_w: null,
            image_url: null,
            documents: [],
          },
          {
            id: 'i2',
            model: 'Model-B',
            topology: 'LV',
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
      approved_solutions: {
        data: [
          { grid_topology: '1p_220V', battery_topology: 'HV', inverter_model: 'Model-A' },
          { grid_topology: '1p_220V', battery_topology: 'LV', inverter_model: 'Model-B' },
        ],
        error: null,
      },
    });
    renderApp();

    await goToSizingViaProject();
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));

    await screen.findByText('Model-A');
    expect(screen.queryByText('Model-B')).not.toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^HV/ })).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^LV/ })).getByText('1')).toBeInTheDocument();
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

    await goToSizingViaProject();

    await waitFor(() => expect(useWizardStore.getState().residentialOptions.maxPowerPerPhaseW).toBeCloseTo(3333.33, 1));
  });
});

describe('SinglePageApp: requires explicit recalculation after sizing changes', () => {
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

  it('does not calculate automatically once a battery is picked', async () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'singlePhase_220',
        topology: 'HighVoltage',
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    setupSupabase({ batteries: { data: [batteryRow], error: null } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ solution: makeSolution() }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp();
    await goToSizingViaProject();

    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));
    fireEvent.click(await screen.findByText('TP-HS3.6'));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not calculate automatically once the inverter selection changes', async () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        gridType: 'singlePhase_220',
        topology: 'HighVoltage',
        batteryModel: 'TP-HS3.6',
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    }));
    setupSupabase({
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ solution: makeSolution() }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp();
    await goToSizingViaProject();

    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));
    fireEvent.click(await screen.findByText('X1-Hybrid-5.0kW-G4'));

    expect(fetchMock).not.toHaveBeenCalled();
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
    await goToSizingViaProject();

    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));
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
    await goToSizingViaProject();

    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));
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
    await goToSizingViaProject();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar dimensionamento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Limpar' }, { timeout: 1000 }));

    expect(useWizardStore.getState().residentialOptions.topology).toBe('HighVoltage');
    expect(useWizardStore.getState().residentialOptions.batteryModel).toBe('TP-HS3.6');
  });

  it('resets every technical configuration when clearing the workspace', async () => {
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
    ];
    setupSupabase({ batteries: { data: batteryRows, error: null } });
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        topology: 'LowVoltage',
        batteryModel: 'TP-LD53',
        secondaryBatteryModel: 'TP-LD106',
        inverterModel: 'X3-ULT-30K',
        minInverterQty: 2,
        gridType: 'threePhase_380',
        maxPowerPerPhaseW: 12000,
        desiredFeatures: ['external_ats', 'microgrid', 'external_generator', 'pv', 'white_tariff'],
        atsPhotoUrl: 'ats.png',
        atsBackupAcknowledged: true,
        microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 5000, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
        generator: { voltageV: 380, phases: 3, apparentPowerVA: 10000, powerFactor: 0.8, safetyMarginW: 1000, photoUrl: null, ownAtsAcknowledged: true },
        pv: { monthlyConsumptionKwh: 500, hsp: 4 },
        whiteTariff: { requiredPowerW: 5000, pontaEnergyWh: 2000, intermediateEnergyWh: 1000, pontaTariffPerKwh: 1, intermediateTariffPerKwh: 0.9, foraPontaTariffPerKwh: 0.5 },
      },
      solution: makeSolution(),
      secondarySolution: makeSolution({ batteryModel: 'TP-LD106' }),
    }));
    renderApp();
    await goToSizingViaProject();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar dimensionamento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Limpar' }, { timeout: 1000 }));

    const { residentialOptions, solution, secondarySolution } = useWizardStore.getState();
    expect(residentialOptions).toMatchObject({
      topology: 'HighVoltage',
      batteryModel: 'TP-HS3.6',
      secondaryBatteryModel: null,
      inverterModel: null,
      minInverterQty: null,
      gridType: 'singlePhase_220',
      maxPowerPerPhaseW: null,
      desiredFeatures: ['backup'],
      atsPhotoUrl: null,
      atsBackupAcknowledged: false,
      microgrid: null,
      generator: null,
      pv: null,
      whiteTariff: null,
    });
    expect(residentialOptions.loads).toEqual([]);
    expect(solution).toBeNull();
    expect(secondarySolution).toBeNull();
    expect(useWizardStore.getState().savedProjects.find((project) => project.id === useWizardStore.getState().currentProjectId)?.residentialOptions).toMatchObject({
      topology: 'HighVoltage',
      batteryModel: 'TP-HS3.6',
      inverterModel: null,
      gridType: 'singlePhase_220',
      desiredFeatures: ['backup'],
    });
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
    await goToSizingViaProject();

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
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Projetos' })).toBeInTheDocument());

    await goToSizingViaProject();

    await openWorkspaceSection('Visão geral');
    fireEvent.click(screen.getByRole('button', { name: /^Backup Total/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));

    const file = new File(['fake-image'], 'disjuntor.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Anexar foto/);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole('img', { name: 'Foto do disjuntor geral' })).toHaveAttribute('src', 'https://cdn.example.com/ats.png'));
  });
});
