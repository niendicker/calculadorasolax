import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, serverFromMock, serviceFromMock, createServerClientMock, createServiceClientMock } = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const serverFromMock = vi.fn();
  const serviceFromMock = vi.fn();
  return {
    getUserMock,
    serverFromMock,
    serviceFromMock,
    createServerClientMock: vi.fn(() => ({ auth: { getUser: getUserMock }, from: serverFromMock })),
    createServiceClientMock: vi.fn(() => ({ from: serviceFromMock })),
  };
});

vi.mock('@/lib/supabase/server', () => ({ createClient: createServerClientMock }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createServiceClientMock }));

async function importRoute() {
  const mod = await import('./route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/projects/project-1/request-supplier-quote', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ projectId: 'project-1' }) };

const baseProject = { id: 'project-1', name: 'Casa de praia' };
const baseProfile = { full_name: 'Fulano', company_name: 'Integradora XPTO', email: 'fulano@x.com' };

function singleResult(data: unknown, error: unknown = null) {
  return { eq: () => ({ single: () => Promise.resolve({ data, error }) }) };
}

/** Chain for the `project_events` cooldown lookup: `.select().eq().eq().order().limit().maybeSingle()`. */
function eventsQueryResult(data: unknown, error: unknown = null) {
  const builder = {
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve({ data, error }),
  };
  return builder;
}

function setupServerFrom({
  project = baseProject as unknown,
  projectError = null as unknown,
  profile = baseProfile as unknown,
  lastRequestEvent = null as unknown,
  insertResult = { data: null, error: null } as unknown,
}: {
  project?: unknown;
  projectError?: unknown;
  profile?: unknown;
  lastRequestEvent?: unknown;
  insertResult?: unknown;
} = {}) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  serverFromMock.mockImplementation((table: string) => {
    if (table === 'projects') {
      return { select: () => singleResult(project, projectError) };
    }
    if (table === 'profiles') {
      return { select: () => singleResult(profile) };
    }
    if (table === 'project_events') {
      return { select: () => eventsQueryResult(lastRequestEvent), insert };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { insert };
}

function setupServiceFrom({
  suppliers = [{ id: 'sup-1', name: 'Fornecedor A', email: 'fornecedor@a.com' }] as unknown,
}: { suppliers?: unknown } = {}) {
  serviceFromMock.mockImplementation((table: string) => {
    if (table === 'suppliers') {
      return { select: () => ({ in: () => Promise.resolve({ data: suppliers, error: null }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESEND_FROM_EMAIL = 'pedidos@example.com';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/projects/[projectId]/request-supplier-quote', () => {
  it('returns 401 when there is no authenticated user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Não autenticado.' });
  });

  it('returns 400 when no supplier is selected', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: [], message: 'Olá' }), routeParams);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Selecione ao menos um fornecedor.' });
  });

  it('returns 400 when the message is blank', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: ['sup-1'], message: '   ' }), routeParams);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'A mensagem para o fornecedor está vazia.' });
  });

  it('returns 500 when Resend is not configured', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    delete process.env.RESEND_API_KEY;
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Envio de email não está configurado no servidor.' });
  });

  it('returns 404 when the project does not exist (or is not owned by the user)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom({ project: null, projectError: { message: 'not found' } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams);

    expect(response.status).toBe(404);
  });

  it('returns 429 when a quote request for this project was already sent within the last 10 minutes', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    setupServerFrom({ lastRequestEvent: { created_at: sixMinutesAgo } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams);

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe('Aguarde 4 min antes de solicitar outro orçamento para este projeto.');
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('returns 422 when the requesting user has no known email', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: undefined } } });
    setupServerFrom({ profile: { ...baseProfile, email: '' } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams);

    expect(response.status).toBe(422);
  });

  it('returns 409 when none of the selected suppliers have an email registered', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom();
    setupServiceFrom({ suppliers: [{ id: 'sup-1', name: 'Fornecedor A', email: null }] });
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Nenhum dos fornecedores selecionados tem email cadastrado.' });
  });

  it('sends one email per supplier, CCs the requester, and logs a single project event', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    const { insert } = setupServerFrom();
    setupServiceFrom({
      suppliers: [
        { id: 'sup-1', name: 'Fornecedor A', email: 'a@fornecedores.com' },
        { id: 'sup-2', name: 'Fornecedor B', email: 'b@fornecedores.com' },
      ],
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) });
    const POST = await importRoute();

    const response = await POST(
      makeRequest({ supplierIds: ['sup-1', 'sup-2'], message: 'Poderiam nos enviar uma cotação?' }),
      routeParams
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'sent', sentTo: ['Fornecedor A', 'Fornecedor B'], failedTo: [] });
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const [firstCall, secondCall] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const firstBody = JSON.parse(firstCall[1].body);
    const secondBody = JSON.parse(secondCall[1].body);
    expect(firstBody).toMatchObject({ to: ['a@fornecedores.com'], cc: ['fulano@x.com'], text: 'Poderiam nos enviar uma cotação?' });
    expect(secondBody).toMatchObject({ to: ['b@fornecedores.com'], cc: ['fulano@x.com'] });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        actor_id: 'user-1',
        event_type: 'supplier_quote_requested',
        message: 'Email enviado para: Fornecedor A, Fornecedor B.',
      })
    );
  });

  it('reports a partial failure without blocking the successful sends', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    const { insert } = setupServerFrom();
    setupServiceFrom({
      suppliers: [
        { id: 'sup-1', name: 'Fornecedor A', email: 'a@fornecedores.com' },
        { id: 'sup-2', name: 'Fornecedor B', email: 'b@fornecedores.com' },
      ],
    });
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) })
      .mockResolvedValueOnce({ ok: false, status: 422, json: () => Promise.resolve({ message: 'bounced' }) });
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: ['sup-1', 'sup-2'], message: 'Olá' }), routeParams);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'sent', sentTo: ['Fornecedor A'], failedTo: ['Fornecedor B'] });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Email enviado para: Fornecedor A (falhou para: Fornecedor B).' })
    );
  });

  it('returns 502 when every send fails', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom();
    setupServiceFrom();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const POST = await importRoute();

    const response = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Não foi possível enviar o email para nenhum fornecedor.' });
  });
});
