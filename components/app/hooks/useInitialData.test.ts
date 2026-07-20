// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { useInitialData } from './useInitialData';

const catalogRow = {
  id: 'lc1',
  name_pt: 'Chuveiro',
  name_en: 'Shower',
  name_zh: '',
  power_w: 5500,
  category: 'kitchen',
  ip_in_ratio: 1,
};

const batteryRow = {
  id: 'b1',
  model: 'TP-HS3.6',
  capacity_kwh: 3.6,
  topology: 'HV',
  standard_power_kw: 1.8,
  peak_power_kw: 2.5,
  min_soc_percent: 10,
  image_url: null,
  documents: [],
};

const inverterRow = {
  id: 'i1',
  model: 'X1-Hybrid-5.0kW-G4',
  topology: 'HV',
  phases: 1,
  standard_power_kva: 5,
  peak_power_kva: 7,
  max_power_per_phase_w: null,
  image_url: null,
  documents: [],
};

const accessoryRow = { id: 'a1', model: 'Smart Meter', description: '', image_url: null, documents: [] };

const approvedSolutionRow = { grid_topology: 'singlePhase_220', battery_topology: 'HV', inverter_model: 'X1-Hybrid-5.0kW-G4' };

const presetRow = { id: 'pr1', name: 'Residencial essencial', description: '', loads: [] };

const profileRow = {
  id: 'user-1',
  email: 'user@example.com',
  full_name: 'Fulano',
  phone: '',
  role: 'admin',
  company_name: '',
  company_address: '',
  company_logo_url: '',
};

function makeSupabase({
  user = { id: 'user-1', email: 'user@example.com', user_metadata: {} } as { id: string; email: string; user_metadata: Record<string, unknown> } | null,
  tableResults = {} as Record<string, { data: unknown; error: null } | { data: null; error: { message: string } }>,
} = {}) {
  const mock = createSupabaseMock({ user, tableResults });
  return mock;
}

function baseHookProps(overrides: Record<string, unknown> = {}) {
  return {
    supabase: makeSupabase(),
    fetchClients: vi.fn().mockResolvedValue(undefined),
    fetchProjects: vi.fn().mockResolvedValue(undefined),
    fetchUserLoadCatalog: vi.fn().mockResolvedValue(undefined),
    fetchUserStockItems: vi.fn().mockResolvedValue(undefined),
    fetchUserLoadPresets: vi.fn().mockResolvedValue(undefined),
    setLoadCatalog: vi.fn(),
    setLoadPresets: vi.fn(),
    ...overrides,
  } as unknown as Parameters<typeof useInitialData>[0];
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useInitialData: logged-out visitor', () => {
  it('loads public catalogs and finishes with no profile and no error', async () => {
    const supabase = makeSupabase({
      user: null,
      tableResults: {
        load_catalog: { data: [catalogRow], error: null },
        batteries: { data: [batteryRow], error: null },
        inverters: { data: [inverterRow], error: null },
        accessories: { data: [accessoryRow], error: null },
        approved_solutions: { data: [approvedSolutionRow], error: null },
        load_presets: { data: [presetRow], error: null },
      },
    });
    const props = baseHookProps({ supabase });

    const { result } = renderHook(() => useInitialData(props));

    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.profile).toBeNull();
    expect(result.current.userEmail).toBeNull();
    expect(result.current.userDataError).toBeNull();
    expect(result.current.batteryCatalog).toEqual([
      {
        id: 'b1',
        model: 'TP-HS3.6',
        nickname: null,
        capacityKwh: 3.6,
        topology: 'HV',
        standardPowerKw: 1.8,
        peakPowerKw: 2.5,
        minSocPercent: 10,
        expansionModel: null,
        imageUrl: null,
        documents: [],
      },
    ]);
    expect(result.current.inverterCatalog).toHaveLength(1);
    expect(result.current.accessoryCatalog).toHaveLength(1);
    expect(result.current.approvedInverterCombos).toEqual([
      { gridTopology: 'singlePhase_220', batteryTopology: 'HV', inverterModel: 'X1-Hybrid-5.0kW-G4' },
    ]);
    // Account-scoped fetchers are never called for a logged-out visitor.
    expect((props.fetchClients as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

describe('useInitialData: logged-in user', () => {
  it('builds the profile from the profiles row and fetches account-scoped data', async () => {
    const supabase = makeSupabase({ tableResults: { profiles: { data: profileRow, error: null } } });
    const props = baseHookProps({ supabase });

    const { result } = renderHook(() => useInitialData(props));

    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.userEmail).toBe('user@example.com');
    expect(result.current.profile).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      fullName: 'Fulano',
      phone: '',
      role: 'admin',
      companyName: '',
      companyAddress: '',
      companyLogoUrl: '',
    });
    expect(props.fetchClients).toHaveBeenCalled();
    expect(props.fetchProjects).toHaveBeenCalled();
    expect(props.fetchUserLoadCatalog).toHaveBeenCalled();
    expect(props.fetchUserStockItems).toHaveBeenCalled();
    expect(props.fetchUserLoadPresets).toHaveBeenCalled();
    expect(result.current.userDataError).toBeNull();
  });

  it('falls back to auth user metadata when there is no profiles row yet', async () => {
    const supabase = makeSupabase({
      user: { id: 'user-1', email: 'user@example.com', user_metadata: { full_name: 'Via metadata', phone: '111' } },
      tableResults: { profiles: { data: null, error: null } },
    });
    const props = baseHookProps({ supabase });

    const { result } = renderHook(() => useInitialData(props));

    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.profile).toMatchObject({ fullName: 'Via metadata', phone: '111', role: 'user' });
  });

  it('sets userDataError when one of the account-scoped fetches rejects', async () => {
    const props = baseHookProps({
      fetchProjects: vi.fn().mockRejectedValue(new Error('network down')),
    });

    const { result } = renderHook(() => useInitialData(props));

    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.userDataError).toContain('Não foi possível carregar');
  });
});

describe('useInitialData: retryUserData', () => {
  it('clears the error on a successful retry', async () => {
    const props = baseHookProps({
      fetchProjects: vi.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValue(undefined),
    });

    const { result } = renderHook(() => useInitialData(props));
    await waitFor(() => expect(result.current.userDataError).not.toBeNull());

    await result.current.retryUserData();

    await waitFor(() => expect(result.current.userDataError).toBeNull());
  });

  it('sets the error again when the retry itself fails', async () => {
    const props = baseHookProps({
      fetchClients: vi.fn().mockRejectedValue(new Error('still down')),
    });

    const { result } = renderHook(() => useInitialData(props));
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await result.current.retryUserData();

    expect(result.current.userDataError).toContain('Não foi possível carregar');
  });
});
