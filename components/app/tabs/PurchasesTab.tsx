'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Minus, PackageCheck, Plus, ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { orderStatusLabels, type SupplierOfferView } from '@/lib/procurement/types';
import { PageHeader } from '../shell/slots';

type Cart = Record<string, number>;
type Order = { id: string; supplier_id: string; created_at: string; request_type: string; status: string; currency: string; subtotal: number; total_amount: number | null; suppliers: { name: string }; purchase_order_items: { id: string; product_model: string; supplier_sku: string; quantity: number; unit_price: number; line_total: number }[] };
const money = (value: number, currency = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);

export function PurchasesTab() {
  const supabase = useMemo(() => createClient(), []);
  const [offers, setOffers] = useState<SupplierOfferView[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    // Offers are scoped to suppliers the admin marked as defaults for every
    // account, plus whichever suppliers this user picked in "Meus
    // Fornecedores" — see supabase/migrations/0064_user_supplier_preferences.sql.
    const [defaultsResult, preferencesResult, orderResult] = await Promise.all([
      supabase.from('suppliers').select('id').eq('is_default_for_all', true),
      userId
        ? supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', userId)
        : Promise.resolve({ data: [] as { supplier_id: string }[], error: null }),
      supabase.from('purchase_orders').select('id, supplier_id, created_at, request_type, status, currency, subtotal, total_amount, suppliers(name), purchase_order_items(id, product_model, supplier_sku, quantity, unit_price, line_total)').order('created_at', { ascending: false }).limit(50),
    ]);
    const allowedSupplierIds = [...new Set([
      ...((defaultsResult.data ?? []) as { id: string }[]).map((row) => row.id),
      ...((preferencesResult.data ?? []) as { supplier_id: string }[]).map((row) => row.supplier_id),
    ])];

    const offerResult = await supabase.from('supplier_offers').select('id, supplier_id, unit_price, stock_quantity, lead_time_days, minimum_quantity, valid_until, supplier_product_mappings!inner(product_type, product_model, supplier_sku, pack_quantity), suppliers!inner(name, currency, order_mode, minimum_order_value)').eq('active', true).in('supplier_id', allowedSupplierIds).order('unit_price');

    const error = defaultsResult.error ?? preferencesResult.error ?? offerResult.error ?? orderResult.error;
    if (error) setMessage(error.message);
    setOffers((offerResult.data ?? []) as unknown as SupplierOfferView[]);
    setOrders((orderResult.data ?? []) as unknown as Order[]);
  }, [supabase]);
  useEffect(() => {
    // Initial remote-resource synchronization; state updates happen after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const cartOffers = offers.filter((offer) => cart[offer.id]);
  const supplierIds = [...new Set(cartOffers.map((offer) => offer.supplier_id))];
  const cartSupplierId = supplierIds[0];
  const cartSupplier = cartOffers[0]?.suppliers;
  const subtotal = cartOffers.reduce((sum, offer) => sum + offer.unit_price * cart[offer.id], 0);
  const filtered = offers.filter((offer) => `${offer.supplier_product_mappings.product_model} ${offer.supplier_product_mappings.supplier_sku} ${offer.suppliers.name}`.toLowerCase().includes(query.toLowerCase()));

  function changeQuantity(offer: SupplierOfferView, quantity: number) {
    if (cartSupplierId && offer.supplier_id !== cartSupplierId) return setMessage('Finalize ou limpe o carrinho atual antes de escolher outro fornecedor.');
    const maximum = offer.stock_quantity ?? 9999;
    const normalized = Math.min(maximum, Math.max(0, quantity));
    setCart((current) => { const next = { ...current }; if (!normalized) delete next[offer.id]; else next[offer.id] = normalized; return next; });
    setMessage(null);
  }

  async function createOrder(requestType: 'quote' | 'direct') {
    if (!cartSupplierId || cartOffers.length === 0) return;
    setBusy(true); setMessage(null);
    const { data, error } = await supabase.rpc('create_purchase_order', {
      p_supplier_id: cartSupplierId,
      p_request_type: requestType,
      p_items: cartOffers.map((offer) => ({ offer_id: offer.id, quantity: cart[offer.id] })),
      p_idempotency_key: crypto.randomUUID(),
      p_delivery_address: {},
      p_customer_notes: notes || null,
    });
    if (error) setMessage(error.message);
    else { setMessage(`${requestType === 'quote' ? 'Cotação solicitada' : 'Pedido criado'} com sucesso. Protocolo #${String(data).slice(0, 8)}.`); setCart({}); setNotes(''); await load(); }
    setBusy(false);
  }

  async function cancelOrder(id: string) {
    const { error } = await supabase.rpc('cancel_purchase_order', { p_order_id: id });
    setMessage(error?.message ?? 'Pedido cancelado.'); await load();
  }

  return <div className="space-y-5 py-5">
    <PageHeader><div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Compras</h1><p className="text-sm text-muted-foreground">Compare ofertas e solicite diretamente aos fornecedores habilitados.</p></div></PageHeader>
    {message && <div role="status" className="rounded-lg border px-3 py-2 text-sm">{message}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Ofertas disponíveis</h2><Input aria-label="Buscar ofertas" className="max-w-xs" placeholder="Produto, SKU ou fornecedor" value={query} onChange={(e) => setQuery(e.target.value)}/></div>
        {filtered.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Ainda não há ofertas disponíveis. Verifique se você escolheu fornecedores em &quot;Meus Fornecedores&quot;, ou aguarde a sincronização de preços.</CardContent></Card> : <div className="grid gap-3 md:grid-cols-2">{filtered.map((offer) => { const mapping = offer.supplier_product_mappings; const quantity = cart[offer.id] ?? 0; return <Card key={offer.id} className={quantity ? 'border-primary/50' : ''}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><div><CardTitle className="text-base">{mapping.product_model}</CardTitle><p className="text-xs text-muted-foreground">{offer.suppliers.name} · SKU {mapping.supplier_sku}</p></div><Badge variant="outline">{mapping.product_type === 'inverter' ? 'Inversor' : mapping.product_type === 'battery' ? 'Bateria' : 'Acessório'}</Badge></div></CardHeader><CardContent><div className="flex items-end justify-between gap-3"><div><p className="text-lg font-semibold">{money(offer.unit_price, offer.suppliers.currency)}</p><p className="text-xs text-muted-foreground">{offer.stock_quantity == null ? 'Estoque sob consulta' : `${offer.stock_quantity} em estoque`}{offer.lead_time_days != null ? ` · ${offer.lead_time_days} dias` : ''}</p></div><div className="flex items-center rounded-lg border"><Button variant="ghost" size="icon-sm" aria-label="Diminuir" disabled={!quantity} onClick={() => changeQuantity(offer, quantity - 1)}><Minus className="h-3.5 w-3.5"/></Button><span className="w-8 text-center text-sm">{quantity}</span><Button variant="ghost" size="icon-sm" aria-label="Aumentar" onClick={() => changeQuantity(offer, Math.max(offer.minimum_quantity, quantity + 1))}><Plus className="h-3.5 w-3.5"/></Button></div></div></CardContent></Card>; })}</div>}
      </section>
      <aside><Card className="xl:sticky xl:top-4"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-4 w-4"/>Carrinho</CardTitle></CardHeader><CardContent className="space-y-3">{cartOffers.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Adicione produtos de um fornecedor.</p> : <>{cartOffers.map((offer) => <div key={offer.id} className="flex justify-between gap-3 border-b pb-2 text-sm"><span>{cart[offer.id]}× {offer.supplier_product_mappings.product_model}</span><strong>{money(offer.unit_price * cart[offer.id], offer.suppliers.currency)}</strong></div>)}<div className="flex justify-between"><span>Subtotal</span><strong>{money(subtotal, cartSupplier?.currency)}</strong></div>{subtotal < Number(cartSupplier?.minimum_order_value ?? 0) && <p className="text-xs text-destructive">Pedido mínimo: {money(Number(cartSupplier?.minimum_order_value), cartSupplier?.currency)}</p>}<textarea className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" placeholder="Observações para o fornecedor" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)}/><div className="grid gap-2">{['quote','both'].includes(cartSupplier?.order_mode ?? '') && <Button disabled={busy || subtotal < Number(cartSupplier?.minimum_order_value ?? 0)} onClick={() => createOrder('quote')}>Solicitar cotação</Button>}{['direct','both'].includes(cartSupplier?.order_mode ?? '') && <Button variant="outline" disabled={busy || subtotal < Number(cartSupplier?.minimum_order_value ?? 0)} onClick={() => createOrder('direct')}>Criar pedido</Button>}<Button variant="ghost" onClick={() => setCart({})}>Limpar carrinho</Button></div></>}</CardContent></Card></aside>
    </div>
    <section className="space-y-3"><h2 className="flex items-center gap-2 font-semibold"><PackageCheck className="h-4 w-4"/>Meus pedidos</h2>{orders.length === 0 ? <p className="text-sm text-muted-foreground">Você ainda não fez pedidos.</p> : orders.map((order) => <Card key={order.id}><CardContent className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{order.suppliers.name}</strong><Badge variant="outline">{orderStatusLabels[order.status] ?? order.status}</Badge><Badge variant="secondary">{order.request_type === 'quote' ? 'Cotação' : 'Pedido direto'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">#{order.id.slice(0,8)} · {new Date(order.created_at).toLocaleString('pt-BR')}</p><p className="mt-2 text-sm">{order.purchase_order_items.map((item) => `${item.quantity}× ${item.product_model}`).join(' · ')}</p></div><div className="text-right"><p className="font-semibold">{money(order.total_amount ?? order.subtotal, order.currency)}</p>{['requested','under_review','quoted'].includes(order.status) && <Button variant="ghost" size="sm" className="mt-1" onClick={() => cancelOrder(order.id)}>Cancelar</Button>}</div></CardContent></Card>)}</section>
  </div>;
}
