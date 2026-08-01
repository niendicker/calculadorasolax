'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Minus, PackageCheck, Plus, ShieldCheck, ShoppingCart, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { orderStatusLabels, type SupplierOfferView } from '@/lib/procurement/types';
import { PageHeader, PageSummary } from '../shell/slots';

type Cart = Record<string, number>;
type Order = { id: string; supplier_id: string; created_at: string; request_type: string; status: string; currency: string; subtotal: number; total_amount: number | null; external_order_id: string | null; suppliers: { name: string }; purchase_order_items: { id: string; product_model: string; supplier_sku: string; quantity: number; unit_price: number; line_total: number }[] };
type Supplier = { id: string; name: string; description: string | null; order_mode: string; is_default_for_all: boolean; supports_partner_orders: boolean };
type DeliveryForm = { name: string; postal_code: string; address: string; number: string; complement: string; district: string; city: string; state: string };
const emptyDelivery: DeliveryForm = { name: '', postal_code: '', address: '', number: '', complement: '', district: '', city: '', state: '' };
const money = (value: number, currency = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
const orderModeLabels: Record<string, string> = { quote: 'Cotação', direct: 'Pedido direto', both: 'Cotação e pedido direto' };

export function SupplyTab({ onShowSummary }: { onShowSummary: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [maxUserSuppliers, setMaxUserSuppliers] = useState(2);
  const [preferredIds, setPreferredIds] = useState<string[]>([]);
  const [pendingSupplierId, setPendingSupplierId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [offers, setOffers] = useState<SupplierOfferView[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [partnerOrderId, setPartnerOrderId] = useState<string | null>(null);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(emptyDelivery);
  const [submittingPartner, setSubmittingPartner] = useState(false);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);

    // Offers are scoped to suppliers the admin marked as defaults for every
    // account, plus whichever suppliers this user picked below — see
    // supabase/migrations/0064_user_supplier_preferences.sql.
    const [supplierResult, settingsResult, preferencesResult, orderResult] = await Promise.all([
      supabase.from('suppliers').select('id, name, description, order_mode, is_default_for_all, supports_partner_orders').eq('active', true).eq('ordering_enabled', true).order('name'),
      supabase.from('app_settings').select('max_user_suppliers').eq('id', true).single(),
      uid
        ? supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', uid)
        : Promise.resolve({ data: [] as { supplier_id: string }[], error: null }),
      supabase.from('purchase_orders').select('id, supplier_id, created_at, request_type, status, currency, subtotal, total_amount, external_order_id, suppliers(name), purchase_order_items(id, product_model, supplier_sku, quantity, unit_price, line_total)').order('created_at', { ascending: false }).limit(50),
    ]);
    const supplierList = (supplierResult.data ?? []) as Supplier[];
    const preferredSupplierIds = ((preferencesResult.data ?? []) as { supplier_id: string }[]).map((row) => row.supplier_id);
    const allowedSupplierIds = [...new Set([
      ...supplierList.filter((supplier) => supplier.is_default_for_all).map((supplier) => supplier.id),
      ...preferredSupplierIds,
    ])];

    const offerResult = await supabase.from('supplier_offers').select('id, supplier_id, unit_price, stock_quantity, lead_time_days, minimum_quantity, valid_until, supplier_product_mappings!inner(product_type, product_model, supplier_sku, pack_quantity), suppliers!inner(name, currency, order_mode, minimum_order_value)').eq('active', true).in('supplier_id', allowedSupplierIds).order('unit_price');

    const error = supplierResult.error ?? settingsResult.error ?? preferencesResult.error ?? offerResult.error ?? orderResult.error;
    if (error) setMessage(error.message);
    setSuppliers(supplierList);
    setMaxUserSuppliers(settingsResult.data?.max_user_suppliers ?? 2);
    setPreferredIds(preferredSupplierIds);
    setOffers((offerResult.data ?? []) as unknown as SupplierOfferView[]);
    setOrders((orderResult.data ?? []) as unknown as Order[]);
  }, [supabase]);
  useEffect(() => {
    // Initial remote-resource synchronization; state updates happen after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const defaultSuppliers = suppliers.filter((supplier) => supplier.is_default_for_all);
  const selectableSuppliers = suppliers.filter((supplier) => !supplier.is_default_for_all);
  const atSupplierLimit = preferredIds.length >= maxUserSuppliers;

  async function toggleSupplier(supplier: Supplier) {
    if (!userId || pendingSupplierId) return;
    const selected = preferredIds.includes(supplier.id);
    if (!selected && atSupplierLimit) return setMessage(`Limite de ${maxUserSuppliers} fornecedores atingido. Remova um para adicionar outro.`);

    setPendingSupplierId(supplier.id);
    setMessage(null);
    const { error } = selected
      ? await supabase.from('user_supplier_preferences').delete().eq('user_id', userId).eq('supplier_id', supplier.id)
      : await supabase.from('user_supplier_preferences').insert({ user_id: userId, supplier_id: supplier.id });
    if (error) setMessage(error.message);
    else { setPreferredIds((current) => (selected ? current.filter((id) => id !== supplier.id) : [...current, supplier.id])); await load(); }
    setPendingSupplierId(null);
  }

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

  function openPartnerForm(orderId: string) {
    setPartnerOrderId(orderId); setDeliveryForm(emptyDelivery); setMessage(null);
  }

  async function submitToPartner(orderId: string) {
    const missing = (['postal_code', 'address', 'number', 'city', 'state'] as const).find((field) => !deliveryForm[field].trim());
    if (missing) return setMessage('Preencha o endereço de entrega completo.');
    setSubmittingPartner(true); setMessage(null);
    const response = await fetch(`/api/purchase-orders/${orderId}/submit-to-partner`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(deliveryForm),
    });
    const result = await response.json();
    if (response.ok) { setMessage(`Pedido enviado ao fornecedor. Nº ${result.saleNumber}.`); setPartnerOrderId(null); await load(); }
    else setMessage(result.error);
    setSubmittingPartner(false);
  }

  return <div className="space-y-5 py-5">
    <PageHeader><div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Fornecedores e Compras</h1><p className="text-sm text-muted-foreground">Escolha seus fornecedores preferidos, compare ofertas e acompanhe seus pedidos.</p></div></PageHeader>
    {message && <div role="status" className="rounded-lg border px-3 py-2 text-sm">{message}</div>}

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4"/>Meus fornecedores ({preferredIds.length}/{maxUserSuppliers})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {defaultSuppliers.length > 0 && <div className="space-y-2">
          <p className="text-xs text-muted-foreground"><ShieldCheck className="mr-1 inline h-3.5 w-3.5"/>Padrão para todas as contas — não contam na sua cota de {maxUserSuppliers}.</p>
          {defaultSuppliers.map((supplier) => <div key={supplier.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span>{supplier.name}</span><Badge variant="outline"><Lock className="mr-1 h-3 w-3"/>Padrão</Badge></div>)}
        </div>}
        {selectableSuppliers.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhum fornecedor disponível para seleção no momento.</p> : selectableSuppliers.map((supplier) => {
          const selected = preferredIds.includes(supplier.id);
          const disabled = !userId || pendingSupplierId === supplier.id || (!selected && atSupplierLimit);
          return <label key={supplier.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${disabled && !selected ? 'opacity-50' : ''} ${selected ? 'border-primary bg-primary/5' : ''}`}>
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleSupplier(supplier)}/>
              <span><span className="font-medium">{supplier.name}</span>{supplier.description && <span className="ml-2 text-xs text-muted-foreground">{supplier.description}</span>}</span>
            </span>
            <Badge variant="outline">{orderModeLabels[supplier.order_mode] ?? supplier.order_mode}</Badge>
          </label>;
        })}
      </CardContent>
    </Card>

    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="shrink-0 font-semibold">Ofertas disponíveis</h2><Input aria-label="Buscar ofertas" className="max-w-xs" placeholder="Produto, SKU ou fornecedor" value={query} onChange={(e) => setQuery(e.target.value)}/></div>
      {filtered.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Ainda não há ofertas disponíveis. Verifique se você escolheu fornecedores acima, ou aguarde a sincronização de preços.</CardContent></Card> : <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">{filtered.map((offer) => { const mapping = offer.supplier_product_mappings; const quantity = cart[offer.id] ?? 0; return <Card key={offer.id} className={quantity ? 'border-primary/50' : ''}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><div><CardTitle className="text-base">{mapping.product_model}</CardTitle><p className="text-xs text-muted-foreground">{offer.suppliers.name} · SKU {mapping.supplier_sku}</p></div><Badge variant="outline">{mapping.product_type === 'inverter' ? 'Inversor' : mapping.product_type === 'battery' ? 'Bateria' : 'Acessório'}</Badge></div></CardHeader><CardContent><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-lg font-semibold">{money(offer.unit_price, offer.suppliers.currency)}</p><p className="text-xs text-muted-foreground">{offer.stock_quantity == null ? 'Estoque sob consulta' : `${offer.stock_quantity} em estoque`}{offer.lead_time_days != null ? ` · ${offer.lead_time_days} dias` : ''}</p></div><div className="flex items-center rounded-lg border"><Button variant="ghost" size="icon-sm" aria-label="Diminuir" disabled={!quantity} onClick={() => changeQuantity(offer, quantity - 1)}><Minus className="h-3.5 w-3.5"/></Button><span className="w-8 text-center text-sm">{quantity}</span><Button variant="ghost" size="icon-sm" aria-label="Aumentar" onClick={() => changeQuantity(offer, Math.max(offer.minimum_quantity, quantity + 1))}><Plus className="h-3.5 w-3.5"/></Button></div></div></CardContent></Card>; })}</div>}
    </section>

    {/* Below `xl` the cart only lives in the summary drawer (see PageSummary
     * below), which has no visible trigger of its own outside the `lg`-only
     * floating button — this keeps the cart reachable on phones too. */}
    {cartOffers.length > 0 && <Button className="xl:hidden" onClick={onShowSummary}><ShoppingCart className="h-4 w-4"/>Ver carrinho ({cartOffers.length}) · {money(subtotal, cartSupplier?.currency)}</Button>}

    <PageSummary>
      <h2 className="flex items-center gap-2 text-base font-semibold"><ShoppingCart className="h-4 w-4"/>Carrinho</h2>
      <div className="space-y-3">{cartOffers.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Adicione produtos de um fornecedor.</p> : <>{cartOffers.map((offer) => <div key={offer.id} className="flex justify-between gap-3 border-b pb-2 text-sm"><span>{cart[offer.id]}× {offer.supplier_product_mappings.product_model}</span><strong>{money(offer.unit_price * cart[offer.id], offer.suppliers.currency)}</strong></div>)}<div className="flex justify-between"><span>Subtotal</span><strong>{money(subtotal, cartSupplier?.currency)}</strong></div>{subtotal < Number(cartSupplier?.minimum_order_value ?? 0) && <p className="text-xs text-destructive">Pedido mínimo: {money(Number(cartSupplier?.minimum_order_value), cartSupplier?.currency)}</p>}<textarea className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" placeholder="Observações para o fornecedor" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)}/><div className="grid gap-2">{['quote','both'].includes(cartSupplier?.order_mode ?? '') && <Button disabled={busy || subtotal < Number(cartSupplier?.minimum_order_value ?? 0)} onClick={() => createOrder('quote')}>Solicitar cotação</Button>}{['direct','both'].includes(cartSupplier?.order_mode ?? '') && <Button variant="outline" disabled={busy || subtotal < Number(cartSupplier?.minimum_order_value ?? 0)} onClick={() => createOrder('direct')}>Criar pedido</Button>}<Button variant="ghost" onClick={() => setCart({})}>Limpar carrinho</Button></div></>}</div>
    </PageSummary>
    <section className="space-y-3"><h2 className="flex items-center gap-2 font-semibold"><PackageCheck className="h-4 w-4"/>Meus pedidos</h2>{orders.length === 0 ? <p className="text-sm text-muted-foreground">Você ainda não fez pedidos.</p> : orders.map((order) => {
      const canSubmitToPartner = order.status === 'requested' && !order.external_order_id && suppliers.find((s) => s.id === order.supplier_id)?.supports_partner_orders;
      return <Card key={order.id}>
        <CardContent className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2"><strong>{order.suppliers.name}</strong><Badge variant="outline">{orderStatusLabels[order.status] ?? order.status}</Badge><Badge variant="secondary">{order.request_type === 'quote' ? 'Cotação' : 'Pedido direto'}</Badge>{order.external_order_id && <Badge variant="outline">Nº {order.external_order_id}</Badge>}</div>
            <p className="mt-1 text-xs text-muted-foreground">#{order.id.slice(0,8)} · {new Date(order.created_at).toLocaleString('pt-BR')}</p>
            <p className="mt-2 text-sm">{order.purchase_order_items.map((item) => `${item.quantity}× ${item.product_model}`).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{money(order.total_amount ?? order.subtotal, order.currency)}</p>
            {['requested','under_review','quoted'].includes(order.status) && <Button variant="ghost" size="sm" className="mt-1" onClick={() => cancelOrder(order.id)}>Cancelar</Button>}
            {canSubmitToPartner && <Button variant="outline" size="sm" className="mt-1" onClick={() => openPartnerForm(order.id)}>Enviar ao fornecedor</Button>}
          </div>
        </CardContent>
        {partnerOrderId === order.id && <CardContent className="grid gap-2 border-t pt-3 sm:grid-cols-2">
          <p className="text-xs text-muted-foreground sm:col-span-2">Endereço de entrega para o fornecedor processar o pedido.</p>
          <Input placeholder="Destinatário (opcional)" value={deliveryForm.name} onChange={(e) => setDeliveryForm({ ...deliveryForm, name: e.target.value })}/>
          <Input placeholder="CEP" value={deliveryForm.postal_code} onChange={(e) => setDeliveryForm({ ...deliveryForm, postal_code: e.target.value })}/>
          <Input placeholder="Endereço" value={deliveryForm.address} onChange={(e) => setDeliveryForm({ ...deliveryForm, address: e.target.value })}/>
          <Input placeholder="Número" value={deliveryForm.number} onChange={(e) => setDeliveryForm({ ...deliveryForm, number: e.target.value })}/>
          <Input placeholder="Complemento (opcional)" value={deliveryForm.complement} onChange={(e) => setDeliveryForm({ ...deliveryForm, complement: e.target.value })}/>
          <Input placeholder="Bairro (opcional)" value={deliveryForm.district} onChange={(e) => setDeliveryForm({ ...deliveryForm, district: e.target.value })}/>
          <Input placeholder="Cidade" value={deliveryForm.city} onChange={(e) => setDeliveryForm({ ...deliveryForm, city: e.target.value })}/>
          <Input placeholder="UF" maxLength={2} value={deliveryForm.state} onChange={(e) => setDeliveryForm({ ...deliveryForm, state: e.target.value.toUpperCase() })}/>
          <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={submittingPartner} onClick={() => submitToPartner(order.id)}>Confirmar envio</Button><Button size="sm" variant="ghost" onClick={() => setPartnerOrderId(null)}>Cancelar</Button></div>
        </CardContent>}
      </Card>;
    })}</section>
  </div>;
}
