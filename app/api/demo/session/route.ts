import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createDemoSessionToken, DEMO_SESSION_COOKIE, DEMO_SESSION_MAX_AGE } from '@/lib/demo/demo-session';

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function POST() {
  if (!(await requireUser())) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  try {
    const cookieStore = await cookies();
    cookieStore.set(DEMO_SESSION_COOKIE, createDemoSessionToken(), {
      httpOnly: true,
      maxAge: DEMO_SESSION_MAX_AGE,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/demo/session] unable to create demo session', error);
    return NextResponse.json({ error: 'Não foi possível iniciar o exemplo.' }, { status: 503 });
  }
}

export async function DELETE() {
  if (!(await requireUser())) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return NextResponse.json({ ok: true });
}
