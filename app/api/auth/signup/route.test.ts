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

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: 'nova@x.com',
  password: 'segredo123',
  name: 'Fulano',
  phone: '11999999999',
  termsAccepted: true,
  locale: 'pt',
  redirectTo: '/pt',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.com';
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'SolaX Power <noreply@mail.solaxpowerbrasil.cloud>';
  process.env.RESEND_CONFIRM_TEMPLATE_ID = 'template-1';
  delete process.env.SUPABASE_INTERNAL_URL;
  generateLinkMock.mockReset();
  createServiceClientMock.mockClear();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe('POST /api/auth/signup: validation', () => {
  it('rejects an invalid JSON body', async () => {
    const POST = await importRoute();
    const response = await POST(new Request('http://localhost/api/auth/signup', { method: 'POST', body: '{not json' }));
    expect(response.status).toBe(400);
  });

  it('rejects a missing email', async () => {
    const POST = await importRoute();
    const response = await POST(makeRequest({ ...validBody, email: '' }));
    expect(response.status).toBe(400);
  });

  it('rejects a missing password', async () => {
    const POST = await importRoute();
    const response = await POST(makeRequest({ ...validBody, password: '' }));
    expect(response.status).toBe(400);
  });

  it('rejects when terms were not accepted, without calling Supabase or Resend', async () => {
    const POST = await importRoute();
    const response = await POST(makeRequest({ ...validBody, termsAccepted: false }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/Termos de Uso/);
    expect(generateLinkMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 500 when a required server env var is missing', async () => {
    delete process.env.RESEND_CONFIRM_TEMPLATE_ID;
    const POST = await importRoute();
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/signup: happy path', () => {
  it('generates the signup link with the same metadata AuthPanel used to send directly, then emails our own /auth/callback link via the Resend template', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: 'abc' } },
      error: null,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ id: 'email-1' }) });

    const POST = await importRoute();
    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(generateLinkMock).toHaveBeenCalledWith({
      type: 'signup',
      email: 'nova@x.com',
      password: 'segredo123',
      options: {
        data: { full_name: 'Fulano', phone: '11999999999', role: 'user', terms_accepted: true },
        redirectTo: 'http://localhost/pt/auth/callback?next=%2Fpt',
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer resend-key' }),
      })
    );
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentPayload = JSON.parse(init.body as string);
    expect(sentPayload).toEqual({
      from: 'SolaX Power <noreply@mail.solaxpowerbrasil.cloud>',
      to: ['nova@x.com'],
      template: {
        id: 'template-1',
        // Our own /auth/callback link (verifyOtp), not GoTrue's action_link
        // — that one needs a code_verifier no admin-generated link ever has.
        variables: {
          name: 'Fulano',
          activation_url: 'http://localhost/pt/auth/callback?token_hash=abc&type=signup&next=%2Fpt',
        },
      },
    });
  });

  it('uses SUPABASE_INTERNAL_URL for the admin client when set, instead of the public URL', async () => {
    process.env.SUPABASE_INTERNAL_URL = 'http://kong:8000';
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: 'abc' } },
      error: null,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });

    const POST = await importRoute();
    await POST(makeRequest(validBody));

    expect(createServiceClientMock).toHaveBeenCalledWith('http://kong:8000', 'service-role-key', expect.anything());
  });
});

describe('POST /api/auth/signup: error handling', () => {
  it('does not leak whether the email is already registered, and sends no email', async () => {
    generateLinkMock.mockResolvedValue({
      data: null,
      error: { code: 'email_exists', message: 'Email address already registered by another user' },
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

  it('does not delete the created user and returns a generic error when Resend fails', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: 'abc' } },
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
    expect(body.error).toContain('Cadastro criado');
    expect(body.error).not.toContain('resend down');
  });

  it('never logs the password', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    generateLinkMock.mockResolvedValue({ data: null, error: { code: 'unexpected_failure', message: 'boom' } });

    const POST = await importRoute();
    await POST(makeRequest(validBody));

    for (const call of consoleSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(validBody.password);
    }
    consoleSpy.mockRestore();
  });
});
