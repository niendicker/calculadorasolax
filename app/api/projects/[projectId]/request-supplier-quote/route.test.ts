import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, serverFromMock, serviceFromMock, rpcMock, createServerClientMock, createServiceClientMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  serverFromMock: vi.fn(),
  serviceFromMock: vi.fn(),
  rpcMock: vi.fn(),
  createServerClientMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

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
const user = { id: 'user-1', email: 'fulano@x.com' };
const project = { id: 'project-1', name: 'Casa de praia' };
const profile = { full_name: 'Fulano', company_name: 'Integradora XPTO', email: 'fulano@x.com' };
const suppliers = [
  { id: 'sup-1', name: 'Fornecedor A', email: 'a@fornecedores.com', is_default_for_all: true },
  { id: 'sup-2', name: 'Fornecedor B', email: 'b@fornecedores.com', is_default_for_all: true },
];

function updateChain() {
  const builder = { eq: vi.fn() };
  builder.eq.mockReturnValueOnce(builder).mockResolvedValue({ error: null });
  return { update: vi.fn(() => builder) };
}

function setup({ claims = suppliers.map((supplier) => ({ request_id: `req-${supplier.id}`, supplier_id: supplier.id, status: 'sending', claimed: true, retry_at: null, claim_token: `token-${supplier.id}` })), rpcError = null as unknown }: { claims?: unknown[]; rpcError?: unknown } = {}) {
  getUserMock.mockResolvedValue({ data: { user } });
  createServerClientMock.mockReturnValue({
    auth: { getUser: getUserMock },
    from: serverFromMock,
    rpc: rpcMock,
  });
  createServiceClientMock.mockReturnValue({ from: serviceFromMock });
  rpcMock.mockResolvedValue({ data: claims, error: rpcError });
  serverFromMock.mockImplementation((table: string) => {
    if (table === 'projects') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: project, error: null }) }) }) };
    if (table === 'profiles') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: profile, error: null }) }) }) };
    if (table === 'user_supplier_preferences') return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    if (table === 'project_events') return { insert: vi.fn().mockResolvedValue({ error: null }) };
    throw new Error(`unexpected server table ${table}`);
  });
  serviceFromMock.mockImplementation((table: string) => {
    if (table === 'suppliers') return { select: () => ({ eq: () => ({ eq: () => ({ in: () => Promise.resolve({ data: suppliers, error: null }) }) }) }) };
    if (table === 'supplier_quote_requests') return updateChain();
    throw new Error(`unexpected service table ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESEND_FROM_EMAIL = 'pedidos@example.com';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) }));
});

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/projects/[projectId]/request-supplier-quote', () => {
  it('requires authentication and rejects more than two suppliers', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    const POST = await importRoute();
    expect((await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams)).status).toBe(401);

    setup();
    const response = await POST(makeRequest({ supplierIds: ['sup-1', 'sup-2', 'sup-3'], message: 'Olá' }), routeParams);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Você pode selecionar no máximo 2 fornecedores.' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects invalid project, supplier and quota errors from the atomic claim', async () => {
    setup({ rpcError: { message: 'project_access_denied' } });
    const POST = await importRoute();
    expect((await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams)).status).toBe(404);

    setup({ rpcError: { message: 'supplier_not_allowed' } });
    expect((await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams)).status).toBe(409);

    setup({ rpcError: { message: 'daily_quote_quota' } });
    const quotaResponse = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá' }), routeParams);
    expect(quotaResponse.status).toBe(429);
    expect(await quotaResponse.json()).toEqual({ error: 'Você atingiu o limite de solicitações de orçamento nas últimas 24 horas.' });
  });

  it('sends one email per claimed supplier and returns persistent results', async () => {
    setup({ claims: suppliers.map((supplier) => ({ request_id: `req-${supplier.id}`, supplier_id: supplier.id, status: 'sending', claimed: true, retry_at: null, claim_token: `token-${supplier.id}` })) });
    const POST = await importRoute();
    const response = await POST(makeRequest({ supplierIds: ['sup-1', 'sup-2'], message: 'Poderiam enviar uma cotação?', idempotencyKey: '11111111-1111-4111-8111-111111111111' }), routeParams);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe('sent');
    expect(body.results).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenCalledWith('claim_supplier_quote_requests', expect.objectContaining({ p_supplier_ids: ['sup-1', 'sup-2'] }));
  });

  it('does not send again when the same idempotency key is already sent or in progress', async () => {
    setup({ claims: [{ request_id: 'req-1', supplier_id: 'sup-1', status: 'sent', claimed: false, retry_at: new Date(Date.now() + 86_400_000).toISOString(), claim_token: null }] });
    const POST = await importRoute();
    const sentResponse = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá', idempotencyKey: '11111111-1111-4111-8111-111111111111' }), routeParams);
    expect(sentResponse.status).toBe(429);
    expect(global.fetch).not.toHaveBeenCalled();

    setup({ claims: [{ request_id: 'req-1', supplier_id: 'sup-1', status: 'sending', claimed: false, retry_at: null, claim_token: null }] });
    const processingResponse = await POST(makeRequest({ supplierIds: ['sup-1'], message: 'Olá', idempotencyKey: '11111111-1111-4111-8111-111111111111' }), routeParams);
    expect(processingResponse.status).toBe(409);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('allows only one of two concurrent claims to send', async () => {
    const claimed = [{ request_id: 'req-1', supplier_id: 'sup-1', status: 'sending', claimed: true, retry_at: null, claim_token: 'token-1' }];
    const alreadyProcessing = [{ request_id: 'req-1', supplier_id: 'sup-1', status: 'sending', claimed: false, retry_at: null, claim_token: null }];
    setup({ claims: claimed });
    rpcMock.mockReset().mockResolvedValueOnce({ data: claimed, error: null }).mockResolvedValueOnce({ data: alreadyProcessing, error: null });
    const POST = await importRoute();
    const body = { supplierIds: ['sup-1'], message: 'Olá', idempotencyKey: '11111111-1111-4111-8111-111111111111' };
    const [first, second] = await Promise.all([POST(makeRequest(body), routeParams), POST(makeRequest(body), routeParams)]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports partial provider failures without hiding the successful supplier', async () => {
    setup({ claims: suppliers.map((supplier) => ({ request_id: `req-${supplier.id}`, supplier_id: supplier.id, status: 'sending', claimed: true, retry_at: null, claim_token: `token-${supplier.id}` })) });
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) })
      .mockRejectedValueOnce(new Error('provider unavailable'));
    const POST = await importRoute();
    const response = await POST(makeRequest({ supplierIds: ['sup-1', 'sup-2'], message: 'Olá' }), routeParams);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe('partial');
    expect(body.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ supplierName: 'Fornecedor A', status: 'sent' }),
      expect.objectContaining({ supplierName: 'Fornecedor B', status: 'failed' }),
    ]));
  });
});
