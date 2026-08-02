'use client';

import { Minus, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { SupplierOfferView } from '@/lib/procurement/types';
import { money, type Cart } from './types';

const productTypeLabels: Record<string, string> = {
  inverter: 'Inversor',
  battery: 'Bateria',
  accessory: 'Acessório',
};

export function OffersSection({
  offers,
  query,
  onQueryChange,
  cart,
  onChangeQuantity,
}: {
  offers: SupplierOfferView[];
  query: string;
  onQueryChange: (query: string) => void;
  cart: Cart;
  onChangeQuantity: (offer: SupplierOfferView, quantity: number) => void;
}) {
  const filtered = offers.filter((offer) =>
    `${offer.supplier_product_mappings.product_model} ${offer.supplier_product_mappings.supplier_sku} ${offer.suppliers.name}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="shrink-0 font-semibold">Ofertas disponíveis</h2>
        <Input
          aria-label="Buscar ofertas"
          className="max-w-xs"
          placeholder="Produto, SKU ou fornecedor"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ainda não há ofertas disponíveis. Verifique se você escolheu fornecedores acima, ou aguarde a
            sincronização de preços.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
          {filtered.map((offer) => {
            const mapping = offer.supplier_product_mappings;
            const quantity = cart[offer.id] ?? 0;
            return (
              <Card key={offer.id} className={quantity ? 'border-primary/50' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{mapping.product_model}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {offer.suppliers.name} · SKU {mapping.supplier_sku}
                      </p>
                    </div>
                    <Badge variant="outline">{productTypeLabels[mapping.product_type] ?? mapping.product_type}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{money(offer.unit_price, offer.suppliers.currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {offer.stock_quantity == null ? 'Estoque sob consulta' : `${offer.stock_quantity} em estoque`}
                        {offer.lead_time_days != null ? ` · ${offer.lead_time_days} dias` : ''}
                      </p>
                    </div>
                    <div className="flex items-center rounded-lg border">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Diminuir"
                        disabled={!quantity}
                        onClick={() => onChangeQuantity(offer, quantity - 1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm">{quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Aumentar"
                        onClick={() => onChangeQuantity(offer, Math.max(offer.minimum_quantity, quantity + 1))}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
