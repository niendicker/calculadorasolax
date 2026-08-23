'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Globe, Lock, ShieldCheck, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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

/** Fills the entire left side of the card (full height, not just a small
 *  icon) so the logo reads as the card's primary visual instead of a
 *  bullet-point next to the name. */
function SupplierLogoPanel({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div className="flex w-24 shrink-0 items-center justify-center self-stretch rounded-l-lg border-r bg-muted text-muted-foreground">
        <Truck className="h-6 w-6" />
      </div>
    );
  }
  return (
    <div className="flex w-24 shrink-0 items-center justify-center self-stretch overflow-hidden rounded-l-lg border-r bg-card">
      {/* Arbitrary admin-entered URLs, not just this project's own Supabase
       * storage bucket — next/image's remote-host allowlist can't cover
       * every supplier's own domain, so a plain <img> is used instead (same
       * approach as the company logo in Perfil). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Logo de ${name}`} className="h-full w-full object-contain p-2" />
    </div>
  );
}

/** Name + website link header shared by every supplier card, default or
 *  selectable — `right` is whatever status affordance goes on that side (a
 *  locked "Padrão" badge, or the selection checkbox). */
function SupplierCardHeader({ supplier, right }: { supplier: Supplier; right: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{supplier.name}</p>
        {supplier.website_url && (
          <span className="flex min-w-0 items-center gap-1 text-xs">
            <Globe className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <a
              href={supplier.website_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-block max-w-full truncate text-primary hover:underline"
            >
              {websiteLabel(supplier.website_url)}
            </a>
          </span>
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
      <CardHeader className="pb-3">
        {canCollapse ? (
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-expanded={expanded}
            aria-label={expanded ? 'Recolher fornecedores' : 'Expandir fornecedores'}
            onClick={() => setExpanded((current) => !current)}
          >
            <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <Truck className="h-4 w-4 shrink-0" />
              <span className="truncate">Meus fornecedores ({preferredIds.length}/{maxUserSuppliers})</span>
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2 text-base font-semibold">
            <Truck className="h-4 w-4 shrink-0" />
            Meus fornecedores ({preferredIds.length}/{maxUserSuppliers})
          </div>
        )}
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
                  <div key={supplier.id} className="flex rounded-lg border text-sm">
                    <SupplierLogoPanel url={supplier.logo_url} name={supplier.name} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
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
                      'flex cursor-pointer rounded-lg border text-sm transition',
                      disabled && !selected && 'cursor-not-allowed opacity-50',
                      selected && 'border-primary bg-primary/5'
                    )}
                  >
                    <SupplierLogoPanel url={supplier.logo_url} name={supplier.name} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
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
                    </div>
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
