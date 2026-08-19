export const QUOTE_SHARE_TTL_DAYS = 7;
const QUOTE_SHARE_TTL_MS = QUOTE_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000;

export function isQuoteShareExpired(createdAt: string, now = Date.now()) {
  const createdAtMs = Date.parse(createdAt);
  return !Number.isFinite(createdAtMs) || now >= createdAtMs + QUOTE_SHARE_TTL_MS;
}
