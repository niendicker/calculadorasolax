'use client';

import { useState } from 'react';
import { Battery, Boxes, Zap } from 'lucide-react';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import type { ProductDocument, StockProductType, UserStockItem } from '@/lib/types';
import { CatalogEmptyState, CatalogProductCard, DocPreviewModal, ImagePreviewModal, SearchInput } from '../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';

const sectionDefinitions: { type: StockProductType; label: string; fallbackIcon: React.ReactNode }[] = [
  { type: 'inverter', label: 'Inversores', fallbackIcon: <Zap className="h-8 w-8 text-muted-foreground" /> },
  { type: 'battery', label: 'Baterias', fallbackIcon: <Battery className="h-8 w-8 text-muted-foreground" /> },
  { type: 'accessory', label: 'Acessórios', fallbackIcon: <Boxes className="h-8 w-8 text-muted-foreground" /> },
];

export function MyStockTab({
  userStockItems,
  inverterCatalog,
  batteryCatalog,
  accessoryCatalog,
  onUpdateValue,
  onRemove,
}: {
  userStockItems: UserStockItem[];
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
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

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu Estoque</h1>
        <p className="text-sm text-muted-foreground">
          Produtos que você adicionou do Catálogo, com o preço que você define para seus orçamentos.
        </p>
      </div>

      {userStockItems.length === 0 ? (
        <CatalogEmptyState label="Nenhum item no seu estoque ainda. Adicione produtos a partir do Catálogo." />
      ) : (
        <div className="space-y-4">
          <div className="max-w-xs">
            <SearchInput value={search} onChange={setSearch} placeholder="Pesquisar modelo..." />
          </div>

          {filteredStockItems.length === 0 && (
            <CatalogEmptyState label="Nenhum item encontrado para essa pesquisa." />
          )}

          {sectionDefinitions.map((section) => {
            const items = filteredStockItems.filter((item) => item.productType === section.type);
            if (items.length === 0) return null;
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
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
            ariaLabel={`Remover ${item.productModel} do meu estoque`}
            title="Remover do estoque?"
            description="Esse item sai do seu estoque pessoal. Você pode adicioná-lo novamente pelo Catálogo quando quiser."
            confirmLabel="Remover"
            onConfirm={() => onRemove(item.id)}
          />
        </div>
      }
    />
  );
}
