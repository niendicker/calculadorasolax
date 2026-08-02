'use client';

import { Lock, ShieldCheck, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { orderModeLabels, type Supplier } from './types';

/** Lets a signed-in user pick up to `maxUserSuppliers` suppliers whose offers
 * should feed their pricing — on top of whichever suppliers the admin marked
 * as mandatory defaults for every account (shown separately, locked). */
export function SupplierPreferencesCard({
  suppliers,
  preferredIds,
  maxUserSuppliers,
  userId,
  pendingSupplierId,
  onToggle,
}: {
  suppliers: Supplier[];
  preferredIds: string[];
  maxUserSuppliers: number;
  userId: string | null;
  pendingSupplierId: string | null;
  onToggle: (supplier: Supplier) => void;
}) {
  const defaultSuppliers = suppliers.filter((supplier) => supplier.is_default_for_all);
  const selectableSuppliers = suppliers.filter((supplier) => !supplier.is_default_for_all);
  const atSupplierLimit = preferredIds.length >= maxUserSuppliers;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4" />
          Meus fornecedores ({preferredIds.length}/{maxUserSuppliers})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {defaultSuppliers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
              Padrão para todas as contas — não contam na sua cota de {maxUserSuppliers}.
            </p>
            {defaultSuppliers.map((supplier) => (
              <div key={supplier.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>{supplier.name}</span>
                <Badge variant="outline">
                  <Lock className="mr-1 h-3 w-3" />
                  Padrão
                </Badge>
              </div>
            ))}
          </div>
        )}
        {selectableSuppliers.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum fornecedor disponível para seleção no momento.
          </p>
        ) : (
          selectableSuppliers.map((supplier) => {
            const selected = preferredIds.includes(supplier.id);
            const disabled = !userId || pendingSupplierId === supplier.id || (!selected && atSupplierLimit);
            return (
              <label
                key={supplier.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                  disabled && !selected ? 'opacity-50' : ''
                } ${selected ? 'border-primary bg-primary/5' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => onToggle(supplier)}
                  />
                  <span>
                    <span className="font-medium">{supplier.name}</span>
                    {supplier.description && (
                      <span className="ml-2 text-xs text-muted-foreground">{supplier.description}</span>
                    )}
                  </span>
                </span>
                <Badge variant="outline">{orderModeLabels[supplier.order_mode] ?? supplier.order_mode}</Badge>
              </label>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
