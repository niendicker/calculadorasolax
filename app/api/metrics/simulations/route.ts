import { NextResponse } from 'next/server';
import { recordSimulation } from '@/lib/data/calculation-repository';
import { parsePendingSimulationPayload } from '@/lib/metrics-queue';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Métrica inválida.' }, { status: 400 });
  }

  const parsedPayload = parsePendingSimulationPayload(payload);
  if (!parsedPayload) return NextResponse.json({ error: 'Métrica inválida.' }, { status: 400 });

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { error } = await recordSimulation(supabase, { ...parsedPayload, user_id: userData.user.id });
  if (error) return NextResponse.json({ error: 'Não foi possível registrar a métrica.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
