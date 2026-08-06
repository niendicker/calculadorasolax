'use client';

import { Building2, FolderOpen, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SupplierOfferView } from '@/lib/procurement/types';
import { DeliveryAddressFields } from './DeliveryAddressFields';
import { money, type Cart, type DeliveryForm } from './types';

export function CartSummary({
  cartOffers,
  cart,
  subtotal,
  cartSupplier,
  notes,
  onNotesChange,
  busy,
  onCreateOrder,
  onClearCart,
  deliveryForm,
  onDeliveryFieldChange,
  hasCompanyAddress,
  onUseCompanyAddress,
  cartProjectName,
}: {
  cartOffers: SupplierOfferView[];
  cart: Cart;
  subtotal: number;
  cartSupplier: SupplierOfferView['suppliers'] | undefined;
  notes: string;
  onNotesChange: (notes: string) => void;
  busy: boolean;
  onCreateOrder: (requestType: 'quote' | 'direct') => void;
  onClearCart: () => void;
  /** Optional at this point — passed straight to create_purchase_order so
   * the supplier already has it, whatever path the order later takes. */
  deliveryForm: DeliveryForm;
  onDeliveryFieldChange: (field: keyof DeliveryForm, value: string) => void;
  /** Whether the profile (Perfil) has a registered company address to offer
   *  as a one-click default — hides the shortcut entirely when there's
   *  nothing to fill in from. */
  hasCompanyAddress: boolean;
  /** Fills every delivery field from the company's registered address —
   *  a one-off default, not a persistent binding, so the fields stay just as
   *  editable afterward as a manually-typed address. */
  onUseCompanyAddress: () => void;
  /** Name of the project whose solution supplied the cart's items (via
   *  "Importar itens do projeto"), if any — the resulting order is linked to
   *  it (see create_purchase_order's p_project_id) so it shows up in that
   *  project's own history afterward. */
  cartProjectName: string | null;
}) {
  const belowMinimum = subtotal < Number(cartSupplier?.minimum_order_value ?? 0);

  return (
    <>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ShoppingCart className="h-4 w-4" />
        Carrinho
      </h2>
      {cartProjectName && cartOffers.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          Projeto: {cartProjectName}
        </p>
      )}
      <div className="space-y-3">
        {cartOffers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Adicione produtos de um fornecedor.</p>
        ) : (
          <>
            {cartOffers.map((offer) => (
              <div key={offer.id} className="flex justify-between gap-3 border-b pb-2 text-sm">
                <span>
                  {cart[offer.id]}× {offer.supplier_product_mappings.product_model}
                </span>
                <strong>{money(offer.unit_price * cart[offer.id], offer.suppliers.currency)}</strong>
              </div>
            ))}
            <div className="flex justify-between">
              <span>Subtotal</span>
              <strong>{money(subtotal, cartSupplier?.currency)}</strong>
            </div>
            {belowMinimum && (
              <p className="text-xs text-destructive">
                Pedido mínimo: {money(Number(cartSupplier?.minimum_order_value), cartSupplier?.currency)}
              </p>
            )}
            <textarea
              className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
              placeholder="Observações para o fornecedor"
              value={notes}
              maxLength={2000}
              onChange={(event) => onNotesChange(event.target.value)}
            />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Endereço de entrega (opcional): ajuda o fornecedor a cotar o frete já na primeira resposta.
                </p>
                {hasCompanyAddress && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                    onClick={onUseCompanyAddress}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Usar endereço da empresa
                  </Button>
                )}
              </div>
              <DeliveryAddressFields form={deliveryForm} onChange={onDeliveryFieldChange} />
            </div>
            <div className="grid gap-2">
              {['quote', 'both'].includes(cartSupplier?.order_mode ?? '') && (
                <Button disabled={busy || belowMinimum} onClick={() => onCreateOrder('quote')}>
                  Solicitar cotação
                </Button>
              )}
              {['direct', 'both'].includes(cartSupplier?.order_mode ?? '') && (
                <Button variant="outline" disabled={busy || belowMinimum} onClick={() => onCreateOrder('direct')}>
                  Criar pedido
                </Button>
              )}
              <Button variant="ghost" onClick={onClearCart}>
                Limpar carrinho
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
