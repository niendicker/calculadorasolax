import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

interface RequestInput {
  supplierIds?: string[];
  message?: string;
}

/** Minimum gap between two quote-request sends for the same project — same
 * abuse-guard idea as notify-supplier-email's SUPPLIER_EMAIL_COOLDOWN_MS,
 * just scoped per project instead of per supplier (this can fan out to
 * several suppliers at once, so a per-supplier cooldown would still let
 * someone spam by picking a different supplier each time). */
const QUOTE_REQUEST_COOLDOWN_MS = 10 * 60 * 1000;

/** Emails one or more suppliers a request-for-quote for a saved project's
 *  solution, on behalf of the requesting seller — the "Solicitar orçamento
 *  ao fornecedor" action on the Projetos page. Always CCs the requesting
 *  user so they have a record to follow up the conversation from. Unlike
 *  notify-supplier-email (which rebuilds its own PDF), the email body here
 *  is built client-side (buildSupplierQuoteRequestEmail) and passed through
 *  as-is — this route only handles auth, the supplier email lookup, and
 *  sending/logging. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let input: RequestInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }
  const supplierIds = Array.isArray(input.supplierIds) ? input.supplierIds.filter((id) => typeof id === 'string') : [];
  const message = (input.message ?? '').trim();
  if (supplierIds.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos um fornecedor.' }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: 'A mensagem para o fornecedor está vazia.' }, { status: 400 });

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({ error: 'Envio de email não está configurado no servidor.' }, { status: 500 });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single();
  if (projectError || !project) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });

  const { data: lastRequestEvent } = await supabase
    .from('project_events')
    .select('created_at')
    .eq('project_id', projectId)
    .eq('event_type', 'supplier_quote_requested')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastRequestEvent) {
    const elapsedMs = Date.now() - new Date(lastRequestEvent.created_at).getTime();
    if (elapsedMs < QUOTE_REQUEST_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((QUOTE_REQUEST_COOLDOWN_MS - elapsedMs) / 1000);
      const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);
      return NextResponse.json(
        { error: `Aguarde ${retryAfterMinutes} min antes de solicitar outro orçamento para este projeto.`, retryAfterSeconds },
        { status: 429 }
      );
    }
  }

  const { data: profile } = await supabase.from('profiles').select('full_name, company_name, email').eq('id', user.id).single();
  const userEmail = profile?.email || user.email;
  if (!userEmail) return NextResponse.json({ error: 'Não foi possível identificar seu email.' }, { status: 422 });
  const requesterName = profile?.company_name?.trim() || profile?.full_name?.trim() || 'Cliente';

  // Same "fornecedores deste usuário" scoping the picker in
  // SupplierQuoteRequestModal uses client-side (active + ordering_enabled +
  // default-for-all-or-preferred) — reapplied here because the lookup below
  // needs the service role (suppliers.email isn't exposed to the anon key),
  // which would otherwise let a caller quote-request *any* supplier id,
  // including ones this user isn't even supposed to see.
  const { data: preferences } = await supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', user.id);
  const preferredIds = new Set(((preferences ?? []) as { supplier_id: string }[]).map((row) => row.supplier_id));

  const service = createServiceClient();
  const { data: suppliers } = await service
    .from('suppliers')
    .select('id, name, email, is_default_for_all')
    .eq('active', true)
    .eq('ordering_enabled', true)
    .in('id', supplierIds);
  const allowedSuppliers = ((suppliers ?? []) as { id: string; name: string; email: string | null; is_default_for_all: boolean }[]).filter(
    (supplier) => supplier.is_default_for_all || preferredIds.has(supplier.id)
  );
  const suppliersWithEmail = allowedSuppliers.filter(
    (supplier): supplier is { id: string; name: string; email: string; is_default_for_all: boolean } => Boolean(supplier.email)
  );
  if (suppliersWithEmail.length === 0) {
    return NextResponse.json({ error: 'Nenhum dos fornecedores selecionados tem email cadastrado.' }, { status: 409 });
  }

  const sentTo: string[] = [];
  const failedTo: string[] = [];

  for (const supplier of suppliersWithEmail) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL,
          to: [supplier.email],
          cc: [userEmail],
          subject: `Solicitação de cotação — ${requesterName} — ${project.name}`,
          text: message,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      sentTo.push(supplier.name);
    } catch {
      failedTo.push(supplier.name);
    }
  }

  if (sentTo.length === 0) {
    return NextResponse.json({ error: 'Não foi possível enviar o email para nenhum fornecedor.' }, { status: 502 });
  }

  await supabase.from('project_events').insert({
    project_id: projectId,
    actor_id: user.id,
    event_type: 'supplier_quote_requested',
    message: `Email enviado para: ${sentTo.join(', ')}${failedTo.length > 0 ? ` (falhou para: ${failedTo.join(', ')})` : ''}.`,
  });

  return NextResponse.json({ status: 'sent', sentTo, failedTo });
}
