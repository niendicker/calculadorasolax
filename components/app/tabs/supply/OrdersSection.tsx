'use client';

import { Mail, PackageCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { orderStatusLabels } from '@/lib/procurement/types';
import { DeliveryAddressFields } from './DeliveryAddressFields';
import { money, type DeliveryForm, type Order, type Supplier } from './types';

function remainingCooldownMs(until: number | undefined): number {
  return Math.max(0, (until ?? 0) - Date.now());
}

export function OrdersSection({
  orders,
  suppliers,
  partnerOrderId,
  deliveryForm,
  submittingPartner,
  onOpenPartnerForm,
  onCancelPartnerForm,
  onDeliveryFieldChange,
  onCancelOrder,
  onSubmitToPartner,
  emailOrderId,
  emailMessage,
  sendingEmail,
  onOpenEmailForm,
  onCancelEmailForm,
  onEmailMessageChange,
  onNotifySupplierByEmail,
  emailCooldownUntil,
}: {
  orders: Order[];
  suppliers: Supplier[];
  partnerOrderId: string | null;
  deliveryForm: DeliveryForm;
  submittingPartner: boolean;
  onOpenPartnerForm: (orderId: string) => void;
  onCancelPartnerForm: () => void;
  onDeliveryFieldChange: (field: keyof DeliveryForm, value: string) => void;
  onCancelOrder: (orderId: string) => void;
  onSubmitToPartner: (orderId: string) => void;
  emailOrderId: string | null;
  emailMessage: string;
  sendingEmail: boolean;
  onOpenEmailForm: (orderId: string, supplierName: string) => void;
  onCancelEmailForm: () => void;
  onEmailMessageChange: (message: string) => void;
  onNotifySupplierByEmail: (orderId: string) => void;
  /** Epoch ms (per order id) until "Notificar por email" can be used again —
   * mirrors the server's 10-minute cooldown so a fresh click doesn't get
   * sent just to bounce off a 429. */
  emailCooldownUntil: Record<string, number>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <PackageCheck className="h-4 w-4" />
        Meus pedidos
      </h2>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Você ainda não fez pedidos.</p>
      ) : (
        orders.map((order) => {
          const supplier = suppliers.find((s) => s.id === order.supplier_id);
          const canSubmitToPartner = order.status === 'requested' && !order.external_order_id && supplier?.supports_partner_orders;
          const cancellable = ['requested', 'under_review', 'quoted'].includes(order.status);
          const canNotifyByEmail = Boolean(supplier?.email) && cancellable;
          const cooldownRemainingMs = remainingCooldownMs(emailCooldownUntil[order.id]);
          const cooldownRemainingMinutes = Math.ceil(cooldownRemainingMs / 60_000);
          return (
            <Card key={order.id}>
              <CardContent className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{order.suppliers.name}</strong>
                    <Badge variant="outline">{orderStatusLabels[order.status] ?? order.status}</Badge>
                    <Badge variant="secondary">{order.request_type === 'quote' ? 'Cotação' : 'Pedido direto'}</Badge>
                    {order.external_order_id && <Badge variant="outline">Nº {order.external_order_id}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    #{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleString('pt-BR')}
                    {order.projects?.name && (
                      <>
                        {' '}
                        · Projeto: {order.projects.name}
                      </>
                    )}
                  </p>
                  <p className="mt-2 text-sm">
                    {order.purchase_order_items.map((item) => `${item.quantity}× ${item.product_model}`).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="font-semibold">{money(order.total_amount ?? order.subtotal, order.currency)}</p>
                  {cancellable && (
                    <ConfirmDeleteButton
                      ariaLabel={`Cancelar pedido de ${order.suppliers.name}`}
                      label="Cancelar"
                      title="Cancelar pedido?"
                      description="O fornecedor será notificado do cancelamento. Essa ação não pode ser desfeita."
                      confirmLabel="Cancelar pedido"
                      triggerVariant="outline"
                      onConfirm={() => onCancelOrder(order.id)}
                    />
                  )}
                  {canSubmitToPartner && (
                    <Button variant="outline" size="sm" onClick={() => onOpenPartnerForm(order.id)}>
                      Enviar ao fornecedor
                    </Button>
                  )}
                  {canNotifyByEmail && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cooldownRemainingMs > 0}
                      title={cooldownRemainingMs > 0 ? `Aguarde ${cooldownRemainingMinutes} min para notificar de novo.` : undefined}
                      onClick={() => onOpenEmailForm(order.id, order.suppliers.name)}
                    >
                      <Mail className="h-4 w-4" />
                      {cooldownRemainingMs > 0 ? `Aguarde ${cooldownRemainingMinutes} min` : 'Notificar por email'}
                    </Button>
                  )}
                </div>
              </CardContent>
              {partnerOrderId === order.id && (
                <CardContent className="space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Endereço de entrega para o fornecedor processar o pedido. Revise antes de confirmar.
                  </p>
                  <DeliveryAddressFields form={deliveryForm} onChange={onDeliveryFieldChange} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={submittingPartner} onClick={() => onSubmitToPartner(order.id)}>
                      Confirmar envio
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onCancelPartnerForm}>
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              )}
              {emailOrderId === order.id && (
                <CardContent className="space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Envia uma solicitação de cotação para <strong>{supplier?.email}</strong>, com o PDF da proposta em
                    anexo e cópia para o seu email.
                  </p>
                  <textarea
                    className="min-h-32 w-full rounded-lg border border-input bg-background p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label="Mensagem para o fornecedor"
                    value={emailMessage}
                    onChange={(event) => onEmailMessageChange(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={sendingEmail || cooldownRemainingMs > 0}
                      onClick={() => onNotifySupplierByEmail(order.id)}
                    >
                      {sendingEmail
                        ? 'Enviando...'
                        : cooldownRemainingMs > 0
                          ? `Aguarde ${cooldownRemainingMinutes} min`
                          : 'Enviar email'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onCancelEmailForm}>
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </section>
  );
}
