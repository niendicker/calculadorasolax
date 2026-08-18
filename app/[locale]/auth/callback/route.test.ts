import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exchangeCodeForSessionMock, fromMock, createServerClientMock } = vi.hoisted(() => {
  const exchangeCodeForSessionMock = vi.fn();
  const fromMock = vi.fn();
  return {
    exchangeCodeForSessionMock,
    fromMock,
    createServerClientMock: vi.fn(() => ({
      auth: { exchangeCodeForSession: exchangeCodeForSessionMock },
      from: fromMock,
    })),
  };
});

vi.mock('@/lib/supabase/server', () => ({ createClient: createServerClientMock }));

async function importRoute() {
  const mod = await import('./route');
  return mod.GET;
}

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://localhost:3000${path}`, { headers });
}

const routeParams = { params: Promise.resolve({ locale: 'pt' }) };

function singleResult(data: unknown) {
  return { eq: () => ({ maybeSingle: () => Promise.resolve({ data, error: null }) }) };
}

beforeEach(() => {
  exchangeCodeForSessionMock.mockReset();
  fromMock.mockReset();
});

describe('GET /[locale]/auth/callback: origin resolution', () => {
  it('redirects using x-forwarded-proto/-host when set, not the internal request origin', async () => {
    const GET = await importRoute();
    const response = await GET(
      makeRequest('/pt/auth/callback?next=%2Fpt%2Freset-password', {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'calculadora.solaxpowerbrasil.cloud',
      }),
      routeParams
    );

    expect(response.headers.get('location')).toBe('https://calculadora.solaxpowerbrasil.cloud/pt/reset-password');
  });

  it('falls back to the request origin when there are no forwarded headers (local dev, no proxy)', async () => {
    const GET = await importRoute();
    const response = await GET(makeRequest('/pt/auth/callback?next=%2Fpt%2Freset-password'), routeParams);

    expect(response.headers.get('location')).toBe('https://localhost:3000/pt/reset-password');
  });
});

describe('GET /[locale]/auth/callback: code exchange', () => {
  it('exchanges the code and redirects to the default locale home when there is no admin profile', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    fromMock.mockReturnValue({ select: () => singleResult({ role: 'user' }) });

    const GET = await importRoute();
    const response = await GET(
      makeRequest('/pt/auth/callback?code=abc', { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'calculadora.solaxpowerbrasil.cloud' }),
      routeParams
    );

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith('abc');
    expect(response.headers.get('location')).toBe('https://calculadora.solaxpowerbrasil.cloud/pt');
  });

  it('redirects an admin user to /admin instead of the default home', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    fromMock.mockReturnValue({ select: () => singleResult({ role: 'admin' }) });

    const GET = await importRoute();
    const response = await GET(
      makeRequest('/pt/auth/callback?code=abc', { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'calculadora.solaxpowerbrasil.cloud' }),
      routeParams
    );

    expect(response.headers.get('location')).toBe('https://calculadora.solaxpowerbrasil.cloud/pt/admin');
  });

  it('does not check for an admin profile when "next" is an explicit non-default target', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const GET = await importRoute();
    const response = await GET(
      makeRequest('/pt/auth/callback?code=abc&next=%2Fpt%2Freset-password', {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'calculadora.solaxpowerbrasil.cloud',
      }),
      routeParams
    );

    expect(fromMock).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://calculadora.solaxpowerbrasil.cloud/pt/reset-password');
  });
});

describe('GET /[locale]/auth/callback: no code (e.g. an expired/invalid link)', () => {
  it('skips the code exchange and redirects straight to "next", preserving the GoTrue error via the URL fragment', async () => {
    const GET = await importRoute();
    const response = await GET(
      makeRequest(
        '/pt/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&next=%2Fpt%2Freset-password',
        { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'calculadora.solaxpowerbrasil.cloud' }
      ),
      routeParams
    );

    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://calculadora.solaxpowerbrasil.cloud/pt/reset-password');
  });
});
