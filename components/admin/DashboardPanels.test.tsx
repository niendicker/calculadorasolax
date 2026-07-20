// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminActivityLogRow, SimulationRow, UserProfileRow } from './types';
import { ActivityLogsPanel, MetricsPanel, UsersPanel } from './DashboardPanels';

function makeUser(partial: Partial<UserProfileRow> & Pick<UserProfileRow, 'id' | 'email'>): UserProfileRow {
  return {
    full_name: '',
    phone: '',
    role: 'user',
    company_name: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function makeSimulation(partial: Partial<SimulationRow> & Pick<SimulationRow, 'id'>): SimulationRow {
  return {
    user_id: null,
    project_name: null,
    client_name: null,
    topology: 'HighVoltage',
    grid_type: 'singlePhase_220',
    peak_w: 5000,
    daily_kwh: 10,
    loads: [],
    inverter_model: 'X1-Hybrid-5.0kW-G4',
    battery_model: 'TP-HS3.6',
    accessories: [],
    solution_code: null,
    created_at: '2026-01-05T14:00:00.000Z', // a Monday
    ...partial,
  };
}

function makeLog(partial: Partial<AdminActivityLogRow> & Pick<AdminActivityLogRow, 'id' | 'entity_type' | 'action'>): AdminActivityLogRow {
  return {
    actor_id: 'u1',
    actor_email: 'admin@x.com',
    target_id: 't1',
    target_label: 'X1-Hybrid-5.0kW-G4',
    summary: 'Alterou potência',
    before_data: { power: 100 },
    after_data: { power: 200 },
    created_at: '2026-01-05T14:00:00.000Z',
    ...partial,
  };
}

describe('UsersPanel', () => {
  it('lists users with their role badge, and filters by search', () => {
    render(
      <UsersPanel
        users={[
          makeUser({ id: 'u1', email: 'ana@x.com', full_name: 'Ana', role: 'admin' }),
          makeUser({ id: 'u2', email: 'beto@x.com', full_name: 'Beto', role: 'user' }),
        ]}
        onResetPassword={vi.fn()}
        saving={false}
      />
    );
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar usuário'), { target: { value: 'beto' } });
    expect(screen.getByText('Beto')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', () => {
    render(<UsersPanel users={[]} onResetPassword={vi.fn()} saving={false} />);
    expect(screen.getByText('Nenhum usuário encontrado para essa busca.')).toBeInTheDocument();
  });

  it('resets a password, and disables the button while saving', () => {
    const onResetPassword = vi.fn();
    const { rerender } = render(
      <UsersPanel users={[makeUser({ id: 'u1', email: 'ana@x.com', full_name: 'Ana' })]} onResetPassword={onResetPassword} saving={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Resetar senha/ }));
    expect(onResetPassword).toHaveBeenCalledWith('ana@x.com');

    rerender(<UsersPanel users={[makeUser({ id: 'u1', email: 'ana@x.com', full_name: 'Ana' })]} onResetPassword={onResetPassword} saving />);
    expect(screen.getByRole('button', { name: /Resetar senha/ })).toBeDisabled();
  });
});

describe('MetricsPanel', () => {
  it('computes user/simulation counts and averages', () => {
    render(
      <MetricsPanel
        users={[makeUser({ id: 'u1', email: 'a@x.com' }), makeUser({ id: 'u2', email: 'b@x.com' })]}
        simulations={[
          makeSimulation({ id: 's1', peak_w: 4000, daily_kwh: 8 }),
          makeSimulation({ id: 's2', peak_w: 6000, daily_kwh: 12 }),
        ]}
      />
    );
    expect(screen.getByText('Usuários').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Simulações').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('5.00 kVA')).toBeInTheDocument(); // avg peak = (4000+6000)/2/1000
    expect(screen.getByText('10.00 kWh/dia')).toBeInTheDocument(); // avg daily = (8+12)/2
  });

  it('shows zeroed metrics with no simulations', () => {
    render(<MetricsPanel users={[]} simulations={[]} />);
    expect(screen.getByText('0 kVA')).toBeInTheDocument();
    expect(screen.getByText('0 kWh/dia')).toBeInTheDocument();
  });

  it('ranks chart rows by frequency, most common first', () => {
    render(
      <MetricsPanel
        users={[]}
        simulations={[
          makeSimulation({ id: 's1', inverter_model: 'X1-Hybrid-5.0kW-G4' }),
          makeSimulation({ id: 's2', inverter_model: 'X1-Hybrid-5.0kW-G4' }),
          makeSimulation({ id: 's3', inverter_model: 'X3-Hybrid-10.0kW-G4' }),
        ]}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Distribuições' }));
    const chartTitle = screen.getByText('Inversores mais recomendados');
    const card = chartTitle.closest('[data-slot="card"]') as HTMLElement;
    const rows = Array.from(card.querySelectorAll('.truncate')).map((el) => el.textContent);
    expect(rows[0]).toBe('X1-Hybrid-5.0kW-G4');
  });

  it('organizes indicators into Visão geral/Tendências/Distribuições tabs, showing only the active one', () => {
    render(<MetricsPanel users={[]} simulations={[]} />);

    // Defaults to "Visão geral".
    expect(screen.getByText('Usuários')).toBeInTheDocument();
    expect(screen.queryByText('Dimensionamentos por dia da semana')).not.toBeInTheDocument();
    expect(screen.queryByText('Tipos de rede mais usados')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Tendências' }));
    expect(screen.getByText('Dimensionamentos por dia da semana')).toBeInTheDocument();
    expect(screen.queryByText('Usuários')).not.toBeInTheDocument();
    expect(screen.queryByText('Tipos de rede mais usados')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Distribuições' }));
    expect(screen.getByText('Tipos de rede mais usados')).toBeInTheDocument();
    expect(screen.queryByText('Dimensionamentos por dia da semana')).not.toBeInTheDocument();
  });

  it('shows a "load more" button only when hasMoreSimulations is set', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<MetricsPanel users={[]} simulations={[]} />);
    expect(screen.queryByRole('button', { name: /Carregar mais simulações/ })).not.toBeInTheDocument();

    rerender(<MetricsPanel users={[]} simulations={[]} hasMoreSimulations onLoadMoreSimulations={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: /Carregar mais simulações/ }));
    expect(onLoadMore).toHaveBeenCalled();
  });
});

describe('ActivityLogsPanel', () => {
  it('shows the no-logs-at-all empty state', () => {
    render(<ActivityLogsPanel logs={[]} />);
    expect(screen.getByText('Ainda não há alterações registradas em produtos, combinações ou regras.')).toBeInTheDocument();
  });

  it('lists logs with entity/action badges', () => {
    render(<ActivityLogsPanel logs={[makeLog({ id: 'l1', entity_type: 'inverter', action: 'update' })]} />);
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.getByText('Inversor')).toBeInTheDocument();
    expect(screen.getByText('Edição')).toBeInTheDocument();
  });

  it('filters by entity type and by search, with a filter-specific empty state', () => {
    render(
      <ActivityLogsPanel
        logs={[
          makeLog({ id: 'l1', entity_type: 'inverter', action: 'update', target_label: 'X1-Hybrid' }),
          makeLog({ id: 'l2', entity_type: 'battery', action: 'create', target_label: 'TP-HS3.6' }),
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Bateria/ }));
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
    expect(screen.queryByText('X1-Hybrid')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    fireEvent.change(screen.getByLabelText('Buscar log por usuário ou item'), { target: { value: 'nonexistent' } });
    expect(screen.getByText('Nenhum registro encontrado para esse filtro.')).toBeInTheDocument();
  });

  it('expands the before/after JSON details', () => {
    render(<ActivityLogsPanel logs={[makeLog({ id: 'l1', entity_type: 'inverter', action: 'update' })]} />);
    fireEvent.click(screen.getByText('Ver dados da alteração'));
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('Depois')).toBeInTheDocument();
  });

  it('shows a "load more" button only when hasMore is set', () => {
    const onLoadMore = vi.fn();
    render(<ActivityLogsPanel logs={[makeLog({ id: 'l1', entity_type: 'inverter', action: 'update' })]} hasMore onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: /Carregar mais logs/ }));
    expect(onLoadMore).toHaveBeenCalled();
  });
});
