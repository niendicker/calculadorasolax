'use client';

import { PackageCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { orderStatusLabels } from '@/lib/procurement/types';
import { money, type DeliveryForm, type Order, type Supplier } from './types';

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
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <PackageCheck className="h-4 w-4" />
        Meus pedidos
      </h2>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Você ainda não fez pedidos.</p>
      ) : (
        orders.map((order) => {
          const canSubmitToPartner =
            order.status === 'requested' &&
            !order.external_order_id &&
            suppliers.find((s) => s.id === order.supplier_id)?.supports_partner_orders;
          const cancellable = ['requested', 'under_review', 'quoted'].includes(order.status);
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
                </div>
              </CardContent>
              {partnerOrderId === order.id && (
                <CardContent className="grid gap-2 border-t pt-3 sm:grid-cols-2">
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Endereço de entrega para o fornecedor processar o pedido.
                  </p>
                  <Input
                    placeholder="Destinatário (opcional)"
                    value={deliveryForm.name}
                    onChange={(event) => onDeliveryFieldChange('name', event.target.value)}
                  />
                  <Input
                    placeholder="CEP"
                    value={deliveryForm.postal_code}
                    onChange={(event) => onDeliveryFieldChange('postal_code', event.target.value)}
                  />
                  <Input
                    placeholder="Endereço"
                    value={deliveryForm.address}
                    onChange={(event) => onDeliveryFieldChange('address', event.target.value)}
                  />
                  <Input
                    placeholder="Número"
                    value={deliveryForm.number}
                    onChange={(event) => onDeliveryFieldChange('number', event.target.value)}
                  />
                  <Input
                    placeholder="Complemento (opcional)"
                    value={deliveryForm.complement}
                    onChange={(event) => onDeliveryFieldChange('complement', event.target.value)}
                  />
                  <Input
                    placeholder="Bairro (opcional)"
                    value={deliveryForm.district}
                    onChange={(event) => onDeliveryFieldChange('district', event.target.value)}
                  />
                  <Input
                    placeholder="Cidade"
                    value={deliveryForm.city}
                    onChange={(event) => onDeliveryFieldChange('city', event.target.value)}
                  />
                  <Input
                    placeholder="UF"
                    maxLength={2}
                    value={deliveryForm.state}
                    onChange={(event) => onDeliveryFieldChange('state', event.target.value.toUpperCase())}
                  />
                  <div className="flex gap-2 sm:col-span-2">
                    <Button size="sm" disabled={submittingPartner} onClick={() => onSubmitToPartner(order.id)}>
                      Confirmar envio
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onCancelPartnerForm}>
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
