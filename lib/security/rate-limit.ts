import { NextResponse } from 'next/server';

type RateLimitState = { count: number; resetAt: number };
type RateLimitOptions = { limit: number; windowMs: number };

const states = new Map<string, RateLimitState>();

export function getRequestClientKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return request.headers.get('x-real-ip')?.trim() || forwarded || 'unknown-client';
}

export function consumeRateLimit(key: string, { limit, windowMs }: RateLimitOptions, now = Date.now()) {
  const current = states.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    states.set(key, next);
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  current.count += 1;
  const remaining = Math.max(0, limit - current.count);
  return {
    allowed: current.count <= limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'Muitas tentativas. Tente novamente mais tarde.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds), 'Cache-Control': 'no-store' } }
  );
}

/** Test-only reset. Production code should never need to clear the limiter. */
export function resetRateLimits() {
  states.clear();
}
