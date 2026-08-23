'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { AlertTriangle, Battery, Boxes, Check, Loader2, Lock, Package, Plus, Search, Truck, Wrench, X, Zap, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { ACCOUNT_LIMITS, isLimitError } from '@/lib/limits';
import { createClient } from '@/lib/supabase/client';
import { listOrderingSuppliers, listSupplierOffers, listUserSupplierPreferences } from '@/lib/data/supplier-repository';
import { USER_SERVICE_PRICING_UNITS, type MarginSettings, type ProductDocument, type StockProductType, type UserServiceItem, type UserServicePricingUnit, type UserStockItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrencyBRL } from '../helpers';
import { PageHeader, PageSummary } from '../shell/slots';
import { CatalogProductCard, DocPreviewModal, ImagePreviewModal } from '../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';

/** Cheapest active offer per `productType:productModel`, among the suppliers
 * this user actually has access to (defaults-for-all + their own picks —
 * same scoping as SupplyTab) — shown as a cost reference next to "Meu preço"
 * so pricing isn't a guessing game. Keyed by string since a plain object is
 * simpler here than a nested map for a lookup this small. */
type SupplierCostMap = Record<string, { unitPrice: number; currency: string }>;

function supplierCostKey(productType: StockProductType, model: string) {
  return `${productType}:${model}`;
}

interface CatalogEntry {
  id: string;
  model: string;
  imageUrl: string | null;
  nickname?: string | null;
  groupKey?: string;
}

interface GroupTab {
  value: string;
  label: string;
}

const inverterPhaseTabs: GroupTab[] = [
  { value: '1', label: 'Monofásico' },
  { value: '2', label: 'Bifásico' },
  { value: '3', label: 'Trifásico' },
];

const batteryTopologyTabs: GroupTab[] = [
  { value: 'HV', label: 'HV' },
  { value: 'LV', label: 'LV' },
];

const sectionDefinitions: {
  type: StockProductType;
  label: string;
  icon: LucideIcon;
  fallbackIcon: React.ReactNode;
  smallIcon: React.ReactNode;
  groupTabs?: GroupTab[];
}[] = [
  {
    type: 'inverter',
    label: 'Inversores',
    icon: Zap,
    fallbackIcon: <Zap className="h-8 w-8 text-muted-foreground" />,
    smallIcon: <Zap className="h-4 w-4 text-muted-foreground" />,
    groupTabs: inverterPhaseTabs,
  },
  {
    type: 'battery',
    label: 'Baterias',
    icon: Battery,
    fallbackIcon: <Battery className="h-8 w-8 text-muted-foreground" />,
    smallIcon: <Battery className="h-4 w-4 text-muted-foreground" />,
    groupTabs: batteryTopologyTabs,
  },
  {
    type: 'accessory',
    label: 'Acessórios',
    icon: Boxes,
    fallbackIcon: <Boxes className="h-8 w-8 text-muted-foreground" />,
    smallIcon: <Boxes className="h-4 w-4 text-muted-foreground" />,
  },
];

export function MyStockTab({
  userStockItems,
  inverterCatalog,
  batteryCatalog,
  accessoryCatalog,
  onAddToStock,
  onUpdateValue,
  onRemove,
  userServices,
  onAddService,
  onUpdateServiceName,
  onUpdateServiceValue,
  onUpdateServicePricingUnit = async () => {},
  onRemoveService,
  marginSettings,
  onUpdateMarginPercent,
}: {
  userStockItems: UserStockItem[];
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  onAddToStock: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
  onUpdateValue: (id: string, unitValue: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  userServices: UserServiceItem[];
  onAddService: (input: { name: string; unitValue: number; pricingUnit?: UserServicePricingUnit }) => Promise<void>;
  onUpdateServiceName: (id: string, name: string) => Promise<void>;
  onUpdateServiceValue: (id: string, unitValue: number) => Promise<void>;
  onUpdateServicePricingUnit?: (id: string, pricingUnit: UserServicePricingUnit) => Promise<void>;
  onRemoveService: (id: string) => Promise<void>;
  marginSettings: MarginSettings;
  onUpdateMarginPercent: (category: StockProductType, percent: number) => Promise<void>;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [activeSection, setActiveSection] = useState<StockProductType>('inverter');
  const [activeMainSection, setActiveMainSection] = useState<'products' | 'services'>('products');
  const [summaryAddOpen, setSummaryAddOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [supplierCosts, setSupplierCosts] = useState<SupplierCostMap>({});
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadSupplierCosts() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      if (!uid) return;

      const [supplierList, preferenceRows] = await Promise.all([
        listOrderingSuppliers(supabase, 'id, is_default_for_all'),
        listUserSupplierPreferences(supabase, uid),
      ]);
      const typedSuppliers = supplierList as unknown as { id: string; is_default_for_all: boolean }[];
      const preferredIds = (preferenceRows as unknown as { supplier_id: string }[]).map((row) => row.supplier_id);
      const allowedSupplierIds = [
        ...new Set([...typedSuppliers.filter((supplier) => supplier.is_default_for_all).map((supplier) => supplier.id), ...preferredIds]),
      ];
      if (allowedSupplierIds.length === 0) return;

      const offers = await listSupplierOffers(
        supabase,
        allowedSupplierIds,
        'unit_price, supplier_product_mappings!inner(product_type, product_model), suppliers!inner(currency)'
      );
      if (cancelled) return;

      const costMap: SupplierCostMap = {};
      for (const offer of offers as unknown as {
        unit_price: number;
        supplier_product_mappings: { product_type: StockProductType; product_model: string };
        suppliers: { currency: string };
      }[]) {
        const key = supplierCostKey(offer.supplier_product_mappings.product_type, offer.supplier_product_mappings.product_model);
        const existing = costMap[key];
        if (!existing || offer.unit_price < existing.unitPrice) {
          costMap[key] = { unitPrice: offer.unit_price, currency: offer.suppliers.currency };
        }
      }
      setSupplierCosts(costMap);
    }

    void loadSupplierCosts();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const atLimit = userStockItems.length >= ACCOUNT_LIMITS.userStockItems;
  const hasUnpricedProduct = userStockItems.some((item) => item.unitValue === 0);
  const hasUnpricedService = userServices.some((service) => service.unitValue === 0);

  const catalogByType: Record<StockProductType, CatalogEntry[]> = {
    inverter: inverterCatalog.map((inverter) => ({
      id: inverter.id,
      model: inverter.model,
      imageUrl: inverter.imageUrl,
      nickname: inverter.nickname,
      groupKey: String(inverter.phases),
    })),
    battery: batteryCatalog.map((battery) => ({
      id: battery.id,
      model: battery.model,
      imageUrl: battery.imageUrl,
      nickname: battery.nickname,
      groupKey: battery.topology,
    })),
    accessory: accessoryCatalog.map((accessory) => ({
      id: accessory.id,
      model: accessory.model,
      imageUrl: accessory.imageUrl,
      nickname: accessory.nickname,
    })),
  };

  const pricedProductCount = userStockItems.filter((item) => item.unitValue > 0).length;
  const unpricedProductCount = userStockItems.length - pricedProductCount;
  const portfolioCost = userStockItems.reduce((total, item) => total + item.unitValue, 0);
  const configuredMarginCount = Object.values(marginSettings).filter((value) => value > 0).length;

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfólio</h1>
          <p className="text-sm text-muted-foreground">
            Seus preços de produtos e serviços, usados nos orçamentos. Para adicionar um novo produto, escolha-o na
            aba Catálogo.
          </p>
        </div>
      </PageHeader>

      <PageSummary>
        <div className="space-y-3" aria-label="Resumo do portfólio">
          <div>
            <h2 className="text-sm font-semibold">Resumo do portfólio</h2>
            <p className="mt-1 text-xs text-muted-foreground">Visão geral dos itens cadastrados.</p>
          </div>
          <div className="space-y-2">
            <PortfolioMetricCard icon={Package} label="Produtos" value={String(userStockItems.length)} detail={`${pricedProductCount} com custo definido`} />
            <PortfolioMetricCard icon={Wrench} label="Serviços" value={String(userServices.length)} detail={`${configuredMarginCount}/3 categorias com markup`} />
            <PortfolioMetricCard
              icon={unpricedProductCount > 0 || hasUnpricedService ? AlertTriangle : Check}
              label="Pendências de preço"
              value={String(unpricedProductCount + (hasUnpricedService ? userServices.filter((service) => service.unitValue === 0).length : 0))}
              detail={unpricedProductCount + (hasUnpricedService ? userServices.filter((service) => service.unitValue === 0).length : 0) === 0 ? 'Tudo pronto para orçamento' : 'Itens precisam de custo'}
              warn={unpricedProductCount > 0 || hasUnpricedService}
            />
            <PortfolioMetricCard icon={Truck} label="Custos cadastrados" value={formatCurrencyBRL(portfolioCost)} detail="Soma dos custos unitários" />
          </div>
        </div>
      </PageSummary>

      <div className="grid grid-cols-2 gap-3" role="tablist" aria-label="Seções do catálogo">
        <PortfolioSectionCard
          active={activeMainSection === 'products'}
          icon={Package}
          label="Produtos"
          count={userStockItems.length}
          countLabel={userStockItems.length === 1 ? 'produto' : 'produtos'}
          warn={hasUnpricedProduct}
          actionLabel={!atLimit ? 'Adicionar produto' : undefined}
          onAction={!atLimit ? () => setSummaryAddOpen(true) : undefined}
          onClick={() => setActiveMainSection('products')}
        />
        <PortfolioSectionCard
          active={activeMainSection === 'services'}
          icon={Wrench}
          label="Serviços"
          count={userServices.length}
          countLabel={userServices.length === 1 ? 'serviço' : 'serviços'}
          warn={hasUnpricedService}
          actionLabel={userServices.length < ACCOUNT_LIMITS.userServices ? 'Adicionar serviço' : undefined}
          onAction={userServices.length < ACCOUNT_LIMITS.userServices ? () => setSummaryAddOpen(true) : undefined}
          onClick={() => setActiveMainSection('services')}
        />
      </div>

        {activeMainSection === 'products' && (
        <>
          {atLimit && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Você atingiu o limite de {ACCOUNT_LIMITS.userStockItems} produtos no seu catálogo. Remova um item para
              adicionar outro.
            </p>
          )}

          <div className="space-y-4">
            <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Tipo de produto">
              {sectionDefinitions.map((section) => {
                const sectionItems = userStockItems.filter((item) => item.productType === section.type);
                return (
                  <PortfolioSectionCard
                    key={section.type}
                    active={activeSection === section.type}
                    icon={section.icon}
                    label={section.label}
                    count={sectionItems.length}
                    countLabel={sectionItems.length === 1 ? 'item' : 'itens'}
                    warn={sectionItems.some((item) => item.unitValue === 0)}
                    compact
                    onClick={() => setActiveSection(section.type)}
                  />
                );
              })}
            </div>

            <div className="min-w-0 space-y-4">
              <div className="rounded-xl border bg-muted/20 p-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  aria-label="Buscar produto no portfólio"
                  placeholder="Buscar modelo ou nome"
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  className="!pl-11"
                />
              </label>
              </div>

              {sectionDefinitions.map((section) => {
              if (section.type !== activeSection) return null;
              const items = userStockItems.filter((item) => item.productType === section.type);
              const normalizedQuery = productQuery.trim().toLowerCase();
              const filteredItems = items.filter((item) => {
                const catalogProduct = catalogByType[section.type].find((product) => product.model === item.productModel);
                return !normalizedQuery || `${item.productModel} ${catalogProduct?.nickname ?? ''}`.toLowerCase().includes(normalizedQuery);
              });
              const marginPercent = marginSettings[marginFieldByProductType[section.type]];
              return (
                <div key={section.type} className="space-y-3">
                  <CategoryMarginInline
                    productType={section.type}
                    marginSettings={marginSettings}
                    onUpdateMarginPercent={onUpdateMarginPercent}
                  />
                  {items.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/20 p-5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><section.icon className="h-5 w-5" aria-hidden="true" /></span>
                      <div><p className="text-sm font-medium">Seu portfólio ainda não tem {section.label.toLowerCase()}.</p><p className="mt-1 text-xs text-muted-foreground">Use o card “Adicionar” abaixo para escolher um item do catálogo.</p></div>
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-muted/20 p-4">
                      <p className="text-sm text-muted-foreground">Nenhum item corresponde à busca ou aos filtros atuais.</p>
                      <Button type="button" size="sm" variant="outline" onClick={() => setProductQuery('')}>Limpar busca</Button>
                    </div>
                  ) : null}
                  <div className="grid gap-3 lg:grid-cols-2">
                    {filteredItems.map((item) => (
                      <StockProductCard
                        key={item.id}
                        item={item}
                        fallbackIcon={section.fallbackIcon}
                        inverterCatalog={inverterCatalog}
                        batteryCatalog={batteryCatalog}
                        accessoryCatalog={accessoryCatalog}
                        onPreviewImage={setPreviewImage}
                        onPreviewDoc={setPreviewDoc}
                        onUpdateValue={onUpdateValue}
                        onRemove={onRemove}
                        marginPercent={marginPercent}
                        supplierCost={supplierCosts[supplierCostKey(item.productType, item.productModel)]}
                      />
                    ))}
                  </div>
                </div>
              );
              })}
              <AddProductCard
                key={activeSection}
                sections={sectionDefinitions}
                catalogByType={catalogByType}
                userStockItems={userStockItems}
                defaultProductType={activeSection}
                atLimit={atLimit}
                stockCount={userStockItems.length}
                stockLimit={ACCOUNT_LIMITS.userStockItems}
                hideTrigger
                open={summaryAddOpen}
                onOpenChange={setSummaryAddOpen}
                onAdd={(productType, model) => onAddToStock({ productType, productModel: model, unitValue: 0 })}
              />
            </div>
          </div>
        </>
      )}

        {activeMainSection === 'services' && (
        <ServicesSection
          userServices={userServices}
          onAddService={onAddService}
          onUpdateServiceName={onUpdateServiceName}
          onUpdateServiceValue={onUpdateServiceValue}
          onUpdateServicePricingUnit={onUpdateServicePricingUnit}
          onRemoveService={onRemoveService}
          addOpen={summaryAddOpen}
          onAddOpenChange={setSummaryAddOpen}
        />
        )}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

/** Section-switcher card — same concept as Dimensionamento's PickerCard
 *  (icon badge + label + status, colored by state) applied to a flatter,
 *  always-2-or-3-way choice: no drill-in/back-button flow, since every
 *  section here is already just a grid of product cards that fits fine on
 *  screen. `warn` mirrors PickerCard's 'warn' state for an item missing
 *  something it needs (here: at least one product in this section with no
 *  "Meu preço" set yet, the same condition StockProductCard itself flags). */
function PortfolioSectionCard({
  active,
  icon: Icon,
  label,
  count,
  countLabel,
  warn,
  compact = false,
  actionLabel,
  onAction,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  count: number;
  countLabel: string;
  warn: boolean;
  compact?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  onClick: () => void;
}) {
  const tabButton = (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        compact
          ? 'flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
          : 'flex min-w-0 flex-1 items-center gap-3 rounded-lg p-4 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        compact
          ? active
            ? 'border-primary text-primary'
            : warn
              ? 'text-destructive hover:bg-destructive/5'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          : active
            ? 'text-primary'
            : warn
              ? 'text-foreground'
              : 'text-foreground'
      )}
    >
      <span
        className={cn(
          compact
            ? 'flex h-7 w-7 shrink-0 items-center justify-center text-current'
            : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
          !compact && active && 'bg-primary/15 text-primary',
          !compact && !active && warn && 'bg-destructive/10 text-destructive'
        )}
      >
          <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('flex items-center gap-1.5 text-sm font-semibold', compact ? 'text-current' : active ? 'text-primary' : 'text-foreground')}>
          {label}
          {warn && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Item sem preço definido" />}
        </p>
        <p className="text-xs text-muted-foreground">
          {count} {countLabel}
        </p>
      </div>
    </button>
  );

  if (compact || !actionLabel || !onAction) return tabButton;

  return (
    <div className={cn(
      'flex w-full min-w-0 items-center rounded-lg border transition',
      active ? 'border-primary bg-primary/5 shadow-sm' : warn ? 'border-destructive/30 bg-card hover:bg-muted/40' : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
    )}>
      {tabButton}
      <button
        type="button"
        aria-label={actionLabel}
        onClick={onAction}
        className="my-3 mr-3 flex h-12 w-32 shrink-0 flex-row items-center justify-center gap-2 rounded-md border border-dashed border-primary/40 bg-background/70 px-2 text-center text-xs font-medium text-primary transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        <span>Adicionar</span>
      </button>
    </div>
  );
}

function PortfolioMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  warn = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  warn?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm', warn && 'border-amber-500/30 bg-amber-500/5')}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary', warn && 'bg-amber-500/10 text-amber-700')}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold text-foreground">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

type InlineSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Wraps an inline (save-on-blur) update call with local status so a failed
 *  write surfaces instead of vanishing silently — these fields have no other
 *  feedback since there's no surrounding form/submit button. */
function useInlineSave<T>(update: (value: T) => Promise<void>) {
  const [state, setState] = useState<InlineSaveState>('idle');
  async function run(value: T) {
    setState('saving');
    try {
      await update(value);
      setState('saved');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
    }
  }
  return [state, run] as const;
}

function InlineSaveStatus({ state }: { state: InlineSaveState }) {
  if (state === 'saving') return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Salvando" />;
  if (state === 'saved') return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Salvo" />;
  if (state === 'error') {
    return (
      <span role="alert" className="text-xs text-destructive">
        Não foi possível salvar
      </span>
    );
  }
  return null;
}

const marginFieldByProductType: Record<StockProductType, keyof MarginSettings> = {
  inverter: 'inverterPercent',
  battery: 'batteryPercent',
  accessory: 'accessoryPercent',
};

/** Sell margin (%) for one product category, applied on top of the stock
 * price entered below — see calculateSystemCost, which every economic
 * analysis (Resumo do projeto, Análise econômica, relatório PDF) goes
 * through. Inline and compact (one line) since it sits inside the category's
 * own tab, next to its product grid, rather than a separate settings card. */
function CategoryMarginInline({
  productType,
  marginSettings,
  onUpdateMarginPercent,
}: {
  productType: StockProductType;
  marginSettings: MarginSettings;
  onUpdateMarginPercent: (category: StockProductType, percent: number) => Promise<void>;
}) {
  const field = marginFieldByProductType[productType];
  const value = marginSettings[field];
  const [saveState, save] = useInlineSave((percent: number) => onUpdateMarginPercent(productType, percent));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
      <div className="min-w-0">
        <label htmlFor={`margin-${productType}`} className="block text-xs font-semibold text-foreground">Markup de venda</label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Aplicado ao custo dos {productType === 'inverter' ? 'inversores' : productType === 'battery' ? 'baterias' : 'acessórios'}.</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          key={value}
          id={`margin-${productType}`}
          type="number"
          min={0}
          step={0.1}
          defaultValue={value}
          onBlur={(event) => {
            const parsed = Number(event.target.value);
            const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
            if (nextValue !== value) void save(nextValue);
          }}
          className="h-9 w-20 rounded-md border border-input bg-background px-2 text-right text-sm font-semibold tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <span className="text-sm font-medium text-muted-foreground">%</span>
        <InlineSaveStatus state={saveState} />
      </div>
    </div>
  );
}

function ServicesSection({
  userServices,
  onAddService,
  onUpdateServiceName,
  onUpdateServiceValue,
  onUpdateServicePricingUnit,
  onRemoveService,
  addOpen,
  onAddOpenChange,
}: {
  userServices: UserServiceItem[];
  onAddService: (input: { name: string; unitValue: number; pricingUnit?: UserServicePricingUnit }) => Promise<void>;
  onUpdateServiceName: (id: string, name: string) => Promise<void>;
  onUpdateServiceValue: (id: string, unitValue: number) => Promise<void>;
  onUpdateServicePricingUnit: (id: string, pricingUnit: UserServicePricingUnit) => Promise<void>;
  onRemoveService: (id: string) => Promise<void>;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}) {
  const atLimit = userServices.length >= ACCOUNT_LIMITS.userServices;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Serviços que você presta (instalação, frete, mão de obra...), com o preço que você define. Somam ao custo
        final da solução quando adicionados a um projeto.
      </p>
      {atLimit && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Você atingiu o limite de {ACCOUNT_LIMITS.userServices} serviços no seu catálogo. Remova um item para
          adicionar outro.
        </p>
      )}
      {userServices.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Você ainda não cadastrou nenhum serviço. Use o card ao lado para adicionar um.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {userServices.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            onUpdateName={onUpdateServiceName}
            onUpdateValue={onUpdateServiceValue}
            onUpdatePricingUnit={onUpdateServicePricingUnit}
            onRemove={onRemoveService}
          />
        ))}
        <AddServiceCard atLimit={atLimit} stockCount={userServices.length} stockLimit={ACCOUNT_LIMITS.userServices} open={addOpen} onOpenChange={onAddOpenChange} onAdd={onAddService} />
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  onUpdateName,
  onUpdateValue,
  onUpdatePricingUnit,
  onRemove,
}: {
  service: UserServiceItem;
  onUpdateName: (id: string, name: string) => Promise<void>;
  onUpdateValue: (id: string, unitValue: number) => Promise<void>;
  onUpdatePricingUnit: (id: string, pricingUnit: UserServicePricingUnit) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [nameSaveState, saveName] = useInlineSave((name: string) => onUpdateName(service.id, name));
  const [valueSaveState, saveValue] = useInlineSave((value: number) => onUpdateValue(service.id, value));
  const [unitSaveState, saveUnit] = useInlineSave((unit: UserServicePricingUnit) => onUpdatePricingUnit(service.id, unit));
  const pricingUnit = service.pricingUnit ?? 'project';
  const pricingDescription = servicePricingDescription(pricingUnit);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-1.5">
          <Input
            key={service.id}
            defaultValue={service.name}
            aria-label={`Nome do serviço ${service.name}`}
            onBlur={(event) => {
              const nextName = event.target.value.trim();
              if (nextName && nextName !== service.name) void saveName(nextName);
            }}
          />
          <InlineSaveStatus state={nameSaveState} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Preço unitário</span>
          <span className="text-xs text-muted-foreground">R$</span>
          <input
            key={`${service.id}-value`}
            type="number"
            min={0}
            step={0.01}
            defaultValue={service.unitValue}
            aria-label={`Preço do serviço ${service.name}`}
            onBlur={(event) => {
              const parsed = Number(event.target.value);
              const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
              if (nextValue !== service.unitValue) void saveValue(nextValue);
            }}
            className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <InlineSaveStatus state={valueSaveState} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`service-unit-${service.id}`} className="text-xs font-medium text-muted-foreground">Cobrar por</label>
          <select
            id={`service-unit-${service.id}`}
            aria-label={`Unidade de cobrança do serviço ${service.name}`}
            value={pricingUnit}
            onChange={(event) => void saveUnit(event.target.value as UserServicePricingUnit)}
            className="h-8 min-w-44 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {USER_SERVICE_PRICING_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label} ({unit.suffix})</option>)}
          </select>
          <InlineSaveStatus state={unitSaveState} />
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Como será calculado</p>
          <p className="mt-0.5">{pricingDescription}</p>
          <p className="mt-1 font-medium text-primary">{formatCurrencyBRL(service.unitValue)} × {pricingUnit === 'project' ? '1 projeto' : 'quantidade encontrada no dimensionamento'}</p>
        </div>
      </div>
      <ConfirmDeleteButton
        ariaLabel={`Remover serviço ${service.name}`}
        title="Remover serviço?"
        description="Esse serviço sai do seu catálogo pessoal. Projetos que já o incluem deixam de ter o preço resolvido."
        confirmLabel="Remover"
        onConfirm={() => onRemove(service.id)}
      />
    </div>
    </div>
  );
}

function servicePricingDescription(unit: UserServicePricingUnit): string {
  switch (unit) {
    case 'project': return 'Valor fixo aplicado uma vez ao projeto.';
    case 'pv_kwp': return 'Multiplica o preço pela potência fotovoltaica da solução, em kWp.';
    case 'nominal_kva': return 'Multiplica o preço pela potência nominal da solução, em kVA.';
    case 'peak_kva': return 'Multiplica o preço pela potência de pico da solução, em kVA.';
    case 'daily_kwh': return 'Multiplica o preço pelo consumo diário calculado, em kWh/dia.';
    case 'battery_qty': return 'Multiplica o preço pela quantidade de baterias da solução.';
    case 'inverter_qty': return 'Multiplica o preço pela quantidade de inversores da solução.';
    case 'accessory_qty': return 'Multiplica o preço pela quantidade de acessórios necessários.';
    case 'load_qty': return 'Multiplica o preço pela quantidade de cargas cadastradas.';
  }
}

function AddServiceCard({
  atLimit,
  stockCount,
  stockLimit,
  open: controlledOpen,
  onOpenChange,
  onAdd,
}: {
  atLimit: boolean;
  stockCount: number;
  stockLimit: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAdd: (input: { name: string; unitValue: number; pricingUnit?: UserServicePricingUnit }) => Promise<void>;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [pricingUnit, setPricingUnit] = useState<UserServicePricingUnit>('project');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  if (atLimit) {
    return (
      <div
        role="status"
        className="grid min-h-[104px] place-items-center gap-1.5 rounded-lg border border-dashed border-input p-3 text-center text-muted-foreground"
      >
        <Lock className="h-6 w-6" aria-hidden="true" />
        <span className="text-sm font-medium">Limite atingido</span>
        <span className="text-xs">{stockCount}/{stockLimit} serviços · remova um item para adicionar outro</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Adicionar serviço ao catálogo"
        className="grid min-h-[104px] cursor-pointer place-items-center gap-1.5 rounded-lg border border-dashed border-input p-3 text-center text-muted-foreground transition hover:border-primary/50 hover:bg-muted/60 hover:text-foreground"
      >
        <Plus className="h-6 w-6" />
        <span className="text-sm font-medium">Adicionar serviço</span>
      </button>
    );
  }

  async function handleAdd() {
    const trimmedName = name.trim();
    const parsedValue = Number(value);
    if (!trimmedName || !Number.isFinite(parsedValue) || parsedValue < 0) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({ name: trimmedName, unitValue: parsedValue, ...(pricingUnit !== 'project' ? { pricingUnit } : {}) });
      setOpen(false);
      setName('');
      setValue('');
      setPricingUnit('project');
    } catch (err) {
      setError(isLimitError(err) ? err.message : 'Não foi possível adicionar o serviço. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Adicionar serviço" className="w-full max-w-lg space-y-4 rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">Novo serviço</p>
            <p className="mt-1 text-sm text-muted-foreground">Defina o preço e como ele será aplicado no orçamento.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Input aria-label="Nome do serviço" placeholder="Ex.: Instalação" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Preço unitário</span>
          <span className="text-xs text-muted-foreground">R$</span>
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder="0,00"
            aria-label="Preço do serviço"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <label htmlFor="new-service-unit" className="text-xs font-medium text-muted-foreground">Cobrar por</label>
        <select id="new-service-unit" aria-label="Unidade de cobrança do serviço" value={pricingUnit} onChange={(event) => setPricingUnit(event.target.value as UserServicePricingUnit)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
          {USER_SERVICE_PRICING_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label} ({unit.suffix})</option>)}
        </select>
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{servicePricingDescription(pricingUnit)}</p>
          <p className="mt-1">Ex.: R$ 350,00/kWp × 6,50 kWp.</p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setError(null); }}>Cancelar</Button>
          <Button type="button" size="sm" disabled={!name.trim() || saving} onClick={handleAdd}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </div>
    </div>
  );
}

function AddProductCard({
  sections,
  catalogByType,
  userStockItems,
  defaultProductType,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  atLimit,
  stockCount,
  stockLimit,
  onAdd,
}: {
  sections: typeof sectionDefinitions;
  catalogByType: Record<StockProductType, CatalogEntry[]>;
  userStockItems: UserStockItem[];
  defaultProductType: StockProductType;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  /** Once the account-wide stock limit is reached, this card can't open the
   * picker at all — showing the count here (not just after a failed add
   * attempt) is the point where the user is actually looking to add
   * something, so it's the clearest place to explain why they can't. */
  atLimit: boolean;
  stockCount: number;
  stockLimit: number;
  onAdd: (productType: StockProductType, model: string) => Promise<void>;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [addingModel, setAddingModel] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [activeProductType, setActiveProductType] = useState<StockProductType>(defaultProductType);
  const [activeGroup, setActiveGroup] = useState<string | null>(sections.find((section) => section.type === defaultProductType)?.groupTabs?.[0]?.value ?? null);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(open) : next;
    if (controlledOpen === undefined) setInternalOpen(resolved);
    onOpenChange?.(resolved);
  };

  // Gates the createPortal call below until after client mount — document
  // doesn't exist during SSR, so this can't be a lazy useState initializer
  // without causing a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || dialogRef.current?.contains(target)) return;
      if (controlledOpen === undefined) setInternalOpen(false);
      onOpenChange?.(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (controlledOpen === undefined) setInternalOpen(false);
        onOpenChange?.(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, controlledOpen, onOpenChange]);

  const normalizedQuery = query.trim().toLowerCase();
  const activeSection = sections.find((section) => section.type === activeProductType) ?? sections[0];
  const availableProducts = catalogByType[activeProductType].filter(
    (product) => !userStockItems.some((item) => item.productType === activeProductType && item.productModel === product.model)
  );
  const visibleProducts = availableProducts
    .filter((product) => !activeSection.groupTabs || product.groupKey === activeGroup)
    .filter((product) => !normalizedQuery || `${product.nickname ?? ''} ${product.model}`.toLowerCase().includes(normalizedQuery));

  async function handleAdd(model: string) {
    setAddingModel(model);
    setAddError(null);
    try {
      await onAdd(activeProductType, model);
      setOpen(false);
    } catch (error) {
      setAddError(isLimitError(error) ? error.message : 'Não foi possível adicionar ao catálogo. Tente novamente.');
    } finally {
      setAddingModel(null);
    }
  }

  const productLabel = activeProductType === 'inverter' ? 'inversor' : activeProductType === 'battery' ? 'bateria' : 'acessório';

  if (atLimit) {
    return (
      <div
        role="status"
        className="grid min-h-[104px] place-items-center gap-1.5 rounded-lg border border-dashed border-input p-3 text-center text-muted-foreground"
      >
        <Lock className="h-6 w-6" aria-hidden="true" />
        <span className="text-sm font-medium">Limite atingido</span>
        <span className="text-xs">
          {stockCount}/{stockLimit} produtos · remova um item para adicionar um {productLabel}
        </span>
      </div>
    );
  }

  return (
    <>
      {!hideTrigger && (
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-label="Adicionar produto ao catálogo"
          onClick={() => setOpen((current) => !current)}
          className="grid min-h-[104px] cursor-pointer place-items-center gap-1.5 rounded-lg border border-dashed border-input p-3 text-center text-muted-foreground transition hover:border-primary/50 hover:bg-muted/60 hover:text-foreground"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-medium">Adicionar</span>
        </button>
      )}

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Escolha um produto do catálogo" className="flex max-h-[min(46rem,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
              <div className="flex items-start justify-between gap-4 border-b p-5">
                <div>
                  <p className="text-base font-semibold">Adicionar produto</p>
                  <p className="mt-1 text-sm text-muted-foreground">Escolha a categoria e depois um item disponível no catálogo.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-1 overflow-x-auto border-b px-4 pt-3" role="tablist" aria-label="Categoria do produto">
                {sections.map((section) => {
                  const active = activeProductType === section.type;
                  const count = catalogByType[section.type].filter((product) => !userStockItems.some((item) => item.productType === section.type && item.productModel === product.model)).length;
                  return (
                    <button
                      key={section.type}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => { setActiveProductType(section.type); setActiveGroup(section.groupTabs?.[0]?.value ?? null); setQuery(''); }}
                      className={cn('flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium transition', active ? 'border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}
                    >
                      <section.icon className="h-4 w-4" aria-hidden="true" />
                      {section.label}
                      <span className="text-xs text-muted-foreground">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="border-b p-4">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input aria-label="Buscar no catálogo" placeholder="Buscar por nome ou modelo" value={query} onChange={(event) => setQuery(event.target.value)} className="!pl-11" autoFocus />
                </label>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row">
                {activeSection.groupTabs && (
                  <div className="flex shrink-0 gap-1 overflow-x-auto border-b bg-muted/30 p-2 sm:w-44 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r" role="tablist" aria-label="Subcategoria">
                    {activeSection.groupTabs.map((tab) => {
                      const active = activeGroup === tab.value;
                      return (
                        <button
                          key={tab.value}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setActiveGroup(tab.value)}
                          className={cn('whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition', active ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground')}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="min-w-0 flex-1 overflow-y-auto p-4">
                  {addError && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{addError}</p>}
                  {visibleProducts.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      {normalizedQuery ? 'Nenhum produto corresponde à busca.' : 'Todos os produtos dessa categoria já estão no seu catálogo.'}
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {visibleProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          disabled={addingModel !== null}
                          onClick={() => handleAdd(product.model)}
                          className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-primary/50 hover:bg-muted/40 disabled:opacity-60"
                        >
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-card">
                            {product.imageUrl ? <Image src={product.imageUrl} alt={product.model} fill sizes="44px" className="object-contain p-1" /> : <div className="flex h-full w-full items-center justify-center">{activeSection.smallIcon}</div>}
                          </div>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{product.nickname || product.model}</span>
                            {product.nickname && <span className="block truncate text-xs text-muted-foreground">{product.model}</span>}
                          </span>
                          {addingModel === product.model ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function StockProductCard({
  item,
  fallbackIcon,
  inverterCatalog,
  batteryCatalog,
  accessoryCatalog,
  onPreviewImage,
  onPreviewDoc,
  onUpdateValue,
  onRemove,
  marginPercent,
  supplierCost,
}: {
  item: UserStockItem;
  fallbackIcon: React.ReactNode;
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  onPreviewImage: (image: { url: string; alt: string }) => void;
  onPreviewDoc: (doc: ProductDocument) => void;
  onUpdateValue: (id: string, unitValue: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** This category's sell margin (see CategoryMarginInline) — used to show
   *  the resulting sale price right under the cost the user enters below,
   *  instead of leaving that math implicit until an order is priced. */
  marginPercent: number;
  /** Cheapest active offer for this exact model among the user's allowed
   *  suppliers (see the supplierCosts fetch above) — a cost reference,
   *  not automatically applied to "Meu preço". */
  supplierCost?: { unitPrice: number; currency: string };
}) {
  const [valueSaveState, saveValue] = useInlineSave((value: number) => onUpdateValue(item.id, value));
  let imageUrl: string | null = null;
  let documents: ProductDocument[] = [];
  let badges: string[] | undefined;
  let specs: [string, string][] | undefined;
  let description: string | null | undefined;
  let nickname: string | null | undefined;

  if (item.productType === 'inverter') {
    const inverter = inverterCatalog.find((option) => option.model === item.productModel);
    if (inverter) {
      nickname = inverter.nickname;
      imageUrl = inverter.imageUrl;
      documents = inverter.documents;
      badges = [inverter.topology, `${inverter.phases} fase${inverter.phases === 1 ? '' : 's'}`];
      specs = [
        ['Potência', `${inverter.standardPowerKva ?? '-'} kVA · pico ${inverter.peakPowerKva ?? '-'} kVA`],
        ['Garantia', `${inverter.warrantyYears ?? 10} anos`],
      ];
    }
  } else if (item.productType === 'battery') {
    const battery = batteryCatalog.find((option) => option.model === item.productModel);
    if (battery) {
      const usefulEnergyKwh = battery.capacityKwh * (1 - battery.minSocPercent / 100);
      nickname = battery.nickname;
      imageUrl = battery.imageUrl;
      documents = battery.documents;
      badges = [battery.topology];
      specs = [
        ['Capacidade', `${battery.capacityKwh} kWh · útil ${usefulEnergyKwh.toFixed(2)} kWh`],
        ['Potência', `${battery.standardPowerKw ?? '-'} kW · pico ${battery.peakPowerKw ?? '-'} kW`],
        ['Garantia', `${battery.warrantyYears ?? 10} anos ou ${battery.warrantyCycles ?? 6000} ciclos`],
      ];
    }
  } else {
    const accessory = accessoryCatalog.find((option) => option.model === item.productModel);
    if (accessory) {
      nickname = accessory.nickname;
      imageUrl = accessory.imageUrl;
      documents = accessory.documents;
      description = accessory.description;
      specs = [['Garantia', `${accessory.warrantyYears ?? 2} anos`]];
    }
  }

  return (
    <CatalogProductCard
      fallbackIcon={fallbackIcon}
      model={item.productModel}
      nickname={nickname}
      imageUrl={imageUrl}
      documents={documents}
      badges={badges}
      specs={specs}
      description={description}
      onPreviewImage={onPreviewImage}
      onPreviewDoc={onPreviewDoc}
      topRightAction={
        <ConfirmDeleteButton
          ariaLabel={`Remover ${item.productModel} do meu catálogo`}
          title="Remover do catálogo?"
          description="Esse item sai do seu catálogo pessoal. Você pode adicioná-lo novamente pela aba Catálogo quando quiser."
          confirmLabel="Remover"
          onConfirm={() => onRemove(item.id)}
        />
      }
      stockControl={
        <div className="space-y-1 border-t pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Meu custo</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">R$</span>
              <input
                key={item.id}
                type="number"
                min={0}
                step={0.01}
                defaultValue={item.unitValue}
                aria-label={`Meu custo para ${item.productModel}`}
                onBlur={(event) => {
                  const parsed = Number(event.target.value);
                  const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
                  if (nextValue !== item.unitValue) void saveValue(nextValue);
                }}
                className="h-7 w-24 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <InlineSaveStatus state={valueSaveState} />
          </div>
          {item.unitValue === 0 && (
            <p className="text-xs text-amber-600">Defina um preço: sem ele, este item entra como R$ 0 nos orçamentos.</p>
          )}
          {supplierCost && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Truck className="h-3 w-3 shrink-0" />
              Referência de fornecedor: {formatCurrencyBRL(supplierCost.unitPrice)}
            </p>
          )}
          {item.unitValue > 0 && (
            <div className="rounded-md bg-primary/5 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">Preço de venda estimado</p>
              <p className="mt-0.5 text-muted-foreground">
                {formatCurrencyBRL(item.unitValue * (1 + marginPercent / 100))} · custo {formatCurrencyBRL(item.unitValue)} + markup de {marginPercent}%
              </p>
            </div>
          )}
        </div>
      }
    />
  );
}
