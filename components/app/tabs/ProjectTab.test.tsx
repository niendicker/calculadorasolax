// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Client, ProjectInfo, SavedProject } from '@/lib/types';
import { renderWithShell } from '../test-helpers/render-with-shell';
import { ProjectTab } from './ProjectTab';

function makeProject(partial: Partial<SavedProject> & Pick<SavedProject, 'id'>): SavedProject {
  return {
    name: 'Projeto salvo',
    clientId: null,
    address: '',
    notes: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
    residentialOptions: {
      topology: 'HighVoltage',
      batteryModel: 'TP-HS3.6',
      secondaryBatteryModel: null,
      inverterModel: null,
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

const emptyProjectInfo: ProjectInfo = { name: '', clientId: null, address: '', notes: '' };

function setup(overrides: Partial<Parameters<typeof ProjectTab>[0]> = {}) {
  const props = {
    projectInfo: emptyProjectInfo,
    projectDetailsVisible: false,
    currentProjectId: null,
    savedProjects: [] as SavedProject[],
    clients: [] as Client[],
    batteryCatalog: [],
    userStockItems: [],
    userServices: [],
    services: [],
    initialLoading: false,
    projectStatus: null,
    topology: null,
    batteryModel: null,
    gridType: null,
    loadsCount: 0,
    peakW: 0,
    dailyKwh: 0,
    hasSolution: false,
    setProjectInfo: vi.fn(),
    onSave: vi.fn(),
    onNew: vi.fn(),
    onCancelNew: vi.fn(),
    onOpen: vi.fn(),
    onOpenSizing: vi.fn(),
    onRemove: vi.fn(),
    onDuplicate: vi.fn(),
    onDownloadPdf: vi.fn(),
    onManageClients: vi.fn(),
    onShowSummary: vi.fn(),
    onAddService: vi.fn(),
    onRemoveService: vi.fn(),
    onUpdateServiceQty: vi.fn(),
    ...overrides,
  };
  const utils = renderWithShell(<ProjectTab {...props} />);
  return { ...utils, props };
}

describe('ProjectTab: empty and list states', () => {
  it('shows a generic placeholder in the summary panel when no project is open or selected', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    expect(
      screen.getByText('Selecione um projeto na lista para ver o resumo, ou clique em "Novo projeto" para começar.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Configuração salva junto')).not.toBeInTheDocument();
  });

  it('shows the live "Configuração salva junto" summary while editing a project draft', () => {
    setup({ projectDetailsVisible: true, currentProjectId: null });
    expect(screen.getByText('Configuração salva junto')).toBeInTheDocument();
  });

  it('shows the empty state and a "Novo projeto" button when there are no projects', () => {
    setup();
    expect(screen.getByText('Nenhum projeto salvo ainda. Clique em "Novo projeto" para começar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Novo projeto/ })).toBeInTheDocument();
  });

  it('lists saved projects as cards with their badges', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })],
    });
    expect(screen.getByText('Casa de praia')).toBeInTheDocument();
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
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

describe('ProjectTab: aggregate stats, filtering and sorting', () => {
  it('shows a stats line with the project count, how many have a solution, and the total priced value', () => {
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

    expect(screen.getByText(/2 projetos/)).toBeInTheDocument();
    expect(screen.getByText(/1 com solução calculada/)).toBeInTheDocument();
    // One match in the aggregate stats line, one on the priced project's own card.
    expect(screen.getAllByText(/R\$\s*8\.000,00/)).toHaveLength(2);
  });

  it('filters the list to only projects with (or without) a calculated solution', () => {
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
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Com solução' }));
    expect(screen.getByText('Casa de praia')).toBeInTheDocument();
    expect(screen.queryByText('Escritório')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Sem solução' }));
    expect(screen.queryByText('Casa de praia')).not.toBeInTheDocument();
    expect(screen.getByText('Escritório')).toBeInTheDocument();
  });

  it('sorts the list by name when "Nome (A-Z)" is chosen', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Zebra' }), makeProject({ id: 'p2', name: 'Alpha' })],
    });

    fireEvent.change(screen.getByLabelText('Ordenar projetos'), { target: { value: 'name' } });

    const names = screen.getAllByText(/^(Zebra|Alpha)$/).map((el) => el.textContent);
    expect(names).toEqual(['Alpha', 'Zebra']);
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
  it('clicking "Novo projeto" (header) delegates to onNew', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    expect(props.onNew).toHaveBeenCalled();
  });

  it('shows an inline draft card (not a separate list item) when starting a new project', () => {
    setup({ projectDetailsVisible: true, currentProjectId: null });

    expect(screen.getByText('Novo projeto', { selector: '.text-base' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do projeto')).toHaveValue('');
  });

  it('edits are reported via setProjectInfo and Fechar calls onCancelNew', () => {
    const { props } = setup({ projectDetailsVisible: true, currentProjectId: null });

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Novo nome' } });
    expect(props.setProjectInfo).toHaveBeenCalledWith({ name: 'Novo nome' });

    fireEvent.click(screen.getByRole('button', { name: /Fechar/ }));
    expect(props.onCancelNew).toHaveBeenCalled();
  });

  it('edits the client, address and notes fields, and delegates "Gerenciar clientes"', () => {
    const { props } = setup({
      projectDetailsVisible: true,
      currentProjectId: null,
      clients: [{ id: 'c1', name: 'Ana Souza' } as Client],
    });

    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c1' } });
    expect(props.setProjectInfo).toHaveBeenCalledWith({ clientId: 'c1' });

    fireEvent.change(screen.getByLabelText('Endereço'), { target: { value: 'Rua das Flores, 10' } });
    expect(props.setProjectInfo).toHaveBeenCalledWith({ address: 'Rua das Flores, 10' });

    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Instalação em telhado inclinado.' } });
    expect(props.setProjectInfo).toHaveBeenCalledWith({ notes: 'Instalação em telhado inclinado.' });

    fireEvent.click(screen.getByRole('button', { name: /Gerenciar clientes/ }));
    expect(props.onManageClients).toHaveBeenCalled();
  });

  it('Salvar projeto in the draft card delegates to onSave when a name is set', () => {
    const { props } = setup({
      projectDetailsVisible: true,
      currentProjectId: null,
      projectInfo: { name: 'Residência Silva', clientId: null, address: '', notes: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Salvar projeto/ }));
    expect(props.onSave).toHaveBeenCalled();
  });

  it('blocks saving and shows an inline error when the name is empty', () => {
    const { props } = setup({ projectDetailsVisible: true, currentProjectId: null });
    fireEvent.click(screen.getByRole('button', { name: /Salvar projeto/ }));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Informe um nome para o projeto.')).toBeInTheDocument();
  });
});

describe('ProjectTab: opening an existing project edits it in place', () => {
  it('replaces the clicked card with the draft form instead of adding a separate card', () => {
    setup({
      savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' }), makeProject({ id: 'p2', name: 'Escritório' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Casa de praia', clientId: null, address: '', notes: '' },
    });

    // The card for p1 became the editable form (its name only shows as an input value)...
    expect(screen.getByLabelText('Nome do projeto')).toHaveValue('Casa de praia');
    expect(screen.getByText('Editando projeto')).toBeInTheDocument();
    // ...while p2 stays a normal read-only card.
    expect(screen.getByText('Escritório')).toBeInTheDocument();
    // Only one "Novo projeto" trigger card should exist for a genuinely new draft, and it must be absent here.
    expect(screen.queryByText('Novo projeto', { selector: '.text-base' })).not.toBeInTheDocument();
  });

  it('clicking Editar on a saved project delegates to onOpen with its id', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(props.onOpen).toHaveBeenCalledWith('p1');
  });

  it('clicking Dimensionamento on a saved project delegates to onOpenSizing with its id', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));
    expect(props.onOpenSizing).toHaveBeenCalledWith('p1');
  });

  it('clicking the duplicate button on a saved project delegates to onDuplicate with its id', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar projeto Casa de praia' }));
    expect(props.onDuplicate).toHaveBeenCalledWith('p1');
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

  it('"Ir para Dimensionamento" in the summary delegates to onOpenSizing with the selected project id', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    clickCard('Casa de praia');
    fireEvent.click(screen.getByRole('button', { name: 'Ir para Dimensionamento' }));

    expect(props.onOpenSizing).toHaveBeenCalledWith('p1');
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

  it('"Copiar dados" shows a single-view preview of the WhatsApp-friendly summary, copying only when confirmed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

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
            batteryQty: 1,
            pvPowerKw: null,
            accessories: [],
          },
        }),
      ],
      clients: [{ id: 'c1', name: 'Ana Souza' } as Client],
    });

    clickCard('Casa de praia');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar dados' }));

    const dialog = screen.getByRole('dialog', { name: 'Prévia da mensagem' });
    expect(writeText).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/Casa de praia/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Ana Souza/)).toBeInTheDocument();
    expect(within(dialog).getByText(/X1-Hybrid/)).toBeInTheDocument();
    expect(within(dialog).getByText(/orçamento/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole('button', { name: 'Dados copiados!' })).toBeInTheDocument();

    // The preview closes itself shortly after a successful copy.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Prévia da mensagem' })).not.toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('"Copiar dados" omits bundled accessories from the preview, keeping only quotable ones', () => {
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
              { model: 'Disjuntor CA', qty: 1, optional: false, appliesTo: 'system', comment: null, bundled: false },
            ],
          },
        }),
      ],
    });

    clickCard('Casa de praia');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar dados' }));

    const dialog = screen.getByRole('dialog', { name: 'Prévia da mensagem' });
    expect(within(dialog).queryByText(/WiFi Dongle/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Disjuntor CA/)).toBeInTheDocument();
  });

  it('clicking the selected card again clears the selection', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    clickCard('Casa de praia');
    expect(screen.getByRole('button', { name: 'Fechar resumo do projeto' })).toBeInTheDocument();

    clickCard('Casa de praia');
    expect(screen.queryByRole('button', { name: 'Fechar resumo do projeto' })).not.toBeInTheDocument();
  });

  it('brings the summary panel into view (e.g. the mobile drawer) when a project is selected', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    clickCard('Casa de praia');
    expect(props.onShowSummary).toHaveBeenCalledTimes(1);

    clickCard('Casa de praia');
    expect(props.onShowSummary).toHaveBeenCalledTimes(1);
  });

  it('does not trigger selection when clicking the card action buttons', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(props.onOpen).toHaveBeenCalledWith('p1');
    expect(screen.queryByRole('button', { name: 'Fechar resumo do projeto' })).not.toBeInTheDocument();
  });
});

describe('ProjectTab: downloading a PDF from the card', () => {
  it('is disabled when the project has no calculated solution', () => {
    setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia', solution: null })] });
    expect(screen.getByRole('button', { name: 'Compartilhar Relatório' })).toBeDisabled();
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

    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar Relatório' }));
    expect(props.onDownloadPdf).toHaveBeenCalledWith('p1');
  });
});

describe('ProjectTab: removing a project', () => {
  it('confirms via the delete popover before calling onRemove', async () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });

    fireEvent.click(screen.getByRole('button', { name: 'Remover projeto Casa de praia' }));
    const confirmButton = await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith('p1'));
  });
});

describe('ProjectTab: status message', () => {
  it('shows the projectStatus text when present', () => {
    setup({ projectStatus: 'Projeto removido.' });
    expect(screen.getByRole('status')).toHaveTextContent('Projeto removido.');
  });
});
