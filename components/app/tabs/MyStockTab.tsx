'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Battery, Boxes, Loader2, Lock, Plus, Wrench, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { ACCOUNT_LIMITS, isLimitError } from '@/lib/limits';
import type { MarginSettings, ProductDocument, StockProductType, UserServiceItem, UserStockItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PageHeader } from '../shell/slots';
import { CatalogProductCard, DocPreviewModal, ImagePreviewModal } from '../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';

interface CatalogEntry {
  id: string;
  model: string;
  imageUrl: string | null;
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
  fallbackIcon: React.ReactNode;
  smallIcon: React.ReactNode;
  groupTabs?: GroupTab[];
}[] = [
  {
    type: 'inverter',
    label: 'Inversores',
    fallbackIcon: <Zap className="h-8 w-8 text-muted-foreground" />,
    smallIcon: <Zap className="h-4 w-4 text-muted-foreground" />,
    groupTabs: inverterPhaseTabs,
  },
  {
    type: 'battery',
    label: 'Baterias',
    fallbackIcon: <Battery className="h-8 w-8 text-muted-foreground" />,
    smallIcon: <Battery className="h-4 w-4 text-muted-foreground" />,
    groupTabs: batteryTopologyTabs,
  },
  {
    type: 'accessory',
    label: 'Acessórios',
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
  onAddService: (input: { name: string; unitValue: number }) => Promise<void>;
  onUpdateServiceName: (id: string, name: string) => Promise<void>;
  onUpdateServiceValue: (id: string, unitValue: number) => Promise<void>;
  onRemoveService: (id: string) => Promise<void>;
  marginSettings: MarginSettings;
  onUpdateMarginPercent: (category: StockProductType, percent: number) => Promise<void>;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [activeSection, setActiveSection] = useState<StockProductType>('inverter');
  const [activeMainSection, setActiveMainSection] = useState<'products' | 'services'>('products');

  const atLimit = userStockItems.length >= ACCOUNT_LIMITS.userStockItems;

  const catalogByType: Record<StockProductType, CatalogEntry[]> = {
    inverter: inverterCatalog.map((inverter) => ({
      id: inverter.id,
      model: inverter.model,
      imageUrl: inverter.imageUrl,
      groupKey: String(inverter.phases),
    })),
    battery: batteryCatalog.map((battery) => ({
      id: battery.id,
      model: battery.model,
      imageUrl: battery.imageUrl,
      groupKey: battery.topology,
    })),
    accessory: accessoryCatalog.map((accessory) => ({
      id: accessory.id,
      model: accessory.model,
      imageUrl: accessory.imageUrl,
    })),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meu Catálogo</h1>
          <p className="text-sm text-muted-foreground">
            Produtos que você adicionou do Catálogo, com o preço que você define para seus orçamentos.
          </p>
        </div>
      </PageHeader>

      <div className="flex gap-1 rounded-md bg-muted/60 p-1" role="tablist" aria-label="Seções do catálogo">
        <button
          type="button"
          role="tab"
          aria-selected={activeMainSection === 'products'}
          onClick={() => setActiveMainSection('products')}
          className={cn(
            'flex h-10 flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9',
            activeMainSection === 'products'
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
          )}
        >
          Produtos
          <span className="text-xs text-muted-foreground">({userStockItems.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMainSection === 'services'}
          onClick={() => setActiveMainSection('services')}
          className={cn(
            'flex h-10 flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9',
            activeMainSection === 'services'
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
          )}
        >
          <Wrench className="h-3.5 w-3.5" />
          Serviços
          <span className="text-xs text-muted-foreground">({userServices.length})</span>
        </button>
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
            <div className="flex gap-1 rounded-md bg-muted/60 p-1" role="tablist" aria-label="Tipo de produto">
              {sectionDefinitions.map((section) => {
                const count = userStockItems.filter((item) => item.productType === section.type).length;
                const active = activeSection === section.type;
                return (
                  <button
                    key={section.type}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveSection(section.type)}
                    className={cn(
                      'flex h-10 flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9',
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    {section.label}
                    <span className="text-xs text-muted-foreground">({count})</span>
                  </button>
                );
              })}
            </div>

            {sectionDefinitions.map((section) => {
              if (section.type !== activeSection) return null;
              const items = userStockItems.filter((item) => item.productType === section.type);
              const availableToAdd = catalogByType[section.type].filter(
                (product) =>
                  !userStockItems.some(
                    (item) => item.productType === section.type && item.productModel === product.model
                  )
              );
              return (
                <div key={section.type} className="space-y-3">
                  <CategoryMarginInline
                    productType={section.type}
                    marginSettings={marginSettings}
                    onUpdateMarginPercent={onUpdateMarginPercent}
                  />
                  <div className="grid gap-3 lg:grid-cols-2">
                    {items.map((item) => (
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
                      />
                    ))}
                    <AddProductCard
                      productType={section.type}
                      availableProducts={availableToAdd}
                      groupTabs={section.groupTabs}
                      smallIcon={section.smallIcon}
                      atLimit={atLimit}
                      stockCount={userStockItems.length}
                      stockLimit={ACCOUNT_LIMITS.userStockItems}
                      onAdd={(model) => onAddToStock({ productType: section.type, productModel: model, unitValue: 0 })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeMainSection === 'services' && (
        <ServicesSection
          userServices={userServices}
          onAddService={onAddService}
          onUpdateServiceName={onUpdateServiceName}
          onUpdateServiceValue={onUpdateServiceValue}
          onRemoveService={onRemoveService}
        />
      )}

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
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

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <label htmlFor={`margin-${productType}`}>Margem de venda</label>
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
          if (nextValue !== value) onUpdateMarginPercent(productType, nextValue);
        }}
        className="h-7 w-16 rounded-md border border-input bg-background px-1.5 text-center text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <span>%</span>
    </div>
  );
}

function ServicesSection({
  userServices,
  onAddService,
  onUpdateServiceName,
  onUpdateServiceValue,
  onRemoveService,
}: {
  userServices: UserServiceItem[];
  onAddService: (input: { name: string; unitValue: number }) => Promise<void>;
  onUpdateServiceName: (id: string, name: string) => Promise<void>;
  onUpdateServiceValue: (id: string, unitValue: number) => Promise<void>;
  onRemoveService: (id: string) => Promise<void>;
}) {
  const atLimit = userServices.length >= ACCOUNT_LIMITS.userServices;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Serviços que você presta (instalação, frete, mão de obra...), com o preço que você define — some ao custo
        final da solução quando adicionados a um projeto.
      </p>
      {atLimit && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Você atingiu o limite de {ACCOUNT_LIMITS.userServices} serviços no seu catálogo. Remova um item para
          adicionar outro.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {userServices.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            onUpdateName={onUpdateServiceName}
            onUpdateValue={onUpdateServiceValue}
            onRemove={onRemoveService}
          />
        ))}
        <AddServiceCard atLimit={atLimit} stockCount={userServices.length} stockLimit={ACCOUNT_LIMITS.userServices} onAdd={onAddService} />
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  onUpdateName,
  onUpdateValue,
  onRemove,
}: {
  service: UserServiceItem;
  onUpdateName: (id: string, name: string) => Promise<void>;
  onUpdateValue: (id: string, unitValue: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Input
          key={service.id}
          defaultValue={service.name}
          aria-label={`Nome do serviço ${service.name}`}
          onBlur={(event) => {
            const nextName = event.target.value.trim();
            if (nextName && nextName !== service.name) onUpdateName(service.id, nextName);
          }}
        />
        <div className="flex items-center gap-1">
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
              if (nextValue !== service.unitValue) onUpdateValue(service.id, nextValue);
            }}
            className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
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
  );
}

function AddServiceCard({
  atLimit,
  stockCount,
  stockLimit,
  onAdd,
}: {
  atLimit: boolean;
  stockCount: number;
  stockLimit: number;
  onAdd: (input: { name: string; unitValue: number }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await onAdd({ name: trimmedName, unitValue: parsedValue });
      setOpen(false);
      setName('');
      setValue('');
    } catch (err) {
      setError(isLimitError(err) ? err.message : 'Não foi possível adicionar o serviço. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <Input aria-label="Nome do serviço" placeholder="Ex.: Instalação" value={name} onChange={(event) => setName(event.target.value)} />
      <div className="flex items-center gap-1">
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
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!name.trim() || saving} onClick={handleAdd}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function AddProductCard({
  productType,
  availableProducts,
  groupTabs,
  smallIcon,
  atLimit,
  stockCount,
  stockLimit,
  onAdd,
}: {
  productType: StockProductType;
  availableProducts: CatalogEntry[];
  groupTabs?: GroupTab[];
  smallIcon: React.ReactNode;
  /** Once the account-wide stock limit is reached, this card can't open the
   * picker at all — showing the count here (not just after a failed add
   * attempt) is the point where the user is actually looking to add
   * something, so it's the clearest place to explain why they can't. */
  atLimit: boolean;
  stockCount: number;
  stockLimit: number;
  onAdd: (model: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [addingModel, setAddingModel] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState(groupTabs?.[0]?.value ?? null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Gates the createPortal call below until after client mount — document
  // doesn't exist during SSR, so this can't be a lazy useState initializer
  // without causing a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    const popRect = popoverRef.current?.getBoundingClientRect();
    if (!rect || !popRect) return;

    const gap = 8;
    const margin = 12;

    let left = rect.left;
    left = Math.min(Math.max(margin, left), window.innerWidth - popRect.width - margin);

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let top =
      spaceBelow >= popRect.height || spaceBelow >= spaceAbove ? rect.bottom + gap : rect.top - gap - popRect.height;
    top = Math.min(Math.max(margin, top), window.innerHeight - popRect.height - margin);

    setPosition({ top, left });
  }, [open, activeGroup]);

  const visibleProducts = groupTabs
    ? availableProducts.filter((product) => product.groupKey === activeGroup)
    : availableProducts;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  async function handleAdd(model: string) {
    setAddingModel(model);
    setAddError(null);
    try {
      await onAdd(model);
      setOpen(false);
    } catch (error) {
      setAddError(isLimitError(error) ? error.message : 'Não foi possível adicionar ao catálogo. Tente novamente.');
    } finally {
      setAddingModel(null);
    }
  }

  const productLabel = productType === 'inverter' ? 'inversor' : productType === 'battery' ? 'bateria' : 'acessório';

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
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label={`Adicionar ${productLabel} ao catálogo`}
        onClick={() => setOpen((current) => !current)}
        className="grid min-h-[104px] cursor-pointer place-items-center gap-1.5 rounded-lg border border-dashed border-input p-3 text-center text-muted-foreground transition hover:border-primary/50 hover:bg-muted/60 hover:text-foreground"
      >
        <Plus className="h-6 w-6" />
        <span className="text-sm font-medium">Adicionar</span>
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Escolha um produto do catálogo"
            className="fixed z-[1000] max-h-96 w-80 overflow-y-auto rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.top === 0 && position.left === 0 ? 'hidden' : 'visible',
            }}
          >
            {addError && <p className="mb-2 text-xs text-destructive">{addError}</p>}
            {groupTabs && (
              <div
                className="mb-2 grid gap-1 rounded-lg bg-muted p-1"
                style={{ gridTemplateColumns: `repeat(${groupTabs.length}, minmax(0, 1fr))` }}
                role="tablist"
              >
                {groupTabs.map((tab) => {
                  const active = activeGroup === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveGroup(tab.value)}
                      className={cn(
                        'h-8 rounded-md text-xs font-medium transition',
                        active
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
            {visibleProducts.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                {groupTabs
                  ? 'Todos os produtos desse filtro já estão no seu catálogo.'
                  : 'Todos os produtos desse grupo já estão no seu catálogo.'}
              </p>
            ) : (
              <div className="space-y-1">
                {visibleProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={addingModel !== null}
                    onClick={() => handleAdd(product.model)}
                    className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition hover:bg-muted disabled:opacity-60"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt={product.model} className="h-full w-full object-contain p-1" />
                      ) : (
                        smallIcon
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate font-medium">{product.model}</span>
                    {addingModel === product.model ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            )}
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
}) {
  let imageUrl: string | null = null;
  let documents: ProductDocument[] = [];
  let badges: string[] | undefined;
  let specs: [string, string][] | undefined;
  let description: string | null | undefined;

  if (item.productType === 'inverter') {
    const inverter = inverterCatalog.find((option) => option.model === item.productModel);
    if (inverter) {
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
        <div className="flex items-center gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground">Meu preço</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">R$</span>
            <input
              key={item.id}
              type="number"
              min={0}
              step={0.01}
              defaultValue={item.unitValue}
              aria-label={`Meu preço para ${item.productModel}`}
              onBlur={(event) => {
                const parsed = Number(event.target.value);
                const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
                if (nextValue !== item.unitValue) onUpdateValue(item.id, nextValue);
              }}
              className="h-7 w-24 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </div>
      }
    />
  );
}
