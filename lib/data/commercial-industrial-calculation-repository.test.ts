import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cacheProjectCalculationResult,
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
});
