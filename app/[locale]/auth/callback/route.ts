import { createClient } from '@/lib/supabase/server';
import { getPublicOrigin } from '@/lib/auth/request-origin';
import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { isSupportedLocale, safeLocalRedirect } from '@/lib/auth/redirect-safety';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return NextResponse.redirect(new URL('/', getPublicOrigin(request)));
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  let next = safeLocalRedirect(requestUrl.searchParams.get('next') ?? undefined, `/${locale}`);

  if (tokenHash || code) {
    const supabase = await createClient();
    // Links we build ourselves (signup/recovery emails via Resend) carry a
    // token_hash from Supabase Admin's generateLink, not a PKCE code —
    // verifyOtp() establishes the session directly from it, no
    // code_verifier needed. exchangeCodeForSession() stays as a fallback
    // for links GoTrue itself issues with a ?code= param, which does
    // require a code_verifier the browser set up beforehand — something an
    // admin-generated link never has, since no browser ever started that
    // PKCE handshake.
    const { data } = tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : await supabase.auth.exchangeCodeForSession(code!);

    if (next === `/${locale}` && data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.role === 'admin') next = `/${locale}/admin`;
    }
  }

  return NextResponse.redirect(new URL(next, getPublicOrigin(request)));
}
