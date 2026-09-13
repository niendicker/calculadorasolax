// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupplierQuoteRequestRow } from '@/lib/data/supplier-quote-repository';
import type { InlineProfile } from '../../types';
import type { ShareableProject } from '../../helpers';
import { SupplierQuoteRequestModal } from './SupplierQuoteRequestModal';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  listOrderingSuppliers: vi.fn(),
  listUserSupplierPreferences: vi.fn(),
  listSupplierQuoteRequests: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/data/supplier-repository', () => ({
  listOrderingSuppliers: mocks.listOrderingSuppliers,
  listUserSupplierPreferences: mocks.listUserSupplierPreferences,
}));
vi.mock('@/lib/data/supplier-quote-repository', () => ({
  listSupplierQuoteRequests: mocks.listSupplierQuoteRequests,
}));

const suppliers = [
  { id: 'supplier-1', name: 'Distribuidora Solar', email: 'solar@example.com', is_default_for_all: true },
  { id: 'supplier-2', name: 'Energia Limpa', email: 'energia@example.com', is_default_for_all: false },
  { id: 'supplier-3', name: 'Sem email', email: null, is_default_for_all: true },
  { id: 'supplier-4', name: 'Terceira opção', email: 'terceira@example.com', is_default_for_all: true },
];

const project = {
  name: 'Projeto residencial',
  topology: 'HighVoltage',
  gridType: 'singlePhase_220',
  loadsCount: 3,
  peakW: 4500,
  dailyKwh: 8,
  solution: null,
} as unknown as ShareableProject;

const profile = {
  id: 'user-1',
  fullName: 'Marcelo',
  companyName: 'Empresa Solar',
  companyDocument: '12.345.678/0001-90',
  phone: '(11) 99999-9999',
  email: 'empresa@example.com',
  companyAddress: {
    postalCode: '01000-000',
    street: 'Rua Solar',
    number: '10',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    complement: '',
  },
} as unknown as InlineProfile;

function makeSupabase(settings: { quote_cooldown_hours: number } | null = { quote_cooldown_hours: 24 }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data: settings, error: null }),
  };
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn(() => builder),
  };
}

function makeRequest(partial: Partial<SupplierQuoteRequestRow>): SupplierQuoteRequestRow {
  return {
    id: 'request-1',
    project_id: 'project-1',
    supplier_id: 'supplier-1',
    status: 'sent',
    created_at: '2026-09-12T10:00:00.000Z',
    sent_at: '2026-09-12T10:00:00.000Z',
    last_sent_at: '2026-09-12T10:00:00.000Z',
    send_count: 1,
    error_message: null,
    ...partial,
  };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof SupplierQuoteRequestModal>> = {}) {
  return render(
    <SupplierQuoteRequestModal
      open
      onClose={vi.fn()}
      projectId="project-1"
      project={project}
      profile={profile}
      batteryCatalog={[]}
      onSent={vi.fn()}
      onManageSuppliers={vi.fn()}
      {...overrides}
    />
  );
}

beforeEach(() => {
  mocks.createClient.mockReturnValue(makeSupabase());
  mocks.listOrderingSuppliers.mockResolvedValue(suppliers);
  mocks.listUserSupplierPreferences.mockResolvedValue([{ supplier_id: 'supplier-2' }]);
  mocks.listSupplierQuoteRequests.mockResolvedValue({ data: [], error: null });
  vi.stubGlobal('crypto', { randomUUID: () => 'request-key' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SupplierQuoteRequestModal', () => {
  it('loads only allowed suppliers with email and renders the generated message', async () => {
    renderModal();

    expect(await screen.findByRole('dialog', { name: 'Solicitar orçamento ao fornecedor' })).toBeInTheDocument();
    expect(await screen.findByText('Distribuidora Solar')).toBeInTheDocument();
    expect(screen.getByText('Energia Limpa')).toBeInTheDocument();
    expect(screen.queryByText('Sem email')).not.toBeInTheDocument();
    expect(screen.getByText('Prévia da mensagem')).toBeInTheDocument();
    expect(screen.getByText(/Projeto residencial/)).toBeInTheDocument();
  });

  it('shows the empty state and opens supplier management', async () => {
    const onClose = vi.fn();
    const onManageSuppliers = vi.fn();
    mocks.listOrderingSuppliers.mockResolvedValue([]);
    renderModal({ onClose, onManageSuppliers });

    expect(await screen.findByText(/Você ainda não selecionou nenhum fornecedor/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para Fornecedores' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onManageSuppliers).toHaveBeenCalledOnce();
  });

  it('renders cooldown, failed and processing history states', async () => {
    mocks.listSupplierQuoteRequests.mockResolvedValue({
      data: [
        makeRequest({ supplier_id: 'supplier-1', status: 'sent', sent_at: new Date(Date.now() - 60_000).toISOString() }),
        makeRequest({ supplier_id: 'supplier-2', status: 'failed', sent_at: null }),
      ],
      error: null,
    });
    renderModal();

    expect(await screen.findByText(/Solicitação enviada em/)).toBeInTheDocument();
    expect(screen.getByText(/Novo envio disponível em/)).toBeInTheDocument();
    expect(screen.getByText(/Última tentativa não enviada/)).toBeInTheDocument();
  });

  it('limits selection to two suppliers and displays successful results', async () => {
    const onSent = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ supplierId: 'supplier-1', supplierName: 'Distribuidora Solar', status: 'sent', sentAt: '2026-09-12T12:00:00.000Z' }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    renderModal({ onSent });

    await screen.findByText('Distribuidora Solar');
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[2]);

    expect(screen.getByText(/2 de 2 selecionados/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitações' }));

    await waitFor(() => expect(onSent).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/request-supplier-quote', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByText('Resultado das solicitações')).toBeInTheDocument();
    expect(screen.getByText('Solicitação enviada em 12/09/2026, 09:00')).toBeInTheDocument();
  });

  it('shows API errors and partial results without calling onSent', async () => {
    const onSent = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'O limite diário foi atingido.',
            results: [{ supplierId: 'supplier-1', supplierName: 'Distribuidora Solar', status: 'failed' }],
          }),
          { status: 429 }
        )
      )
    );
    renderModal({ onSent });

    await screen.findByText('Distribuidora Solar');
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitações' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O limite diário foi atingido.');
    expect(screen.getByText('Resultado das solicitações')).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('reports connection failures and closes with backdrop, button and Escape', async () => {
    const onClose = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderModal({ onClose });

    const dialog = await screen.findByRole('dialog', { name: 'Solicitar orçamento ao fornecedor' });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitações' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Falha de conexão/);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(dialog);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('shows a loading error when suppliers cannot be loaded', async () => {
    mocks.listOrderingSuppliers.mockRejectedValue(new Error('database unavailable'));
    renderModal();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os fornecedores e o histórico.');
  });
});
