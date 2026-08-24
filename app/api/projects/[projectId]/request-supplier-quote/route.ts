import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendResendEmail } from '@/lib/email/resend';
import {
  findProjectForQuote,
  findRequesterProfile,
  listAllowedSupplierContacts,
  listPreferredSupplierIds,
  recordSupplierQuoteRequest,
} from '@/lib/data/supplier-quote-repository';

interface RequestInput {
  supplierIds?: string[];
  message?: string;
  idempotencyKey?: string;
}

const MAX_SUPPLIERS_PER_REQUEST = 2;

type ClaimRow = {
  request_id: string;
  supplier_id: string;
  status: 'sending' | 'sent' | 'failed' | 'cooldown' | 'pending';
  claimed: boolean;
  retry_at: string | null;
  claim_token: string | null;
};

type SupplierResult = {
  supplierId: string;
  supplierName: string;
  status: 'sent' | 'failed' | 'cooldown' | 'sending' | 'pending';
  sentAt?: string;
  retryAt?: string;
};

/** The database claim function owns project access, supplier eligibility,
 * quota, cooldown and concurrency. This route only sends rows that it
 * exclusively claimed and persists the provider result afterwards. */
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

  const supplierIds = Array.isArray(input.supplierIds)
    ? [...new Set(input.supplierIds.filter((id): id is string => typeof id === 'string'))]
    : [];
  const message = (input.message ?? '').trim();
  if (supplierIds.length === 0) return NextResponse.json({ error: 'Selecione ao menos um fornecedor.' }, { status: 400 });
  if (supplierIds.length > MAX_SUPPLIERS_PER_REQUEST) {
    return NextResponse.json({ error: 'Você pode selecionar no máximo 2 fornecedores.' }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: 'A mensagem para o fornecedor está vazia.' }, { status: 400 });
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({ error: 'Envio de email não está configurado no servidor.' }, { status: 500 });
  }

  const project = await findProjectForQuote(supabase, projectId);
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });

  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return NextResponse.json({ error: 'Identificador de solicitação inválido.' }, { status: 400 });
  }

  const profile = await findRequesterProfile(supabase, user.id);
  const userEmail = profile?.email || user.email;
  if (!userEmail) return NextResponse.json({ error: 'Não foi possível identificar seu email.' }, { status: 422 });
  const requesterName = profile?.company_name?.trim() || profile?.full_name?.trim() || 'Cliente';

  const { data: claimRows, error: claimError } = await supabase.rpc('claim_supplier_quote_requests', {
    p_project_id: projectId,
    p_supplier_ids: supplierIds,
    p_idempotency_key: idempotencyKey,
  });
  if (claimError) {
    const code = claimError.message;
    if (code.includes('supplier_limit')) return NextResponse.json({ error: 'Você pode selecionar no máximo 2 fornecedores.' }, { status: 400 });
    if (code.includes('daily_quote_quota')) {
      return NextResponse.json({ error: 'Você atingiu o limite de solicitações de orçamento nas últimas 24 horas.' }, { status: 429 });
    }
    if (code.includes('project_access_denied')) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
    if (code.includes('supplier_not_allowed')) {
      return NextResponse.json({ error: 'Um dos fornecedores selecionados não está disponível para sua conta ou não possui email cadastrado.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Não foi possível registrar a solicitação de orçamento.' }, { status: 502 });
  }

  const claims = (claimRows ?? []) as ClaimRow[];
  const preferredIds = await listPreferredSupplierIds(supabase, user.id);
  const service = createServiceClient();
  const allowedSuppliers = await listAllowedSupplierContacts(service, supplierIds, preferredIds);
  const supplierById = new Map(allowedSuppliers.map((supplier) => [supplier.id, supplier]));
  const results: SupplierResult[] = [];

  for (const claim of claims) {
    const supplier = supplierById.get(claim.supplier_id);
    if (!supplier) continue;
    if (!claim.claimed) {
      results.push({
        supplierId: supplier.id,
        supplierName: supplier.name,
        status: claim.status,
        ...(claim.retry_at ? { retryAt: claim.retry_at } : {}),
      });
      continue;
    }

    try {
      await sendResendEmail({
        from: process.env.RESEND_FROM_EMAIL,
        to: [supplier.email as string],
        cc: [userEmail],
        subject: `Solicitação de cotação — ${requesterName} — ${project.name}`,
        text: message,
      });
      const sentAt = new Date().toISOString();
      await service
        .from('supplier_quote_requests')
        .update({ status: 'sent', sent_at: sentAt, last_sent_at: sentAt, attempt_started_at: null, claim_token: null, error_message: null })
        .eq('id', claim.request_id)
        .eq('claim_token', claim.claim_token as string);
      results.push({ supplierId: supplier.id, supplierName: supplier.name, status: 'sent', sentAt });
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message.slice(0, 500) : 'Falha inesperada no provedor de email.';
      await service
        .from('supplier_quote_requests')
        .update({ status: 'failed', attempt_started_at: null, claim_token: null, error_message: errorMessage })
        .eq('id', claim.request_id)
        .eq('claim_token', claim.claim_token as string);
      results.push({ supplierId: supplier.id, supplierName: supplier.name, status: 'failed' });
    }
  }

  const sent = results.filter((result) => result.status === 'sent');
  const failed = results.filter((result) => result.status === 'failed');
  const blocked = results.filter((result) => ['cooldown', 'sending', 'pending'].includes(result.status));
  const claimedAny = claims.some((claim) => claim.claimed);
  if (!claimedAny && sent.length > 0 && failed.length === 0) {
    const retryAt = sent.find((result) => result.retryAt)?.retryAt;
    return NextResponse.json(
      {
        error: 'Este fornecedor já recebeu uma solicitação para este projeto recentemente.',
        results: results.map((result) => ({ ...result, status: 'cooldown' as const })),
        retryAt,
      },
      { status: 429 }
    );
  }
  if (sent.length > 0) {
    await recordSupplierQuoteRequest(supabase, {
      project_id: projectId,
      actor_id: user.id,
      event_type: 'supplier_quote_requested',
      message: `Solicitação de orçamento: ${results.map((result) => `${result.supplierName} (${result.status})`).join(', ')}.`,
    });
  }

  if (sent.length === 0 && failed.length === 0 && blocked.length > 0) {
    const retryAt = blocked.find((result) => result.retryAt)?.retryAt;
    const processing = blocked.some((result) => result.status === 'sending' || result.status === 'pending');
    return NextResponse.json(
      { error: processing ? 'Esta solicitação já está sendo processada.' : 'Este fornecedor já recebeu uma solicitação para este projeto recentemente.', results, retryAt },
      { status: processing ? 409 : 429 }
    );
  }
  if (sent.length === 0) {
    return NextResponse.json({ error: 'Não foi possível enviar a solicitação para nenhum fornecedor.', results }, { status: 502 });
  }

  return NextResponse.json({ status: failed.length > 0 ? 'partial' : 'sent', results });
}
