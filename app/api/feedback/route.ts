import { NextResponse } from 'next/server';
import { sendResendEmail } from '@/lib/email/resend';
import { createClient } from '@/lib/supabase/server';

type FeedbackKind = 'bug' | 'suggestion';

interface FeedbackInput {
  kind?: FeedbackKind;
  message?: string;
}

const kindLabels: Record<FeedbackKind, string> = {
  bug: 'Bug ou problema',
  suggestion: 'Sugestão de melhoria',
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let input: FeedbackInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const kind = input.kind;
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (!kind || !kindLabels[kind]) return NextResponse.json({ error: 'Selecione o tipo de contribuição.' }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ error: 'Descreva sua contribuição com pelo menos 10 caracteres.' }, { status: 400 });
  if (message.length > 5000) return NextResponse.json({ error: 'A contribuição deve ter no máximo 5.000 caracteres.' }, { status: 400 });

  const recipient = process.env.FEEDBACK_TO_EMAIL;
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !recipient) {
    return NextResponse.json({ error: 'Envio de feedback não está configurado no servidor.' }, { status: 500 });
  }

  try {
    await sendResendEmail({
      from: process.env.RESEND_FROM_EMAIL,
      to: [recipient],
      reply_to: user.email ? [user.email] : undefined,
      subject: `[Calculadora] ${kindLabels[kind]}`,
      text: [
        `Tipo: ${kindLabels[kind]}`,
        `Versão: ${process.env.NEXT_PUBLIC_APP_VERSION ?? 'desconhecida'}`,
        `Usuário: ${user.email ?? user.id}`,
        `ID: ${user.id}`,
        '',
        message,
      ].join('\n'),
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível enviar sua contribuição. Tente novamente.' }, { status: 502 });
  }

  return NextResponse.json({ status: 'sent' });
}
