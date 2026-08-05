'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
  selectedSupplierCount,
}: {
  offers: SupplierOfferView[];
  query: string;
  onQueryChange: (query: string) => void;
  cart: Cart;
  onChangeQuantity: (offer: SupplierOfferView, quantity: number) => void;
  selectedSupplierCount: number;
}) {
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);

  // Sourced from the offers actually on screen (not the full "Meus
  // fornecedores" list) so a chip never appears for a supplier with nothing
  // to show right now.
  const suppliersWithOffers = useMemo(() => {
    const byId = new Map<string, string>();
    for (const offer of offers) {
      if (!byId.has(offer.supplier_id)) byId.set(offer.supplier_id, offer.suppliers.name);
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [offers]);

  // Falls back to "Todos" if the selected supplier no longer has any offer
  // (e.g. its offers expired while this chip was already selected) instead
  // of silently showing zero results with an active-looking chip.
  const effectiveSupplierFilter =
    supplierFilter && suppliersWithOffers.some((supplier) => supplier.id === supplierFilter) ? supplierFilter : null;

  const filtered = offers.filter(
    (offer) =>
      (!effectiveSupplierFilter || offer.supplier_id === effectiveSupplierFilter) &&
      `${offer.supplier_product_mappings.product_model} ${offer.supplier_product_mappings.supplier_sku} ${offer.suppliers.name}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="shrink-0 text-base font-semibold">Ofertas disponíveis</h2>
        <Input
          aria-label="Buscar ofertas"
          className="max-w-xs"
          placeholder="Produto, SKU ou fornecedor"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      {suppliersWithOffers.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por fornecedor">
          <button
            type="button"
            aria-pressed={effectiveSupplierFilter === null}
            onClick={() => setSupplierFilter(null)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              effectiveSupplierFilter === null
                ? 'border-primary bg-primary/[0.08] text-foreground'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground'
            )}
          >
            Todos
          </button>
          {suppliersWithOffers.map((supplier) => (
            <button
              key={supplier.id}
              type="button"
              aria-pressed={effectiveSupplierFilter === supplier.id}
              onClick={() => setSupplierFilter(supplier.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                effectiveSupplierFilter === supplier.id
                  ? 'border-primary bg-primary/[0.08] text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground'
              )}
            >
              {supplier.name}
            </button>
          ))}
        </div>
      )}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {selectedSupplierCount === 0
              ? 'Nenhuma oferta disponível ainda. Escolha ao menos um fornecedor em "Meus fornecedores" acima para ver preços.'
              : 'Nenhuma oferta encontrada para os fornecedores selecionados. Tente outro termo de busca ou aguarde a sincronização de preços.'}
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
                        {offer.minimum_quantity > 1 ? ` · mín. ${offer.minimum_quantity} un.` : ''}
                      </p>
                    </div>
                    <div className="flex items-center rounded-lg border">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Diminuir"
                        disabled={!quantity}
                        onClick={() => onChangeQuantity(offer, quantity - 1 < offer.minimum_quantity ? 0 : quantity - 1)}
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
