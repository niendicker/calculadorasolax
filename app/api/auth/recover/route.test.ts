import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { generateLinkMock, createServiceClientMock } = vi.hoisted(() => {
  const generateLinkMock = vi.fn();
  return {
    generateLinkMock,
    createServiceClientMock: vi.fn(() => ({ auth: { admin: { generateLink: generateLinkMock } } })),
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: createServiceClientMock }));

async function importRoute() {
  const mod = await import('./route');
  return mod.POST;
}

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/auth/recover', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

const validBody = { email: 'user@x.com', locale: 'pt' };

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.com';
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'SolaX Power <noreply@mail.solaxpowerbrasil.cloud>';
  process.env.RESEND_RECOVERY_TEMPLATE_ID = 'template-2';
  delete process.env.SUPABASE_INTERNAL_URL;
  generateLinkMock.mockReset();
  createServiceClientMock.mockClear();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe('POST /api/auth/recover: validation', () => {
  it('rejects an invalid JSON body', async () => {
    const POST = await importRoute();
    const response = await POST(new Request('http://localhost/api/auth/recover', { method: 'POST', body: '{not json' }));
    expect(response.status).toBe(400);
  });

  it('rejects a missing email', async () => {
    const POST = await importRoute();
    const response = await POST(makeRequest({ ...validBody, email: '' }));
    expect(response.status).toBe(400);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('rejects a missing locale', async () => {
    const POST = await importRoute();
    const response = await POST(makeRequest({ ...validBody, locale: '' }));
    expect(response.status).toBe(400);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('returns 500 when a required server env var is missing', async () => {
    delete process.env.RESEND_RECOVERY_TEMPLATE_ID;
    const POST = await importRoute();
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/recover: happy path', () => {
  it('generates the recovery link through /auth/callback and emails it via the Resend template', async () => {
    generateLinkMock.mockResolvedValue({
      data: {
        properties: { hashed_token: 'abc' },
        user: { user_metadata: { full_name: 'Fulano' } },
      },
      error: null,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ id: 'email-1' }) });

    const POST = await importRoute();
    const response = await POST(
      makeRequest(validBody, { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'calculadora.solaxpowerbrasil.cloud' })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(generateLinkMock).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'user@x.com',
      options: {
        redirectTo: 'https://calculadora.solaxpowerbrasil.cloud/pt/auth/callback?next=%2Fpt%2Freset-password',
      },
    });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentPayload = JSON.parse(init.body as string);
    expect(sentPayload).toEqual({
      from: 'SolaX Power <noreply@mail.solaxpowerbrasil.cloud>',
      to: ['user@x.com'],
      template: {
        id: 'template-2',
        // Our own /auth/callback link (verifyOtp), not GoTrue's action_link
        // — that one needs a code_verifier no admin-generated link ever has.
        variables: {
          name: 'Fulano',
          reset_password_url: 'https://calculadora.solaxpowerbrasil.cloud/pt/auth/callback?token_hash=abc&type=recovery&next=%2Fpt%2Freset-password',
        },
      },
    });
  });

  it('falls back to an empty name when the user has none in metadata', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: 'abc' }, user: { user_metadata: {} } },
      error: null,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });

    const POST = await importRoute();
    await POST(makeRequest(validBody));

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentPayload = JSON.parse(init.body as string);
    expect(sentPayload.template.variables.name).toBe('');
  });

  it('uses SUPABASE_INTERNAL_URL for the admin client when set, instead of the public URL', async () => {
    process.env.SUPABASE_INTERNAL_URL = 'http://kong:8000';
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: 'abc' }, user: { user_metadata: {} } },
      error: null,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });

    const POST = await importRoute();
    await POST(makeRequest(validBody));

    expect(createServiceClientMock).toHaveBeenCalledWith('http://kong:8000', 'service-role-key', expect.anything());
  });
});

describe('POST /api/auth/recover: error handling', () => {
  it('does not leak whether the email has an account, and sends no email', async () => {
    generateLinkMock.mockResolvedValue({
      data: null,
      error: { code: 'user_not_found', message: 'User not found' },
    });

    const POST = await importRoute();
    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a generic, sanitized error when generateLink fails for another reason', async () => {
    generateLinkMock.mockResolvedValue({ data: null, error: { code: 'unexpected_failure', message: 'internal secret detail' } });

    const POST = await importRoute();
    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).not.toContain('internal secret detail');
  });

  it('returns a generic error when Resend fails', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: 'abc' }, user: { user_metadata: {} } },
      error: null,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'resend down' }),
    });

    const POST = await importRoute();
    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).not.toContain('resend down');
  });
});
