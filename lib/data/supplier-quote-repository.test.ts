import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findProjectForQuote,
  findRequesterProfile,
  listAllowedSupplierContacts,
  listPreferredSupplierIds,
  listSupplierQuoteRequests,
  recordSupplierQuoteRequest,
} from './supplier-quote-repository';

type QueryResult = { data: unknown; error: Error | null };
type QueryBuilder = Record<string, ReturnType<typeof vi.fn>> & {
  then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
};

function makeQuery(result: QueryResult): QueryBuilder {
  const builder = {} as QueryBuilder;
  for (const method of ['select', 'eq', 'in', 'order', 'insert']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function makeClient(result: QueryResult = { data: null, error: null }) {
  const query = makeQuery(result);
  const from = vi.fn(() => query);
  const client = { from } as unknown as SupabaseClient;
  return { client, from, query };
}

describe('supplier-quote-repository', () => {
  it('busca o projeto e o perfil do solicitante', async () => {
    const project = { id: 'project-1', name: 'Projeto solar' };
    const projectClient = makeClient({ data: project, error: null });
    await expect(findProjectForQuote(projectClient.client, 'project-1')).resolves.toEqual(project);
    expect(projectClient.from).toHaveBeenCalledWith('projects');
    expect(projectClient.query.select).toHaveBeenCalledWith('id, name');
    expect(projectClient.query.eq).toHaveBeenCalledWith('id', 'project-1');

    const profile = { full_name: 'Marcelo', company_name: 'Empresa', email: 'marcelo@example.com' };
    const profileClient = makeClient({ data: profile, error: null });
    await expect(findRequesterProfile(profileClient.client, 'user-1')).resolves.toEqual(profile);
    expect(profileClient.from).toHaveBeenCalledWith('profiles');
    expect(profileClient.query.select).toHaveBeenCalledWith('full_name, company_name, email');
    expect(profileClient.query.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('lista IDs preferenciais e normaliza ausência de dados', async () => {
    const preferenceClient = makeClient({ data: [{ supplier_id: 'supplier-1' }, { supplier_id: 'supplier-2' }], error: null });
    await expect(listPreferredSupplierIds(preferenceClient.client, 'user-1')).resolves.toEqual(['supplier-1', 'supplier-2']);
    expect(preferenceClient.from).toHaveBeenCalledWith('user_supplier_preferences');
    expect(preferenceClient.query.select).toHaveBeenCalledWith('supplier_id');
    expect(preferenceClient.query.eq).toHaveBeenCalledWith('user_id', 'user-1');

    const empty = makeClient({ data: null, error: new Error('preferências indisponíveis') });
    await expect(listPreferredSupplierIds(empty.client, 'user-1')).resolves.toEqual([]);
  });

  it('permite fornecedores padrão ou preferenciais, excluindo os demais', async () => {
    const suppliers = [
      { id: 'default-1', name: 'Padrão', email: 'default@example.com', is_default_for_all: true },
      { id: 'preferred-1', name: 'Preferencial', email: 'preferred@example.com', is_default_for_all: false },
      { id: 'other-1', name: 'Outro', email: 'other@example.com', is_default_for_all: false },
    ];
    const { client, query } = makeClient({ data: suppliers, error: null });

    await expect(listAllowedSupplierContacts(client, ['default-1', 'preferred-1', 'other-1'], ['preferred-1'])).resolves.toEqual([
      suppliers[0],
      suppliers[1],
    ]);
    expect(query.select).toHaveBeenCalledWith('id, name, email, is_default_for_all');
    expect(query.eq).toHaveBeenNthCalledWith(1, 'active', true);
    expect(query.eq).toHaveBeenNthCalledWith(2, 'ordering_enabled', true);
    expect(query.in).toHaveBeenCalledWith('id', ['default-1', 'preferred-1', 'other-1']);
  });

  it('retorna lista vazia quando nenhum fornecedor elegível é encontrado', async () => {
    const { client, query } = makeClient({ data: null, error: new Error('fornecedores indisponíveis') });

    await expect(listAllowedSupplierContacts(client, [], [])).resolves.toEqual([]);
    expect(query.in).toHaveBeenCalledWith('id', []);
  });

  it('registra uma solicitação de cotação no histórico do projeto', async () => {
    const event = { project_id: 'project-1', event_type: 'supplier_quote_requested', metadata: { supplierIds: ['supplier-1'] } };
    const { client, from, query } = makeClient({ data: null, error: null });

    await expect(recordSupplierQuoteRequest(client, event)).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledWith('project_events');
    expect(query.insert).toHaveBeenCalledWith(event);
  });

  it('lista solicitações por projeto e preserva erro do Supabase', async () => {
    const requests = [{
      id: 'request-1',
      project_id: 'project-1',
      supplier_id: 'supplier-1',
      status: 'sent',
      created_at: '2026-01-01T00:00:00.000Z',
      sent_at: '2026-01-01T00:01:00.000Z',
      last_sent_at: null,
      send_count: 1,
      error_message: null,
    }];
    const success = makeClient({ data: requests, error: null });
    await expect(listSupplierQuoteRequests(success.client, 'project-1')).resolves.toEqual({ data: requests, error: null });
    expect(success.from).toHaveBeenCalledWith('supplier_quote_requests');
    expect(success.query.eq).toHaveBeenCalledWith('project_id', 'project-1');
    expect(success.query.order).toHaveBeenCalledWith('created_at', { ascending: false });

    const error = new Error('histórico indisponível');
    const failed = makeClient({ data: null, error });
    await expect(listSupplierQuoteRequests(failed.client, 'project-1')).resolves.toEqual({ data: [], error });
  });
});
