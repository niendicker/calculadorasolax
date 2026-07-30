'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Store, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { orderStatusLabels } from '@/lib/procurement/types';

type Supplier = { id: string; name: string; slug: string; active: boolean; ordering_enabled: boolean; order_mode: string; currency: string; minimum_order_value: number; description: string | null };
type Integration = { supplier_id: string; connector_type: string; base_url: string | null; products_path: string; auth_type: string; credential_env_key: string | null; api_key_header: string; enabled: boolean; mapping: Record<string, string>; last_sync_at: string | null; last_sync_status: string | null; last_sync_message: string | null };
type Mapping = { id: string; supplier_id: string; product_type: string; product_model: string; supplier_sku: string; active: boolean };
type Order = { id: string; created_at: string; status: string; request_type: string; subtotal: number; currency: string; profiles?: { full_name: string | null; email: string } | null; suppliers?: { name: string } | null };

const fieldClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm';

export function SuppliersEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [supplierForm, setSupplierForm] = useState({ name: '', slug: '', active: true, ordering_enabled: false, order_mode: 'quote', minimum_order_value: 0, description: '' });
  const [integrationForm, setIntegrationForm] = useState({ connector_type: 'manual', base_url: '', products_path: '', auth_type: 'none', credential_env_key: '', api_key_header: 'x-api-key', enabled: false, items: 'items', sku: 'sku', price: 'price', stock: 'stock', lead_days: 'lead_days' });
  const [mappingForm, setMappingForm] = useState({ product_type: 'inverter', product_model: '', supplier_sku: '', unit_price: '', stock_quantity: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [supplierResult, integrationResult, mappingResult, orderResult] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('supplier_integrations').select('*'),
      supabase.from('supplier_product_mappings').select('*').order('product_model'),
      supabase.from('purchase_orders').select('id, created_at, status, request_type, subtotal, currency, suppliers(name)').order('created_at', { ascending: false }).limit(100),
    ]);
    const error = supplierResult.error ?? integrationResult.error ?? mappingResult.error ?? orderResult.error;
    if (error) setMessage(error.message);
    setSuppliers((supplierResult.data ?? []) as Supplier[]);
    setIntegrations((integrationResult.data ?? []) as Integration[]);
    setMappings((mappingResult.data ?? []) as Mapping[]);
    setOrders((orderResult.data ?? []) as unknown as Order[]);
  }, [supabase]);

  useEffect(() => {
    // Initial remote-resource synchronization; state updates happen after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function transitionOrder(orderId: string, status: string) {
    const { error } = await supabase.rpc('admin_transition_purchase_order', {
      p_order_id: orderId, p_status: status, p_message: null,
    });
    setMessage(error?.message ?? 'Status do pedido atualizado.');
    await load();
  }

  function selectSupplier(id: string) {
    setSelectedId(id);
    const supplier = suppliers.find((item) => item.id === id);
    const integration = integrations.find((item) => item.supplier_id === id);
    if (supplier) setSupplierForm({ name: supplier.name, slug: supplier.slug, active: supplier.active, ordering_enabled: supplier.ordering_enabled, order_mode: supplier.order_mode, minimum_order_value: supplier.minimum_order_value, description: supplier.description ?? '' });
    if (integration) setIntegrationForm({ connector_type: integration.connector_type, base_url: integration.base_url ?? '', products_path: integration.products_path, auth_type: integration.auth_type, credential_env_key: integration.credential_env_key ?? '', api_key_header: integration.api_key_header, enabled: integration.enabled, items: integration.mapping.items ?? 'items', sku: integration.mapping.sku ?? 'sku', price: integration.mapping.price ?? 'price', stock: integration.mapping.stock ?? 'stock', lead_days: integration.mapping.lead_days ?? 'lead_days' });
    else setIntegrationForm((current) => ({ ...current, connector_type: 'manual', base_url: '', products_path: '', auth_type: 'none', credential_env_key: '', enabled: false }));
  }

  async function saveSupplier() {
    setBusy(true); setMessage(null);
    const payload = { ...supplierForm, currency: 'BRL', description: supplierForm.description || null };
    const result = selectedId ? await supabase.from('suppliers').update(payload).eq('id', selectedId).select('id').single() : await supabase.from('suppliers').insert(payload).select('id').single();
    if (result.error) setMessage(result.error.message);
    else { setMessage('Fornecedor salvo.'); setSelectedId(result.data.id); await load(); }
    setBusy(false);
  }

  async function saveIntegration() {
    if (!selectedId) return setMessage('Salve ou selecione um fornecedor primeiro.');
    setBusy(true); setMessage(null);
    const payload = { supplier_id: selectedId, connector_type: integrationForm.connector_type, base_url: integrationForm.base_url || null, products_path: integrationForm.products_path, auth_type: integrationForm.auth_type, credential_env_key: integrationForm.credential_env_key || null, api_key_header: integrationForm.api_key_header, enabled: integrationForm.enabled, mapping: { items: integrationForm.items, sku: integrationForm.sku, price: integrationForm.price, stock: integrationForm.stock, lead_days: integrationForm.lead_days } };
    const { error } = await supabase.from('supplier_integrations').upsert(payload, { onConflict: 'supplier_id' });
    setMessage(error?.message ?? 'Integração salva.'); await load(); setBusy(false);
  }

  async function addMapping() {
    if (!selectedId || !mappingForm.product_model.trim() || !mappingForm.supplier_sku.trim()) return setMessage('Preencha fornecedor, produto e SKU.');
    const { data, error } = await supabase.from('supplier_product_mappings').insert({ supplier_id: selectedId, product_type: mappingForm.product_type, product_model: mappingForm.product_model, supplier_sku: mappingForm.supplier_sku }).select('id').single();
    let offerError = null;
    if (!error && data && mappingForm.unit_price !== '') {
      const result = await supabase.from('supplier_offers').insert({ mapping_id: data.id, supplier_id: selectedId, unit_price: Number(mappingForm.unit_price), stock_quantity: mappingForm.stock_quantity === '' ? null : Number(mappingForm.stock_quantity), active: true });
      offerError = result.error;
    }
    setMessage((error ?? offerError)?.message ?? 'Produto vinculado e oferta publicada.'); if (!error && !offerError) setMappingForm((value) => ({ ...value, product_model: '', supplier_sku: '', unit_price: '', stock_quantity: '' })); await load();
  }

  async function sync() {
    if (!selectedId) return;
    setBusy(true); setMessage('Sincronizando catálogo do fornecedor...');
    const response = await fetch(`/api/admin/suppliers/${selectedId}/sync`, { method: 'POST' });
    const result = await response.json();
    setMessage(response.ok ? `${result.updated} ofertas atualizadas.` : result.error); await load(); setBusy(false);
  }

  const selectedIntegration = integrations.find((item) => item.supplier_id === selectedId);
  return <div className="space-y-4">
    <div><h2 className="text-xl font-semibold">Fornecedores e compras</h2><p className="text-sm text-muted-foreground">Integrações, preços, disponibilidade e fila de pedidos em um único fluxo.</p></div>
    {message && <div role="status" className="rounded-lg border px-3 py-2 text-sm">{message}</div>}
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle className="text-base">Fornecedores</CardTitle></CardHeader><CardContent className="space-y-2">
        <Button variant={!selectedId ? 'default' : 'outline'} className="w-full justify-start" onClick={() => { setSelectedId(''); setSupplierForm({ name: '', slug: '', active: true, ordering_enabled: false, order_mode: 'quote', minimum_order_value: 0, description: '' }); }}>Novo fornecedor</Button>
        {suppliers.map((supplier) => <button key={supplier.id} onClick={() => selectSupplier(supplier.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === supplier.id ? 'border-primary bg-primary/5' : ''}`}><span className="font-medium">{supplier.name}</span><span className="mt-1 flex gap-1"><Badge variant={supplier.active ? 'default' : 'secondary'}>{supplier.active ? 'Ativo' : 'Inativo'}</Badge>{supplier.ordering_enabled && <Badge variant="outline">Pedidos</Badge>}</span></button>)}
      </CardContent></Card>
      <div className="space-y-4">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4"/>Cadastro e capacidade</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          <div><Label>Nome</Label><Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}/></div><div><Label>Identificador</Label><Input placeholder="fornecedor-x" value={supplierForm.slug} onChange={(e) => setSupplierForm({ ...supplierForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}/></div>
          <div><Label>Modalidade</Label><select className={fieldClass} value={supplierForm.order_mode} onChange={(e) => setSupplierForm({ ...supplierForm, order_mode: e.target.value })}><option value="quote">Cotação</option><option value="direct">Pedido direto</option><option value="both">Ambos</option></select></div><div><Label>Pedido mínimo (R$)</Label><Input type="number" min="0" step="0.01" value={supplierForm.minimum_order_value} onChange={(e) => setSupplierForm({ ...supplierForm, minimum_order_value: Number(e.target.value) })}/></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={supplierForm.active} onChange={(e) => setSupplierForm({ ...supplierForm, active: e.target.checked })}/>Fornecedor ativo</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={supplierForm.ordering_enabled} onChange={(e) => setSupplierForm({ ...supplierForm, ordering_enabled: e.target.checked })}/>Aceita pedidos na plataforma</label>
          <div className="sm:col-span-2"><Label>Descrição</Label><Input value={supplierForm.description} onChange={(e) => setSupplierForm({ ...supplierForm, description: e.target.value })}/></div><Button disabled={busy || !supplierForm.name || !supplierForm.slug} onClick={saveSupplier}><Save className="h-4 w-4"/>Salvar fornecedor</Button>
        </CardContent></Card>
        {selectedId && <Card><CardHeader><CardTitle className="text-base">API de preços e estoque</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          <div><Label>Conector</Label><select className={fieldClass} value={integrationForm.connector_type} onChange={(e) => setIntegrationForm({ ...integrationForm, connector_type: e.target.value })}><option value="manual">Atualização manual</option><option value="generic_json">API JSON genérica</option></select></div><div><Label>Autenticação</Label><select className={fieldClass} value={integrationForm.auth_type} onChange={(e) => setIntegrationForm({ ...integrationForm, auth_type: e.target.value })}><option value="none">Nenhuma</option><option value="bearer">Bearer token</option><option value="api_key">API key</option></select></div>
          <div><Label>URL base HTTPS</Label><Input placeholder="https://api.fornecedor.com/" value={integrationForm.base_url} onChange={(e) => setIntegrationForm({ ...integrationForm, base_url: e.target.value })}/></div><div><Label>Rota de produtos</Label><Input placeholder="v1/products" value={integrationForm.products_path} onChange={(e) => setIntegrationForm({ ...integrationForm, products_path: e.target.value })}/></div>
          <div><Label>Variável de ambiente do segredo</Label><Input placeholder="SUPPLIER_X_API_KEY" value={integrationForm.credential_env_key} onChange={(e) => setIntegrationForm({ ...integrationForm, credential_env_key: e.target.value.toUpperCase() })}/><p className="mt-1 text-xs text-muted-foreground">O valor do segredo nunca é salvo nem exibido no navegador.</p></div><div><Label>Cabeçalho da API key</Label><Input value={integrationForm.api_key_header} onChange={(e) => setIntegrationForm({ ...integrationForm, api_key_header: e.target.value })}/></div>
          {(['items','sku','price','stock','lead_days'] as const).map((field) => <div key={field}><Label>Caminho: {field}</Label><Input value={integrationForm[field]} onChange={(e) => setIntegrationForm({ ...integrationForm, [field]: e.target.value })}/></div>)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={integrationForm.enabled} onChange={(e) => setIntegrationForm({ ...integrationForm, enabled: e.target.checked })}/>Sincronização habilitada</label><div className="flex flex-wrap gap-2"><Button onClick={saveIntegration} disabled={busy}>Salvar API</Button><Button variant="outline" onClick={sync} disabled={busy || integrationForm.connector_type === 'manual'}><RefreshCw className="h-4 w-4"/>Sincronizar</Button></div>
          {selectedIntegration?.last_sync_at && <p className="sm:col-span-2 text-xs text-muted-foreground">Última sincronização: {new Date(selectedIntegration.last_sync_at).toLocaleString('pt-BR')} · {selectedIntegration.last_sync_status} · {selectedIntegration.last_sync_message}</p>}
        </CardContent></Card>}
        {selectedId && <Card><CardHeader><CardTitle className="text-base">Vínculo de SKUs e oferta manual</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[130px_1fr_1fr_120px_110px_auto]"><select className={fieldClass} value={mappingForm.product_type} onChange={(e) => setMappingForm({ ...mappingForm, product_type: e.target.value })}><option value="inverter">Inversor</option><option value="battery">Bateria</option><option value="accessory">Acessório</option></select><Input placeholder="Modelo na plataforma" value={mappingForm.product_model} onChange={(e) => setMappingForm({ ...mappingForm, product_model: e.target.value })}/><Input placeholder="SKU do fornecedor" value={mappingForm.supplier_sku} onChange={(e) => setMappingForm({ ...mappingForm, supplier_sku: e.target.value })}/><Input aria-label="Preço manual" type="number" min="0" step="0.01" placeholder="Preço" value={mappingForm.unit_price} onChange={(e) => setMappingForm({ ...mappingForm, unit_price: e.target.value })}/><Input aria-label="Estoque manual" type="number" min="0" placeholder="Estoque" value={mappingForm.stock_quantity} onChange={(e) => setMappingForm({ ...mappingForm, stock_quantity: e.target.value })}/><Button onClick={addMapping}>Vincular</Button></div>{mappings.filter((item) => item.supplier_id === selectedId).map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span><Badge variant="outline">{item.product_type}</Badge> {item.product_model}</span><code className="text-xs">{item.supplier_sku}</code></div>)}</CardContent></Card>}
      </div>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4"/>Pedidos recentes</CardTitle></CardHeader><CardContent className="space-y-2">{orders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido recebido.</p> : orders.map((order) => <div key={order.id} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[1fr_190px_auto] sm:items-center"><div><p className="font-medium">{order.suppliers?.name ?? 'Fornecedor'} · #{order.id.slice(0, 8)}</p><p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString('pt-BR')} · {order.request_type === 'quote' ? 'Cotação' : 'Pedido direto'}</p></div><select aria-label={`Status do pedido ${order.id.slice(0,8)}`} className={fieldClass} value={order.status} onChange={(event) => void transitionOrder(order.id, event.target.value)}>{Object.entries(orderStatusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><strong>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:order.currency}).format(order.subtotal)}</strong></div>)}</CardContent></Card>
  </div>;
}
