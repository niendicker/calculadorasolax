// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import type { Client, SavedProject } from '@/lib/types';
import { renderWithShell } from '../test-helpers/render-with-shell';
import { ClientsTab } from './ClientsTab';

function makeClient(partial: Partial<Client> & Pick<Client, 'id' | 'name'>): Client {
  return {
    email: '',
    phone: '',
    document: '',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

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

function setup(overrides: Partial<Parameters<typeof ClientsTab>[0]> = {}) {
  const props = {
    clients: [] as Client[],
    savedProjects: [] as SavedProject[],
    onAdd: vi.fn().mockResolvedValue(makeClient({ id: 'new', name: 'Novo Cliente' })),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onOpenProject: vi.fn(),
    ...overrides,
  };
  const utils = renderWithShell(<ClientsTab {...props} />);
  return { ...utils, props };
}

describe('ClientsTab: empty and list states', () => {
  it('shows the empty state when there are no clients', () => {
    setup();
    expect(screen.getByText('Nenhum cliente cadastrado ainda.')).toBeInTheDocument();
  });

  it('lists clients and filters them by search', () => {
    setup({
      clients: [makeClient({ id: 'c1', name: 'Ana' }), makeClient({ id: 'c2', name: 'Beto' })],
    });

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Beto')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar cliente...' }));
    fireEvent.change(screen.getByPlaceholderText('Pesquisar cliente...'), { target: { value: 'ana' } });

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Beto')).not.toBeInTheDocument();
  });
});

describe('ClientsTab: client project history', () => {
  it('does not show a project count for a client with no projects', () => {
    setup({ clients: [makeClient({ id: 'c1', name: 'Ana' })], savedProjects: [] });
    expect(screen.queryByRole('button', { name: /projeto/ })).not.toBeInTheDocument();
  });

  it('shows the project count and expands to list each one with its status', () => {
    setup({
      clients: [makeClient({ id: 'c1', name: 'Ana' })],
      savedProjects: [
        makeProject({ id: 'p1', name: 'Casa da Praia', clientId: 'c1', status: 'draft' }),
        makeProject({ id: 'p2', name: 'Apto Centro', clientId: 'c1', status: 'accepted' }),
        makeProject({ id: 'p3', name: 'Projeto de outro cliente', clientId: 'c2' }),
      ],
    });

    const toggle = screen.getByRole('button', { name: '2 projetos' });
    expect(screen.queryByText('Casa da Praia')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByText('Casa da Praia')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByText('Apto Centro')).toBeInTheDocument();
    expect(screen.getByText('Aceita')).toBeInTheDocument();
    expect(screen.queryByText('Projeto de outro cliente')).not.toBeInTheDocument();
  });

  it('uses singular "projeto" for a single project', () => {
    setup({
      clients: [makeClient({ id: 'c1', name: 'Ana' })],
      savedProjects: [makeProject({ id: 'p1', name: 'Casa da Praia', clientId: 'c1' })],
    });
    expect(screen.getByRole('button', { name: '1 projeto' })).toBeInTheDocument();
  });

  it('opens a project from the client list', () => {
    const { props } = setup({
      clients: [makeClient({ id: 'c1', name: 'Ana' })],
      savedProjects: [makeProject({ id: 'p1', name: 'Casa da Praia', clientId: 'c1' })],
    });

    fireEvent.click(screen.getByRole('button', { name: '1 projeto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(props.onOpenProject).toHaveBeenCalledWith('p1');
  });

  it('collapses the project list when toggled again', () => {
    setup({
      clients: [makeClient({ id: 'c1', name: 'Ana' })],
      savedProjects: [makeProject({ id: 'p1', name: 'Casa da Praia', clientId: 'c1' })],
    });

    const toggle = screen.getByRole('button', { name: '1 projeto' });
    fireEvent.click(toggle);
    expect(screen.getByText('Casa da Praia')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText('Casa da Praia')).not.toBeInTheDocument();
  });
});

describe('ClientsTab: add flow', () => {
  it('opens the form via the header button, requires a name, and saves', async () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    expect(screen.getByLabelText(/^Nome/)).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /Salvar cliente/ });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Novo Cliente' } });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Novo Cliente' })));
    // Form closes back to the list on success.
    await waitFor(() => expect(screen.queryByLabelText(/^Nome/)).not.toBeInTheDocument());
  });

  it('shows a limit-reached error verbatim and keeps the form open', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Limite de 50 clientes cadastrados atingido.'));
    setup({ onAdd });

    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar cliente/ }));

    await waitFor(() => expect(screen.getByText('Limite de 50 clientes cadastrados atingido.')).toBeInTheDocument());
    expect(screen.getByLabelText(/^Nome/)).toBeInTheDocument();
  });

  it('shows a generic error message for any other failure', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('boom'));
    setup({ onAdd });

    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar cliente/ }));

    await waitFor(() =>
      expect(screen.getByText('Não foi possível salvar o cliente. Verifique sua conexão e tente novamente.')).toBeInTheDocument()
    );
  });

  it('closes the form without saving on Cancelar when nothing was typed', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText(/^Nome/)).not.toBeInTheDocument();
  });

  it('focuses the name field automatically when the form opens', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    expect(screen.getByLabelText(/^Nome/)).toHaveFocus();
  });

  it('submits the form on Enter instead of requiring a click on Salvar', async () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));

    const nameInput = screen.getByLabelText(/^Nome/);
    fireEvent.change(nameInput, { target: { value: 'Novo Cliente' } });
    fireEvent.submit(nameInput.closest('form')!);

    await waitFor(() => expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Novo Cliente' })));
  });

  it('asks for confirmation before discarding unsaved changes on Cancelar', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Rascunho' } });

    fireEvent.click(screen.getByRole('button', { name: 'Descartar alterações do cliente' }));
    const discardButton = await screen.findByRole('button', { name: 'Descartar' }, { timeout: 1000 });
    fireEvent.click(discardButton);

    expect(screen.queryByLabelText(/^Nome/)).not.toBeInTheDocument();
  });

  it('disables "Novo cliente" once the account limit is reached', () => {
    const clients = Array.from({ length: 50 }, (_, index) => makeClient({ id: `c${index}`, name: `Cliente ${index}` }));
    setup({ clients });

    expect(screen.getByText('Clientes (50/50)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo cliente' })).toBeDisabled();
  });
});

describe('ClientsTab: edit flow', () => {
  it('pre-fills the form and calls onUpdate with the id', async () => {
    const client = makeClient({ id: 'c1', name: 'Ana', email: 'ana@x.com' });
    const { props } = setup({ clients: [client] });

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Ana');
    expect(screen.getByLabelText('Email')).toHaveValue('ana@x.com');

    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Ana Editada' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar cliente/ }));

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Ana Editada' }))
    );
  });
});

describe('ClientsTab: remove flow', () => {
  it('confirms via the delete popover before calling onRemove', async () => {
    const client = makeClient({ id: 'c1', name: 'Ana' });
    const { props } = setup({ clients: [client] });

    fireEvent.click(screen.getByRole('button', { name: 'Remover cliente Ana' }));

    const confirmButton = await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith('c1'));
  });

  it('shows a generic error and re-enables actions when onRemove fails', async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error('boom'));
    const client = makeClient({ id: 'c1', name: 'Ana' });
    setup({ clients: [client], onRemove });

    fireEvent.click(screen.getByRole('button', { name: 'Remover cliente Ana' }));
    const confirmButton = await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível remover o cliente. Verifique sua conexão e tente novamente.')
      ).toBeInTheDocument()
    );
    // Once the failed removal settles, the edit button is enabled again.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeEnabled());
  });
});

describe('ClientsTab: form fields', () => {
  it('updates email, phone, document and notes fields', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11999999999' } });
    fireEvent.change(screen.getByLabelText('CPF/CNPJ'), { target: { value: '123.456.789-00' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'nota qualquer' } });

    expect(screen.getByLabelText('Email')).toHaveValue('a@b.com');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 99999-9999');
    expect(screen.getByLabelText('CPF/CNPJ')).toHaveValue('123.456.789-00');
    expect(screen.getByLabelText('Observações')).toHaveValue('nota qualquer');
  });

  it('shows a placeholder when a client has no contact info', () => {
    setup({ clients: [makeClient({ id: 'c1', name: 'Sem Contato' })] });
    expect(screen.getByText('Sem dados de contato')).toBeInTheDocument();
  });
});
