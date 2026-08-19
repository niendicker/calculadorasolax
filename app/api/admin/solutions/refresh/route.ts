import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getProfileRole } from '@/lib/data/admin-repository';

// PostgREST encodes `.in()` values into the DELETE URL. Updating the whole
// generated catalog in one request can therefore exceed the proxy URI limit.
const DELETE_BATCH_SIZE = 50;

export async function POST(request: Request) {
  let body: { generatedSolutions?: unknown; previousIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  if (!Array.isArray(body.generatedSolutions) || !Array.isArray(body.previousIds)) {
    return NextResponse.json({ error: 'Dados de combinações inválidos.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { role, error: profileError } = await getProfileRole(supabase, user.id);
  if (profileError || role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Supabase não está configurado no servidor.' }, { status: 500 });
  }
  const previousIds = body.previousIds.filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (previousIds.length > 0) {
    for (let offset = 0; offset < previousIds.length; offset += DELETE_BATCH_SIZE) {
      const batch = previousIds.slice(offset, offset + DELETE_BATCH_SIZE);
      const { error } = await service.from('approved_solutions').delete().in('id', batch);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { error: upsertError } = await service
    .from('approved_solutions')
    .upsert(body.generatedSolutions, { onConflict: 'solution_code' });
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
