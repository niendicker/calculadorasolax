'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { AlertTriangle, Battery, Boxes, Check, Info, Loader2, Lock, MoreHorizontal, Package, Plus, Search, Truck, Wrench, X, Zap, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDeleteModalButton } from '@/components/ui/confirm-delete-button';
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
  const activeSectionDefinition = sectionDefinitions.find((section) => section.type === activeSection) ?? sectionDefinitions[0];

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfólio</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie produtos, serviços e preços usados nos seus orçamentos.
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
            <PortfolioMetricCard icon={Package} label="Produtos cadastrados" value={`${userStockItems.length}/${ACCOUNT_LIMITS.userStockItems}`} detail={`${pricedProductCount} com custo definido`} />
            <PortfolioMetricCard icon={Wrench} label="Serviços cadastrados" value={`${userServices.length}/${ACCOUNT_LIMITS.userServices}`} detail={`${configuredMarginCount}/3 categorias com markup`} />
            <PortfolioMetricCard
              icon={unpricedProductCount > 0 || hasUnpricedService ? AlertTriangle : Check}
              label="Pendências de preço"
              value={String(unpricedProductCount + (hasUnpricedService ? userServices.filter((service) => service.unitValue === 0).length : 0))}
              detail={unpricedProductCount + (hasUnpricedService ? userServices.filter((service) => service.unitValue === 0).length : 0) === 0 ? 'Tudo pronto para orçamento' : 'Itens precisam de custo'}
              warn={unpricedProductCount > 0 || hasUnpricedService}
            />
            <PortfolioMetricCard icon={Truck} label="Custos unitários cadastrados" value={formatCurrencyBRL(portfolioCost)} detail="Soma dos custos unitários dos produtos cadastrados" />
          </div>
        </div>
      </PageSummary>

      <div className="grid grid-cols-2 gap-3" role="tablist" aria-label="Contextos do portfólio">
        <PortfolioSectionCard
          active={activeMainSection === 'products'}
          icon={Package}
          label="Produtos"
          count={userStockItems.length}
          countLabel={userStockItems.length === 1 ? 'produto' : 'produtos'}
          warn={hasUnpricedProduct}
          actionLabel={!atLimit ? 'Adicionar produto' : undefined}
          onAction={!atLimit ? () => { setActiveMainSection('products'); setSummaryAddOpen(true); } : undefined}
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
          onAction={userServices.length < ACCOUNT_LIMITS.userServices ? () => { setActiveMainSection('services'); setSummaryAddOpen(true); } : undefined}
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
            {userStockItems.length > 0 && (
              <>
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

                <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center">
                  <label className="relative block min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      aria-label="Buscar produto no portfólio"
                      placeholder="Buscar modelo ou nome"
                      value={productQuery}
                      onChange={(event) => setProductQuery(event.target.value)}
                      className="!pl-11"
                    />
                  </label>
                  <CategoryMarginInline
                    productType={activeSection}
                    productLabel={activeSectionDefinition.label}
                    marginSettings={marginSettings}
                    onUpdateMarginPercent={onUpdateMarginPercent}
                  />
                </div>
              </>
            )}

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
                  {items.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/20 p-5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Package className="h-5 w-5" aria-hidden="true" /></span>
                      <div><p className="text-sm font-medium">Nenhum produto cadastrado</p><p className="mt-1 text-xs text-muted-foreground">Cadastre um produto pelo botão “Adicionar produto” acima para incluí-lo no seu portfólio.</p></div>
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{count} {countLabel}</span>
        </div>
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

function CardContextMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          {children}
        </div>
      )}
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
  productLabel,
  marginSettings,
  onUpdateMarginPercent,
}: {
  productType: StockProductType;
  productLabel: string;
  marginSettings: MarginSettings;
  onUpdateMarginPercent: (category: StockProductType, percent: number) => Promise<void>;
}) {
  const field = marginFieldByProductType[productType];
  const value = marginSettings[field];
  const [saveState, save] = useInlineSave((percent: number) => onUpdateMarginPercent(productType, percent));

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 sm:min-w-[15rem] sm:border-l sm:pl-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <label htmlFor={`margin-${productType}`} className="text-xs font-semibold text-foreground">Markup · {productLabel}</label>
          <span title={`Aplicado ao custo dos ${productLabel.toLowerCase()}.`} aria-label={`Markup aplicado aos ${productLabel.toLowerCase()}`}>
            <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          key={value}
          id={`margin-${productType}`}
          aria-label="Markup de venda"
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
      {userServices.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <p><span className="font-medium text-foreground">Serviços do seu catálogo.</span> Cadastre valores para instalação, frete e mão de obra. Eles entram no custo quando usados em um projeto.</p>
        </div>
      )}
      {atLimit && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Você atingiu o limite de {ACCOUNT_LIMITS.userServices} serviços no seu catálogo. Remova um item para
          adicionar outro.
        </p>
      )}
      {userServices.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wrench className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium">Nenhum serviço cadastrado</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Cadastre instalação, frete ou mão de obra pelo botão “Adicionar serviço” acima para incluí-los nos seus orçamentos.
            </p>
          </div>
        </div>
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
      </div>
      <AddServiceCard atLimit={atLimit} stockCount={userServices.length} stockLimit={ACCOUNT_LIMITS.userServices} hideTrigger open={addOpen} onOpenChange={onAddOpenChange} onAdd={onAddService} />
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
  const pricingExample = servicePricingExample(pricingUnit, service.unitValue);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wrench className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 truncate pt-1 text-sm font-semibold" title={`Serviço de ${service.name}`}>
          Serviço de {service.name}
        </p>
        <CardContextMenu label={`Mais ações para ${service.name}`}>
          <ConfirmDeleteModalButton
            ariaLabel={`Excluir serviço ${service.name} do meu catálogo`}
            itemName={service.name}
            itemType="serviço"
            label="Excluir"
            showIcon={false}
            onConfirm={() => onRemove(service.id)}
          />
        </CardContextMenu>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border bg-muted/10">
        <div className="grid gap-2 border-b p-3 sm:grid-cols-[minmax(8rem,0.65fr)_minmax(0,1.35fr)] sm:items-center">
          <label htmlFor={`${service.id}-service-name`} className="text-xs font-medium text-muted-foreground">Nome</label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`${service.id}-service-name`}
              key={service.id}
              defaultValue={service.name}
              aria-label={`Nome do serviço ${service.name}`}
              onBlur={(event) => {
                const nextName = event.target.value.trim();
                if (nextName && nextName !== service.name) void saveName(nextName);
              }}
              className="h-9 bg-background font-medium"
            />
            <InlineSaveStatus state={nameSaveState} />
          </div>
        </div>
        <div className="grid gap-2 border-b p-3 sm:grid-cols-[minmax(8rem,0.65fr)_minmax(0,1.35fr)] sm:items-center">
          <label htmlFor={`${service.id}-service-value`} className="text-xs font-medium text-muted-foreground">{servicePricingValueLabel(pricingUnit)}</label>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">R$</span>
            <input
              id={`${service.id}-service-value`}
              key={`${service.id}-value`}
              type="text"
              inputMode="decimal"
              min={0}
              step={0.01}
              defaultValue={formatServicePriceInput(String(service.unitValue))}
              aria-label={`Preço do serviço ${service.name}`}
              onBlur={(event) => {
                const nextValue = parseServicePrice(event.target.value) ?? 0;
                event.currentTarget.value = formatServicePriceInput(String(nextValue));
                if (nextValue !== service.unitValue) void saveValue(nextValue);
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <InlineSaveStatus state={valueSaveState} />
          </div>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-[minmax(8rem,0.65fr)_minmax(0,1.35fr)] sm:items-center">
          <label htmlFor={`service-unit-${service.id}`} className="text-xs font-medium text-muted-foreground">Forma de cobrança</label>
          <div className="flex items-center gap-1.5">
            <select
              id={`service-unit-${service.id}`}
              aria-label={`Unidade de cobrança do serviço ${service.name}`}
              value={pricingUnit}
              onChange={(event) => void saveUnit(event.target.value as UserServicePricingUnit)}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {USER_SERVICE_PRICING_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{servicePricingOptionLabel(unit.value)}</option>)}
            </select>
            <InlineSaveStatus state={unitSaveState} />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Como será calculado</p>
        <p className="mt-0.5">{pricingExample.explanation}</p>
        <p className="mt-1 font-medium text-primary">Exemplo: {pricingExample.example}</p>
      </div>
    </div>
  );
}

function servicePricingOptionLabel(unit: UserServicePricingUnit): string {
  switch (unit) {
    case 'project': return 'Por projeto';
    case 'pv_kwp': return 'Por kWp';
    case 'nominal_kva': return 'Por kVA nominal';
    case 'peak_kva': return 'Por kVA de pico';
    case 'daily_kwh': return 'Por kWh/dia';
    case 'battery_qty': return 'Por bateria';
    case 'inverter_qty': return 'Por inversor';
    case 'accessory_qty': return 'Por acessório';
    case 'load_qty': return 'Por carga';
  }
}

function servicePricingValueLabel(unit: UserServicePricingUnit): string {
  switch (unit) {
    case 'project': return 'Valor por projeto';
    case 'pv_kwp': return 'Valor por kWp';
    case 'nominal_kva': return 'Valor por kVA nominal';
    case 'peak_kva': return 'Valor por kVA de pico';
    case 'daily_kwh': return 'Valor por kWh/dia';
    case 'battery_qty': return 'Valor por bateria';
    case 'inverter_qty': return 'Valor por inversor';
    case 'accessory_qty': return 'Valor por acessório';
    case 'load_qty': return 'Valor por carga';
  }
}

function servicePricingExample(unit: UserServicePricingUnit, unitValue?: number): { explanation: string; example: string } {
  const defaults: Record<UserServicePricingUnit, number> = {
    project: 500,
    pv_kwp: 1500,
    nominal_kva: 350,
    peak_kva: 350,
    daily_kwh: 2.5,
    battery_qty: 500,
    inverter_qty: 500,
    accessory_qty: 150,
    load_qty: 100,
  };
  const quantities: Record<UserServicePricingUnit, { value: number; label: string }> = {
    project: { value: 1, label: 'projeto' },
    pv_kwp: { value: 6.5, label: 'kWp' },
    nominal_kva: { value: 6, label: 'kVA' },
    peak_kva: { value: 8, label: 'kVA' },
    daily_kwh: { value: 12, label: 'kWh' },
    battery_qty: { value: 2, label: 'baterias' },
    inverter_qty: { value: 2, label: 'inversores' },
    accessory_qty: { value: 3, label: 'acessórios' },
    load_qty: { value: 4, label: 'cargas' },
  };
  const amount = unitValue ?? defaults[unit];
  const quantity = quantities[unit];
  const rateSuffix = unit === 'project' ? '' : `/${quantity.label}`;
  const quantityValue = quantity.value.toLocaleString('pt-BR', { minimumFractionDigits: unit === 'project' ? 0 : 2, maximumFractionDigits: 2 });
  const explanations: Record<UserServicePricingUnit, string> = {
    project: 'Valor fixo aplicado uma vez ao projeto.',
    pv_kwp: 'O valor é multiplicado pela potência fotovoltaica dimensionada.',
    nominal_kva: 'O valor é multiplicado pela potência nominal dimensionada.',
    peak_kva: 'O valor é multiplicado pela potência máxima dimensionada.',
    daily_kwh: 'O valor é multiplicado pelo consumo diário calculado.',
    battery_qty: 'O valor é multiplicado pela quantidade de baterias necessárias.',
    inverter_qty: 'O valor é multiplicado pela quantidade de inversores necessários.',
    accessory_qty: 'O valor é multiplicado pela quantidade de acessórios necessários.',
    load_qty: 'O valor é multiplicado pela quantidade de cargas cadastradas.',
  };
  return {
    explanation: explanations[unit],
    example: `${formatCurrencyBRL(amount)}${rateSuffix} × ${quantityValue} ${quantity.label} = ${formatCurrencyBRL(amount * quantity.value)}`,
  };
}

function parseServicePrice(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatServicePriceInput(input: string): string {
  const parsed = parseServicePrice(input);
  if (parsed == null) return input.trim().startsWith('-') ? '' : input;
  return parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AddServiceCard({
  atLimit,
  stockCount,
  stockLimit,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  onAdd,
}: {
  atLimit: boolean;
  stockCount: number;
  stockLimit: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onAdd: (input: { name: string; unitValue: number; pricingUnit?: UserServicePricingUnit }) => Promise<void>;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [pricingUnit, setPricingUnit] = useState<UserServicePricingUnit>('project');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [valueTouched, setValueTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const closeModal = useCallback(() => {
    setOpen(false);
    setError(null);
  }, [controlledOpen, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;

    const getFocusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ) ?? []);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('input')?.focus());
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      requestAnimationFrame(() => (previousFocusRef.current ?? triggerRef.current)?.focus());
    };
  }, [closeModal, open]);

  if (atLimit) {
    if (hideTrigger) return null;
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
    if (hideTrigger) return null;
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
    const parsedValue = parseServicePrice(value);
    setSubmitAttempted(true);
    if (!trimmedName || parsedValue == null) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({ name: trimmedName, unitValue: parsedValue, ...(pricingUnit !== 'project' ? { pricingUnit } : {}) });
      setOpen(false);
      setName('');
      setValue('');
      setPricingUnit('project');
      setNameTouched(false);
      setValueTouched(false);
      setSubmitAttempted(false);
    } catch (err) {
      setError(isLimitError(err) ? err.message : 'Não foi possível adicionar o serviço. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const pricingExample = servicePricingExample(pricingUnit);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="new-service-title" aria-describedby="new-service-description" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="new-service-title" className="text-base font-semibold">Novo serviço</h2>
            <p id="new-service-description" className="mt-1 text-sm text-muted-foreground">Defina o preço e como ele será aplicado no orçamento.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={closeModal}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void handleAdd(); }}>
          <div className="space-y-1.5">
            <label htmlFor="new-service-name" className="text-xs font-medium text-muted-foreground">Nome do serviço</label>
            <Input id="new-service-name" aria-label="Nome do serviço" aria-invalid={(nameTouched || submitAttempted) && !name.trim()} aria-describedby={(nameTouched || submitAttempted) && !name.trim() ? 'new-service-name-error' : undefined} placeholder="Ex.: Instalação" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => setNameTouched(true)} />
            {(nameTouched || submitAttempted) && !name.trim() && <p id="new-service-name-error" className="text-xs text-destructive">Informe o nome do serviço.</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-service-price" className="text-xs font-medium text-muted-foreground">Preço</label>
            <div className="flex h-9 items-center rounded-md border border-input bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
              <span className="text-sm text-muted-foreground" aria-hidden="true">R$</span>
              <input id="new-service-price" type="text" inputMode="decimal" min={0} step={0.01} placeholder="0,00" aria-label="Preço do serviço" aria-invalid={(valueTouched || submitAttempted) && parseServicePrice(value) == null} aria-describedby={(valueTouched || submitAttempted) && parseServicePrice(value) == null ? 'new-service-price-error' : undefined} value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9.,-]/g, ''))} onBlur={() => { setValueTouched(true); setValue(formatServicePriceInput(value)); }} className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-sm outline-none focus:ring-0" />
            </div>
            {(valueTouched || submitAttempted) && parseServicePrice(value) == null && <p id="new-service-price-error" className="text-xs text-destructive">Informe um preço válido.</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-service-unit" className="text-xs font-medium text-muted-foreground">Forma de cobrança</label>
            <select id="new-service-unit" aria-label="Forma de cobrança" value={pricingUnit} onChange={(event) => setPricingUnit(event.target.value as UserServicePricingUnit)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40">
              {USER_SERVICE_PRICING_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{servicePricingOptionLabel(unit.value)}</option>)}
            </select>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Como será calculado</p>
            <p className="mt-1">{pricingExample.explanation}</p>
            <p className="mt-1 font-medium text-primary">Exemplo: {pricingExample.example}</p>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="default" className="min-h-10 min-w-24" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" size="default" className="min-h-10 min-w-32" disabled={!name.trim() || parseServicePrice(value) == null || saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(open) : next;
    if (controlledOpen === undefined) setInternalOpen(resolved);
    onOpenChange?.(resolved);
  };

  const closePicker = useCallback(() => {
    if (controlledOpen === undefined) setInternalOpen(false);
    onOpenChange?.(false);
  }, [controlledOpen, onOpenChange]);

  // Gates the createPortal call below until after client mount — document
  // doesn't exist during SSR, so this can't be a lazy useState initializer
  // without causing a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : triggerRef.current;

    function getFocusableElements() {
      return Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || dialogRef.current?.contains(target)) return;
      closePicker();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePicker();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closePicker, open]);

  useEffect(() => {
    if (open) return;
    const focusTarget = previousFocusRef.current ?? triggerRef.current;
    if (focusTarget) {
      focusTarget.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const activeSection = sections.find((section) => section.type === activeProductType) ?? sections[0];
  const productsInPortfolio = new Set(
    userStockItems
      .filter((item) => item.productType === activeProductType)
      .map((item) => item.productModel)
  );
  const visibleProducts = catalogByType[activeProductType]
    .filter((product) => !activeSection.groupTabs || product.groupKey === activeGroup)
    .filter((product) => !normalizedQuery || `${product.nickname ?? ''} ${product.model}`.toLowerCase().includes(normalizedQuery));

  async function handleAdd(model: string) {
    setAddingModel(model);
    setAddError(null);
    try {
      await onAdd(activeProductType, model);
      closePicker();
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
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePicker();
            }}
          >
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-product-dialog-title" aria-describedby="add-product-dialog-description" className="flex h-[min(46rem,85dvh)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl min-h-0 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
              <div className="flex items-start justify-between gap-4 border-b p-5">
                <div>
                  <h2 id="add-product-dialog-title" className="text-base font-semibold">Adicionar produto</h2>
                  <p id="add-product-dialog-description" className="mt-1 text-sm text-muted-foreground">Escolha a categoria e depois um item disponível no catálogo.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={closePicker}>
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
                  <Input ref={searchInputRef} aria-label="Buscar no catálogo" placeholder="Buscar por nome ou modelo" value={query} onChange={(event) => setQuery(event.target.value)} className="!pl-11" />
                </label>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
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
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
                  {addError && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{addError}</p>}
                  {visibleProducts.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">Nenhum produto encontrado</p>
                      <p className="mt-1">Altere a busca ou selecione outra categoria ou filtro.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {visibleProducts.map((product) => {
                        const isAdded = productsInPortfolio.has(product.model);
                        return (
                        <button
                          key={product.id}
                          type="button"
                          disabled={addingModel !== null || isAdded}
                          aria-label={`${product.nickname || product.model}${isAdded ? ', já está no portfólio' : ', adicionar ao portfólio'}`}
                          onClick={() => { if (!isAdded) void handleAdd(product.model); }}
                          className={cn(
                            'flex min-h-20 w-full touch-manipulation items-center gap-3 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                            isAdded
                              ? 'cursor-default border-primary/20 bg-primary/5 text-muted-foreground'
                              : 'cursor-pointer bg-card hover:border-primary/50 hover:bg-muted/40'
                          )}
                        >
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-card">
                            {product.imageUrl ? <Image src={product.imageUrl} alt={product.model} fill sizes="44px" className="object-contain p-1" /> : <div className="flex h-full w-full items-center justify-center">{activeSection.smallIcon}</div>}
                          </div>
                          <span className="min-w-0 flex-1">
                            <span className="block line-clamp-2 truncate text-sm font-medium" title={product.nickname || product.model}>{product.nickname || product.model}</span>
                            {product.nickname && <span className="block truncate text-xs text-muted-foreground" title={product.model}>{product.model}</span>}
                          </span>
                          {addingModel === product.model ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Adicionando" /> : isAdded ? <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary"><Check className="h-4 w-4" aria-hidden="true" />No portfólio</span> : <Plus className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="Adicionar" />}
                        </button>
                        );
                      })}
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
      badges = [
        inverter.topology,
        inverter.phases === 1 ? 'Monofásico' : inverter.phases === 2 ? 'Bifásico' : 'Trifásico',
      ];
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
      compactContent
      onPreviewImage={onPreviewImage}
      onPreviewDoc={onPreviewDoc}
      topRightAction={
        <CardContextMenu label={`Mais ações para ${item.productModel}`}>
          <ConfirmDeleteModalButton
            ariaLabel={`Excluir ${item.productModel} do meu catálogo`}
            itemName={nickname || item.productModel}
            label="Excluir"
            onConfirm={() => onRemove(item.id)}
          />
        </CardContextMenu>
      }
      stockControl={
        <div className="space-y-2 border-t pt-3">
          <div className="overflow-hidden rounded-lg border bg-muted/10 text-xs">
            <div className="grid gap-2 border-b p-3 sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)] sm:items-center">
              <span className="font-medium text-muted-foreground">Meu custo</span>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">R$</span>
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
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <InlineSaveStatus state={valueSaveState} />
              </div>
            </div>
            {supplierCost && (
              <div className="grid gap-2 border-b p-3 sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)] sm:items-center">
                <span className="flex items-center gap-1.5 font-medium text-muted-foreground"><Truck className="h-3.5 w-3.5" aria-hidden="true" />Fornecedor</span>
                <span className="font-medium text-foreground">{formatCurrencyBRL(supplierCost.unitPrice)}</span>
              </div>
            )}
            {item.unitValue > 0 && (
              <div className="grid gap-2 bg-primary/5 p-3 sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)] sm:items-center">
                <span className="font-medium text-muted-foreground">Venda estimada</span>
                <span className="font-semibold text-primary">{formatCurrencyBRL(item.unitValue * (1 + marginPercent / 100))}<span className="ml-1 text-[11px] font-normal text-muted-foreground">({marginPercent}% markup)</span></span>
              </div>
            )}
          </div>
          {item.unitValue === 0 && (
            <p className="text-xs text-amber-600">Defina um custo: sem ele, este item entra como R$ 0 nos orçamentos.</p>
          )}
        </div>
      }
    />
  );
}
