// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import type { Client, ProjectInfo, SavedProject } from '@/lib/types';
import { useWizardStore } from '@/lib/store/wizard-store';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';
import { renderWithShell } from '../test-helpers/render-with-shell';
import { ProjectTab } from './ProjectTab';

const { buildProjectQuotePdfBlobMock, createClientMock } = vi.hoisted(() => ({
  buildProjectQuotePdfBlobMock: vi.fn(),
  createClientMock: vi.fn(),
}));
vi.mock('../project-quote-pdf', async (importOriginal) => {
  // Only the (slow, real-PDF-rendering) buildProjectQuotePdfBlob is mocked —
  // buildProjectQuotePdfInputFromSavedProject is a plain data-shaping
  // function the code under test actually calls, so it stays real.
  const actual = await importOriginal<typeof import('../project-quote-pdf')>();
  return { ...actual, buildProjectQuotePdfBlob: buildProjectQuotePdfBlobMock };
});
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

function makeProject(partial: Partial<SavedProject> & Pick<SavedProject, 'id'>): SavedProject {
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

const emptyProjectInfo: ProjectInfo = { name: '', clientId: null, address: emptyAddress(), notes: '' };

beforeEach(() => {
  resetWizardStore();
  buildProjectQuotePdfBlobMock.mockReset();
  createClientMock.mockReturnValue(
    createSupabaseMock({ tableResults: { quote_shares: { data: { id: 'share-1' }, error: null } } })
  );
});

/** projectInfo/projectDetailsVisible/currentProjectId/savedProjects/clients/
 * userStockItems/userServices/marginSettings/services are real useWizardStore
 * state now (ProjectTab reads them directly instead of receiving them as
 * props — see ProjectTab.tsx) — seed the store instead of passing props for
 * these, everything else still goes through props as before. */
type StoreOverrides = Partial<
  Pick<
    ReturnType<typeof useWizardStore.getState>,
    | 'projectInfo'
    | 'projectDetailsVisible'
    | 'currentProjectId'
    | 'savedProjects'
    | 'clients'
    | 'userStockItems'
    | 'userServices'
    | 'marginSettings'
    | 'services'
  >
>;

function setup(overrides: Partial<Parameters<typeof ProjectTab>[0]> & StoreOverrides = {}) {
  const {
    projectInfo = emptyProjectInfo,
    projectDetailsVisible = false,
    currentProjectId = null,
    savedProjects = [] as SavedProject[],
    clients = [] as Client[],
    userStockItems = [],
    userServices = [],
    marginSettings = { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 },
    services = [],
    ...propOverrides
  } = overrides;

  useWizardStore.setState({
    projectInfo,
    projectDetailsVisible,
    currentProjectId,
    savedProjects,
    clients,
    userStockItems,
    userServices,
    marginSettings,
    services,
  });

  const props = {
    batteryCatalog: [],
    inverterCatalog: [],
    accessoryCatalog: [],
    initialLoading: false,
    topology: null,
    batteryModel: null,
    gridType: null,
    loadsCount: 0,
    peakW: 0,
    dailyKwh: 0,
    hasSolution: false,
    onSave: vi.fn(),
    onNew: vi.fn(),
    onCancelNew: vi.fn(),
    onOpen: vi.fn(),
    onOpenSizing: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onRemove: vi.fn(),
    onRefreshSolution: vi.fn(),
    refreshingProjectId: null,
    onUpdateStatus: vi.fn(),
    onDownloadPdf: vi.fn(),
    downloadingProjectId: null,
    onManagePortfolio: vi.fn(),
    onShowSummary: vi.fn(),
    onHideSummary: vi.fn(),
    ...propOverrides,
  };
  const utils = renderWithShell(<ProjectTab {...props} />);
  return { ...utils, props };
}

function openProjectActions(projectName: string) {
  fireEvent.click(screen.getByRole('button', { name: `Mais ações para ${projectName}` }));
}

describe('ProjectTab: empty and list states', () => {
  it('shows an onboarding hint for a brand-new user with no saved projects', () => {
    setup({ savedProjects: [] });
    expect(screen.getByText('Novo por aqui?')).toBeInTheDocument();
  });

  it('hides the onboarding hint once at least one project exists', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    expect(screen.queryByText('Novo por aqui?')).not.toBeInTheDocument();
  });

  it('shows the remove action on the project card', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    expect(screen.queryByRole('button', { name: 'Duplicar projeto Casa de praia' })).not.toBeInTheDocument();
    openProjectActions('Casa de praia');
    expect(screen.getByRole('button', { name: 'Excluir projeto Casa de praia' })).toBeInTheDocument();
  });

  it('hides the onboarding hint while a draft is open, even with no saved projects yet', () => {
    setup({ savedProjects: [], projectDetailsVisible: true, currentProjectId: null });
    expect(screen.queryByText('Novo por aqui?')).not.toBeInTheDocument();
  });

  it('shows a generic placeholder in the summary panel when no project is open or selected', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    expect(
      screen.getByText('Selecione um projeto na lista para ver o resumo, ou clique em "Novo projeto" para começar.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Configuração salva junto')).not.toBeInTheDocument();
  });

  it('shows the live "Configuração salva junto" summary for a brand-new, not-yet-saved draft', () => {
    setup({ projectDetailsVisible: true, currentProjectId: null });
    expect(screen.getByText('Configuração salva junto')).toBeInTheDocument();
  });

  it('shows the same rich SelectedProjectSummary (not "Configuração salva junto") while editing an already-saved project', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Casa de praia', clientId: null, address: emptyAddress(), notes: '' },
    });

    expect(screen.queryByText('Configuração salva junto')).not.toBeInTheDocument();
    // The project card action is not shown while editing its draft.
    expect(screen.queryByRole('button', { name: 'Excluir projeto Casa de praia' })).not.toBeInTheDocument();
    // No "unselect" affordance while editing — "Fechar" on the draft card
    // itself (with its own discard confirmation) is what exits editing.
    expect(screen.queryByRole('button', { name: 'Fechar resumo do projeto' })).not.toBeInTheDocument();
  });

  it('shows filled-in requirements in the live summary panel once topology/battery/grid/loads/solution are set', () => {
    setup({
      projectDetailsVisible: true,
      currentProjectId: null,
      topology: 'HighVoltage',
      batteryModel: 'TP-HS3.6',
      gridType: 'singlePhase_220',
      loadsCount: 3,
      hasSolution: true,
    });

    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
    expect(screen.getByText('Dimensionamento concluído')).toBeInTheDocument();
    expect(screen.getByText('3 carga(s) cadastrada(s)')).toBeInTheDocument();
  });

  it('shows just the "Novo projeto" trigger card when there are no projects yet', () => {
    setup();
    expect(screen.getByRole('button', { name: /Novo projeto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver exemplo preenchido' })).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum projeto encontrado para essa pesquisa.')).not.toBeInTheDocument();
  });

  it('lists saved projects as cards with their badges', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })],
    });
    expect(screen.getByText('Casa de praia')).toBeInTheDocument();
    expect(screen.getByText('Alta tensão (HV)')).toBeInTheDocument();
    expect(screen.getByText('Monofásico 220V')).toBeInTheDocument();
  });

  it('shows the linked client\'s name on a project card', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia', clientId: 'c1' })],
      clients: [{ id: 'c1', name: 'Ana Souza' } as Client],
    });
    expect(screen.getByText(/Ana Souza/)).toBeInTheDocument();
  });

  it('filters the saved-project list by search', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' }), makeProject({ id: 'p2', name: 'Escritório' })],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar projeto...' }));
    fireEvent.change(screen.getByPlaceholderText('Pesquisar projeto...'), { target: { value: 'praia' } });

    expect(screen.getByText('Casa de praia')).toBeInTheDocument();
    expect(screen.queryByText('Escritório')).not.toBeInTheDocument();
  });
});

describe('ProjectTab: aggregate stats', () => {
  it('shows a summary strip with the project count, how many have a solution, and the total priced value', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
        makeProject({ id: 'p2', name: 'Escritório' }),
      ],
      userStockItems: [
        { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid', unitValue: 8000, createdAt: '', updatedAt: '' },
      ],
    });

    const summary = screen.getByRole('group', { name: 'Resumo dos projetos' });
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(within(summary).getByText('projetos')).toBeInTheDocument();
    expect(within(summary).getByText('1')).toBeInTheDocument();
    expect(within(summary).getByText('com solução')).toBeInTheDocument();
    // One match in the summary strip, one on the priced project's own card.
    expect(screen.getAllByText(/R\$\s*8\.000,00/)).toHaveLength(2);
  });

  it("shows the linked client's phone and email on the card", () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia', clientId: 'c1' })],
      clients: [{ id: 'c1', name: 'Ana Souza', phone: '(11) 99999-0000', email: 'ana@example.com' } as Client],
    });

    expect(screen.getByText('(11) 99999-0000')).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
  });

  it("shows each project's own priced solution value on its card, flagging a partial total", () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
      userStockItems: [
        { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid', unitValue: 8000, createdAt: '', updatedAt: '' },
      ],
    });

    // One match in the aggregate stats line, one on the card itself.
    expect(screen.getAllByText(/R\$\s*8\.000,00/)).toHaveLength(2);
    expect(screen.getByText('(parcial)')).toBeInTheDocument();
  });

  it('shows placeholder badges when the project has no topology/battery/grid set', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          residentialOptions: {
            topology: null,
            batteryModel: null,
            secondaryBatteryModel: null,
            inverterModel: null,
            minInverterQty: null,
            gridType: null,
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
        }),
      ],
    });

    expect(screen.getByText('Sem topologia')).toBeInTheDocument();
    expect(screen.getByText('Sem rede')).toBeInTheDocument();
  });

  it('omits the value line on the card when the project has no priced items', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    expect(screen.queryByText('Valor:')).not.toBeInTheDocument();
  });

  it('flags a project without a solution as stale once it has been idle for a week', () => {
    const staleDate = new Date(Date.now() - 10 * 86_400_000).toISOString();
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia', updatedAt: staleDate, solution: null })],
    });

    expect(screen.getByText(/Parado há 10 dias/)).toBeInTheDocument();
  });

  it('does not flag a project as stale when it already has a calculated solution', () => {
    const staleDate = new Date(Date.now() - 10 * 86_400_000).toISOString();
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          updatedAt: staleDate,
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
    });

    expect(screen.queryByText(/Parado há/)).not.toBeInTheDocument();
  });
});

describe('ProjectTab: new project draft', () => {
  it('clicking the "Novo projeto" trigger card delegates to onNew', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Novo projeto/ }));
    expect(props.onNew).toHaveBeenCalled();
  });

  it('hides the "Novo projeto" trigger card while a draft is already open', () => {
    setup({ projectDetailsVisible: true, currentProjectId: null });
    expect(screen.queryByRole('button', { name: /Novo projeto/ })).not.toBeInTheDocument();
  });

  it('hides other saved-project cards and the search input while a new draft is open', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })],
      projectDetailsVisible: true,
      currentProjectId: null,
    });
    expect(screen.queryByText('Casa de praia')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pesquisar projeto...' })).not.toBeInTheDocument();
  });

  it('shows an inline draft card (not a separate list item) when starting a new project', () => {
    setup({ projectDetailsVisible: true, currentProjectId: null });

    expect(screen.getByText('Novo projeto', { selector: '.text-base' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do projeto')).toHaveValue('');
  });

  it('does not offer "Dimensionamento" for a brand-new, not-yet-saved draft', () => {
    setup({ projectDetailsVisible: true, currentProjectId: null });
    expect(screen.queryByRole('button', { name: 'Dimensionamento' })).not.toBeInTheDocument();
  });

  it('edits are reported via setProjectInfo, and Fechar asks for confirmation before calling onCancelNew', async () => {
    const { props } = setup({ projectDetailsVisible: true, currentProjectId: null });

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Novo nome' } });
    expect(useWizardStore.getState().projectInfo.name).toBe('Novo nome');

    fireEvent.click(screen.getByRole('button', { name: 'Descartar alterações do projeto' }));
    const confirmButton = await screen.findByRole('button', { name: 'Descartar' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    expect(props.onCancelNew).toHaveBeenCalled();
  });

  it('closes immediately on Fechar when the new-project draft is still blank', () => {
    const { props } = setup({ projectDetailsVisible: true, currentProjectId: null });

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(props.onCancelNew).toHaveBeenCalled();
  });

  it('edits the client, address and notes fields', () => {
    setup({
      projectDetailsVisible: true,
      currentProjectId: null,
      clients: [{ id: 'c1', name: 'Ana Souza' } as Client],
    });

    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c1' } });
    expect(useWizardStore.getState().projectInfo.clientId).toBe('c1');

    fireEvent.change(screen.getByLabelText('Endereço'), { target: { value: 'Rua das Flores, 10' } });
    expect(useWizardStore.getState().projectInfo.address.street).toBe('Rua das Flores, 10');

    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '10' } });
    expect(useWizardStore.getState().projectInfo.address).toMatchObject({ street: 'Rua das Flores, 10', number: '10' });

    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Instalação em telhado inclinado.' } });
    expect(useWizardStore.getState().projectInfo.notes).toBe('Instalação em telhado inclinado.');
  });

  it('no longer shows a "Gerenciar clientes" button in the draft card', () => {
    setup({ projectDetailsVisible: true, currentProjectId: null });
    expect(screen.queryByRole('button', { name: /Gerenciar clientes/ })).not.toBeInTheDocument();
  });

  it('Salvar projeto in the draft card delegates to onSave when a name is set', () => {
    const { props } = setup({
      projectDetailsVisible: true,
      currentProjectId: null,
      projectInfo: { name: 'Residência Silva', clientId: null, address: emptyAddress(), notes: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(props.onSave).toHaveBeenCalled();
  });

  it('blocks saving and shows an inline error when the name is empty', () => {
    const { props } = setup({ projectDetailsVisible: true, currentProjectId: null });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Informe um nome para o projeto.')).toBeInTheDocument();
  });

  it('keeps Salvar projeto enabled for a brand-new, still-blank draft so its name validation can surface', () => {
    setup({ projectDetailsVisible: true, currentProjectId: null });
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('shows a placeholder with a Portfólio link when there are no user services registered yet', () => {
    const { props } = setup({ projectDetailsVisible: true, currentProjectId: null, userServices: [] });

    const portfolioLink = screen.getByRole('button', { name: 'Portfólio' });
    expect(portfolioLink.closest('p')).toHaveTextContent(
      'Cadastre serviços (instalação, frete...) em Portfólio para adicioná-los ao projeto.'
    );

    fireEvent.click(portfolioLink);
    expect(props.onManagePortfolio).toHaveBeenCalled();
  });

  it('adds a service to the draft, updates its quantity, and removes it', () => {
    setup({
      projectDetailsVisible: true,
      currentProjectId: null,
      userServices: [{ id: 'srv1', name: 'Instalação', unitValue: 500, createdAt: '', updatedAt: '' }],
      services: [],
    });

    // Each control below goes through the real store actions, and the tab re-renders off the store.
    fireEvent.click(screen.getByRole('button', { name: /Instalação · R\$/ }));
    expect(useWizardStore.getState().services).toEqual([{ serviceId: 'srv1', name: 'Instalação', qty: 1 }]);

    fireEvent.change(screen.getByLabelText('Quantidade de Instalação'), { target: { value: '3' } });
    expect(useWizardStore.getState().services[0]).toEqual({ serviceId: 'srv1', name: 'Instalação', qty: 3 });

    fireEvent.click(screen.getByLabelText('Remover serviço Instalação'));
    expect(useWizardStore.getState().services).toEqual([]);
  });

  it('only offers services not already added to the draft', () => {
    setup({
      projectDetailsVisible: true,
      currentProjectId: null,
      userServices: [
        { id: 'srv1', name: 'Instalação', unitValue: 500, createdAt: '', updatedAt: '' },
        { id: 'srv2', name: 'Frete', unitValue: 100, createdAt: '', updatedAt: '' },
      ],
      services: [{ serviceId: 'srv1', name: 'Instalação', qty: 1 }],
    });

    expect(screen.queryByRole('button', { name: /^Instalação · R\$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Frete · R\$/ })).toBeInTheDocument();
  });
});

describe('ProjectTab: opening an existing project edits it in place', () => {
  it('replaces the clicked card with the draft form instead of adding a separate card', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' }), makeProject({ id: 'p2', name: 'Escritório' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Casa de praia', clientId: null, address: emptyAddress(), notes: '' },
    });

    // The card for p1 became the editable form (its name only shows as an input value)...
    expect(screen.getByLabelText('Nome do projeto')).toHaveValue('Casa de praia');
    expect(screen.getByText('Editando projeto')).toBeInTheDocument();
    // ...while p2's card is hidden entirely, so it can't be clicked into by mistake mid-edit.
    expect(screen.queryByText('Escritório')).not.toBeInTheDocument();
    // Only one "Novo projeto" trigger card should exist for a genuinely new draft, and it must be absent here.
    expect(screen.queryByText('Novo projeto', { selector: '.text-base' })).not.toBeInTheDocument();
  });

  it('offers a technical solution shortcut while editing an already-saved project', () => {
    const { props } = setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Casa de praia', clientId: null, address: emptyAddress(), notes: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Solução técnica' }));
    expect(props.onOpenSizing).toHaveBeenCalledWith('p1');
  });

  it('closes immediately on Fechar when editing an existing project with no unsaved changes', () => {
    const { props } = setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Casa de praia', clientId: null, address: emptyAddress(), notes: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(props.onCancelNew).toHaveBeenCalled();
  });

  it('disables Salvar projeto, with a tooltip, when editing an existing project with no unsaved changes', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Casa de praia', clientId: null, address: emptyAddress(), notes: '' },
    });

    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Nenhuma alteração para salvar.');
  });

  it('keeps Salvar projeto enabled once an existing project is edited', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Casa de praia editada', clientId: null, address: emptyAddress(), notes: '' },
    });

    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('title');
  });

  it('asks for confirmation on Fechar when editing an existing project with unsaved changes', async () => {
    const { props } = setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Casa de praia editada', clientId: null, address: emptyAddress(), notes: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Descartar alterações do projeto' }));
    const confirmButton = await screen.findByRole('button', { name: 'Descartar' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    expect(props.onCancelNew).toHaveBeenCalled();
  });

  it('closes immediately on Fechar even when the saved project\'s services came back from the DB with reordered keys', () => {
    // Postgres jsonb doesn't preserve object key order on read — a service
    // line saved as { serviceId, name, qty } can come back as
    // { qty, name, serviceId } (or any other order) without anything having
    // actually changed. The dirty-check must not be fooled by that.
    const { props } = setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          services: [{ qty: 2, name: 'Instalação', serviceId: 'srv1' } as unknown as { serviceId: string; name: string; qty: number }],
        }),
      ],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Casa de praia', clientId: null, address: emptyAddress(), notes: '' },
      services: [{ serviceId: 'srv1', name: 'Instalação', qty: 2 }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(props.onCancelNew).toHaveBeenCalled();
  });

  it('clicking Editar on a saved project delegates to onOpen with its id and also opens its summary', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(props.onOpen).toHaveBeenCalledWith('p1');
    expect(props.onShowSummary).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Fechar resumo do projeto' })).toBeInTheDocument();
  });

  it('clicking Workspace on a saved project delegates to onOpenWorkspace with its id', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
    expect(props.onOpenWorkspace).toHaveBeenCalledWith('p1');
  });

});

describe('ProjectTab: selecting a project without opening it', () => {
  function clickCard(name: string) {
    const card = screen.getAllByText(name).map((el) => el.closest('[role="button"]')).find(Boolean);
    if (!card) throw new Error(`Card for "${name}" not found`);
    fireEvent.click(card);
  }

  it('shows a rich read-only summary in the side panel when a card is selected', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          clientId: 'c1',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 2,
            pvPowerKw: 5,
            accessories: [],
          },
        }),
      ],
      clients: [{ id: 'c1', name: 'Ana Souza' } as Client],
    });

    clickCard('Casa de praia');

    expect(screen.getByText('Inversor')).toBeInTheDocument();
    expect(screen.getByText('X1-Hybrid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar resumo do projeto' })).toBeInTheDocument();
  });

  it('pre-selects currentProjectId on mount (e.g. arriving via the project-name link from Dimensionamento)', () => {
    const { props } = setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' }), makeProject({ id: 'p2', name: 'Escritório' })],
      currentProjectId: 'p1',
    });

    // No click needed — p1's summary is already showing on mount.
    expect(screen.getByRole('button', { name: 'Fechar resumo do projeto' })).toBeInTheDocument();
    expect(props.onShowSummary).toHaveBeenCalled();
  });

  it('does not pre-select anything when currentProjectId is unset', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })], currentProjectId: null });
    expect(screen.queryByRole('button', { name: 'Fechar resumo do projeto' })).not.toBeInTheDocument();
  });

  it('does not show a duplicate action in the summary', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    clickCard('Casa de praia');
    expect(screen.queryByRole('button', { name: 'Duplicar projeto Casa de praia' })).not.toBeInTheDocument();
  });

  it('the "Excluir" action in the project card opens a modal before delegating to onRemove', async () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    clickCard('Casa de praia');
    openProjectActions('Casa de praia');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir projeto Casa de praia' }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir projeto?' });
    expect(dialog).toHaveTextContent('O projeto “Casa de praia” será removido do seu portfólio. Esta ação não poderá ser desfeita.');
    const confirmButton = within(dialog).getByRole('button', { name: 'Excluir projeto' });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith('p1'));
  });

  it('shows the solution value priced from the user stock, flagging a partial total when an item has no price', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
      userStockItems: [
        {
          id: 'stock1',
          productType: 'inverter',
          productModel: 'X1-Hybrid',
          unitValue: 8000,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });

    clickCard('Casa de praia');

    const label = screen.getByText('Valor da solução');
    expect(label).toBeInTheDocument();
    expect(within(label.parentElement!).getByText(/R\$\s*8\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/Preço parcial: 1 de 2 itens/)).toBeInTheDocument();
  });

  it('shows "Valor da solução" and "Serviços" in the same card, with the total already including the services', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
          services: [{ serviceId: 'srv1', name: 'Instalação', qty: 1 }],
        }),
      ],
      userStockItems: [
        {
          id: 'stock1',
          productType: 'inverter',
          productModel: 'X1-Hybrid',
          unitValue: 8000,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'stock2',
          productType: 'battery',
          productModel: 'TP-HS3.6',
          unitValue: 2000,
          createdAt: '',
          updatedAt: '',
        },
      ],
      userServices: [{ id: 'srv1', name: 'Instalação', unitValue: 500, createdAt: '', updatedAt: '' }],
    });

    clickCard('Casa de praia');

    const label = screen.getByText('Valor da solução');
    const servicesLabel = screen.getByText('Serviços');
    // Both live inside the very same bordered card.
    expect(label.closest('.rounded-lg')).toBe(servicesLabel.closest('.rounded-lg'));

    expect(within(label.parentElement!).getByText(/R\$\s*10\.500,00/)).toBeInTheDocument();
    expect(screen.getByText(/Instalação/)).toBeInTheDocument();
    expect(within(servicesLabel.parentElement!).getByText(/R\$\s*500,00/)).toBeInTheDocument();
  });

  it('splits master and expansion battery units into separate lines', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'T58 Master',
            batteryQty: 3,
            batteryPortsUsed: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
      batteryCatalog: [
        {
          id: 'bat1',
          model: 'T58 Master',
          capacityKwh: 5.8,
          topology: 'HV',
          standardPowerKw: 5,
          peakPowerKw: 6,
          minSocPercent: 10,
          expansionModel: 'T58 Slave',
          imageUrl: null,
          documents: [],
        },
      ],
    });

    clickCard('Casa de praia');

    expect(screen.getByText('Bateria')).toBeInTheDocument();
    expect(screen.getByText('T58 Master × 1')).toBeInTheDocument();
    expect(screen.getByText('Bateria (expansão)')).toBeInTheDocument();
    expect(screen.getByText('T58 Slave × 2')).toBeInTheDocument();
  });

  it('shows each product\'s nickname alongside its model/quantity when the catalog has one', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid-5.0kW-G4',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 2,
            pvPowerKw: null,
            accessories: [{ model: 'Smart Meter', qty: 1, optional: false, appliesTo: 'system', comment: null, bundled: false }],
          },
        }),
      ],
      inverterCatalog: [
        {
          id: 'i1',
          model: 'X1-Hybrid-5.0kW-G4',
          nickname: 'Titan 5kW',
          topology: 'HV',
          phases: 1,
          standardPowerKva: 5,
          peakPowerKva: 7,
          maxPowerPerPhaseW: null,
          imageUrl: null,
          documents: [],
          flags: [],
        },
      ],
      batteryCatalog: [
        {
          id: 'b1',
          model: 'TP-HS3.6',
          nickname: 'Nova 3.6',
          capacityKwh: 3.6,
          topology: 'HV',
          standardPowerKw: 1.8,
          peakPowerKw: 2.5,
          minSocPercent: 10,
          imageUrl: null,
          documents: [],
        },
      ],
      accessoryCatalog: [
        { id: 'a1', model: 'Smart Meter', nickname: 'Medidor Inteligente', description: null, imageUrl: null, documents: [] },
      ],
    });

    clickCard('Casa de praia');

    // Nickname is the prominent line; the bare model code sits underneath as a caption.
    const inverterNickname = screen.getByText('Titan 5kW');
    expect(inverterNickname.nextElementSibling).toHaveTextContent('X1-Hybrid-5.0kW-G4');

    const batteryNickname = screen.getByText('Nova 3.6 × 2');
    expect(batteryNickname.nextElementSibling).toHaveTextContent('TP-HS3.6');

    const accessoryNickname = screen.getByText('Medidor Inteligente');
    expect(accessoryNickname.nextElementSibling).toHaveTextContent('Smart Meter');
  });

  it('marks bundled accessories as included with the inverter/battery in the summary', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [
              { model: 'WiFi Dongle', qty: 1, optional: false, appliesTo: 'inverter', comment: null, bundled: true },
              { model: 'CT Clamp', qty: 2, optional: false, appliesTo: 'battery', comment: null, bundled: true },
              { model: 'Disjuntor CA', qty: 1, optional: false, appliesTo: 'system', comment: null, bundled: false },
            ],
          },
        }),
      ],
    });

    clickCard('Casa de praia');

    expect(screen.getByText('WiFi Dongle')).toBeInTheDocument();
    expect(screen.getByText('Incluso no inversor')).toBeInTheDocument();
    expect(screen.getByText('CT Clamp × 2')).toBeInTheDocument();
    expect(screen.getByText('Incluso na bateria')).toBeInTheDocument();
    expect(screen.getByText('Disjuntor CA')).toBeInTheDocument();
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
  });

  it('clicking the selected card again clears the selection', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    clickCard('Casa de praia');
    expect(screen.getByRole('button', { name: 'Fechar resumo do projeto' })).toBeInTheDocument();

    clickCard('Casa de praia');
    expect(screen.queryByRole('button', { name: 'Fechar resumo do projeto' })).not.toBeInTheDocument();
  });

  it('clicking the summary\'s close (X) button clears the selection and hides the mobile drawer', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    clickCard('Casa de praia');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar resumo do projeto' }));

    expect(props.onHideSummary).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Fechar resumo do projeto' })).not.toBeInTheDocument();
  });

  it('brings the summary panel into view (e.g. the mobile drawer) when a project is selected', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    clickCard('Casa de praia');
    expect(props.onShowSummary).toHaveBeenCalledTimes(1);

    clickCard('Casa de praia');
    expect(props.onShowSummary).toHaveBeenCalledTimes(1);
  });

});

describe('ProjectTab: refreshing a project\'s solution from the card', () => {
  it('shows no "Atualizar" button when the project has no solution yet', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia', solution: null })] });
    expect(screen.queryByRole('button', { name: /Atualizar/ })).not.toBeInTheDocument();
  });

  it('calls onRefreshSolution with the project id, without triggering card selection', () => {
    const { props } = setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
    });

    openProjectActions('Casa de praia');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atualizar' }));

    expect(props.onRefreshSolution).toHaveBeenCalledWith('p1');
    expect(screen.queryByRole('button', { name: 'Fechar resumo do projeto' })).not.toBeInTheDocument();
  });

  it('shows a loading spinner and disables the button while this project is refreshing', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
      refreshingProjectId: 'p1',
    });

    openProjectActions('Casa de praia');
    expect(screen.getByRole('menuitem', { name: 'Atualizar' })).toBeDisabled();
  });

  it('flags the "Atualizar" button when the saved solution no longer meets its own requirements', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          residentialOptions: {
            topology: 'HighVoltage',
            batteryModel: 'TP-HS3.6',
            secondaryBatteryModel: null,
            inverterModel: null,
            minInverterQty: null,
            gridType: 'singlePhase_220',
            loads: [{ id: 'l1', name: 'Chuveiro', powerW: 100000, qty: 1, ipInRatio: 1, usageFactor: 1 }],
            peakCalcMode: 'sum',
            operationHours: 5,
            desiredFeatures: ['backup'],
            whiteTariff: null,
            microgrid: null,
            generator: null,
            pv: null,
            atsPhotoUrl: null,
            atsBackupAcknowledged: false,
            maxPowerPerPhaseW: null,
          },
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            inverterRatedPowerW: 1000,
            inverterPeakPowerW: 1000,
            availableEnergyWh: 1000,
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
    });

    openProjectActions('Casa de praia');
    expect(screen.getByRole('menuitem', { name: 'Atualizar' })).toHaveAttribute(
      'title',
      'A solução salva não atende 100% aos requisitos. Recalcule para atualizar.'
    );
  });
});

describe('ProjectTab: quotation status', () => {
  it('shows the project\'s current status on its card', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia', status: 'sent' })] });
    expect(screen.getByRole('combobox', { name: 'Status da cotação' })).toHaveValue('sent');
  });

  it('calls onUpdateStatus with the project id and the newly picked status, without triggering card selection', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia', status: 'draft' })] });

    fireEvent.change(screen.getByRole('combobox', { name: 'Status da cotação' }), { target: { value: 'accepted' } });

    expect(props.onUpdateStatus).toHaveBeenCalledWith('p1', 'accepted');
    expect(screen.queryByRole('button', { name: 'Fechar resumo do projeto' })).not.toBeInTheDocument();
  });

  it('shows the status control in the selected-project summary panel too', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia', status: 'rejected' })] });

    const card = screen.getAllByText('Casa de praia').map((el) => el.closest('[role="button"]')).find(Boolean);
    fireEvent.click(card!);

    expect(screen.getAllByRole('combobox', { name: 'Status da cotação' })).toHaveLength(2);
  });
});

describe('ProjectTab: downloading a PDF from the card', () => {
  it('is disabled when the project has no calculated solution', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia', solution: null })] });
    openProjectActions('Casa de praia');
    expect(screen.getByRole('menuitem', { name: 'Baixar relatório' })).toBeDisabled();
  });

  it('delegates to onDownloadPdf with the project id when a solution exists', () => {
    const { props } = setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 2,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
    });

    openProjectActions('Casa de praia');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Baixar relatório' }));
    expect(props.onDownloadPdf).toHaveBeenCalledWith('p1');
  });

  it('shows a loading state and disables the button only for the project currently generating its PDF', () => {
    setup({
      savedProjects: [
        makeProject({
          id: 'p1',
          name: 'Casa de praia',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
        makeProject({
          id: 'p2',
          name: 'Escritório',
          solution: {
            inverterId: 'inv1',
            inverterModel: 'X1-Hybrid',
            batteryId: 'bat1',
            batteryModel: 'TP-HS3.6',
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
      downloadingProjectId: 'p1',
    });

    openProjectActions('Casa de praia');
    expect(screen.getByRole('menuitem', { name: 'Gerando relatório...' })).toBeDisabled();
    // The second project keeps its report action available in its own menu.
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações para Escritório' }));
    expect(screen.getByRole('menuitem', { name: 'Baixar relatório' })).not.toBeDisabled();
  });
});
