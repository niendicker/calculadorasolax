// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateResidentialSolution } from './calculate-residential';
import { pendingSimulationCount } from './metrics-queue';
import { getNetworkErrorMessage } from './calculation-error-messages';
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

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});

describe('calculateResidentialSolution', () => {
  it('invokes calculate-residential with residentialOptions + batteryModel, returning the solution', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ solution: fakeSolution }) });

    const result = await calculateResidentialSolution({
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: 'Casa de praia',
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(fetch).toHaveBeenCalledWith('/api/calculations/residential', expect.objectContaining({
      method: 'POST',
    }));
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      ...residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: 'Casa de praia',
      peakW: 5500,
      dailyKwh: 3.5,
    });
    expect(result).toEqual({ solution: fakeSolution });
  });

  it('logs a simulation row to app_simulations on success', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ solution: fakeSolution }) });

    await calculateResidentialSolution({
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: 'Casa de praia',
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('queues the simulation locally when the app_simulations insert fails, without failing the calculation', async () => {
    const simulationPayload = {
      user_id: 'user-1', project_name: 'Casa de praia', topology: 'HighVoltage', grid_type: 'singlePhase_220',
      peak_w: 5500, daily_kwh: 3.5, loads: residentialOptions.loads, inverter_model: fakeSolution.inverterModel,
      battery_model: fakeSolution.batteryModel, accessories: [], solution_code: null,
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ solution: fakeSolution, simulationPending: true, simulationPayload }),
    });
    expect(pendingSimulationCount()).toBe(0);

    const result = await calculateResidentialSolution({
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
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Não foi possível encontrar uma solução compatível.' }),
    });

    const result = await calculateResidentialSolution({
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: null,
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(result).toEqual({ error: 'Não foi possível encontrar uma solução compatível.' });
  });

  it('falls back to the network error message when the API call throws', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    const result = await calculateResidentialSolution({
      residentialOptions,
      batteryModel: 'TP-HS3.6',
      projectName: null,
      peakW: 5500,
      dailyKwh: 3.5,
    });

    expect(result).toEqual({ error: getNetworkErrorMessage() });
  });
});
