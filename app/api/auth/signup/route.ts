import { NextResponse } from 'next/server';
import { getPublicOrigin } from '@/lib/auth/request-origin';
import { createServiceClient } from '@/lib/supabase/service';
import { sendResendEmail } from '@/lib/email/resend';
import { CURRENT_LEGAL_DOCUMENT_VERSION } from '@/lib/legal-documents';
import { consumeRateLimit, getRequestClientKey, rateLimitResponse } from '@/lib/security/rate-limit';

interface SignupInput {
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
  termsAccepted?: boolean;
  locale?: string;
  redirectTo?: string;
}

/** Server-side signup: creates the user via Supabase Admin's generateLink
 *  (same mechanics as auth.signUp() — creation, password rules, the
 *  handle_new_user trigger — just without GoTrue auto-sending its own
 *  unstyled confirmation email) and hands the resulting action_link to
 *  Resend's existing "confirm signup" template instead. Never runs
 *  supabase.auth.signUp() — that would create a second, redundant user
 *  creation attempt against the same email. */
export async function POST(request: Request) {
  const rate = consumeRateLimit(`signup:${getRequestClientKey(request)}`, { limit: 20, windowMs: 15 * 60_000 });
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  let input: SignupInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const email = (input.email ?? '').trim();
  const password = input.password ?? '';
  const name = (input.name ?? '').trim();
  const phone = (input.phone ?? '').trim();
  const locale = (input.locale ?? '').trim();

  if (!email || !password || !locale) {
    return NextResponse.json({ error: 'Preencha email, senha e os demais campos obrigatórios.' }, { status: 400 });
  }
  // The client already blocks submission without this checked (see
  // AuthPanel's own guard) — re-checked here since this endpoint could be
  // called directly, and accepting a signup without consent server-side
  // would defeat that guard entirely.
  if (!input.termsAccepted) {
    return NextResponse.json({ error: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[api/auth/signup] SUPABASE_SERVICE_ROLE_KEY não configurada.');
    return NextResponse.json({ error: 'Cadastro não está disponível no momento. Tente novamente mais tarde.' }, { status: 500 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !process.env.RESEND_CONFIRM_TEMPLATE_ID) {
    console.error('[api/auth/signup] Envio do email de confirmação não está configurado (RESEND_*).');
    return NextResponse.json({ error: 'Cadastro não está disponível no momento. Tente novamente mais tarde.' }, { status: 500 });
  }

  const supabaseAdmin = createServiceClient();

  // Mirrors AuthPanel's old emailRedirectTo exactly (same /auth/callback,
  // same locale/next), just built server-side from the request's own origin
  // instead of window.location — an env-fixed redirect URL would drop
  // per-locale routing and the caller's original "next" destination.
  const origin = getPublicOrigin(request);
  const redirectPath = (input.redirectTo ?? '').trim() || `/${locale}`;
  const emailRedirectTo = `${origin}/${locale}/auth/callback?next=${encodeURIComponent(redirectPath)}`;

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: {
      // Same 4 keys AuthPanel's signUp() used to send — handle_new_user
      // (0080/0082) reads full_name/phone/terms_accepted from
      // raw_user_meta_data regardless of which API created the auth.users
      // row; role is included for parity but the trigger ignores it (0076
      // hardened it to always insert 'user' server-side).
      data: {
        full_name: name,
        phone,
        role: 'user',
        terms_accepted: true,
        terms_accepted_version: CURRENT_LEGAL_DOCUMENT_VERSION,
      },
      redirectTo: emailRedirectTo,
    },
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    // email_exists/user_already_exists must not surface as a distinct
    // message — otherwise this becomes an account-enumeration oracle. No
    // email is sent in this case (nothing new to confirm); the client sees
    // the same generic success response as a real signup.
    if (linkError && ['email_exists', 'user_already_exists'].includes(linkError.code ?? '')) {
      console.warn('[api/auth/signup] signup attempted for an email that already has an account');
      return NextResponse.json({ ok: true });
    }
    console.error('[api/auth/signup] generateLink failed', linkError);
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' }, { status: 502 });
  }

  // Points at our own /auth/callback (verifyOtp) instead of sending
  // GoTrue's action_link — that link's ?code= requires a code_verifier only
  // a browser-initiated PKCE handshake ever sets, which never happens here
  // since generateLink runs entirely server-side.
  const activationUrl = `${origin}/${locale}/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=signup&next=${encodeURIComponent(redirectPath)}`;

  try {
    await sendResendEmail({
        from: process.env.RESEND_FROM_EMAIL,
        to: [email],
        // No `subject` override — the template already has its own.
        template: {
          id: process.env.RESEND_CONFIRM_TEMPLATE_ID,
          variables: { name: name || '', activation_url: activationUrl },
        },
    });
  } catch (cause) {
    // The user was already created by generateLink above — per spec, never
    // delete it here. The resend-confirmation flow is handled separately;
    // for now this is a logged incident and a generic error to the client.
    console.error('[api/auth/signup] Resend send failed for a created-but-unconfirmed user', cause);
    return NextResponse.json(
      { error: 'Cadastro criado, mas não foi possível enviar o email de confirmação. Tente novamente em instantes.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
