import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { renderPurchaseOrderPdf, type PurchaseOrderPdfDeliveryAddress, type PurchaseOrderPdfItem } from '@/lib/pdf/purchase-order-pdf';
import { findLastSupplierEmailEvent, findOrderForEmail, findPurchaseOrderProfile, findSupplierContact, recordSupplierEmailEvent } from '@/lib/data/purchase-order-repository';
import { sendResendEmail } from '@/lib/email/resend';

interface NotifyInput {
  message?: string;
}

/** Minimum gap between two "Notificar por email" sends for the same order —
 * without this, an impatient user (or a repeated/scripted call directly
 * against this route) could email the same supplier over and over for one
 * order. `purchase_order_events` already logs every send; this is the first
 * place that reads it back instead of treating it as a write-only log. */
const SUPPLIER_EMAIL_COOLDOWN_MS = 10 * 60 * 1000;

/** Emails a supplier a request-for-quote for an already-created purchase
 *  order — for suppliers with no partner-order API integration (see
 *  supports_partner_orders / submit-to-partner), a plain contact email is
 *  the only channel available. Always CCs the requesting user so they have
 *  a record to follow up the conversation from. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let input: NotifyInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }
  const message = (input.message ?? '').trim();
  if (!message) return NextResponse.json({ error: 'Escreva uma mensagem para o fornecedor.' }, { status: 400 });

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({ error: 'Envio de email não está configurado no servidor.' }, { status: 500 });
  }

  const order = await findOrderForEmail(supabase, orderId);
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
  if (!['requested', 'under_review', 'quoted'].includes(order.status)) {
    return NextResponse.json({ error: 'Este pedido não está mais disponível para notificar o fornecedor.' }, { status: 409 });
  }

  const lastEmailEvent = await findLastSupplierEmailEvent(supabase, orderId);
  if (lastEmailEvent) {
    const elapsedMs = Date.now() - new Date(lastEmailEvent.created_at).getTime();
    if (elapsedMs < SUPPLIER_EMAIL_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((SUPPLIER_EMAIL_COOLDOWN_MS - elapsedMs) / 1000);
      const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);
      return NextResponse.json(
        { error: `Aguarde ${retryAfterMinutes} min antes de notificar este fornecedor de novo.`, retryAfterSeconds },
        { status: 429 }
      );
    }
  }

  const profile = await findPurchaseOrderProfile(supabase, user.id);
  const userEmail = profile?.email || user.email;
  if (!userEmail) return NextResponse.json({ error: 'Não foi possível identificar seu email.' }, { status: 422 });

  const service = createServiceClient();
  const supplier = await findSupplierContact(service, order.supplier_id);
  if (!supplier?.email) return NextResponse.json({ error: 'Este fornecedor não tem um email cadastrado.' }, { status: 409 });

  const items = (order.purchase_order_items ?? []) as PurchaseOrderPdfItem[];
  const customerName = profile?.company_name?.trim() || profile?.full_name?.trim() || 'Cliente';
  const deliveryAddress = (order.delivery_address ?? null) as PurchaseOrderPdfDeliveryAddress | null;

  let pdfBase64: string;
  try {
    pdfBase64 = await renderPurchaseOrderPdf({
      supplierName: supplier.name,
      customerName,
      customerEmail: userEmail,
      customerPhone: profile?.phone?.trim() || null,
      currency: order.currency,
      items,
      subtotal: order.subtotal,
      message,
      deliveryAddress,
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível gerar o PDF da proposta.' }, { status: 500 });
  }

  try {
    await sendResendEmail({
        from: process.env.RESEND_FROM_EMAIL,
        to: [supplier.email],
        cc: [userEmail],
        subject: `Solicitação de cotação — ${customerName}`,
        text: message,
        attachments: [{ filename: `proposta-${orderId.slice(0, 8)}.pdf`, content: pdfBase64 }],
    });

    await recordSupplierEmailEvent(service, {
      order_id: orderId,
      actor_id: user.id,
      event_type: 'supplier_email_sent',
      message: `Email enviado para ${supplier.email}, com cópia para ${userEmail}.`,
    });

    return NextResponse.json({ status: 'sent' });
  } catch (cause) {
    const messageText = cause instanceof Error ? cause.message : 'Falha inesperada ao enviar o email.';
    return NextResponse.json({ error: messageText }, { status: 502 });
  }
}
