import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cacheProjectCalculationResult,
  checkUserCiAccess,
  checkUserCiBackupAccess,
  findBessProductModel,
  findOwnCiProject,
  findUserBessUnitPrice,
  invokeCommercialIndustrialCalculation,
  listCalculationRuns,
  recordCalculationRun,
} from './commercial-industrial-calculation-repository';

type QueryResult = { data: unknown; error: Error | null };
type QueryBuilder = Record<string, ReturnType<typeof vi.fn>> & {
  then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
};

function makeQuery(result: QueryResult): QueryBuilder {
  const builder = {} as QueryBuilder;
  for (const method of ['select', 'update', 'insert', 'eq', 'order']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function makeClient(result: QueryResult = { data: null, error: null }) {
  const query = makeQuery(result);
  const from = vi.fn(() => query);
  const invoke = vi.fn();
  const client = { from, functions: { invoke } } as unknown as SupabaseClient;
  return { client, from, invoke, query };
}

const options = { tariffId: 'tariff-1', bessProductId: 'bess-1' };
const calculationResult = { engineVersion: 'ci-v1', recommendation: { scenarioId: 'scenario-1' } };
const run = {
  id: 'run-1',
  engine_version: 'ci-v1',
  selected_scenario_id: 'scenario-1',
  status: 'completed',
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('commercial-industrial-calculation-repository', () => {
  it('invoca a Edge Function C&I com opções e preços', async () => {
    const { client, invoke } = makeClient();
    const body = { options, unitPriceBrl: 45000, additionalCostsBrl: 1200 };
    const result = { data: calculationResult, error: null };
    invoke.mockResolvedValue(result);

    await expect(invokeCommercialIndustrialCalculation(client, body)).resolves.toEqual(result);
    expect(invoke).toHaveBeenCalledWith('calculate-commercial-industrial', { body });
  });

  it('cai para cálculo direto local quando a Edge Function remota falha', async () => {
    const { client, invoke } = makeClient();
    invoke.mockRejectedValue(new Error('Edge function not reachable'));
    // body with incomplete options returns error gracefully from direct calculation
    const body = { options: {}, unitPriceBrl: 45000 };
    const res = await invokeCommercialIndustrialCalculation(client, body);
    expect(res.data).toBeNull();
    expect(res.error).toBeDefined();
  });

  it('calcula diretamente com solar FV preenchendo solarGenerationKw no dispatch', async () => {
    const bRow = {
      id: 'bess-1',
      model: 'BESS 100',
      module_power_kw: 50,
      module_capacity_kwh: 100,
      efficiency_percent: 90,
      soc_min_percent: 10,
      soc_max_percent: 90,
    };
    const { client, invoke } = makeClient({ data: bRow, error: null });
    // Simulate remote function returning stale result without solar points
    invoke.mockResolvedValue({
      data: {
        engineVersion: 'ci-v1',
        selected: {
          scenarioId: 's1',
          dispatch: [{ timestamp: '2026-08-24T12:00:00.000Z', loadKw: 100 }],
        },
      },
      error: null,
    });

    const body = {
      options: {
        loadCurve: {
          points: [{ timestamp: '2026-08-24T15:00:00.000Z', powerKw: 100 }],
          resolutionMinutes: 60,
          timezone: 'America/Sao_Paulo',
          profileBasis: 'representative_period',
          periodStart: '2026-08-24',
          periodEnd: '2026-08-24',
        },
        tariff: {
          tariffType: 'verde',
          contractedDemandKw: 100,
          energyRatePeakBrlPerMwh: 1200,
          energyRateOffPeakBrlPerMwh: 400,
          peakStart: '18:00',
          peakEnd: '21:00',
        },
        bessProductId: 'bess-1',
        strategy: 'HYBRID',
        sizing: { mode: 'fixed', moduleCount: 1, minModules: null, maxModules: null },
        financialAssumptions: {
          discountRatePercent: 12,
          analysisHorizonYears: 10,
          annualEnergyInflationPercent: 0,
          monthsPerYear: 12,
        },
        rankingCriterion: 'PAYBACK',
        solar: {
          enabled: true,
          installedPowerKwp: 50,
          inverterPowerKw: 50,
          dailyYieldKwhPerKwp: 4.5,
          prioritizeBessCharging: true,
        },
      },
      unitPriceBrl: 45000,
    };

    const res = await invokeCommercialIndustrialCalculation(client, body);
    expect(res.data).toBeDefined();
    expect(res.data?.selected?.dispatch?.[0]?.solarGenerationKw).toBeGreaterThan(0);
  });

  it('busca o preço próprio do produto BESS e retorna null quando não há registro', async () => {
    const { client, query } = makeClient({ data: { unit_value: '45000.50' }, error: null });

    await expect(findUserBessUnitPrice(client, 'user-1', 'BESS 100')).resolves.toBe(45000.5);
    expect(query.select).toHaveBeenCalledWith('unit_value');
    expect(query.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'product_type', 'ci_bess');
    expect(query.eq).toHaveBeenNthCalledWith(3, 'product_model', 'BESS 100');

    const empty = makeClient({ data: null, error: null });
    await expect(findUserBessUnitPrice(empty.client, 'user-1', 'BESS 200')).resolves.toBeNull();
  });

  it('propaga erro ao buscar o preço do usuário', async () => {
    const error = new Error('falha no preço');
    const { client } = makeClient({ data: null, error });

    await expect(findUserBessUnitPrice(client, 'user-1', 'BESS 100')).rejects.toBe(error);
  });

  it('busca somente o modelo BESS ativo e diferencia produto ausente', async () => {
    const { client, query } = makeClient({ data: { model: 'BESS 100' }, error: null });

    await expect(findBessProductModel(client, 'bess-1')).resolves.toBe('BESS 100');
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', 'bess-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'active', true);

    const empty = makeClient({ data: null, error: null });
    await expect(findBessProductModel(empty.client, 'missing')).resolves.toBeNull();
  });

  it('carrega o projeto próprio e aceita ausência mascarada por RLS', async () => {
    const project = { id: 'project-1', installation_type: 'commercial_industrial', calculation_options: options };
    const { client, query } = makeClient({ data: project, error: null });

    await expect(findOwnCiProject(client, 'project-1')).resolves.toEqual(project);
    expect(query.select).toHaveBeenCalledWith('id, installation_type, calculation_options');
    expect(query.eq).toHaveBeenCalledWith('id', 'project-1');

    const empty = makeClient({ data: null, error: null });
    await expect(findOwnCiProject(empty.client, 'other-user-project')).resolves.toBeNull();
  });

  it('propaga erros das consultas de produto e projeto', async () => {
    const error = new Error('consulta indisponível');
    const product = makeClient({ data: null, error });
    const project = makeClient({ data: null, error });

    await expect(findBessProductModel(product.client, 'bess-1')).rejects.toBe(error);
    await expect(findOwnCiProject(project.client, 'project-1')).rejects.toBe(error);
  });

  it('registra a execução e atualiza o cache do projeto', async () => {
    const { client, from, query } = makeClient({ data: null, error: null });
    const payload = {
      project_id: 'project-1',
      user_id: 'user-1',
      installation_type: 'commercial_industrial' as const,
      engine_version: 'ci-v1',
      input_fingerprint: 'hash-1',
      input_snapshot: options,
      result_snapshot: calculationResult,
      selected_scenario_id: 'scenario-1',
    };

    const runResult = await recordCalculationRun(client, payload);
    expect(runResult).toEqual({ data: null, error: null });
    expect(from).toHaveBeenCalledWith('project_calculation_runs');
    expect(query.insert).toHaveBeenCalledWith(payload);

    await expect(cacheProjectCalculationResult(client, 'project-1', calculationResult, 'ci-v1')).resolves.toEqual({ data: null, error: null });
    expect(from).toHaveBeenLastCalledWith('projects');
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ calculation_result: calculationResult, calculation_version: 'ci-v1', updated_at: expect.any(String) }));
    expect(query.eq).toHaveBeenLastCalledWith('id', 'project-1');
  });

  it('lista execuções mais recentes primeiro e retorna lista vazia', async () => {
    const { client, query } = makeClient({ data: [run], error: null });

    await expect(listCalculationRuns(client, 'project-1')).resolves.toEqual([run]);
    expect(query.select).toHaveBeenCalledWith('id, engine_version, selected_scenario_id, status, created_at');
    expect(query.eq).toHaveBeenCalledWith('project_id', 'project-1');
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });

    const empty = makeClient({ data: null, error: null });
    await expect(listCalculationRuns(empty.client, 'project-1')).resolves.toEqual([]);
  });

  it('propaga erro ao listar execuções', async () => {
    const error = new Error('histórico indisponível');
    const { client } = makeClient({ data: null, error });

    await expect(listCalculationRuns(client, 'project-1')).rejects.toBe(error);
  });

  describe('checkUserCiAccess', () => {
    it('retorna true para admin independente das flags', async () => {
      const { client } = makeClient({ data: { role: 'admin', feature_flags: [] }, error: null });
      await expect(checkUserCiAccess(client, 'u1')).resolves.toBe(true);
    });

    it('retorna true para usuário com flag ci', async () => {
      const { client } = makeClient({ data: { role: 'user', feature_flags: ['ci'] }, error: null });
      await expect(checkUserCiAccess(client, 'u1')).resolves.toBe(true);
    });

    it('retorna false para usuário sem flag ci', async () => {
      const { client } = makeClient({ data: { role: 'user', feature_flags: [] }, error: null });
      await expect(checkUserCiAccess(client, 'u1')).resolves.toBe(false);
    });

    it('retorna false se perfil não for encontrado', async () => {
      const { client } = makeClient({ data: null, error: null });
      await expect(checkUserCiAccess(client, 'u1')).resolves.toBe(false);
    });
  });

  describe('checkUserCiBackupAccess', () => {
    it('retorna true para admin independente das flags', async () => {
      const { client } = makeClient({ data: { role: 'admin', feature_flags: [] }, error: null });
      await expect(checkUserCiBackupAccess(client, 'u1')).resolves.toBe(true);
    });

    it('retorna true para usuário com flag ci_backup', async () => {
      const { client } = makeClient({ data: { role: 'user', feature_flags: ['ci', 'ci_backup'] }, error: null });
      await expect(checkUserCiBackupAccess(client, 'u1')).resolves.toBe(true);
    });

    it('retorna false para usuário sem flag ci_backup', async () => {
      const { client } = makeClient({ data: { role: 'user', feature_flags: ['ci'] }, error: null });
      await expect(checkUserCiBackupAccess(client, 'u1')).resolves.toBe(false);
    });

    it('retorna false se perfil não for encontrado', async () => {
      const { client } = makeClient({ data: null, error: null });
      await expect(checkUserCiBackupAccess(client, 'u1')).resolves.toBe(false);
    });
  });
});

describe('imported solar compatibility with remote calculation', () => {
  it('recalculates locally if an older Edge Function returns estimated generation instead of the imported values', async () => {
    const { client, invoke } = makeClient({ data: { id: 'bess-1', model: 'BESS 100', module_power_kw: 50, module_capacity_kwh: 100, efficiency_percent: 90, soc_min_percent: 10, soc_max_percent: 90 }, error: null });
    const timestamp = '2026-01-01T15:00:00Z';
    invoke.mockResolvedValue({ data: { engineVersion: 'ci-v1', selected: { dispatch: [{ timestamp, solarGenerationKw: 999 }] } }, error: null });
    const loadCurve = { points: [{ timestamp, powerKw: 100 }], resolutionMinutes: 15, timezone: 'America/Sao_Paulo', profileBasis: 'representative_period', periodStart: '2026-01-01', periodEnd: '2026-01-01', source: 'csv' };
    const options = {
      loadCurve, bessProductId: 'bess-1', strategy: 'HYBRID', sizing: { mode: 'fixed', moduleCount: 1 }, rankingCriterion: 'PAYBACK',
      tariff: { energyRatePeakBrlPerMwh: 1200, energyRateOffPeakBrlPerMwh: 400, demandRateBrlPerKwMonth: 30, contractedDemandKw: 100, peakStart: '18:00', peakEnd: '21:00', tariffModality: 'verde', market: 'cativo', icmsPercent: 0, pisCofinsPercent: 0 },
      financialAssumptions: { discountRatePercent: 12, analysisHorizonYears: 10, annualEnergyInflationPercent: 0, monthsPerYear: 12 },
      solar: { enabled: true, installedPowerKwp: 0, inverterPowerKw: 0, dailyYieldKwhPerKwp: 4.5, prioritizeBessCharging: true, generationCurve: { ...loadCurve, points: [{ timestamp, powerKw: 27.5 }] } },
    };
    const result = await invokeCommercialIndustrialCalculation(client, { options, unitPriceBrl: 45000 });
    expect(result.error).toBeNull();
    expect(result.data?.selected?.dispatch[0].solarGenerationKw).toBe(27.5);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
