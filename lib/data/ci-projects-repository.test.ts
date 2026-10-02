import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CiProjectRecord } from './ci-projects-repository';
import {
  deleteCiProjectRecord,
  listCiProjectRecords,
  saveCiProjectRecord,
  updateCiProjectStatusRecord,
} from './ci-projects-repository';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

type QueryResult = { data: unknown; error: Error | null };
type QueryBuilder = Record<string, ReturnType<typeof vi.fn>> & {
  then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
};

function makeQuery(result: QueryResult): QueryBuilder {
  const builder = {} as QueryBuilder;
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function makeClient(result: QueryResult = { data: null, error: null }) {
  const query = makeQuery(result);
  const from = vi.fn(() => query);
  createClientMock.mockReturnValue({ from });
  return { from, query };
}

const payload: CiProjectRecord = {
  user_id: 'user-1',
  client_id: 'client-1',
  name: 'Projeto C&I',
  address: { city: 'São Paulo' },
  notes: 'Projeto de teste',
  installation_type: 'commercial_industrial',
  calculation_options: { bessProductId: 'bess-1' },
  updated_at: '2026-01-01T00:00:00.000Z',
};

const savedProject = {
  id: 'project-1',
  name: payload.name,
  client_id: payload.client_id,
  address: payload.address,
  notes: payload.notes,
  installation_type: payload.installation_type,
  calculation_options: payload.calculation_options,
  calculation_result: null,
  calculation_version: null,
  status: 'draft',
  updated_at: payload.updated_at,
};

beforeEach(() => {
  createClientMock.mockReset();
});

describe('ci-projects-repository', () => {
  it('insere um novo projeto C&I e retorna o registro selecionado', async () => {
    const { from, query } = makeClient({ data: savedProject, error: null });

    await expect(saveCiProjectRecord(null, payload)).resolves.toEqual(savedProject);
    expect(from).toHaveBeenCalledWith('projects');
    expect(query.insert).toHaveBeenCalledWith(payload);
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('installation_type'));
    expect(query.single).toHaveBeenCalledTimes(1);
  });

  it('atualiza um projeto existente pelo ID', async () => {
    const { query } = makeClient({ data: savedProject, error: null });

    await expect(saveCiProjectRecord('project-1', payload)).resolves.toEqual(savedProject);
    expect(query.update).toHaveBeenCalledWith(payload);
    expect(query.eq).toHaveBeenCalledWith('id', 'project-1');
    expect(query.insert).not.toHaveBeenCalled();
  });

  it('propaga erros ao salvar projeto', async () => {
    const error = new Error('projeto inválido');
    makeClient({ data: null, error });

    await expect(saveCiProjectRecord(null, payload)).rejects.toBe(error);
  });

  it('remove um projeto e propaga erro de exclusão', async () => {
    const success = makeClient({ data: null, error: null });
    await expect(deleteCiProjectRecord('project-1')).resolves.toBeUndefined();
    expect(success.from).toHaveBeenCalledWith('projects');
    expect(success.query.delete).toHaveBeenCalledTimes(1);
    expect(success.query.eq).toHaveBeenCalledWith('id', 'project-1');

    const error = new Error('exclusão bloqueada');
    makeClient({ data: null, error });
    await expect(deleteCiProjectRecord('project-1')).rejects.toBe(error);
  });

  it('atualiza o status e a data do projeto', async () => {
    const { query } = makeClient({ data: { ...savedProject, status: 'sent' }, error: null });

    await expect(updateCiProjectStatusRecord('project-1', 'sent')).resolves.toEqual({ ...savedProject, status: 'sent' });
    expect(query.update).toHaveBeenCalledWith({ status: 'sent', updated_at: expect.any(String) });
    expect(query.eq).toHaveBeenCalledWith('id', 'project-1');
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('calculation_result'));
  });

  it('propaga erro ao atualizar o status', async () => {
    const error = new Error('status inválido');
    makeClient({ data: null, error });

    await expect(updateCiProjectStatusRecord('project-1', 'rejected')).rejects.toBe(error);
  });

  it('lista apenas projetos comerciais/industriais mais recentes primeiro', async () => {
    const projects = [savedProject];
    const { query } = makeClient({ data: projects, error: null });

    await expect(listCiProjectRecords()).resolves.toEqual(projects);
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('calculation_options'));
    expect(query.eq).toHaveBeenCalledWith('installation_type', 'commercial_industrial');
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false });

    makeClient({ data: null, error: null });
    await expect(listCiProjectRecords()).resolves.toEqual([]);
  });

  it('propaga erro ao listar projetos C&I', async () => {
    const error = new Error('projetos indisponíveis');
    makeClient({ data: null, error });

    await expect(listCiProjectRecords()).rejects.toBe(error);
  });
});
