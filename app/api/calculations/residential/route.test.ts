import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, invokeMock, recordSimulationMock, cookiesMock, demoSessionMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  invokeMock: vi.fn(),
  recordSimulationMock: vi.fn(),
  cookiesMock: vi.fn(),
  demoSessionMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/data/calculation-repository', () => ({
  invokeResidentialCalculation: invokeMock,
  recordSimulation: recordSimulationMock,
}));
vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('@/lib/demo/demo-session', () => ({
  DEMO_SESSION_COOKIE: 'solax-demo-session',
  isValidDemoSessionToken: demoSessionMock,
}));

const solution = {
  inverterId: 'inv-1',
  inverterModel: 'X1-Hybrid-5.0',
  batteryId: 'bat-1',
  batteryModel: 'T-BAT-SYS-HV',
  batteryQty: 1,
  pvPowerKw: 4,
  accessories: [{ model: 'ATS-1' }],
  solutionCode: 'SOL-1',
};

function makeRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/calculations/residential', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batteryModel: 'T-BAT-SYS-HV',
      loads: [{ name: 'Carga', powerW: 1000, qty: 1 }],
      projectName: 'Projeto teste',
      peakW: 1000,
      dailyKwh: 4,
      topology: 'HighVoltage',
      gridType: 'singlePhase_220',
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  createClientMock.mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  });
  cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
  demoSessionMock.mockReturnValue(false);
  invokeMock.mockResolvedValue({ data: solution, error: null });
  recordSimulationMock.mockResolvedValue({ error: null });
});

describe('POST /api/calculations/residential', () => {
  it('invokes the calculation and records the resulting simulation', async () => {
    const { POST } = await import('./route');

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ solution });
    expect(invokeMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ batteryModel: 'T-BAT-SYS-HV' }));
    expect(recordSimulationMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      user_id: 'user-1',
      project_name: 'Projeto teste',
      inverter_model: solution.inverterModel,
      battery_model: solution.batteryModel,
      accessories: ['ATS-1'],
    }));
  });

  it('returns a calculation error without recording a simulation', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('calculation failed') });
    const { POST } = await import('./route');

    const response = await POST(makeRequest());

    expect(response.status).toBe(422);
    expect(recordSimulationMock).not.toHaveBeenCalled();
  });

  it('skips simulation persistence for a valid demo session', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'demo-token' }) });
    demoSessionMock.mockReturnValue(true);
    const { POST } = await import('./route');

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(recordSimulationMock).not.toHaveBeenCalled();
  });
});
