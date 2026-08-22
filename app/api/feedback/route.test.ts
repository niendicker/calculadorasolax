import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, createClientMock, sendResendEmailMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  createClientMock: vi.fn(),
  sendResendEmailMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/email/resend', () => ({ sendResendEmail: sendResendEmailMock }));

async function importRoute() {
  const mod = await import('./route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/feedback', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const originalEnv = { ...process.env };

beforeEach(() => {
  createClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.com' } } });
  sendResendEmailMock.mockResolvedValue({ id: 'email-1' });
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'SolaX <noreply@example.com>';
  process.env.FEEDBACK_TO_EMAIL = 'produto@example.com';
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('POST /api/feedback', () => {
  it('requires authentication', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const response = await (await importRoute())(makeRequest({ kind: 'bug', message: 'Algo não funcionou.' }));
    expect(response.status).toBe(401);
    expect(sendResendEmailMock).not.toHaveBeenCalled();
  });

  it('validates the contribution and sends it internally through Resend', async () => {
    const response = await (await importRoute())(makeRequest({ kind: 'bug', message: 'O botão de cálculo não responde.' }));
    expect(response.status).toBe(200);
    expect(sendResendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: ['produto@example.com'],
      reply_to: ['user@example.com'],
      subject: '[Calculadora] Bug ou problema',
    }));
  });

  it('rejects messages that are too short', async () => {
    const response = await (await importRoute())(makeRequest({ kind: 'suggestion', message: 'curto' }));
    expect(response.status).toBe(400);
    expect(sendResendEmailMock).not.toHaveBeenCalled();
  });
});
