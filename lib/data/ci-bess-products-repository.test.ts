import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CiBessProductInput, CiBessProductRecord } from './ci-bess-products-repository';
import {
  createCiBessProduct,
  listActiveCiBessProducts,
  listCiBessProducts,
  setCiBessProductActive,
  updateCiBessProduct,
} from './ci-bess-products-repository';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

type QueryResult = { data: unknown; error: Error | null };
type QueryBuilder = Record<string, ReturnType<typeof vi.fn>> & {
  then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
};

function makeQuery(result: QueryResult): QueryBuilder {
  const builder = {} as QueryBuilder;
  for (const method of ['select', 'order', 'insert', 'update', 'eq']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function makeSupabase(result: QueryResult) {
  const query = makeQuery(result);
  const from = vi.fn(() => query);
  createClientMock.mockReturnValue({ from });
  return { from, query };
}

const product: CiBessProductRecord = {
  id: 'bess-1',
  model: 'BESS 100',
  manufacturer: 'SolaX',
  description: 'Produto C&I',
  active: true,
  module_power_kw: 100,
  module_capacity_kwh: 215,
  efficiency_percent: 90,
  soc_min_percent: 10,
  soc_max_percent: 95,
  warranty_years: 10,
  image_url: null,
  documents: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const input: CiBessProductInput = {
  model: product.model,
  manufacturer: product.manufacturer,
  description: product.description,
  active: product.active,
  module_power_kw: product.module_power_kw,
  module_capacity_kwh: product.module_capacity_kwh,
  efficiency_percent: product.efficiency_percent,
  soc_min_percent: product.soc_min_percent,
  soc_max_percent: product.soc_max_percent,
  warranty_years: product.warranty_years,
  image_url: product.image_url,
  documents: product.documents,
};

beforeEach(() => {
  createClientMock.mockReset();
});

describe('ci-bess-products-repository', () => {
  it('lista todos os produtos ordenados pelo modelo', async () => {
    const { from, query } = makeSupabase({ data: [product], error: null });

    await expect(listCiBessProducts()).resolves.toEqual([product]);

    expect(from).toHaveBeenCalledWith('ci_bess_products');
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('id, model, manufacturer'));
    expect(query.order).toHaveBeenCalledWith('model');
  });

  it('converte resposta vazia em lista vazia e propaga erro da listagem', async () => {
    makeSupabase({ data: null, error: null });
    await expect(listCiBessProducts()).resolves.toEqual([]);

    const error = new Error('falha ao carregar catálogo');
    makeSupabase({ data: null, error });
    await expect(listCiBessProducts()).rejects.toBe(error);
  });

  it('lista somente produtos ativos para os pickers', async () => {
    const { query } = makeSupabase({ data: [product], error: null });

    await expect(listActiveCiBessProducts()).resolves.toEqual([product]);

    expect(query.eq).toHaveBeenCalledWith('active', true);
    expect(query.order).toHaveBeenCalledWith('model');
  });

  it('propaga erro da listagem de produtos ativos', async () => {
    const error = new Error('catálogo indisponível');
    makeSupabase({ data: null, error });

    await expect(listActiveCiBessProducts()).rejects.toBe(error);
  });

  it('cria um produto e retorna o registro persistido', async () => {
    const { query } = makeSupabase({ data: product, error: null });

    await expect(createCiBessProduct(input)).resolves.toEqual(product);

    expect(query.insert).toHaveBeenCalledWith(input);
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('documents'));
    expect(query.single).toHaveBeenCalledTimes(1);
  });

  it('propaga erro ao criar um produto', async () => {
    const error = new Error('modelo duplicado');
    makeSupabase({ data: null, error });

    await expect(createCiBessProduct(input)).rejects.toBe(error);
  });

  it('atualiza um produto acrescentando updated_at', async () => {
    const { query } = makeSupabase({ data: { ...product, active: false }, error: null });

    await expect(updateCiBessProduct(product.id, { active: false })).resolves.toEqual({ ...product, active: false });

    expect(query.update).toHaveBeenCalledWith({ active: false, updated_at: expect.any(String) });
    expect(query.eq).toHaveBeenCalledWith('id', product.id);
    expect(query.single).toHaveBeenCalledTimes(1);
  });

  it('propaga erro ao atualizar um produto', async () => {
    const error = new Error('produto não encontrado');
    makeSupabase({ data: null, error });

    await expect(updateCiBessProduct(product.id, { active: false })).rejects.toBe(error);
  });

  it('altera o estado ativo usando a mesma operação de atualização', async () => {
    const { query } = makeSupabase({ data: { ...product, active: false }, error: null });

    await expect(setCiBessProductActive(product.id, false)).resolves.toEqual({ ...product, active: false });

    expect(query.update).toHaveBeenCalledWith({ active: false, updated_at: expect.any(String) });
    expect(query.eq).toHaveBeenCalledWith('id', product.id);
  });
});
