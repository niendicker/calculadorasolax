// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { AdminPanel } from './AdminPanel';

const { createClientMock, routerMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));

const inverterRow = {
  id: 'i1',
  model: 'X1-Hybrid-5.0kW-G4',
  power_kw: 5,
  standard_power_kva: 5,
  peak_power_kva: 7,
  phases: 1,
  topology: 'HV',
  grid_types: ['1P_220V'],
  max_battery_qty: 6,
  battery_ports: 1,
  battery_voltage_min_v: null,
  battery_voltage_max_v: null,
  battery_current_max_a: null,
  max_power_per_phase_w: null,
  flags: [],
  pv_oversizing_percent: 100,
  image_url: null,
  documents: [],
};

const batteryRow = {
  id: 'b1',
  model: 'TP-HS3.6',
  capacity_kwh: 3.6,
  topology: 'HV',
  standard_power_kw: 1.8,
  peak_power_kw: 2.5,
  min_soc_percent: 10,
  nominal_voltage_v: null,
  voltage_min_v: null,
  voltage_max_v: null,
  recommended_current_a: null,
  max_current_a: null,
  flags: [],
  max_association_qty: 15,
  image_url: null,
  documents: [],
};

const userRow = {
  id: 'u1',
  email: 'a@x.com',
  full_name: 'Ana',
  phone: '',
  role: 'user',
  company_name: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function setupSupabase(
  overrides: Record<string, { data: unknown; error: null } | { data: null; error: { message: string } }> = {},
  auth: Record<string, ReturnType<typeof vi.fn>> = {}
) {
  const supabase = createSupabaseMock({
    tableResults: {
      app_simulations: { data: [], error: null },
      profiles: { data: [userRow], error: null },
      inverters: { data: [inverterRow], error: null },
      batteries: { data: [batteryRow], error: null },
      accessories: { data: [], error: null },
      load_catalog: { data: [], error: null },
      load_presets: { data: [], error: null },
      accessory_rules: { data: [], error: null },
      ess_compatibility_rules: { data: [], error: null },
      approved_solutions: { data: [], error: null },
      admin_activity_logs: { data: [], error: null },
      ...overrides,
    },
    auth,
  });
  createClientMock.mockReturnValue(supabase);
  return supabase;
}

beforeEach(() => {
  createClientMock.mockReset();
  routerMock.replace.mockReset();
  routerMock.refresh.mockReset();
});

describe('AdminPanel: initial load', () => {
  it('shows a loading skeleton, then the metrics tab once data resolves', async () => {
    setupSupabase();
    render(<AdminPanel />);

    expect(screen.getByLabelText('Carregando dados administrativos')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());
  });

  it('shows an error alert when a resource fails to load', async () => {
    setupSupabase({ profiles: { data: null, error: { message: 'db down' } } });
    render(<AdminPanel />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('db down'));
  });
});

describe('AdminPanel: tab navigation and lazy loading', () => {
  it('fetches a tab\'s resources only the first time it is visited', async () => {
    const supabase = setupSupabase();
    render(<AdminPanel />);
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());
    const callsAfterFirstVisit = supabase.from.mock.calls.filter(([table]) => table === 'batteries').length;

    fireEvent.click(screen.getByRole('button', { name: /Indicadores/ }));
    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());
    const callsAfterSecondVisit = supabase.from.mock.calls.filter(([table]) => table === 'batteries').length;

    expect(callsAfterSecondVisit).toBe(callsAfterFirstVisit);
  });

  it('"Atualizar" forces a re-fetch of the active tab even if already loaded', async () => {
    const supabase = setupSupabase();
    render(<AdminPanel />);
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    const callsBefore = supabase.from.mock.calls.filter(([table]) => table === 'profiles').length;
    fireEvent.click(screen.getByRole('button', { name: /Atualizar/ }));
    await waitFor(() => {
      const callsAfter = supabase.from.mock.calls.filter(([table]) => table === 'profiles').length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});

describe('AdminPanel: saving a product records an activity log and refreshes the list', () => {
  it('saves a new inverter', async () => {
    const supabase = setupSupabase();
    render(<AdminPanel />);
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Inversores/ }));
    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Novo inversor/ }));
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'X3-Hybrid-10.0kW-G4' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Inversor salvo.'));
    expect(supabase.from).toHaveBeenCalledWith('admin_activity_logs');
  });
});

describe('AdminPanel: removing a row', () => {
  it('deletes a battery and records the activity log', async () => {
    const supabase = setupSupabase();
    render(<AdminPanel />);
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover TP-HS3.6' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro removido com sucesso.'));
    expect(supabase.from).toHaveBeenCalledWith('admin_activity_logs');
  });
});

describe('AdminPanel: sign out and mobile menu', () => {
  it('signs out and redirects to login', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    setupSupabase({}, { signOut });
    render(<AdminPanel />);
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/pt/login'));
  });

  it('opens and closes the mobile navigation menu', async () => {
    setupSupabase();
    render(<AdminPanel />);
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu administrativo' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar menu' })[1]);
    expect(screen.queryByRole('dialog', { name: 'Menu administrativo' })).not.toBeInTheDocument();
  });
});
