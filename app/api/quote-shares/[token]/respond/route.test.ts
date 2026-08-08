import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceFromMock, createServiceClientMock } = vi.hoisted(() => {
  const serviceFromMock = vi.fn();
  return {
    serviceFromMock,
    createServiceClientMock: vi.fn(() => ({ from: serviceFromMock })),
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: createServiceClientMock }));

async function importRoute() {
  const mod = await import('./route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/quote-shares/token-1/respond', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ token: 'token-1' }) };

function singleResult(data: unknown, error: unknown = null) {
  return { eq: () => ({ maybeSingle: () => Promise.resolve({ data, error }) }) };
}

function setupServiceFrom({
  share = { id: 'token-1', project_id: 'project-1', status: 'sent' } as unknown,
  shareError = null as unknown,
  updateShareResult = { data: null, error: null } as unknown,
}: { share?: unknown; shareError?: unknown; updateShareResult?: unknown } = {}) {
  const updateShare = vi.fn(() => ({ eq: () => Promise.resolve(updateShareResult) }));
  const updateProject = vi.fn(() => ({ eq: () => Promise.resolve({ data: null, error: null }) }));
  const insertEvent = vi.fn(() => Promise.resolve({ data: null, error: null }));
  serviceFromMock.mockImplementation((table: string) => {
    if (table === 'quote_shares') {
      return { select: () => singleResult(share, shareError), update: updateShare };
    }
    if (table === 'projects') {
      return { update: updateProject };
    }
    if (table === 'project_events') {
      return { insert: insertEvent };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { updateShare, updateProject, insertEvent };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

describe('POST /api/quote-shares/[token]/respond', () => {
  it('returns 400 for an invalid JSON body', async () => {
    const POST = await importRoute();
    const request = new Request('http://localhost/api/quote-shares/token-1/respond', { method: 'POST', body: 'not json' });

    const response = await POST(request, routeParams);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_payload' });
  });

  it('returns 400 when decision is neither accepted nor rejected', async () => {
    const POST = await importRoute();

    const response = await POST(makeRequest({ decision: 'maybe' }), routeParams);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_payload' });
  });

  it('returns 404 when the token does not exist', async () => {
    setupServiceFrom({ share: null });
    const POST = await importRoute();

    const response = await POST(makeRequest({ decision: 'accepted' }), routeParams);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 409 when the share already has a response', async () => {
    setupServiceFrom({ share: { id: 'token-1', project_id: 'project-1', status: 'accepted' } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ decision: 'rejected' }), routeParams);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'already_responded' });
  });

  it('accepts: updates quote_shares.status/responded_at and projects.status/updated_at, returns 200', async () => {
    const { updateShare, updateProject } = setupServiceFrom();
    const POST = await importRoute();

    const response = await POST(makeRequest({ decision: 'accepted' }), routeParams);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted' });
    expect(updateShare).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted', responded_at: expect.any(String) }));
    expect(updateProject).toHaveBeenCalledWith({ status: 'accepted', updated_at: expect.any(String) });
  });

  it('logs a quote_accepted project_event with from_status/to_status', async () => {
    const { insertEvent } = setupServiceFrom();
    const POST = await importRoute();

    await POST(makeRequest({ decision: 'accepted' }), routeParams);

    expect(insertEvent).toHaveBeenCalledWith({
      project_id: 'project-1',
      actor_id: null,
      event_type: 'quote_accepted',
      from_status: 'sent',
      to_status: 'accepted',
    });
  });

  it('logs a quote_rejected project_event when the customer declines', async () => {
    const { insertEvent } = setupServiceFrom();
    const POST = await importRoute();

    await POST(makeRequest({ decision: 'rejected' }), routeParams);

    expect(insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'quote_rejected', from_status: 'sent', to_status: 'rejected' })
    );
  });

  it('rejects: returns 200 with the rejected status', async () => {
    setupServiceFrom();
    const POST = await importRoute();

    const response = await POST(makeRequest({ decision: 'rejected' }), routeParams);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'rejected' });
  });

  it('returns 500 when updating quote_shares fails', async () => {
    setupServiceFrom({ updateShareResult: { data: null, error: { message: 'boom' } } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ decision: 'accepted' }), routeParams);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'update_failed' });
  });

  it('returns 500 when the initial lookup errors', async () => {
    setupServiceFrom({ share: null, shareError: { message: 'db down' } });
    const POST = await importRoute();

    const response = await POST(makeRequest({ decision: 'accepted' }), routeParams);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'lookup_failed' });
  });
});
