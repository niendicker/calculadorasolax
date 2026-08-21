import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoSessionToken, isValidDemoSessionToken } from './demo-session';

const NOW = 1_700_000_000_000;

describe('demo session token', () => {
  beforeEach(() => {
    process.env.DEMO_SESSION_SECRET = 'a-secret-that-is-long-enough-for-tests-123';
  });

  it('creates a token that validates before expiry', () => {
    const token = createDemoSessionToken(NOW);
    expect(isValidDemoSessionToken(token, NOW + 60_000)).toBe(true);
  });

  it('rejects tampered and expired tokens', () => {
    const token = createDemoSessionToken(NOW);
    const [payload, signature] = token.split('.');
    expect(isValidDemoSessionToken(`${payload}.${signature.slice(0, -1)}x`, NOW)).toBe(false);
    expect(isValidDemoSessionToken(token, NOW + 2 * 60 * 60 * 1000)).toBe(false);
  });

  it('rejects tokens when the server secret is not configured', () => {
    delete process.env.DEMO_SESSION_SECRET;
    expect(isValidDemoSessionToken('invalid')).toBe(false);
  });
});
