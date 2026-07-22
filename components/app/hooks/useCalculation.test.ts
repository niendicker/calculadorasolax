// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCalculationErrorMessage, getNetworkErrorMessage } from '@/lib/calculation-error-messages';
import type { ProjectInfo, ResidentialOptions, Solution, SingleLoad } from '@/lib/types';
import { useCalculation } from './useCalculation';

function makeLoad(): SingleLoad {
  return { id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 };
}

const validResidentialOptions: ResidentialOptions = {
  topology: 'HighVoltage',
  batteryModel: 'TP-HS3.6',
  secondaryBatteryModel: null,
  inverterModel: null,
  gridType: 'singlePhase_220',
  loads: [makeLoad()],
  peakCalcMode: 'sum',
  desiredFeatures: [],
  whiteTariff: null,
  microgrid: null,
  generator: null,
  atsPhotoUrl: null,
  atsBackupAcknowledged: false,
  maxPowerPerPhaseW: null,
};

const incompleteResidentialOptions: ResidentialOptions = {
  ...validResidentialOptions,
  batteryModel: null,
};

const projectInfo: ProjectInfo = { name: 'Projeto teste', clientId: null, address: '', notes: '' };

const fakeSolution: Solution = {
  inverterId: 'inv-1',
  inverterModel: 'X1-Hybrid-5.0kW-G4',
  batteryId: 'bat-1',
  batteryModel: 'TP-HS3.6',
  batteryQty: 1,
  pvPowerKw: 5,
  accessories: [],
};

function makeSupabase({
  invokeResult = { data: fakeSolution as Solution | null, error: null as { message: string } | null },
  user = { id: 'user-1' } as { id: string } | null,
  insertError = null as { message: string } | null,
  catalogData = {} as Record<string, unknown[]>,
} = {}) {
  const insertMock = vi.fn().mockResolvedValue({ error: insertError });
  const from = vi.fn((table: string) => ({
    select: () => ({ in: () => Promise.resolve({ data: catalogData[table] ?? [] }) }),
    insert: insertMock,
  }));
  const supabase = {
    functions: { invoke: vi.fn().mockResolvedValue(invokeResult) },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  };
  return { supabase, insertMock };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  const { supabase } = makeSupabase();
  return {
    supabase,
    residentialOptions: validResidentialOptions,
    projectInfo,
    peakW: 5500,
    dailyKwh: 5.5,
    solution: null,
    setSolution: vi.fn(),
    secondarySolution: null,
    setSecondarySolution: vi.fn(),
    inverterCatalog: [],
    batteryCatalog: [],
    accessoryCatalog: [],
    ...overrides,
  } as unknown as Parameters<typeof useCalculation>[0];
}

beforeEach(() => {
  window.localStorage.clear();
});

// renderHook's callback must receive a *stable* props object across
// re-renders (calculate()/the media effect both trigger internal setState).
// Rebuilding props inline on every render would hand the media effect a
// fresh `inverterCatalog`/`batteryCatalog`/`accessoryCatalog` array identity
// each time, retriggering it forever — so props are always built once, then
// passed in via renderHook's `initialProps`.
function renderCalculation(props: ReturnType<typeof baseProps>) {
  return renderHook((p: ReturnType<typeof baseProps>) => useCalculation(p), { initialProps: props });
}

describe('useCalculation: canCalculate', () => {
  it('is false when residential options are incomplete', () => {
    const { result } = renderCalculation(baseProps({ residentialOptions: incompleteResidentialOptions }));
    expect(result.current.canCalculate).toBe(false);
  });

  it('is true once topology, battery, grid type and at least one load are set', () => {
    const { result } = renderCalculation(baseProps());
    expect(result.current.canCalculate).toBe(true);
  });

  it('is false when Gerador Externo is selected but its power is below the loads peak power', () => {
    const { result } = renderCalculation(
      baseProps({
        residentialOptions: {
          ...validResidentialOptions,
          desiredFeatures: ['external_generator'],
          generator: { voltageV: 220, phases: 1, apparentPowerVA: 2000, photoUrl: null, ownAtsAcknowledged: false },
        },
        peakW: 5500,
      })
    );
    expect(result.current.canCalculate).toBe(false);
  });

  it('is true when Gerador Externo power covers the loads peak power and the ATS notice is acknowledged', () => {
    const { result } = renderCalculation(
      baseProps({
        residentialOptions: {
          ...validResidentialOptions,
          desiredFeatures: ['external_generator'],
          generator: { voltageV: 220, phases: 1, apparentPowerVA: 6000, photoUrl: null, ownAtsAcknowledged: true },
        },
        peakW: 5500,
      })
    );
    expect(result.current.canCalculate).toBe(true);
  });

  it('is false when Gerador Externo power is sufficient but the own-ATS notice is not acknowledged', () => {
    const { result } = renderCalculation(
      baseProps({
        residentialOptions: {
          ...validResidentialOptions,
          desiredFeatures: ['external_generator'],
          generator: { voltageV: 220, phases: 1, apparentPowerVA: 6000, photoUrl: null, ownAtsAcknowledged: false },
        },
        peakW: 5500,
      })
    );
    expect(result.current.canCalculate).toBe(false);
  });

  it('is false when Microrrede is selected but the power notice is not acknowledged', () => {
    const { result } = renderCalculation(
      baseProps({
        residentialOptions: {
          ...validResidentialOptions,
          desiredFeatures: ['microgrid'],
          microgrid: {
            voltageV: 220,
            onGridPhases: 1,
            onGridApparentPowerVA: 500,
            isFundamentalRequirement: true,
            photoUrl: null,
            powerNoticeAcknowledged: false,
          },
        },
      })
    );
    expect(result.current.canCalculate).toBe(false);
  });

  it('is true when Microrrede is selected and the power notice is acknowledged', () => {
    const { result } = renderCalculation(
      baseProps({
        residentialOptions: {
          ...validResidentialOptions,
          desiredFeatures: ['microgrid'],
          microgrid: {
            voltageV: 220,
            onGridPhases: 1,
            onGridApparentPowerVA: 500,
            isFundamentalRequirement: true,
            photoUrl: null,
            powerNoticeAcknowledged: true,
          },
        },
      })
    );
    expect(result.current.canCalculate).toBe(true);
  });
});

describe('useCalculation: calculate', () => {
  it('does nothing when canCalculate is false', async () => {
    const { supabase } = makeSupabase();
    const { result } = renderCalculation(baseProps({ supabase, residentialOptions: incompleteResidentialOptions }));

    await act(async () => {
      await result.current.calculate();
    });

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('sets the solution and records the simulation on success', async () => {
    const { supabase, insertMock } = makeSupabase();
    const setSolution = vi.fn();
    const { result } = renderCalculation(baseProps({ supabase, setSolution }));

    await act(async () => {
      await result.current.calculate();
    });

    expect(setSolution).toHaveBeenCalledWith(fakeSolution);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ project_name: 'Projeto teste', peak_w: 5500, daily_kwh: 5.5 })
    );
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('clears the solution and sets a mapped error message when the function call fails', async () => {
    const { supabase } = makeSupabase({ invokeResult: { data: null, error: { message: 'boom' } } });
    const setSolution = vi.fn();
    const { result } = renderCalculation(baseProps({ supabase, setSolution }));

    await act(async () => {
      await result.current.calculate();
    });

    expect(setSolution).toHaveBeenCalledWith(null);
    expect(result.current.error).toBe(getCalculationErrorMessage(undefined));
  });

  it('sets a network error message when the Supabase call throws', async () => {
    const { supabase } = makeSupabase();
    supabase.functions.invoke = vi.fn().mockRejectedValue(new Error('network down'));
    const setSolution = vi.fn();
    const { result } = renderCalculation(baseProps({ supabase, setSolution }));

    await act(async () => {
      await result.current.calculate();
    });

    expect(setSolution).toHaveBeenCalledWith(null);
    expect(result.current.error).toBe(getNetworkErrorMessage());
  });

  it('queues the simulation locally instead of failing when the insert errors', async () => {
    const { supabase } = makeSupabase({ insertError: { message: 'insert failed' } });
    const { result } = renderCalculation(baseProps({ supabase }));

    await act(async () => {
      await result.current.calculate();
    });

    const queued = JSON.parse(window.localStorage.getItem('solax-pending-simulations') ?? '[]');
    expect(queued).toHaveLength(1);
    expect(queued[0].payload.project_name).toBe('Projeto teste');
  });

  it('runs a parallel second call for the secondary battery, keeping success/failure isolated per slot', async () => {
    const invoke = vi.fn().mockImplementation((_name: string, { body }: { body: { batteryModel: string } }) =>
      body.batteryModel === 'TP-HS7.2'
        ? Promise.resolve({ data: null, error: { message: 'boom' } })
        : Promise.resolve({ data: fakeSolution, error: null })
    );
    const { supabase } = makeSupabase();
    supabase.functions.invoke = invoke;
    const setSolution = vi.fn();
    const setSecondarySolution = vi.fn();
    const { result } = renderCalculation(
      baseProps({
        supabase,
        setSolution,
        setSecondarySolution,
        residentialOptions: { ...validResidentialOptions, secondaryBatteryModel: 'TP-HS7.2' },
      })
    );

    await act(async () => {
      await result.current.calculate();
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(setSolution).toHaveBeenCalledWith(fakeSolution);
    expect(setSecondarySolution).toHaveBeenCalledWith(null);
    expect(result.current.error).toBeNull();
    expect(result.current.secondaryError).toBe(getCalculationErrorMessage(undefined));
    expect(result.current.loading).toBe(false);
  });

  it('does not call the secondary battery when none is selected', async () => {
    const { supabase } = makeSupabase();
    const { result } = renderCalculation(baseProps({ supabase }));

    await act(async () => {
      await result.current.calculate();
    });

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(result.current.secondaryError).toBeNull();
  });
});

describe('useCalculation: product media effect', () => {
  it('clears product media when there is no solution', async () => {
    const { supabase } = makeSupabase();
    const { result } = renderCalculation(baseProps({ supabase, solution: null }));

    await waitFor(() => expect(result.current.productMedia).toEqual({}));
  });

  it('resolves media from the given catalogs without hitting Supabase when everything matches', async () => {
    const { supabase } = makeSupabase();
    const { result } = renderCalculation(
      baseProps({
        supabase,
        solution: fakeSolution,
        inverterCatalog: [{ model: 'X1-Hybrid-5.0kW-G4', imageUrl: null, documents: [] }],
        batteryCatalog: [{ model: 'TP-HS3.6', imageUrl: null, documents: [] }],
      })
    );

    await waitFor(() => expect(result.current.productMedia['X1-Hybrid-5.0kW-G4']).toBeDefined());
    expect(result.current.productMedia['TP-HS3.6']).toBeDefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('falls back to Supabase for models missing from the given catalogs', async () => {
    const { supabase } = makeSupabase({
      catalogData: { inverters: [{ model: 'X1-Hybrid-5.0kW-G4', image_url: 'x.png', documents: [] }] },
    });
    const { result } = renderCalculation(
      baseProps({ supabase, solution: fakeSolution, inverterCatalog: [], batteryCatalog: [] })
    );

    await waitFor(() => expect(result.current.productMedia['X1-Hybrid-5.0kW-G4']).toBeDefined());
    expect(supabase.from).toHaveBeenCalledWith('inverters');
  });

  it('also resolves media for the battery Master\'s expansionModel, so its card gets a nickname/image/attachments too', async () => {
    const { supabase } = makeSupabase();
    const { result } = renderCalculation(
      baseProps({
        supabase,
        solution: { ...fakeSolution, batteryModel: 'T58 V2 Master', batteryQty: 3 },
        inverterCatalog: [{ model: 'X1-Hybrid-5.0kW-G4', imageUrl: null, documents: [] }],
        batteryCatalog: [
          { model: 'T58 V2 Master', nickname: 'Master', expansionModel: 'T58 Slave', imageUrl: null, documents: [] },
          { model: 'T58 Slave', nickname: 'Slave', imageUrl: 'slave.png', documents: [] },
        ],
      })
    );

    await waitFor(() => expect(result.current.productMedia['T58 Slave']).toBeDefined());
    expect(result.current.productMedia['T58 Slave']).toMatchObject({ nickname: 'Slave', imageUrl: 'slave.png' });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
