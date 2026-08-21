import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_LIMITS } from '@/lib/limits';
import { useWizardStore } from '../wizard-store';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

function resetStore() {
  resetWizardStore();
  createClientMock.mockReset();
}

const serviceRow = {
  id: 'row-s1',
  name: 'Instalação',
  unit_value: 500,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('fetchUserServices', () => {
  beforeEach(() => resetStore());

  it('maps rows into userServices', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: [serviceRow], error: null } } })
    );

    await useWizardStore.getState().fetchUserServices();

    expect(useWizardStore.getState().userServices).toEqual([
      {
        id: 'row-s1',
        name: 'Instalação',
        unitValue: 500,
        pricingUnit: 'project',
        createdAt: serviceRow.created_at,
        updatedAt: serviceRow.updated_at,
      },
    ]);
  });

  it('propagates a Supabase error without changing state', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: null, error: { message: 'db down' } } } })
    );

    await expect(useWizardStore.getState().fetchUserServices()).rejects.toBeTruthy();
    expect(useWizardStore.getState().userServices).toEqual([]);
  });
});

describe('addService', () => {
  beforeEach(() => resetStore());

  it('throws a limit-reached error at ACCOUNT_LIMITS.userServices', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState({
      userServices: Array.from({ length: ACCOUNT_LIMITS.userServices }, (_, i) => ({
        id: `s${i}`,
        name: `Serviço ${i}`,
        unitValue: 0,
        createdAt: '',
        updatedAt: '',
      })),
    });

    await expect(useWizardStore.getState().addService({ name: 'Novo', unitValue: 100 })).rejects.toThrow(/Limite de/);
  });

  it('throws not_authenticated when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));
    await expect(useWizardStore.getState().addService({ name: 'Novo', unitValue: 100 })).rejects.toThrow(
      'not_authenticated'
    );
  });

  it('propagates a Supabase error instead of updating state', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: null, error: { message: 'db down' } } } })
    );

    await expect(useWizardStore.getState().addService({ name: 'Novo', unitValue: 100 })).rejects.toBeTruthy();
    expect(useWizardStore.getState().userServices).toEqual([]);
  });

  it('inserts and appends the new service, sorted by name', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: serviceRow, error: null } } })
    );
    useWizardStore.setState({
      userServices: [{ id: 'z', name: 'Zebra', unitValue: 0, createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().addService({ name: 'Instalação', unitValue: 500 });

    expect(useWizardStore.getState().userServices.map((s) => s.name)).toEqual(['Instalação', 'Zebra']);
  });
});

describe('updateServiceName', () => {
  beforeEach(() => resetStore());

  it('trims and updates the name on the matching service', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: null, error: null } } })
    );
    useWizardStore.setState({
      userServices: [{ id: 's1', name: 'Antigo', unitValue: 100, createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().updateServiceName('s1', '  Novo Nome  ');

    expect(useWizardStore.getState().userServices[0].name).toBe('Novo Nome');
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      userServices: [{ id: 's1', name: 'Antigo', unitValue: 100, createdAt: '', updatedAt: '' }],
    });

    await expect(useWizardStore.getState().updateServiceName('s1', 'Novo')).rejects.toBeTruthy();
  });
});

describe('updateServiceValue', () => {
  beforeEach(() => resetStore());

  it('updates the unit value on the matching service', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: null, error: null } } })
    );
    useWizardStore.setState({
      userServices: [{ id: 's1', name: 'Serviço', unitValue: 100, createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().updateServiceValue('s1', 999);

    expect(useWizardStore.getState().userServices[0].unitValue).toBe(999);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      userServices: [{ id: 's1', name: 'Serviço', unitValue: 100, createdAt: '', updatedAt: '' }],
    });

    await expect(useWizardStore.getState().updateServiceValue('s1', 999)).rejects.toBeTruthy();
  });
});

describe('removeService', () => {
  beforeEach(() => resetStore());

  it('removes the service and any project line referencing it', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: null, error: null } } })
    );
    useWizardStore.setState({
      userServices: [{ id: 's1', name: 'Serviço', unitValue: 100, createdAt: '', updatedAt: '' }],
      services: [{ serviceId: 's1', name: 'Serviço', qty: 1 }],
    });

    await useWizardStore.getState().removeService('s1');

    const s = useWizardStore.getState();
    expect(s.userServices).toEqual([]);
    expect(s.services).toEqual([]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_services: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      userServices: [{ id: 's1', name: 'Serviço', unitValue: 100, createdAt: '', updatedAt: '' }],
    });

    await expect(useWizardStore.getState().removeService('s1')).rejects.toBeTruthy();
  });
});

describe('addServiceToProject', () => {
  beforeEach(() => resetStore());

  it('adds a line at qty 1 for a known service', () => {
    useWizardStore.setState({
      userServices: [{ id: 's1', name: 'Serviço', unitValue: 100, createdAt: '', updatedAt: '' }],
      services: [],
    });

    useWizardStore.getState().addServiceToProject('s1');

    expect(useWizardStore.getState().services).toEqual([{ serviceId: 's1', name: 'Serviço', qty: 1 }]);
  });

  it('is a no-op when the service is already on the project', () => {
    const existingLine = { serviceId: 's1', name: 'Serviço', qty: 3 };
    useWizardStore.setState({
      userServices: [{ id: 's1', name: 'Serviço', unitValue: 100, createdAt: '', updatedAt: '' }],
      services: [existingLine],
    });

    useWizardStore.getState().addServiceToProject('s1');

    expect(useWizardStore.getState().services).toEqual([existingLine]);
  });

  it('is a no-op when the service id is not found in userServices', () => {
    useWizardStore.setState({ userServices: [], services: [] });

    useWizardStore.getState().addServiceToProject('missing');

    expect(useWizardStore.getState().services).toEqual([]);
  });
});

describe('removeServiceFromProject', () => {
  beforeEach(() => resetStore());

  it('removes only the matching line', () => {
    useWizardStore.setState({
      services: [
        { serviceId: 's1', name: 'A', qty: 1 },
        { serviceId: 's2', name: 'B', qty: 1 },
      ],
    });

    useWizardStore.getState().removeServiceFromProject('s1');

    expect(useWizardStore.getState().services).toEqual([{ serviceId: 's2', name: 'B', qty: 1 }]);
  });
});

describe('updateProjectServiceQty', () => {
  beforeEach(() => resetStore());

  it('updates the qty on the matching line', () => {
    useWizardStore.setState({ services: [{ serviceId: 's1', name: 'A', qty: 1 }] });

    useWizardStore.getState().updateProjectServiceQty('s1', 5);

    expect(useWizardStore.getState().services[0].qty).toBe(5);
  });

  it('clamps qty to a minimum of 1', () => {
    useWizardStore.setState({ services: [{ serviceId: 's1', name: 'A', qty: 5 }] });

    useWizardStore.getState().updateProjectServiceQty('s1', -3);

    expect(useWizardStore.getState().services[0].qty).toBe(1);
  });
});
