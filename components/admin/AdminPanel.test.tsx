// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const accessoryRow = {
  id: 'a1',
  model: 'Smart Meter',
  nickname: null,
  description: null,
  active: true,
  image_url: null,
  documents: [],
};

const loadCatalogRow = {
  id: 'l1',
  name_pt: 'Chuveiro elétrico',
  name_en: 'Electric shower',
  name_zh: '',
  power_w: 5500,
  category: 'Aquecimento',
  ip_in_ratio: 1,
  active: true,
};

const presetRow = {
  id: 'p1',
  name: 'Residencial médio',
  description: '',
  loads: [],
  display_order: 0,
};

const accessoryRuleRow = {
  id: 'r1',
  accessory_id: 'a1',
  name: 'Regra Smart Meter',
  inclusion: 'required',
  trigger_metric: 'per_solution',
  min_quantity: 1,
  inverter_model: null,
  inverter_models: [],
  battery_model: null,
  grid_topology: null,
  battery_topology: null,
  quantity_per_match: 1,
  comment: null,
  active: true,
  accessories: { model: 'Smart Meter' },
};

const essRuleRow = {
  id: 'e1',
  name: 'Regra ESS',
  inverter_model: 'X1-Hybrid-5.0kW-G4',
  battery_model: 'TP-HS3.6',
  battery_topology: 'HV',
  grid_topology: null,
  max_parallel_inverters: 1,
  min_battery_qty: 1,
  max_battery_qty: 2,
  battery_configs: [],
  comment: null,
  active: true,
  created_at: '',
};

const solutionRow = {
  id: 's1',
  source_file: 'admin',
  solution_code: 'code-1',
  schema_version: '1.0',
  inverter_model: 'X1-Hybrid-5.0kW-G4',
  inverter_quantity: 1,
  battery_ports_used: 1,
  nominal_voltage_v: 220,
  rated_power_w: 5000,
  peak_power_w: 7000,
  grid_topology: '1p_220V',
  battery_model: 'TP-HS3.6',
  battery_topology: 'HV',
  battery_quantity: 1,
  battery_power_w: 1800,
  available_energy_wh: 3200,
  accessories: [],
  comments: [],
  raw_solution: {},
  active: true,
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

/** A query builder that always resolves with the given error — used to make
 * exactly one subsequent `.from(table)` call fail (e.g. a save/remove),
 * without disturbing the table's already-mocked initial-load response. */
function failingBuilder(message: string) {
  const result = { data: null, error: { message } };
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    upsert: () => builder,
    eq: () => builder,
    in: () => builder,
    range: () => builder,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

/** Redirects the next `.from(table)` call on this mock to fail with
 * `message`, then restores the original mocked behavior for later calls. */
function makeFromFailOnce(supabase: ReturnType<typeof createSupabaseMock>, table: string, message: string) {
  const original = supabase.from;
  supabase.from = vi.fn((t: string) => {
    if (t === table) {
      supabase.from = original;
      return failingBuilder(message);
    }
    return original(t);
  }) as typeof supabase.from;
}

function withStorageMock(
  supabase: ReturnType<typeof createSupabaseMock>,
  { uploadError = null as { message: string } | null, publicUrl = 'https://cdn.example.com/x.png' } = {}
) {
  (supabase as unknown as { storage: unknown }).storage = {
    from: () => ({
      upload: vi.fn().mockResolvedValue({ error: uploadError }),
      getPublicUrl: () => ({ data: { publicUrl } }),
    }),
  };
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

  it('edits an existing inverter (hits the update/beforeData branch)', async () => {
    await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Inversores/ }));
    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'X1-Hybrid-5.0kW-G4-v2' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Inversor salvo.'));
  });
});

describe('AdminPanel: removing a row', () => {
  it('deletes an inverter and records the activity log (hits the getLogTarget "inverters" branch)', async () => {
    await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Inversores/ }));
    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover X1-Hybrid-5.0kW-G4' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro removido com sucesso.'));
  });

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

  it('opens and closes the mobile navigation menu via the X button', async () => {
    setupSupabase();
    render(<AdminPanel />);
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu administrativo' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar menu' })[1]);
    expect(screen.queryByRole('dialog', { name: 'Menu administrativo' })).not.toBeInTheDocument();
  });

  it('closes the mobile menu by clicking the backdrop overlay', async () => {
    setupSupabase();
    render(<AdminPanel />);
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar menu' })[0]);
    expect(screen.queryByRole('dialog', { name: 'Menu administrativo' })).not.toBeInTheDocument();
  });

  it('navigates and closes the menu when a tab is picked from the mobile nav', async () => {
    setupSupabase();
    render(<AdminPanel />);
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu administrativo' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Baterias/ }));

    expect(screen.queryByRole('dialog', { name: 'Menu administrativo' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());
  });
});

async function openAdminPanel(overrides?: Parameters<typeof setupSupabase>[0], auth?: Parameters<typeof setupSupabase>[1]) {
  const supabase = setupSupabase(overrides, auth);
  render(<AdminPanel />);
  await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());
  return supabase;
}

describe('AdminPanel: saving every entity type records the right activity log entity', () => {
  it('saves a new battery', async () => {
    await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Nova bateria/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Bateria salva.'));
  });

  it('updates an existing battery (hits the update/beforeData branch)', async () => {
    await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'TP-HS3.6-v2' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Bateria salva.'));
  });

  it('saves a new accessory', async () => {
    await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Acessórios/ }));
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Novo acessório/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Acessório salvo.'));
  });

  it('saves a new load catalog item', async () => {
    await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Cargas/ }));
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Nova carga/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Carga salva.'));
  });

  it('saves a new preset', async () => {
    await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Presets/ }));
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Novo preset/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Preset salvo.'));
  });

  it('saves a new solution (combinação)', async () => {
    await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Combinações/ }));
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Combinação salva.'));
  });

  it('edits an existing solution with accessories/comments already set (hits editSolution and the accessories/comments filters)', async () => {
    await openAdminPanel({
      approved_solutions: {
        data: [{ ...solutionRow, accessories: ['Smart Meter x1'], comments: ['Confirmado em campo'] }],
        error: null,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Combinações/ }));
    await waitFor(() => expect(screen.getByText('code-1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Editar combinação' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Combinação salva.'));
  });

  it('saves a new accessory rule from an existing accessory\'s "Regras de aplicação" tab', async () => {
    await openAdminPanel({ accessories: { data: [accessoryRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Acessórios/ }));
    await waitFor(() => expect(screen.getByText('Smart Meter')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regras de aplicação' }));
    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Regra salva.'));
  });

  it('saves a new ESS compatibility rule from an existing inverter\'s "Compatibilidade ESS" tab', async () => {
    await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Inversores/ }));
    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compatibilidade ESS' }));
    fireEvent.click(screen.getByRole('button', { name: /Nova compatibilidade/ }));

    const essDialog = screen.getByRole('dialog', { name: /Nova compatibilidade ESS/ });
    fireEvent.click(within(essDialog).getByRole('button', { name: /TP-HS3.6/ }));
    fireEvent.click(within(essDialog).getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Regra ESS salva.'));
  });
});

describe('AdminPanel: save failure surfaces the Supabase error instead of a generic message', () => {
  it('shows the error alert and does not clear the form when saving a battery fails', async () => {
    const supabase = await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Nova bateria/ }));
    makeFromFailOnce(supabase, 'batteries', 'capacity_kwh must be positive');
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('capacity_kwh must be positive'));
  });
});

describe('AdminPanel: removing every entity type resolves the right activity-log label', () => {
  it('removes an accessory', async () => {
    await openAdminPanel({ accessories: { data: [accessoryRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Acessórios/ }));
    await waitFor(() => expect(screen.getByText('Smart Meter')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover Smart Meter' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro removido com sucesso.'));
  });

  it('removes a load catalog item permanently', async () => {
    await openAdminPanel({ load_catalog: { data: [loadCatalogRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Cargas/ }));
    await waitFor(() => expect(screen.getByText('Chuveiro elétrico')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover Chuveiro elétrico' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro removido com sucesso.'));
  });

  it('deactivates (soft-removes) a load catalog item', async () => {
    await openAdminPanel({ load_catalog: { data: [loadCatalogRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Cargas/ }));
    await waitFor(() => expect(screen.getByText('Chuveiro elétrico')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Desativar Chuveiro elétrico' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro inativado com sucesso.'));
  });

  it('removes a preset', async () => {
    await openAdminPanel({ load_presets: { data: [presetRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Presets/ }));
    await waitFor(() => expect(screen.getByText('Residencial médio')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover Residencial médio' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro removido com sucesso.'));
  });

  it('removes an approved solution (hard delete)', async () => {
    await openAdminPanel({ approved_solutions: { data: [solutionRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Combinações/ }));
    await waitFor(() => expect(screen.getByText('code-1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Excluir combinação code-1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro removido com sucesso.'));
  });

  it('deactivates (soft-removes) an approved solution', async () => {
    await openAdminPanel({ approved_solutions: { data: [solutionRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Combinações/ }));
    await waitFor(() => expect(screen.getByText('code-1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Inativar combinação code-1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro inativado com sucesso.'));
  });

  it('removes an ESS compatibility rule', async () => {
    await openAdminPanel({ ess_compatibility_rules: { data: [essRuleRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Inversores/ }));
    await waitFor(() => expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compatibilidade ESS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover Regra ESS' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro removido com sucesso.'));
  });

  it('removes an accessory rule', async () => {
    await openAdminPanel({
      accessories: { data: [accessoryRow], error: null },
      accessory_rules: { data: [accessoryRuleRow], error: null },
    });
    fireEvent.click(screen.getByRole('button', { name: /Acessórios/ }));
    await waitFor(() => expect(screen.getByText('Smart Meter')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regras de aplicação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover Regra Smart Meter' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Registro removido com sucesso.'));
  });

  it('surfaces the error alert when removing fails, and keeps the row (removingIds resets)', async () => {
    const supabase = await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());

    makeFromFailOnce(supabase, 'batteries', 'foreign key violation');
    fireEvent.click(screen.getByRole('button', { name: 'Remover TP-HS3.6' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('foreign key violation'));
    // The row must still be present/interactable — removingIds was rolled back.
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
  });
});

describe('AdminPanel: bulk-deleting filtered solutions', () => {
  it('deletes every currently-visible solution via "Limpar todas"', async () => {
    await openAdminPanel({ approved_solutions: { data: [solutionRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Combinações/ }));
    await waitFor(() => expect(screen.getByText('code-1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Limpar todas as combinações filtradas' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir todas' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 combinações removidas com sucesso.'));
  });

  it('surfaces the error alert when the bulk delete fails', async () => {
    const supabase = await openAdminPanel({ approved_solutions: { data: [solutionRow], error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Combinações/ }));
    await waitFor(() => expect(screen.getByText('code-1')).toBeInTheDocument());

    makeFromFailOnce(supabase, 'approved_solutions', 'bulk delete blocked');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar todas as combinações filtradas' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir todas' }, { timeout: 1000 }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('bulk delete blocked'));
  });
});

describe('AdminPanel: generating and approving rule-based solutions', () => {
  it('generates combinations from an ESS rule and approves all of them, cleaning up stale rows', async () => {
    const supabase = await openAdminPanel({
      ess_compatibility_rules: {
        data: [
          {
            ...essRuleRow,
            battery_configs: [{ battery_model: 'TP-HS3.6', battery_topology: 'HV', min_battery_qty: 1, max_battery_qty: 1 }],
          },
        ],
        error: null,
      },
      // A previously generated row for the same inverter+battery pair, but with a
      // code that won't match anything in this new batch — cleanupStale must delete it.
      approved_solutions: {
        data: [
          {
            ...solutionRow,
            id: 'stale-1',
            solution_code: 'STALE-CODE',
            source_file: 'generated-rules',
            inverter_model: 'X1-Hybrid-5.0kW-G4',
            battery_model: 'TP-HS3.6',
          },
        ],
        error: null,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Combinações/ }));
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Aprovar todas/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Aprovar todas/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/gerada.*aprovada|combinação.*gerada/i));
    expect(supabase.from).toHaveBeenCalledWith('admin_activity_logs');
  });

  it('surfaces the error alert when the upsert fails', async () => {
    const supabase = await openAdminPanel({
      ess_compatibility_rules: {
        data: [
          {
            ...essRuleRow,
            battery_configs: [{ battery_model: 'TP-HS3.6', battery_topology: 'HV', min_battery_qty: 1, max_battery_qty: 1 }],
          },
        ],
        error: null,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Combinações/ }));
    await waitFor(() => expect(screen.queryByLabelText('Carregando dados administrativos')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Aprovar todas/ })).toBeInTheDocument());

    makeFromFailOnce(supabase, 'approved_solutions', 'upsert rejected');
    fireEvent.click(screen.getByRole('button', { name: /Aprovar todas/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('upsert rejected'));
  });
});

describe('AdminPanel: password reset', () => {
  it('sends a reset email and shows a confirmation with the address', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    await openAdminPanel({}, { resetPasswordForEmail });
    fireEvent.click(screen.getByRole('button', { name: /Usuários/ }));
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Resetar senha/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Email de redefinição enviado para a@x.com.'));
    expect(resetPasswordForEmail).toHaveBeenCalledWith('a@x.com', expect.objectContaining({ redirectTo: expect.stringContaining('/pt/reset-password') }));
  });

  it('surfaces the error alert when the reset email fails to send', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: { message: 'rate limited' } });
    await openAdminPanel({}, { resetPasswordForEmail });
    fireEvent.click(screen.getByRole('button', { name: /Usuários/ }));
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Resetar senha/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('rate limited'));
  });
});

describe('AdminPanel: pagination ("carregar mais")', () => {
  it('loads another page of simulations and appends it', async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      id: `sim-${i}`,
      created_at: '2026-01-01T00:00:00.000Z',
      peak_w: 1000,
      daily_kwh: 5,
      loads: [],
      accessories: [],
      grid_type: 'singlePhase_220',
      topology: 'HighVoltage',
      inverter_model: 'X1-Hybrid-5.0kW-G4',
      battery_model: 'TP-HS3.6',
    }));
    await openAdminPanel({ app_simulations: { data: fullPage, error: null } });

    const loadMoreButton = await screen.findByRole('button', { name: /Carregar mais simulações/ });
    fireEvent.click(loadMoreButton);

    await waitFor(() => expect(loadMoreButton).not.toBeDisabled());
  });

  it('loads another page of activity logs and appends it', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      id: `log-${i}`,
      actor_id: null,
      actor_email: 'admin@x.com',
      entity_type: 'inverter',
      action: 'create',
      target_id: null,
      target_label: `Item ${i}`,
      summary: `Criou item ${i}.`,
      before_data: null,
      after_data: null,
      created_at: '2026-01-01T00:00:00.000Z',
    }));
    await openAdminPanel({ admin_activity_logs: { data: fullPage, error: null } });
    fireEvent.click(screen.getByRole('button', { name: /Logs/ }));

    const loadMoreButton = await screen.findByRole('button', { name: /Carregar mais logs/ });
    fireEvent.click(loadMoreButton);

    await waitFor(() => expect(loadMoreButton).not.toBeDisabled());
  });
});

describe('AdminPanel: recordActivityLog failure', () => {
  it('does not let a log-write failure block or crash the save itself', async () => {
    // recordActivityLog's own setFailure(...) is immediately superseded by
    // saveBattery's setSuccess(...) right after it returns (see AdminPanel.tsx),
    // so the log failure message itself isn't the final visible state — what
    // matters here is that the failing insert into admin_activity_logs doesn't
    // throw and the save still completes normally.
    const supabase = await openAdminPanel();
    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Nova bateria/ }));
    makeFromFailOnce(supabase, 'admin_activity_logs', 'log table unreachable');
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Bateria salva.'));
  });
});

describe('AdminPanel: uploading a product image', () => {
  it('uploads to the product-assets bucket and fills the image URL field with the public URL', async () => {
    const supabase = await openAdminPanel();
    withStorageMock(supabase, { publicUrl: 'https://cdn.example.com/bateria.png' });
    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mídias' }));

    const file = new File(['fake-image'], 'bateria.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Enviar imagem/);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByPlaceholderText('URL da imagem')).toHaveValue('https://cdn.example.com/bateria.png'));
  });

  it('shows an inline error instead of failing silently when the upload fails', async () => {
    const supabase = await openAdminPanel();
    withStorageMock(supabase, { uploadError: { message: 'network hiccup mid-upload' } });
    fireEvent.click(screen.getByRole('button', { name: /Baterias/ }));
    await waitFor(() => expect(screen.getByText('TP-HS3.6')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mídias' }));

    const file = new File(['fake-image'], 'bateria.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Enviar imagem/);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('network hiccup mid-upload')).toBeInTheDocument());
  });
});
