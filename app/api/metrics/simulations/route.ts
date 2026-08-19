import { NextResponse } from 'next/server';
import { recordSimulation } from '@/lib/data/calculation-repository';
import { createClient } from '@/lib/supabase/server';
import type { PendingSimulationPayload } from '@/lib/metrics-queue';

export async function POST(request: Request) {
  let payload: PendingSimulationPayload;
  try {
    payload = (await request.json()) as PendingSimulationPayload;
  } catch {
    return NextResponse.json({ error: 'Métrica inválida.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { error } = await recordSimulation(supabase, { ...payload, user_id: userData.user.id });
  if (error) return NextResponse.json({ error: 'Não foi possível registrar a métrica.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
