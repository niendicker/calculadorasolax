import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, serverFromMock, serviceFromMock, createServerClientMock, createServiceClientMock, renderPdfMock } = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const serverFromMock = vi.fn();
  const serviceFromMock = vi.fn();
  return {
    getUserMock,
    serverFromMock,
    serviceFromMock,
    createServerClientMock: vi.fn(() => ({ auth: { getUser: getUserMock }, from: serverFromMock })),
    createServiceClientMock: vi.fn(() => ({ from: serviceFromMock })),
    renderPdfMock: vi.fn().mockResolvedValue('ZmFrZS1wZGY='),
  };
});

vi.mock('@/lib/supabase/server', () => ({ createClient: createServerClientMock }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createServiceClientMock }));
vi.mock('@/lib/pdf/purchase-order-pdf', () => ({ renderPurchaseOrderPdf: renderPdfMock }));

async function importRoute() {
  const mod = await import('./route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/purchase-orders/order-1/notify-supplier-email', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ orderId: 'order-1' }) };

const baseOrder = {
  id: 'order-1',
  supplier_id: 'sup-1',
  currency: 'BRL',
  subtotal: 5000,
  status: 'requested',
  delivery_address: null,
  purchase_order_items: [
    { product_model: 'X1-Hybrid-5.0kW-G4', supplier_sku: 'SKU-1', quantity: 1, unit_price: 5000, line_total: 5000 },
  ],
};

const baseProfile = { full_name: 'Fulano', company_name: 'Integradora XPTO', phone: '11999999999', email: 'fulano@x.com' };

function singleResult(data: unknown, error: unknown = null) {
  return { eq: () => ({ single: () => Promise.resolve({ data, error }) }) };
}

/** Chain for the `purchase_order_events` lookup: `.select().eq().eq().order().limit().maybeSingle()`. */
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
  order = baseOrder as unknown,
  orderError = null as unknown,
  profile = baseProfile as unknown,
  lastEmailEvent = null as unknown,
}: { order?: unknown; orderError?: unknown; profile?: unknown; lastEmailEvent?: unknown } = {}) {
  serverFromMock.mockImplementation((table: string) => {
    if (table === 'purchase_orders') {
      return { select: () => singleResult(order, orderError) };
    }
    if (table === 'profiles') {
      return { select: () => singleResult(profile) };
    }
    if (table === 'purchase_order_events') {
      return { select: () => eventsQueryResult(lastEmailEvent) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

function setupServiceFrom({
  supplier = { name: 'Fornecedor A', email: 'fornecedor@a.com' } as unknown,
  insertResult = { data: null, error: null } as unknown,
}: { supplier?: unknown; insertResult?: unknown } = {}) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  serviceFromMock.mockImplementation((table: string) => {
    if (table === 'suppliers') {
      return { select: () => singleResult(supplier) };
    }
    if (table === 'purchase_order_events') {
      return { insert };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { insert };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderPdfMock.mockResolvedValue('ZmFrZS1wZGY=');
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESEND_FROM_EMAIL = 'pedidos@example.com';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/purchase-orders/[orderId]/notify-supplier-email', () => {
  it('returns 401 when there is no authenticated user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Não autenticado.' });
  });

  it('returns 400 when the message is blank', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: '   ' }), routeParams);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Escreva uma mensagem para o fornecedor.' });
  });

  it('returns 500 when Resend is not configured', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    delete process.env.RESEND_API_KEY;
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Envio de email não está configurado no servidor.' });
  });

  it('returns 404 when the order does not exist', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom({ order: null, orderError: { message: 'not found' } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(404);
  });

  it('returns 409 when the order is no longer in a notifiable status', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom({ order: { ...baseOrder, status: 'fulfilled' } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Este pedido não está mais disponível para notificar o fornecedor.' });
  });

  it('returns 422 when the requesting user has no known email', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: undefined } } });
    setupServerFrom({ profile: { ...baseProfile, email: '' } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(422);
  });

  it('returns 429 when a supplier email for this order was already sent within the last 10 minutes', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    setupServerFrom({ lastEmailEvent: { created_at: sixMinutesAgo } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe('Aguarde 4 min antes de notificar este fornecedor de novo.');
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(4 * 60);
  });

  it('allows sending again once the 10-minute cooldown has fully elapsed', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    setupServerFrom({ lastEmailEvent: { created_at: elevenMinutesAgo } });
    setupServiceFrom();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(200);
  });

  it('returns 409 when the supplier has no email registered', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom();
    setupServiceFrom({ supplier: { name: 'Fornecedor A', email: null } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Este fornecedor não tem um email cadastrado.' });
  });

  it('sends the email with the PDF attached, CCs the requesting user, and logs an event', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom();
    const { insert } = setupServiceFrom();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-1' }),
    });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Poderiam nos enviar uma cotação?' }), routeParams);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'sent' });

    expect(renderPdfMock).toHaveBeenCalledWith(
      expect.objectContaining({ supplierName: 'Fornecedor A', customerEmail: 'fulano@x.com', message: 'Poderiam nos enviar uma cotação?' })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer test-key' }),
      })
    );
    const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.to).toEqual(['fornecedor@a.com']);
    expect(sentBody.cc).toEqual(['fulano@x.com']);
    expect(sentBody.attachments[0].content).toBe('ZmFrZS1wZGY=');

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: 'order-1', actor_id: 'user-1', event_type: 'supplier_email_sent' })
    );
  });

  it('passes the order\'s saved delivery address through to the PDF, when it has one', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom({
      order: { ...baseOrder, delivery_address: { address: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP' } },
    });
    setupServiceFrom();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) });
    const POST = await importRoute();

    await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(renderPdfMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryAddress: { address: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP' },
      })
    );
  });

  it('returns 502 when Resend responds with an error', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom();
    setupServiceFrom();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: 'Domínio não verificado.' }),
    });
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Domínio não verificado.' });
  });

  it('returns 500 when PDF generation fails', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'fulano@x.com' } } });
    setupServerFrom();
    setupServiceFrom();
    renderPdfMock.mockRejectedValue(new Error('boom'));
    const POST = await importRoute();

    const response = await POST(makeRequest({ message: 'Olá' }), routeParams);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Não foi possível gerar o PDF da proposta.' });
  });
});
