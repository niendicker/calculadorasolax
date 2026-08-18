import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getPublicOrigin } from '@/lib/auth/request-origin';

interface RecoverInput {
  email?: string;
  locale?: string;
}

/** Server-side password recovery: generates the reset link via Supabase
 *  Admin's generateLink (same mechanics as auth.resetPasswordForEmail(),
 *  just without GoTrue auto-sending its own unstyled email) and hands the
 *  resulting action_link to Resend's recovery template instead. */
export async function POST(request: Request) {
  let input: RecoverInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const email = (input.email ?? '').trim();
  const locale = (input.locale ?? '').trim();

  if (!email || !locale) {
    return NextResponse.json({ error: 'Informe o email.' }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[api/auth/recover] SUPABASE_SERVICE_ROLE_KEY não configurada.');
    return NextResponse.json({ error: 'Recuperação de senha não está disponível no momento. Tente novamente mais tarde.' }, { status: 500 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !process.env.RESEND_RECOVERY_TEMPLATE_ID) {
    console.error('[api/auth/recover] Envio do email de recuperação não está configurado (RESEND_*).');
    return NextResponse.json({ error: 'Recuperação de senha não está disponível no momento. Tente novamente mais tarde.' }, { status: 500 });
  }

  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAdmin = createServiceClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Same /auth/callback indirection AuthPanel used to send straight to
  // resetPasswordForEmail() — its exchangeCodeForSession(code) has to run
  // before ResetPasswordPanel's updateUser() has a session to act on.
  const origin = getPublicOrigin(request);
  const redirectTo = `${origin}/${locale}/auth/callback?next=${encodeURIComponent(`/${locale}/reset-password`)}`;

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });

  if (linkError || !linkData?.properties?.action_link) {
    // user_not_found must not surface as a distinct message — otherwise
    // this becomes an account-enumeration oracle. No email is sent in this
    // case; the client sees the same generic success response as a real
    // recovery request.
    if (linkError && linkError.code === 'user_not_found') {
      console.warn('[api/auth/recover] recovery attempted for an email with no account');
      return NextResponse.json({ ok: true });
    }
    console.error('[api/auth/recover] generateLink failed', linkError);
    return NextResponse.json({ error: 'Não foi possível concluir a recuperação. Tente novamente.' }, { status: 502 });
  }

  const resetPasswordUrl = linkData.properties.action_link;
  const name = linkData.user?.user_metadata?.full_name ?? '';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [email],
        template: {
          id: process.env.RESEND_RECOVERY_TEMPLATE_ID,
          variables: { name, reset_password_url: resetPasswordUrl },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || `Falha ao enviar email (HTTP ${response.status}).`);
  } catch (cause) {
    console.error('[api/auth/recover] Resend send failed', cause);
    return NextResponse.json(
      { error: 'Não foi possível enviar o email de recuperação. Tente novamente em instantes.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
