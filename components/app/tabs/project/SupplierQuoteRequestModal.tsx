'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { buildSupplierQuoteRequestEmail, type ShareableBatteryCatalog, type ShareableProject } from '../../helpers';
import type { InlineProfile } from '../../types';

interface SupplierOption {
  id: string;
  name: string;
  email: string;
}

/** Lets the seller pick one or more suppliers from the catalog and, after
 *  previewing the exact email body, send them a request-for-quote for the
 *  project's current solution — including the seller's own company data
 *  (see buildSupplierQuoteRequestEmail) so the supplier has what it needs to
 *  issue an NF and quote freight. Replaces the old copy-to-clipboard-only
 *  "Copiar dados para fornecedor" flow with an actual send, via
 *  /api/projects/[projectId]/request-supplier-quote. */
export function SupplierQuoteRequestModal({
  open,
  onClose,
  projectId,
  project,
  profile,
  batteryCatalog,
  onSent,
  onManageSuppliers,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  project: ShareableProject;
  profile: InlineProfile;
  batteryCatalog: ShareableBatteryCatalog;
  onSent: () => void;
  /** Sends the seller to Fornecedores to pick suppliers, for when they haven't
   *  chosen any yet — see the `allowedCount === 0` empty state below. */
  onManageSuppliers: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  // Suppliers the seller actually has access to (admin defaults + their own
  // picks in Fornecedores), before narrowing to the ones with an email on file —
  // kept separate from `suppliers` so the empty state can tell "you haven't
  // chosen any supplier yet" apart from "none of your suppliers have an
  // email registered".
  const [allowedCount, setAllowedCount] = useState<number | null>(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting selection/error for a freshly-opened dialog, not reacting to a prop change
    setSelectedIds(new Set());
    setError(null);
    setLoadingSuppliers(true);
    const supabase = createClient();

    // Same "fornecedores deste usuário" scoping Fornecedores already uses (see
    // SupplyTab.tsx's allowedSupplierIds): suppliers the admin marked as
    // default for every account, plus whichever ones this seller picked for
    // themselves — not the full admin catalog, so this list stays consistent
    // with who they actually buy from.
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const [supplierResult, preferencesResult] = await Promise.all([
        supabase
          .from('suppliers')
          .select('id, name, email, is_default_for_all')
          .eq('active', true)
          .eq('ordering_enabled', true)
          .order('name'),
        uid
          ? supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', uid)
          : Promise.resolve({ data: [] as { supplier_id: string }[] }),
      ]);
      const allSuppliers = (supplierResult.data ?? []) as {
        id: string;
        name: string;
        email: string | null;
        is_default_for_all: boolean;
      }[];
      const preferredIds = new Set(((preferencesResult.data ?? []) as { supplier_id: string }[]).map((row) => row.supplier_id));
      const allowed = allSuppliers.filter((supplier) => supplier.is_default_for_all || preferredIds.has(supplier.id));

      setAllowedCount(allowed.length);
      setSuppliers(
        allowed
          .filter((supplier) => Boolean(supplier.email))
          .map((supplier) => ({ id: supplier.id, name: supplier.name, email: supplier.email as string }))
      );
      setLoadingSuppliers(false);
    }
    void load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const message = buildSupplierQuoteRequestEmail(project, profile, batteryCatalog);

  function toggleSupplier(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/request-supplier-quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierIds: Array.from(selectedIds), message }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error || 'Não foi possível enviar a solicitação.');
        return;
      }
      onSent();
      onClose();
    } catch {
      setError('Falha de conexão ao enviar a solicitação.');
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Solicitar orçamento ao fornecedor"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-medium">Solicitar orçamento ao fornecedor</p>
          <Button variant="ghost" size="icon-sm" aria-label="Fechar" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Enviar para</p>
            {loadingSuppliers ? (
              <p className="text-xs text-muted-foreground">Carregando fornecedores...</p>
            ) : allowedCount === 0 ? (
              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  Você ainda não escolheu fornecedores. Escolha em Fornecedores para poder solicitar orçamentos.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onManageSuppliers();
                  }}
                >
                  Ir para Fornecedores
                </Button>
              </div>
            ) : suppliers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum dos seus fornecedores tem email cadastrado.</p>
            ) : (
              <div className="space-y-1.5">
                {suppliers.map((supplier) => (
                  <label key={supplier.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(supplier.id)}
                      onChange={() => toggleSupplier(supplier.id)}
                    />
                    <span>{supplier.name}</span>
                    <span className="text-xs text-muted-foreground">{supplier.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Prévia da mensagem</p>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-xs text-muted-foreground">
              {message}
            </pre>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="shrink-0 border-t p-3">
          <Button className="w-full" disabled={selectedIds.size === 0 || sending} onClick={() => void handleSend()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Enviar solicitação
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
