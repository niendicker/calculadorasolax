'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Globe, Lock, ShieldCheck, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { orderModeLabels, type Supplier } from './types';

/** Strips the protocol/www so a full URL reads as a short, scannable label
 *  next to the supplier's name — falls back to the raw string for anything
 *  admin-entered that isn't a valid absolute URL. */
function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function SupplierLogo({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
        <Truck className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card">
      {/* Arbitrary admin-entered URLs, not just this project's own Supabase
       * storage bucket — next/image's remote-host allowlist can't cover
       * every supplier's own domain, so a plain <img> is used instead (same
       * approach as the company logo in Perfil). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Logo de ${name}`} className="h-full w-full object-contain p-1" />
    </div>
  );
}

/** Name + logo + website link header shared by every supplier card, default
 *  or selectable — `right` is whatever status affordance goes on that side
 *  (a locked "Padrão" badge, or the selection checkbox). */
function SupplierCardHeader({ supplier, right }: { supplier: Supplier; right: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <SupplierLogo url={supplier.logo_url} name={supplier.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{supplier.name}</p>
        {supplier.website_url && (
          <a
            href={supplier.website_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="flex items-center gap-1 truncate text-xs text-primary hover:underline"
          >
            <Globe className="h-3 w-3 shrink-0" />
            <span className="truncate">{websiteLabel(supplier.website_url)}</span>
          </a>
        )}
      </div>
      {right}
    </div>
  );
}

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
  // Collapsed by default once the user already has preferences saved, so
  // returning visitors aren't forced to scroll past a fully-expanded setup
  // card before reaching the offers they came for.
  const [expanded, setExpanded] = useState(() => preferredIds.length === 0);
  const defaultSuppliers = suppliers.filter((supplier) => supplier.is_default_for_all);
  const selectableSuppliers = suppliers.filter((supplier) => !supplier.is_default_for_all);
  const atSupplierLimit = preferredIds.length >= maxUserSuppliers;
  const canCollapse = defaultSuppliers.length > 0 || selectableSuppliers.length > 0;
  const selectedNames = suppliers
    .filter((supplier) => supplier.is_default_for_all || preferredIds.includes(supplier.id))
    .map((supplier) => supplier.name);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" />
            Meus fornecedores ({preferredIds.length}/{maxUserSuppliers})
          </CardTitle>
          {canCollapse && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={expanded ? 'Recolher fornecedores' : 'Expandir fornecedores'}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
        {!expanded && selectedNames.length > 0 && (
          <p className="text-xs text-muted-foreground">{selectedNames.join(', ')}</p>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          {defaultSuppliers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                Padrão para todas as contas: não contam na sua cota de {maxUserSuppliers}.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {defaultSuppliers.map((supplier) => (
                  <div key={supplier.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                    <SupplierCardHeader
                      supplier={supplier}
                      right={
                        <Badge variant="outline" className="shrink-0">
                          <Lock className="mr-1 h-3 w-3" />
                          Padrão
                        </Badge>
                      }
                    />
                    {supplier.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{supplier.description}</p>
                    )}
                    <Badge variant="outline" className="w-fit">
                      {orderModeLabels[supplier.order_mode] ?? supplier.order_mode}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectableSuppliers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum fornecedor disponível para seleção no momento.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {selectableSuppliers.map((supplier) => {
                const selected = preferredIds.includes(supplier.id);
                const disabled = !userId || pendingSupplierId === supplier.id || (!selected && atSupplierLimit);
                return (
                  <label
                    key={supplier.id}
                    className={cn(
                      'flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-sm transition',
                      disabled && !selected && 'cursor-not-allowed opacity-50',
                      selected && 'border-primary bg-primary/5'
                    )}
                  >
                    <SupplierCardHeader
                      supplier={supplier}
                      right={
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          checked={selected}
                          disabled={disabled}
                          onChange={() => onToggle(supplier)}
                        />
                      }
                    />
                    {supplier.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{supplier.description}</p>
                    )}
                    <Badge variant="outline" className="w-fit">
                      {orderModeLabels[supplier.order_mode] ?? supplier.order_mode}
                    </Badge>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
