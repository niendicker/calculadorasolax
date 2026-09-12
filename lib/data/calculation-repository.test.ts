import { describe, expect, it, vi } from 'vitest';
import type { PendingSimulationPayload } from '@/lib/api-contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { invokeResidentialCalculation, recordSimulation } from './calculation-repository';

function makeClient() {
  const invoke = vi.fn();
  const insert = vi.fn();
  const from = vi.fn(() => ({ insert }));
  const client = {
    functions: { invoke },
    from,
  } as unknown as SupabaseClient;
  return { client, from, invoke, insert };
}

const body = { batteryModel: 'T-BAT-SYS-HV', loads: [{ powerW: 1000, qty: 1 }] };
const simulation: PendingSimulationPayload = {
  user_id: 'user-1',
  project_name: 'Projeto teste',
  topology: 'HighVoltage',
  grid_type: 'singlePhase_220',
  peak_w: 1000,
  daily_kwh: 4,
  loads: [{ powerW: 1000, qty: 1 }],
  inverter_model: 'X1-Hybrid-5.0',
  battery_model: 'T-BAT-SYS-HV',
  accessories: [],
  solution_code: 'SOL-1',
};

describe('calculation-repository', () => {
  it('invoca a Edge Function residencial com o corpo recebido', async () => {
    const { client, invoke } = makeClient();
    const result = { data: { solutionCode: 'SOL-1' }, error: null };
    invoke.mockResolvedValue(result);

    await expect(invokeResidentialCalculation(client, body)).resolves.toEqual(result);
    expect(invoke).toHaveBeenCalledWith('calculate-residential', { body });
  });

  it('registra a simulação na tabela de analytics', async () => {
    const { client, from, insert } = makeClient();
    const result = { error: null };
    insert.mockResolvedValue(result);

    await expect(recordSimulation(client, simulation)).resolves.toEqual(result);
    expect(from).toHaveBeenCalledWith('app_simulations');
    expect(insert).toHaveBeenCalledWith(simulation);
  });

  it('preserva erros retornados pela Edge Function e pelo insert', async () => {
    const { client, invoke, insert } = makeClient();
    const calculationError = new Error('falha no cálculo');
    const insertError = new Error('falha ao registrar');
    invoke.mockResolvedValue({ data: null, error: calculationError });
    insert.mockResolvedValue({ error: insertError });

    await expect(invokeResidentialCalculation(client, body)).resolves.toEqual({ data: null, error: calculationError });
    await expect(recordSimulation(client, simulation)).resolves.toEqual({ error: insertError });
  });
});
