import { beforeEach, describe, expect, it } from 'vitest';
import { consumeRateLimit, resetRateLimits } from './rate-limit';

describe('rate limiter', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the configured limit and rejects the next request', () => {
    const options = { limit: 2, windowMs: 60_000 };
    expect(consumeRateLimit('client', options, 1_000).allowed).toBe(true);
    expect(consumeRateLimit('client', options, 1_001).allowed).toBe(true);
    expect(consumeRateLimit('client', options, 1_002).allowed).toBe(false);
  });

  it('starts a new window after expiry', () => {
    const options = { limit: 1, windowMs: 1_000 };
    expect(consumeRateLimit('client', options, 1_000).allowed).toBe(true);
    expect(consumeRateLimit('client', options, 2_000).allowed).toBe(true);
  });
});
