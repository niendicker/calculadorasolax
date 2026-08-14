// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateResidentialSolution } from './calculate-residential';
import { pendingSimulationCount } from './metrics-queue';
import { getCalculationErrorMessage, getNetworkErrorMessage } from './calculation-error-messages';
import type { ResidentialOptions, Solution } from './types';

const residentialOptions: ResidentialOptions = {
  topology: 'HighVoltage',
  batteryModel: 'TP-HS3.6',
  secondaryBatteryModel: null,
  inverterModel: null,
  minInverterQty: null,
  gridType: 'singlePhase_220',
  loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, qty: 1, ipInRatio: 1 }],
  peakCalcMode: 'sum',
  operationHours: 4,
  desiredFeatures: [],
  whiteTariff: null,
  microgrid: null,
  generator: null,
  pv: null,
  atsPhotoUrl: null,
  atsBackupAcknowledged: false,
  maxPowerPerPhaseW: null,
};

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
  invokeResult = { data: fakeSolution as Solution | null, error: null as unknown },
  insertError = null as { message: string } | null,
}: {
  invokeResult?: { data: Solution | null; error: unknown };
  insertError?: { message: string } | null;
} = {}) {
  const insertMock = vi.fn().mockResolvedValue({ error: insertError });
  return {
    functions: { invoke: vi.fn().mockResolvedValue(invokeResult) },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn(() => ({ insert: insertMock })),
    __insertMock: insertMock,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('calculateResidentialSolution', () => {
  it('invokes calculate-residential with residentialOptions + batteryModel, returning the solution', async () => {
    const supabase = makeSupabase();

    const result = await calculateResidentialSolution({
      supabase: supabase as never,
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: 'Casa de praia',
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('calculate-residential', {
      body: { ...residentialOptions, batteryModel: 'TP-HS3.6' },
    });
    expect(result).toEqual({ solution: fakeSolution });
  });

  it('logs a simulation row to app_simulations on success', async () => {
    const supabase = makeSupabase();

    await calculateResidentialSolution({
      supabase: supabase as never,
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: 'Casa de praia',
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(supabase.from).toHaveBeenCalledWith('app_simulations');
    expect(supabase.__insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        project_name: 'Casa de praia',
        peak_w: 5500,
        daily_kwh: 3.5,
        inverter_model: fakeSolution.inverterModel,
        battery_model: fakeSolution.batteryModel,
      })
    );
  });

  it('queues the simulation locally when the app_simulations insert fails, without failing the calculation', async () => {
    const supabase = makeSupabase({ insertError: { message: 'db down' } });
    expect(pendingSimulationCount()).toBe(0);

    const result = await calculateResidentialSolution({
      supabase: supabase as never,
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: 'Casa de praia',
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(result).toEqual({ solution: fakeSolution });
    expect(pendingSimulationCount()).toBe(1);
  });

  it('resolves a function error into a specific message instead of the solution', async () => {
    const supabase = makeSupabase({ invokeResult: { data: null, error: { message: 'boom' } } });

    const result = await calculateResidentialSolution({
      supabase: supabase as never,
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: null,
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(result).toEqual({ error: getCalculationErrorMessage(undefined) });
  });

  it('logs a simulation with user_id null when there is no authenticated user', async () => {
    const supabase = makeSupabase();
    supabase.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null } });

    await calculateResidentialSolution({
      supabase: supabase as never,
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: 'Casa de praia',
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(supabase.__insertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }));
  });

  it('falls back to the network error message when the invoke call throws', async () => {
    const supabase = makeSupabase();
    supabase.functions.invoke = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await calculateResidentialSolution({
      supabase: supabase as never,
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: null,
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(result).toEqual({ error: getNetworkErrorMessage() });
  });
});
