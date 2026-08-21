// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { ProjectEventsTimeline } from './ProjectEventsTimeline';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

function eventRow(partial: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'e1',
    project_id: 'p1',
    actor_id: 'user-1',
    event_type: 'quote_shared',
    from_status: null,
    to_status: null,
    message: null,
    created_at: '2026-01-01T12:00:00.000Z',
    ...partial,
  };
}

describe('ProjectEventsTimeline', () => {
  it('renders nothing while the project has no events', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { project_events: { data: [], error: null } } }));

    const { container } = render(<ProjectEventsTimeline projectId="p1" refreshKey="k1" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows a recoverable message when the history query fails', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { project_events: { data: null, error: { message: 'database unavailable' } } } })
    );

    render(<ProjectEventsTimeline projectId="p1" refreshKey="k1" />);

    expect(await screen.findByText('Não foi possível carregar o histórico.')).toBeInTheDocument();
  });

  it('renders every known event type with its friendly label', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: {
          project_events: {
            data: [
              eventRow({ id: 'e1', event_type: 'quote_shared' }),
              eventRow({ id: 'e2', event_type: 'quote_link_viewed' }),
              eventRow({ id: 'e3', event_type: 'quote_accepted' }),
              eventRow({ id: 'e4', event_type: 'quote_rejected' }),
              eventRow({ id: 'e5', event_type: 'status_changed', from_status: 'draft', to_status: 'sent' }),
            ],
            error: null,
          },
        },
      })
    );

    render(<ProjectEventsTimeline projectId="p1" refreshKey="k1" />);

    expect(await screen.findByText('Cotação compartilhada por WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Cliente visualizou o orçamento')).toBeInTheDocument();
    expect(screen.getByText('Cliente aceitou o orçamento')).toBeInTheDocument();
    expect(screen.getByText('Cliente recusou o orçamento')).toBeInTheDocument();
    expect(screen.getByText('Status alterado: Rascunho → Enviada')).toBeInTheDocument();
  });

  it('falls back to the raw message for an event_type it does not recognize yet', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: {
          project_events: { data: [eventRow({ event_type: 'delivered', message: 'Pedido entregue' })], error: null },
        },
      })
    );

    render(<ProjectEventsTimeline projectId="p1" refreshKey="k1" />);

    expect(await screen.findByText('Pedido entregue')).toBeInTheDocument();
  });

  it('refetches when refreshKey changes', async () => {
    const supabase = createSupabaseMock({ tableResults: { project_events: { data: [eventRow()], error: null } } });
    createClientMock.mockReturnValue(supabase);

    const { rerender } = render(<ProjectEventsTimeline projectId="p1" refreshKey="k1" />);
    await screen.findByText('Cotação compartilhada por WhatsApp');
    expect(supabase.from).toHaveBeenCalledTimes(1);

    rerender(<ProjectEventsTimeline projectId="p1" refreshKey="k2" />);
    await waitFor(() => expect(supabase.from).toHaveBeenCalledTimes(2));
  });
});
