'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isAddressEmpty } from '@/lib/address';
import { createClient } from '@/lib/supabase/client';
import { useWizardStore } from '@/lib/store/wizard-store';
import type { SupplierOfferView } from '@/lib/procurement/types';
import type { Solution, StockProductType } from '@/lib/types';
import { batteryQuantityBreakdown, normalizeAccessoryLine } from '../helpers';
import { PageHeader, PageSummary } from '../shell/slots';
import { SupplyLoadingSkeleton } from '../shared-ui';
import type { BatteryCatalogOption, InlineProfile } from '../types';
import { CartSummary } from './supply/CartSummary';
import { ImportProjectPicker, type ImportCandidate } from './supply/ImportProjectPicker';
import { OffersSection } from './supply/OffersSection';
import { OrdersSection } from './supply/OrdersSection';
import { SupplierPreferencesCard } from './supply/SupplierPreferencesCard';
import { emptyDelivery, money, nonEmptyDeliveryFields, type Cart, type DeliveryForm, type Order, type Supplier } from './supply/types';

export function SupplyTab({
  onShowSummary,
  batteryCatalog = [],
  autoImportFromSolution = false,
  onAutoImportHandled,
  profile = null,
}: {
  onShowSummary: () => void;
  batteryCatalog?: BatteryCatalogOption[];
  /** Set by "Cotar solução" (Dimensionamento) to trigger importFromSolution
   *  automatically once this tab's offers have loaded, instead of requiring
   *  a second click on "Importar itens do projeto" below. */
  autoImportFromSolution?: boolean;
  onAutoImportHandled?: () => void;
  profile?: InlineProfile | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { solution, projectInfo, savedProjects, currentProjectId } = useWizardStore();
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [maxUserSuppliers, setMaxUserSuppliers] = useState(2);
  const [preferredIds, setPreferredIds] = useState<string[]>([]);
  const [pendingSupplierId, setPendingSupplierId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [offers, setOffers] = useState<SupplierOfferView[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Cart>({});
  // Set when the cart's items came from "Importar itens do projeto" —
  // create_purchase_order already accepts a project_id (see migration 0063),
  // this is just the frontend finally threading it through so a project's
  // purchase history stays traceable afterward. Cleared alongside the cart.
  const [cartProjectId, setCartProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Collected at checkout, optional — passed straight into create_purchase_order
  // so the supplier has it from the start, whichever path the order later
  // takes (automatic partner push or manual email). Cleared alongside the
  // cart/notes once the order is created.
  const [checkoutDelivery, setCheckoutDelivery] = useState<DeliveryForm>(emptyDelivery);
  const [partnerOrderId, setPartnerOrderId] = useState<string | null>(null);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(emptyDelivery);
  const [submittingPartner, setSubmittingPartner] = useState(false);
  const [emailOrderId, setEmailOrderId] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  // Epoch ms (per order) until "Notificar por email" is allowed again — the
  // server enforces the real 10-minute cooldown (it reads back
  // purchase_order_events, so it holds even across reloads/other tabs); this
  // just avoids letting the user fire an attempt that's certain to be
  // rejected right after a send.
  const [emailCooldownUntil, setEmailCooldownUntil] = useState<Record<string, number>>({});
  // Only used to force a re-render as each cooldown lapses (so the button
  // re-enables on its own) — the value itself is never read.
  const [, setCooldownTick] = useState(0);

  useEffect(() => {
    if (Object.keys(emailCooldownUntil).length === 0) return;
    const timer = setInterval(() => setCooldownTick((t) => t + 1), 15_000);
    return () => clearInterval(timer);
  }, [emailCooldownUntil]);

  function setSuccess(message: string) {
    setStatus(message);
    setError(null);
  }

  function setFailure(message: string) {
    setError(message);
    setStatus(null);
  }

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(timer);
  }, [status]);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);

    // Offers are scoped to suppliers the admin marked as defaults for every
    // account, plus whichever suppliers this user picked below — see
    // supabase/migrations/0064_user_supplier_preferences.sql. app_settings and
    // user_supplier_preferences are both RLS-restricted to signed-in users, so
    // a signed-out visitor skips them entirely instead of getting a raw
    // Postgrest "no rows" error back from app_settings' .single().
    const [supplierResult, settingsResult, preferencesResult, orderResult] = await Promise.all([
      supabase
        .from('suppliers')
        .select('id, name, description, order_mode, is_default_for_all, supports_partner_orders, email')
        .eq('active', true)
        .eq('ordering_enabled', true)
        .order('name'),
      uid
        ? supabase.from('app_settings').select('max_user_suppliers').eq('id', true).single()
        : Promise.resolve({ data: null as { max_user_suppliers: number } | null, error: null }),
      uid
        ? supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', uid)
        : Promise.resolve({ data: [] as { supplier_id: string }[], error: null }),
      supabase
        .from('purchase_orders')
        .select(
          'id, supplier_id, created_at, request_type, status, currency, subtotal, total_amount, external_order_id, delivery_address, project_id, projects(name), suppliers(name), purchase_order_items(id, product_model, supplier_sku, quantity, unit_price, line_total)'
        )
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    const supplierList = (supplierResult.data ?? []) as Supplier[];
    const defaultSupplierIds = new Set(
      supplierList.filter((supplier) => supplier.is_default_for_all).map((supplier) => supplier.id)
    );
    // A supplier promoted to default-for-all after the user already picked
    // it shouldn't keep eating into their quota — supabase/migrations/0072
    // cleans up the underlying row, but this filter keeps the count correct
    // client-side too regardless of when that cleanup has run.
    const preferredSupplierIds = ((preferencesResult.data ?? []) as { supplier_id: string }[])
      .map((row) => row.supplier_id)
      .filter((id) => !defaultSupplierIds.has(id));
    const allowedSupplierIds = [
      ...new Set([
        ...supplierList.filter((supplier) => supplier.is_default_for_all).map((supplier) => supplier.id),
        ...preferredSupplierIds,
      ]),
    ];

    const offerResult = await supabase
      .from('supplier_offers')
      .select(
        'id, supplier_id, unit_price, stock_quantity, lead_time_days, minimum_quantity, valid_until, supplier_product_mappings!inner(product_type, product_model, supplier_sku, pack_quantity), suppliers!inner(name, currency, order_mode, minimum_order_value)'
      )
      .eq('active', true)
      .in('supplier_id', allowedSupplierIds)
      // Safety cap — this page has no pagination UI yet; revisit if a catalog
      // ever legitimately needs more offers visible at once.
      .limit(300)
      .order('unit_price');

    const loadError = supplierResult.error ?? settingsResult.error ?? preferencesResult.error ?? offerResult.error ?? orderResult.error;
    if (loadError) setFailure(loadError.message);
    setSuppliers(supplierList);
    setMaxUserSuppliers(settingsResult.data?.max_user_suppliers ?? 2);
    setPreferredIds(preferredSupplierIds);
    setOffers((offerResult.data ?? []) as unknown as SupplierOfferView[]);
    setOrders((orderResult.data ?? []) as unknown as Order[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // Initial remote-resource synchronization; state updates happen after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const atSupplierLimit = preferredIds.length >= maxUserSuppliers;

  async function toggleSupplier(supplier: Supplier) {
    if (!userId || pendingSupplierId) return;
    const selected = preferredIds.includes(supplier.id);
    if (!selected && atSupplierLimit) {
      return setFailure(`Limite de ${maxUserSuppliers} fornecedores atingido. Remova um para adicionar outro.`);
    }

    setPendingSupplierId(supplier.id);
    setError(null);
    const { error: toggleError } = selected
      ? await supabase.from('user_supplier_preferences').delete().eq('user_id', userId).eq('supplier_id', supplier.id)
      : await supabase.from('user_supplier_preferences').insert({ user_id: userId, supplier_id: supplier.id });
    if (toggleError) {
      setFailure(toggleError.message);
    } else {
      setPreferredIds((current) => (selected ? current.filter((id) => id !== supplier.id) : [...current, supplier.id]));
      await load();
    }
    setPendingSupplierId(null);
  }

  const selectedSupplierCount = suppliers.filter((supplier) => supplier.is_default_for_all).length + preferredIds.length;

  const cartOffers = offers.filter((offer) => cart[offer.id]);
  const supplierIds = [...new Set(cartOffers.map((offer) => offer.supplier_id))];
  const cartSupplierId = supplierIds[0];
  const cartSupplier = cartOffers[0]?.suppliers;
  const subtotal = cartOffers.reduce((sum, offer) => sum + offer.unit_price * cart[offer.id], 0);

  function changeQuantity(offer: SupplierOfferView, quantity: number) {
    if (cartSupplierId && offer.supplier_id !== cartSupplierId) {
      return setFailure('Finalize ou limpe o carrinho atual antes de escolher outro fornecedor.');
    }
    const maximum = offer.stock_quantity ?? 9999;
    const normalized = Math.min(maximum, Math.max(0, quantity));
    setCart((current) => {
      const next = { ...current };
      if (!normalized) delete next[offer.id];
      else next[offer.id] = normalized;
      return next;
    });
    setError(null);
  }

  async function createOrder(requestType: 'quote' | 'direct') {
    if (!cartSupplierId || cartOffers.length === 0) return;
    setBusy(true);
    setError(null);
    const { data, error: createError } = await supabase.rpc('create_purchase_order', {
      p_supplier_id: cartSupplierId,
      p_request_type: requestType,
      p_items: cartOffers.map((offer) => ({ offer_id: offer.id, quantity: cart[offer.id] })),
      p_idempotency_key: crypto.randomUUID(),
      p_project_id: cartProjectId,
      p_delivery_address: nonEmptyDeliveryFields(checkoutDelivery),
      p_customer_notes: notes || null,
    });
    if (createError) {
      setFailure(createError.message);
    } else {
      setSuccess(
        `${requestType === 'quote' ? 'Cotação solicitada' : 'Pedido criado'} com sucesso. Protocolo #${String(data).slice(0, 8)}.`
      );
      setCart({});
      setNotes('');
      setCheckoutDelivery(emptyDelivery);
      setCartProjectId(null);
      await load();
    }
    setBusy(false);
  }

  function updateCheckoutDeliveryField(field: keyof DeliveryForm, value: string) {
    setCheckoutDelivery((current) => ({ ...current, [field]: value }));
  }

  const hasCompanyAddress = Boolean(profile && !isAddressEmpty(profile.companyAddress));

  // One-off fill, not a persistent binding — lets the checkout address start
  // from the company's own registered address (Perfil) instead of typed from
  // scratch, while staying just as editable/overridable afterward as any
  // manually-entered delivery address.
  function useCompanyAddressForDelivery() {
    if (!profile) return;
    setCheckoutDelivery({
      name: profile.companyName,
      postal_code: profile.companyAddress.postalCode,
      address: profile.companyAddress.street,
      number: profile.companyAddress.number,
      complement: profile.companyAddress.complement,
      district: profile.companyAddress.district,
      city: profile.companyAddress.city,
      state: profile.companyAddress.state,
    });
  }

  async function cancelOrder(id: string) {
    const { error: cancelError } = await supabase.rpc('cancel_purchase_order', { p_order_id: id });
    if (cancelError) setFailure(cancelError.message);
    else setSuccess('Pedido cancelado.');
    await load();
  }

  function openPartnerForm(orderId: string) {
    setPartnerOrderId(orderId);
    // Pre-fill from whatever address the customer already gave at checkout —
    // still shown (not skipped) so they can review/complete it before this
    // irreversible push to the partner's API, but not retyped from scratch.
    const order = orders.find((item) => item.id === orderId);
    setDeliveryForm({ ...emptyDelivery, ...(order?.delivery_address ?? {}) });
    setError(null);
  }

  function updateDeliveryField(field: keyof DeliveryForm, value: string) {
    setDeliveryForm((current) => ({ ...current, [field]: value }));
  }

  async function submitToPartner(orderId: string) {
    const missing = (['postal_code', 'address', 'number', 'city', 'state'] as const).find(
      (field) => !deliveryForm[field].trim()
    );
    if (missing) return setFailure('Preencha o endereço de entrega completo.');
    setSubmittingPartner(true);
    setError(null);
    try {
      const response = await fetch(`/api/purchase-orders/${orderId}/submit-to-partner`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(deliveryForm),
      });
      const result = await response.json();
      if (response.ok) {
        setSuccess(`Pedido enviado ao fornecedor. Nº ${result.saleNumber}.`);
        setPartnerOrderId(null);
        await load();
      } else {
        setFailure(result.error ?? 'Erro ao enviar pedido ao fornecedor.');
      }
    } catch {
      setFailure('Erro ao enviar pedido ao fornecedor. Verifique sua conexão e tente novamente.');
    } finally {
      setSubmittingPartner(false);
    }
  }

  function openEmailForm(orderId: string, supplierName: string) {
    setEmailOrderId(orderId);
    setEmailMessage(
      `Olá, ${supplierName}!\n\nSegue em anexo nossa solicitação de cotação com os produtos e quantidades necessários. Poderiam nos retornar com preço, prazo de entrega e condições de pagamento?\n\nFico à disposição para qualquer dúvida.\n\nAtenciosamente.`
    );
    setError(null);
  }

  async function notifySupplierByEmail(orderId: string) {
    if (!emailMessage.trim()) return setFailure('Escreva uma mensagem para o fornecedor.');
    setSendingEmail(true);
    setError(null);
    try {
      const response = await fetch(`/api/purchase-orders/${orderId}/notify-supplier-email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: emailMessage }),
      });
      const result = await response.json();
      if (response.ok) {
        setSuccess('Email enviado ao fornecedor, com cópia para você.');
        setEmailOrderId(null);
        setEmailCooldownUntil((c) => ({ ...c, [orderId]: Date.now() + 10 * 60 * 1000 }));
      } else {
        setFailure(result.error ?? 'Erro ao enviar email ao fornecedor.');
        if (response.status === 429 && typeof result.retryAfterSeconds === 'number') {
          setEmailCooldownUntil((c) => ({ ...c, [orderId]: Date.now() + result.retryAfterSeconds * 1000 }));
        }
      }
    } catch {
      setFailure('Erro ao enviar email ao fornecedor. Verifique sua conexão e tente novamente.');
    } finally {
      setSendingEmail(false);
    }
  }

  // Every project with a calculated solution is a valid import source, not
  // just whatever happens to be live in the wizard right now — a project
  // loaded elsewhere (e.g. re-opened from "Projeto") already carries its own
  // stored solution even without touching Dimensionamento again this
  // session. The currently-open project (if any) uses the live `solution`
  // instead of its stored one, since that's the freshest data if it was just
  // recalculated and not saved yet.
  const importCandidates = useMemo<ImportCandidate[]>(() => {
    const candidates: ImportCandidate[] = [];
    if (!currentProjectId && solution) {
      candidates.push({ id: '__draft__', name: projectInfo.name.trim() || 'Solução atual (não salva)', solution });
    }
    for (const project of savedProjects) {
      const projectSolution = project.id === currentProjectId ? (solution ?? project.solution) : project.solution;
      if (!projectSolution) continue;
      candidates.push({ id: project.id, name: project.name.trim() || 'Projeto sem nome', solution: projectSolution });
    }
    return candidates;
  }, [savedProjects, currentProjectId, solution, projectInfo.name]);

  // Resolves which supplier a solution's items would import from (whichever
  // supplier already has items in the cart, or the cheapest one offering the
  // solution's inverter — mirrors the single-supplier-per-cart rule enforced
  // in changeQuantity) and matches each wanted item against that supplier's
  // offers. Shared by the actual import and by the picker's upfront
  // compatibility check, so both agree on exactly the same result.
  function resolveImportPlan(targetSolution: Solution) {
    const batteryParts = batteryQuantityBreakdown(
      targetSolution.batteryModel,
      targetSolution.batteryQty,
      batteryCatalog,
      (targetSolution.inverterQty ?? 1) * (targetSolution.batteryPortsUsed ?? 1)
    );
    const wanted: { productType: StockProductType; model: string; qty: number }[] = [
      { productType: 'inverter', model: targetSolution.inverterModel, qty: targetSolution.inverterQty ?? 1 },
      ...batteryParts.map((part) => ({ productType: 'battery' as const, model: part.model, qty: part.qty })),
      ...targetSolution.accessories.flatMap((accessory) => {
        const { model, qty, optional, bundled } = normalizeAccessoryLine(accessory);
        return bundled || optional ? [] : [{ productType: 'accessory' as const, model, qty }];
      }),
    ];

    const inverterOffers = offers.filter(
      (offer) =>
        offer.supplier_product_mappings.product_type === 'inverter' &&
        offer.supplier_product_mappings.product_model === targetSolution.inverterModel
    );
    const targetSupplierId = cartSupplierId ?? inverterOffers[0]?.supplier_id ?? null;
    if (!targetSupplierId) {
      return { targetSupplierId: null, matches: [], unmatched: wanted.map((item) => item.model) };
    }

    const matches: { item: (typeof wanted)[number]; offer: SupplierOfferView }[] = [];
    const unmatched: string[] = [];
    for (const item of wanted) {
      const offer = offers.find(
        (candidate) =>
          candidate.supplier_id === targetSupplierId &&
          candidate.supplier_product_mappings.product_type === item.productType &&
          candidate.supplier_product_mappings.product_model === item.model
      );
      if (!offer) unmatched.push(item.model);
      else matches.push({ item, offer });
    }
    return { targetSupplierId, matches, unmatched };
  }

  // Only projects whose every item already has an offer from the resolved
  // supplier show as importable in the picker — an upfront check so an
  // incompatible project reads as such before it's clicked, not just after.
  function checkImportCompatibility(targetSolution: Solution) {
    const plan = resolveImportPlan(targetSolution);
    return { compatible: plan.targetSupplierId !== null && plan.unmatched.length === 0, missing: plan.unmatched };
  }

  // Pre-fills the cart with the chosen project's own inverter/battery/
  // non-bundled accessories. Still used as-is by the auto-import effect
  // below (arriving via "Cotar solução" bypasses the picker and its
  // compatibility gate), which is why it still tolerates and reports a
  // partial match instead of assuming resolveImportPlan found everything.
  function importSolutionItems(targetSolution: Solution) {
    const plan = resolveImportPlan(targetSolution);
    if (!plan.targetSupplierId) {
      return setFailure('Nenhuma oferta de inversor compatível com a solução foi encontrada entre seus fornecedores.');
    }

    const nextCart: Cart = { ...cart };
    for (const { item, offer } of plan.matches) {
      const maximum = offer.stock_quantity ?? item.qty;
      nextCart[offer.id] = Math.max(nextCart[offer.id] ?? 0, Math.min(item.qty, maximum));
    }
    setCart(nextCart);
    if (plan.unmatched.length > 0) {
      setFailure(`Itens sem oferta do fornecedor selecionado, não adicionados: ${plan.unmatched.join(', ')}.`);
    } else {
      setSuccess('Itens da solução adicionados ao carrinho.');
    }
  }

  function handleImportCandidate(candidate: ImportCandidate) {
    importSolutionItems(candidate.solution);
    // '__draft__' is the live, not-yet-saved solution — nothing to link the
    // order to yet, unlike every other candidate, which is a real project id.
    setCartProjectId(candidate.id === '__draft__' ? null : candidate.id);
  }

  useEffect(() => {
    if (!loading && autoImportFromSolution) {
      /* eslint-disable react-hooks/set-state-in-effect -- one-shot reaction to navigating here from "Cotar solução", not a render-time derivation */
      if (solution) {
        importSolutionItems(solution);
        setCartProjectId(currentProjectId);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
      onAutoImportHandled?.();
    }
    // Only re-run when loading finishes or the parent asks for a fresh
    // import — importSolutionItems/onAutoImportHandled are fresh closures
    // every render and would otherwise cause this to fire on every offer/cart change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, autoImportFromSolution]);

  return (
    <div className={`space-y-5 py-5 ${cartOffers.length > 0 ? 'pb-20 xl:pb-5' : ''}`}>
      <PageHeader>
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">
            Escolha seus fornecedores preferidos, compare ofertas e acompanhe seus pedidos.
          </p>
        </div>
      </PageHeader>

      {(status || error) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`rounded-lg border px-3 py-2 text-sm ${
            error ? 'border-destructive/40 text-destructive' : 'border-success/40 text-success'
          }`}
        >
          {error ?? status}
        </div>
      )}

      {loading ? (
        <SupplyLoadingSkeleton />
      ) : (
        <>
          <SupplierPreferencesCard
            suppliers={suppliers}
            preferredIds={preferredIds}
            maxUserSuppliers={maxUserSuppliers}
            userId={userId}
            pendingSupplierId={pendingSupplierId}
            onToggle={toggleSupplier}
          />

          {importCandidates.length > 0 && (
            <ImportProjectPicker
              candidates={importCandidates}
              checkCompatibility={checkImportCompatibility}
              onImport={handleImportCandidate}
            />
          )}

          <OffersSection
            offers={offers}
            query={query}
            onQueryChange={setQuery}
            cart={cart}
            onChangeQuantity={changeQuantity}
            selectedSupplierCount={selectedSupplierCount}
          />

          {/* Below `xl` the cart only lives in the summary drawer (see PageSummary
           * below), which has no visible trigger of its own — this fixed button
           * keeps the cart reachable on phones no matter how far the offers grid
           * has been scrolled. */}
          {cartOffers.length > 0 && (
            <Button
              className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300 xl:hidden"
              onClick={onShowSummary}
            >
              <ShoppingCart className="h-4 w-4" />
              Ver carrinho ({cartOffers.length}) · {money(subtotal, cartSupplier?.currency)}
            </Button>
          )}

          <PageSummary>
            <CartSummary
              cartOffers={cartOffers}
              cart={cart}
              subtotal={subtotal}
              cartSupplier={cartSupplier}
              notes={notes}
              onNotesChange={setNotes}
              busy={busy}
              onCreateOrder={createOrder}
              onClearCart={() => {
                setCart({});
                setCheckoutDelivery(emptyDelivery);
                setCartProjectId(null);
              }}
              deliveryForm={checkoutDelivery}
              onDeliveryFieldChange={updateCheckoutDeliveryField}
              hasCompanyAddress={hasCompanyAddress}
              onUseCompanyAddress={useCompanyAddressForDelivery}
              cartProjectName={cartProjectId ? (savedProjects.find((p) => p.id === cartProjectId)?.name ?? null) : null}
            />
          </PageSummary>

          <OrdersSection
            orders={orders}
            suppliers={suppliers}
            partnerOrderId={partnerOrderId}
            deliveryForm={deliveryForm}
            submittingPartner={submittingPartner}
            onOpenPartnerForm={openPartnerForm}
            onCancelPartnerForm={() => setPartnerOrderId(null)}
            onDeliveryFieldChange={updateDeliveryField}
            onCancelOrder={cancelOrder}
            onSubmitToPartner={submitToPartner}
            emailOrderId={emailOrderId}
            emailMessage={emailMessage}
            sendingEmail={sendingEmail}
            onOpenEmailForm={openEmailForm}
            onCancelEmailForm={() => setEmailOrderId(null)}
            onEmailMessageChange={setEmailMessage}
            onNotifySupplierByEmail={notifySupplierByEmail}
            emailCooldownUntil={emailCooldownUntil}
          />
        </>
      )}
    </div>
  );
}
