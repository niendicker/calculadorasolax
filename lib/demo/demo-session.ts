import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEMO_SESSION_COOKIE = 'solax-demo-session';
export const DEMO_SESSION_MAX_AGE = 2 * 60 * 60;

function getSecret() {
  const secret = process.env.DEMO_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('DEMO_SESSION_SECRET must contain at least 32 characters.');
  return secret;
}

function sign(payload: string) {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createDemoSessionToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + DEMO_SESSION_MAX_AGE })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function isValidDemoSessionToken(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const expected = sign(payload);
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return false;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof decoded.exp === 'number' && decoded.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}
