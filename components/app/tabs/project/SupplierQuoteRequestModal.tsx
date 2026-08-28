'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Clock3, FileText, Info, Loader2, Mail, UsersRound, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { listOrderingSuppliers, listUserSupplierPreferences } from '@/lib/data/supplier-repository';
import { listSupplierQuoteRequests, type SupplierQuoteRequestRow } from '@/lib/data/supplier-quote-repository';
import { buildSupplierQuoteRequestEmail, type ShareableBatteryCatalog, type ShareableProject } from '../../helpers';
import type { InlineProfile } from '../../types';

interface SupplierOption {
  id: string;
  name: string;
  email: string;
}

interface SendResult {
  supplierId: string;
  supplierName: string;
  status: 'sent' | 'failed' | 'cooldown' | 'sending' | 'pending';
  sentAt?: string;
  retryAt?: string;
}

const MAX_SELECTED_SUPPLIERS = 2;
const DEFAULT_COOLDOWN_HOURS = 24;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function cooldownUntil(request: SupplierQuoteRequestRow, cooldownHours: number) {
  if (!request.sent_at) return null;
  return new Date(new Date(request.sent_at).getTime() + cooldownHours * 60 * 60 * 1000);
}

function latestBySupplier(rows: SupplierQuoteRequestRow[]) {
  const latest = new Map<string, SupplierQuoteRequestRow>();
  for (const row of rows) if (!latest.has(row.supplier_id)) latest.set(row.supplier_id, row);
  return latest;
}

/** Secure server-backed supplier quote request flow. The browser only selects
 * suppliers and presents state; the route handler and database claim function
 * remain authoritative for access, quota, cooldown and sending. */
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
  onManageSuppliers: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [history, setHistory] = useState<SupplierQuoteRequestRow[]>([]);
  const [cooldownHours, setCooldownHours] = useState(DEFAULT_COOLDOWN_HOURS);
  const [now, setNow] = useState<number | null>(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset state for a newly opened dialog
    setSelectedIds(new Set());
    setResults(null);
    setError(null);
    setLoadingSuppliers(true);
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const [allSuppliers, preferenceRows, requestRows, settingsResult] = await Promise.all([
        listOrderingSuppliers(supabase, 'id, name, email, is_default_for_all'),
        uid ? listUserSupplierPreferences(supabase, uid) : Promise.resolve([]),
        listSupplierQuoteRequests(supabase, projectId),
        supabase.from('app_settings').select('quote_cooldown_hours').eq('id', true).maybeSingle(),
      ]);
      if (cancelled) return;
      const typedSuppliers = allSuppliers as unknown as {
        id: string;
        name: string;
        email: string | null;
        is_default_for_all: boolean;
      }[];
      const preferredIds = new Set(preferenceRows.map((row) => row.supplier_id));
      const allowed = typedSuppliers.filter((supplier) => supplier.is_default_for_all || preferredIds.has(supplier.id));
      setSuppliers(
        allowed
          .filter((supplier) => Boolean(supplier.email))
          .map((supplier) => ({ id: supplier.id, name: supplier.name, email: supplier.email as string }))
      );
      setHistory(requestRows.data);
      setCooldownHours(settingsResult.data?.quote_cooldown_hours ?? DEFAULT_COOLDOWN_HOURS);
      setLoadingSuppliers(false);
    }
    void load().catch(() => {
      if (!cancelled) {
        setLoadingSuppliers(false);
        setError('Não foi possível carregar os fornecedores e o histórico.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    // Keep the visible cooldown state current without using Date.now() during
    // render; the backend remains authoritative if the browser timer sleeps.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !sending) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, sending]);

  const message = buildSupplierQuoteRequestEmail(project, profile, batteryCatalog);
  const latestRequests = useMemo(() => latestBySupplier(history), [history]);
  const hasResendSelection = Array.from(selectedIds).some((id) => {
    const request = latestRequests.get(id);
    if (!request) return false;
    if (request.status === 'failed') return true;
    const until = cooldownUntil(request, cooldownHours);
    return request.status === 'sent' && Boolean(until && now !== null && until.getTime() <= now);
  });

  if (!open || !mounted) return null;

  function toggleSupplier(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECTED_SUPPLIERS) next.add(id);
      return next;
    });
    setError(null);
  }

  function requestStatus(supplierId: string) {
    const request = latestRequests.get(supplierId);
    if (!request) return null;
    const until = cooldownUntil(request, cooldownHours);
    if (request.status === 'sent' && until) {
      const blocked = now === null || until.getTime() > now;
      return { label: `Solicitação enviada em ${formatDate(request.sent_at as string)}`, detail: blocked ? `Novo envio disponível em ${formatDate(until.toISOString())}` : 'Reenvio disponível agora.', blocked };
    }
    if (request.status === 'sending' || request.status === 'pending') {
      return { label: 'Solicitação em processamento', detail: 'Aguarde a conclusão do envio.', blocked: true };
    }
    if (request.status === 'failed') {
      return { label: 'Última tentativa não enviada', detail: 'Você pode tentar novamente de forma explícita.', blocked: false };
    }
    return null;
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/request-supplier-quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierIds: Array.from(selectedIds), message, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error || 'Não foi possível registrar a solicitação.');
        if (Array.isArray(body?.results)) setResults(body.results);
        return;
      }
      setResults(body.results ?? []);
      onSent();
    } catch {
      setError('Falha de conexão ao registrar a solicitação. Verifique o histórico antes de tentar novamente.');
    } finally {
      setSending(false);
    }
  }

  const resultList = results ?? suppliers.map((supplier) => ({ supplierId: supplier.id, supplierName: supplier.name, status: requestStatus(supplier.id)?.blocked ? 'cooldown' : 'pending' } as SendResult));

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-quote-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !sending) onClose();
      }}
    >
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id="supplier-quote-modal-title" className="text-xl font-semibold tracking-tight">Solicitar orçamento ao fornecedor</h2>
            <p className="mt-1 text-sm text-muted-foreground">Selecione até 2 fornecedores e envie a mensagem de cotação.</p>
          </div>
          <Button variant="outline" size="icon-sm" aria-label="Fechar" disabled={sending} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:space-y-6 sm:p-6">
          {results ? (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm font-medium">Resultado das solicitações</p>
              {resultList.map((result) => (
                <div key={result.supplierId} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                  {result.status === 'sent' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />}
                  <div className="min-w-0">
                    <p className="font-medium">{result.supplierName}</p>
                    <p className="text-xs text-muted-foreground">
                      {result.status === 'sent' && result.sentAt ? `Solicitação enviada em ${formatDate(result.sentAt)}` : result.status === 'cooldown' ? 'Já recebeu uma solicitação dentro do período de proteção.' : 'Não foi possível enviar a solicitação.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <UsersRound className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <h3 className="text-lg font-semibold">Fornecedores</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Escolha até dois fornecedores para solicitar a cotação.</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">{selectedIds.size} de {MAX_SELECTED_SUPPLIERS} selecionados</span>
                </div>
                {loadingSuppliers ? (
                  <p className="text-xs text-muted-foreground">Carregando fornecedores...</p>
                ) : suppliers.length === 0 ? (
                  <div className="space-y-2 rounded-lg border border-dashed p-3">
                    <p className="text-xs text-muted-foreground">Você ainda não selecionou nenhum fornecedor para receber esta cotação. Escolha um fornecedor em Fornecedores para continuar.</p>
                    <Button variant="outline" size="sm" onClick={() => { onClose(); onManageSuppliers(); }}>Ir para Fornecedores</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {suppliers.map((supplier) => {
                      const status = requestStatus(supplier.id);
                      const selected = selectedIds.has(supplier.id);
                      return (
                        <label key={supplier.id} className={`flex min-h-20 items-start gap-3 rounded-xl border p-4 text-sm transition-colors ${status?.blocked ? 'opacity-70' : 'cursor-pointer hover:bg-muted/40'} ${selected ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                          <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={selected} disabled={status?.blocked || sending} onChange={() => toggleSupplier(supplier.id)} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold">{supplier.name}</span>
                            <span className="mt-1 block truncate text-sm text-muted-foreground">{supplier.email}</span>
                            {status && <span className="mt-1 flex items-start gap-1 text-[0.7rem] text-muted-foreground"><Clock3 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{status.label}{status.detail ? ` · ${status.detail}` : ''}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-primary" aria-hidden="true" />
                    <h3 className="text-lg font-semibold">Prévia da mensagem</h3>
                  </div>
                  <span className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">gerada automaticamente</span>
                </div>
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/80 bg-primary/[0.025] p-4 text-sm leading-6 text-muted-foreground">{message}</pre>
                <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> <span>Os fornecedores receberão os dados acima por email.</span></p>
              </div>
            </>
          )}
          {error && <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{error}</p>}
        </div>

        <div className="shrink-0 border-t px-5 py-4 sm:px-6">
          {results ? (
            <div className="flex justify-end">
              <Button className="min-w-32" onClick={onClose}>Fechar</Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={sending} onClick={onClose}>Cancelar</Button>
              <Button disabled={selectedIds.size === 0 || sending} onClick={() => void handleSend()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {sending ? 'Enviando...' : hasResendSelection ? 'Reenviar solicitação' : 'Enviar solicitações'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
