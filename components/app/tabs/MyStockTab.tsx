'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Battery, Boxes, Loader2, Plus, Zap } from 'lucide-react';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import type { ProductDocument, StockProductType, UserStockItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PageHeader } from '../shell/slots';
import { CatalogProductCard, DocPreviewModal, ImagePreviewModal, SearchInput } from '../shared-ui';
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
}: {
  userStockItems: UserStockItem[];
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  onAddToStock: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
  onUpdateValue: (id: string, unitValue: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStockItems = userStockItems.filter((item) =>
    item.productModel.toLowerCase().includes(normalizedSearch)
  );

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

      {userStockItems.length > 0 && (
        <div className="max-w-xs">
          <SearchInput value={search} onChange={setSearch} placeholder="Pesquisar modelo..." />
        </div>
      )}

      <div className="space-y-4">
        {sectionDefinitions.map((section) => {
          const items = filteredStockItems.filter((item) => item.productType === section.type);
          const availableToAdd = catalogByType[section.type].filter(
            (product) =>
              !userStockItems.some(
                (item) => item.productType === section.type && item.productModel === product.model
              )
          );
          return (
            <div key={section.type} className="space-y-2">
              <p className="text-sm font-medium">{section.label}</p>
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
                  onAdd={(model) => onAddToStock({ productType: section.type, productModel: model, unitValue: 0 })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function AddProductCard({
  productType,
  availableProducts,
  groupTabs,
  smallIcon,
  onAdd,
}: {
  productType: StockProductType;
  availableProducts: CatalogEntry[];
  groupTabs?: GroupTab[];
  smallIcon: React.ReactNode;
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
      setAddError(
        error instanceof Error && error.message.startsWith('Limite de')
          ? error.message
          : 'Não foi possível adicionar ao catálogo. Tente novamente.'
      );
    } finally {
      setAddingModel(null);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label={`Adicionar ${productType === 'inverter' ? 'inversor' : productType === 'battery' ? 'bateria' : 'acessório'} ao catálogo`}
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
      specs = [['Potência', `${inverter.standardPowerKva ?? '-'} kVA · pico ${inverter.peakPowerKva ?? '-'} kVA`]];
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
      ];
    }
  } else {
    const accessory = accessoryCatalog.find((option) => option.model === item.productModel);
    if (accessory) {
      imageUrl = accessory.imageUrl;
      documents = accessory.documents;
      description = accessory.description;
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
          <ConfirmDeleteButton
            ariaLabel={`Remover ${item.productModel} do meu catálogo`}
            title="Remover do catálogo?"
            description="Esse item sai do seu catálogo pessoal. Você pode adicioná-lo novamente pela aba Catálogo quando quiser."
            confirmLabel="Remover"
            onConfirm={() => onRemove(item.id)}
          />
        </div>
      }
    />
  );
}
