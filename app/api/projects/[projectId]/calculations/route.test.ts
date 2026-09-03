import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  findOwnCiProjectMock,
  findBessProductModelMock,
  findUserBessUnitPriceMock,
  invokeMock,
  recordCalculationRunMock,
  cacheProjectCalculationResultMock,
  listCalculationRunsMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  findOwnCiProjectMock: vi.fn(),
  findBessProductModelMock: vi.fn(),
  findUserBessUnitPriceMock: vi.fn(),
  invokeMock: vi.fn(),
  recordCalculationRunMock: vi.fn(),
  cacheProjectCalculationResultMock: vi.fn(),
  listCalculationRunsMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/data/commercial-industrial-calculation-repository', () => ({
  findOwnCiProject: findOwnCiProjectMock,
  findBessProductModel: findBessProductModelMock,
  findUserBessUnitPrice: findUserBessUnitPriceMock,
  invokeCommercialIndustrialCalculation: invokeMock,
  recordCalculationRun: recordCalculationRunMock,
  cacheProjectCalculationResult: cacheProjectCalculationResultMock,
  listCalculationRuns: listCalculationRunsMock,
}));

const ciProject = {
  id: 'proj-1',
  installation_type: 'commercial_industrial',
  calculation_options: { bessProductId: 'product-1' },
};

const calculationResult = {
  engineVersion: 'ci-v1',
  inputFingerprint: 'abc123',
  recommendation: { scenarioId: 'modules-1', reason: 'porque sim' },
};

function makeRequest() {
  return new Request('http://localhost/api/projects/proj-1/calculations', { method: 'POST' });
}

function makeParams() {
  return { params: Promise.resolve({ projectId: 'proj-1' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  });
  findOwnCiProjectMock.mockResolvedValue(ciProject);
  findBessProductModelMock.mockResolvedValue('T-BESS-100');
  findUserBessUnitPriceMock.mockResolvedValue(45000);
  invokeMock.mockResolvedValue({ data: calculationResult, error: null });
  recordCalculationRunMock.mockResolvedValue({ error: null });
  cacheProjectCalculationResultMock.mockResolvedValue({ error: null });
  listCalculationRunsMock.mockResolvedValue([]);
});

describe('POST /api/projects/[projectId]/calculations', () => {
  it('calculates, records the run, and caches the result on the project', async () => {
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(calculationResult);
    expect(invokeMock).toHaveBeenCalledWith(expect.anything(), { options: ciProject.calculation_options, unitPriceBrl: 45000 });
    expect(recordCalculationRunMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj-1',
        user_id: 'user-1',
        installation_type: 'commercial_industrial',
        engine_version: 'ci-v1',
        selected_scenario_id: 'modules-1',
      })
    );
    expect(cacheProjectCalculationResultMock).toHaveBeenCalledWith(expect.anything(), 'proj-1', calculationResult, 'ci-v1');
  });

  it('returns 401 when there is no authenticated user', async () => {
    createClientMock.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(401);
    expect(findOwnCiProjectMock).not.toHaveBeenCalled();
  });

  it('returns 404 without distinguishing "not found" from "not yours"', async () => {
    findOwnCiProjectMock.mockResolvedValue(null);
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(404);
  });

  it('rejects a residential project with 400', async () => {
    findOwnCiProjectMock.mockResolvedValue({ ...ciProject, installation_type: 'residential' });
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(400);
  });

  it('returns 422 when the project has no bessProductId configured yet', async () => {
    findOwnCiProjectMock.mockResolvedValue({ ...ciProject, calculation_options: {} });
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(422);
    expect(findBessProductModelMock).not.toHaveBeenCalled();
  });

  it('returns 422 when the BESS product no longer resolves to an active model', async () => {
    findBessProductModelMock.mockResolvedValue(null);
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(422);
    expect(findUserBessUnitPriceMock).not.toHaveBeenCalled();
  });

  it('returns 422 when the user has not priced this product yet', async () => {
    findUserBessUnitPriceMock.mockResolvedValue(null);
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(422);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('returns a calculation error without recording a run', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('boom') });
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(422);
    expect(recordCalculationRunMock).not.toHaveBeenCalled();
  });

  it('still returns the result even if recording the run fails', async () => {
    recordCalculationRunMock.mockResolvedValue({ error: new Error('history write failed') });
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(calculationResult);
  });

  it('records a null selected_scenario_id when no scenario was viable (Fase 6 audit, Problem #5)', async () => {
    const nonViableResult = { ...calculationResult, recommendation: { scenarioId: null, reason: 'Nenhum dos 3 cenários avaliados atinge payback dentro do horizonte de análise.' } };
    invokeMock.mockResolvedValue({ data: nonViableResult, error: null });
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(recordCalculationRunMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ selected_scenario_id: null })
    );
  });
});

describe('GET /api/projects/[projectId]/calculations', () => {
  it('returns the run history for the project', async () => {
    listCalculationRunsMock.mockResolvedValue([{ id: 'run-1', engine_version: 'ci-v1', selected_scenario_id: 'modules-1', status: 'completed', created_at: '2026-08-30T00:00:00Z' }]);
    const { GET } = await import('./route');

    const response = await GET(new Request('http://localhost'), makeParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runs: [{ id: 'run-1', engine_version: 'ci-v1', selected_scenario_id: 'modules-1', status: 'completed', created_at: '2026-08-30T00:00:00Z' }] });
  });

  it('returns 404 when the project is not the caller\'s own', async () => {
    findOwnCiProjectMock.mockResolvedValue(null);
    const { GET } = await import('./route');

    const response = await GET(new Request('http://localhost'), makeParams());

    expect(response.status).toBe(404);
  });
});
