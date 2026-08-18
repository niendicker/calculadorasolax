import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params;
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  let next = requestUrl.searchParams.get('next') ?? `/${locale}`;

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    if (next === `/${locale}` && data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.role === 'admin') next = `/${locale}/admin`;
    }
  }

  // request.url reflects whatever host Next.js itself sees behind the
  // reverse proxy (e.g. https://localhost:3000, the app's own internal
  // port) — not the public domain the browser actually used. Every GoTrue
  // email link (signup confirmation, password recovery) points here, so
  // building the redirect straight from requestUrl.origin silently sent
  // every one of them to a dead https://localhost:3000 URL in production.
  // The reverse proxy sets x-forwarded-proto/-host for the real origin;
  // falling back to requestUrl.origin keeps local dev (no proxy) working.
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const origin = forwardedProto && forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin;

  return NextResponse.redirect(new URL(next, origin));
}
