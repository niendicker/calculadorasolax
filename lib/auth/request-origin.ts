/** request.url reflects whatever host Next.js itself sees behind the
 *  reverse proxy (e.g. https://localhost:3000, the app's own internal
 *  port) — not the public domain the browser actually used. Every GoTrue
 *  email link (signup confirmation, password recovery) is built from this,
 *  so falling back to requestUrl.origin alone silently sent every one of
 *  them to a dead https://localhost:3000 URL in production. The reverse
 *  proxy sets x-forwarded-proto/-host for the real origin; falling back to
 *  requestUrl.origin keeps local dev (no proxy) working. */
export function getPublicOrigin(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedProto && forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(request.url).origin;
}
