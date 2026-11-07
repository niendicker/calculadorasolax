import { stsFixture, stsBackup } from '@/supabase/functions/_shared/commercial-industrial/sts.test-fixtures';
import { modularOptions } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  checkUserCiAccessMock,
  checkUserCiBackupAccessMock,
  findOwnCiProjectMock,
  findBessProductModelMock,
  findUserBessUnitPriceMock,
  invokeMock,
  recordCalculationRunMock,
  cacheProjectCalculationResultMock,
  listCalculationRunsMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  checkUserCiAccessMock: vi.fn(),
  checkUserCiBackupAccessMock: vi.fn(),
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
  checkUserCiAccess: checkUserCiAccessMock,
  checkUserCiBackupAccess: checkUserCiBackupAccessMock,
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

it('accepts automatic technical search without a manually selected model or its price', async () => {
  const { POST } = await import('./route');
  findOwnCiProjectMock.mockResolvedValue({...ciProject,calculation_options:{bessProductId:null,bessSystem:{kind:'automatic',minPowerKw:150,minEnergyKwh:300}}});
  const response=await POST(makeRequest(),makeParams());
  expect(response.status).toBe(200);
  expect(findBessProductModelMock).not.toHaveBeenCalled();
  expect(findUserBessUnitPriceMock).not.toHaveBeenCalled();
  expect(invokeMock).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({options:expect.objectContaining({bessSystem:{kind:'automatic',minPowerKw:150,minEnergyKwh:300}})}));
});

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
  checkUserCiAccessMock.mockResolvedValue(true);
  checkUserCiBackupAccessMock.mockResolvedValue(true);
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
    expect(invokeMock).toHaveBeenCalledWith(expect.anything(), { options: ciProject.calculation_options, unitPriceBrl: 0 });
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

  it('returns 403 when user has no CI feature flag', async () => {
    checkUserCiAccessMock.mockResolvedValue(false);
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Acesso ao módulo C&I não liberado para este usuário. Solicite autorização ao administrador.',
    });
  });

  it('returns 403 when user has no CI backup feature flag and backup is enabled', async () => {
    checkUserCiBackupAccessMock.mockResolvedValue(false);
    findOwnCiProjectMock.mockResolvedValue({
      id: 'proj-1',
      installation_type: 'commercial_industrial',
      calculation_options: { bessProductId: 'product-1', backup: { enabled: true } },
    });
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Acesso à funcionalidade de Backup C&I não liberado para este usuário. Solicite autorização ao administrador.',
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('also requires backup authorization for generator support without backup',async()=>{
    checkUserCiBackupAccessMock.mockResolvedValue(false);
    findOwnCiProjectMock.mockResolvedValue({...ciProject,calculation_options:{bessProductId:'product-1',backup:{enabled:false},generator:{enabled:true}}});
    const {POST}=await import('./route');
    expect((await POST(makeRequest(),makeParams())).status).toBe(403);
    expect(invokeMock).not.toHaveBeenCalled();
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

  it('delegates persisted availability to the common calculator without a legacy product lookup', async () => {
    findBessProductModelMock.mockResolvedValue(null);
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(findUserBessUnitPriceMock).not.toHaveBeenCalled();
  });

  it('allows technical calculation when the legacy product has no price', async () => {
    findUserBessUnitPriceMock.mockResolvedValue(null);
    const { POST } = await import('./route');

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(invokeMock).toHaveBeenCalled();
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


describe('imported profile API limits', () => {
  it('rejects a period longer than seven days locally before invoking a remote calculator', async () => {
    findOwnCiProjectMock.mockResolvedValue({ ...ciProject, calculation_options: {
      ...ciProject.calculation_options,
      loadCurve: { points: [{ timestamp: '2026-01-01T00:00:00Z', powerKw: 10 }, { timestamp: '2026-01-09T00:00:00Z', powerKw: 10 }], resolutionMinutes: 60, timezone: 'America/Sao_Paulo', profileBasis: 'representative_period', periodStart: '2026-01-01', periodEnd: '2026-01-09', source: 'csv' },
    } });
    const { POST } = await import('./route');
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('7 dias');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});


describe('modular PCS + batteries API', () => {
  it('accepts a modular configuration without an integrated product and records its equipment/pricing snapshot', async () => {
    const equipment = { compatibility: { id: 'approved-id', revision: 'r1' }, prices: { pcsUnitBrl: 40000, batteryUnitBrl: 30000 } };
    findOwnCiProjectMock.mockResolvedValue({ ...ciProject, calculation_options: modularOptions() });
    invokeMock.mockResolvedValue({ data: { ...calculationResult, engineVersion: 'ci-modular-v2', assumptions: { equipment } }, error: null });
    const { POST } = await import('./route');
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    expect(findBessProductModelMock).not.toHaveBeenCalled();
    expect(findUserBessUnitPriceMock).not.toHaveBeenCalled();
    expect(recordCalculationRunMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ input_snapshot: { options: modularOptions(), equipment } }));
  });
});


it('records STS specifications, approved PCS limit and own prices with the calculation snapshot',async()=>{
  const options={...modularOptions(),backup:stsBackup()};const stsContext=stsFixture();
  const equipment={compatibility:{id:'approved',revision:'1'},prices:{pcsUnitBrl:40000,batteryUnitBrl:30000}};
  checkUserCiBackupAccessMock.mockResolvedValue(true);
  findOwnCiProjectMock.mockResolvedValue({...ciProject,calculation_options:options});
  invokeMock.mockResolvedValue({data:{...calculationResult,engineVersion:'ci-modular-v2',assumptions:{equipment},stsContext},error:null});
  const {POST}=await import('./route');const response=await POST(makeRequest(),makeParams());
  expect(response.status).toBe(200);
  expect(recordCalculationRunMock).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({input_snapshot:{options,equipment,stsContext}}));
});
