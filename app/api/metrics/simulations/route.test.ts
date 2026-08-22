import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, createClientMock, recordSimulationMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  createClientMock: vi.fn(),
  recordSimulationMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

vi.mock('@/lib/data/calculation-repository', () => ({
  recordSimulation: recordSimulationMock,
}));

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/metrics/simulations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  user_id: 'attacker-id',
  project_name: 'Projeto teste',
  topology: 'HighVoltage',
  grid_type: 'threePhase_380',
  peak_w: 5000,
  daily_kwh: 12,
  loads: [{ name: 'Carga', powerW: 1000 }],
  inverter_model: 'INV-1',
  battery_model: 'BAT-1',
  accessories: [],
  solution_code: 'SOL-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  createClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
  getUserMock.mockResolvedValue({ data: { user: { id: 'real-user-id' } } });
  recordSimulationMock.mockResolvedValue({ error: null });
});

describe('POST /api/metrics/simulations', () => {
  it('rejects malformed payloads before authentication or persistence', async () => {
    const { POST } = await import('./route');

    const response = await POST(makeRequest({ ...validPayload, peak_w: -1 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Métrica inválida.' });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(recordSimulationMock).not.toHaveBeenCalled();
  });

  it('requires an authenticated user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import('./route');

    const response = await POST(makeRequest(validPayload));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Não autenticado.' });
    expect(recordSimulationMock).not.toHaveBeenCalled();
  });

  it('overrides a client-supplied user_id with the authenticated user', async () => {
    const { POST } = await import('./route');

    const response = await POST(makeRequest(validPayload));

    expect(response.status).toBe(200);
    expect(recordSimulationMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ user_id: 'real-user-id' }));
    expect(recordSimulationMock.mock.calls[0][1].user_id).not.toBe('attacker-id');
  });

  it('returns a service error when metric persistence fails', async () => {
    recordSimulationMock.mockResolvedValue({ error: new Error('database unavailable') });
    const { POST } = await import('./route');

    const response = await POST(makeRequest(validPayload));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Não foi possível registrar a métrica.' });
  });
});
