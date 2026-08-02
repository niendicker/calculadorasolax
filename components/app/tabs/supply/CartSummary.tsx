'use client';

import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SupplierOfferView } from '@/lib/procurement/types';
import { money, type Cart } from './types';

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
}) {
  const belowMinimum = subtotal < Number(cartSupplier?.minimum_order_value ?? 0);

  return (
    <>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ShoppingCart className="h-4 w-4" />
        Carrinho
      </h2>
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
