// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
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
      inverterModel: null,
      gridType: 'singlePhase_220',
      loads: [],
      peakCalcMode: 'sum',
      desiredFeatures: [],
      whiteTariff: null,
      microgrid: null,
      generator: null,
      atsPhotoUrl: null,
      maxPowerPerPhaseW: null,
    },
    solution: null,
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
    onManageClients: vi.fn(),
    ...overrides,
  };
  const utils = renderWithShell(<ProjectTab {...props} />);
  return { ...utils, props };
}

describe('ProjectTab: empty and list states', () => {
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

  it('edits are reported via setProjectInfo and Cancelar calls onCancelNew', () => {
    const { props } = setup({ projectDetailsVisible: true, currentProjectId: null });

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Novo nome' } });
    expect(props.setProjectInfo).toHaveBeenCalledWith({ name: 'Novo nome' });

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
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

  it('Salvar projeto in the draft card delegates to onSave', () => {
    const { props } = setup({ projectDetailsVisible: true, currentProjectId: null });
    fireEvent.click(screen.getAllByRole('button', { name: /Salvar projeto/ })[0]);
    expect(props.onSave).toHaveBeenCalled();
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

  it('clicking Abrir on a saved project delegates to onOpen with its id', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(props.onOpen).toHaveBeenCalledWith('p1');
  });

  it('clicking Dimensionamento on a saved project delegates to onOpenSizing with its id', () => {
    const { props } = setup({ savedProjects: [makeProject({ id: 'p1', name: 'Casa de praia' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Dimensionamento' }));
    expect(props.onOpenSizing).toHaveBeenCalledWith('p1');
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
