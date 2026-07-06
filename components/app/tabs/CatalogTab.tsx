'use client';

import { useState } from 'react';
import { Battery, Boxes, Check, Plus, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProductDocument, StockProductType, UserStockItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  BatteryCardsSkeleton,
  CatalogEmptyState,
  CatalogProductCard,
  DocPreviewModal,
  ImagePreviewModal,
  SearchInput,
} from '../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';

const inverterPhaseGroups = [
  { phases: 1, label: 'Monofásico' },
  { phases: 2, label: 'Bifásico' },
  { phases: 3, label: 'Trifásico' },
];

export function CatalogTab({
  initialLoading,
  inverterCatalog,
  batteryCatalog,
  accessoryCatalog,
  userStockItems,
  onAddToStock,
}: {
  initialLoading: boolean;
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  userStockItems: UserStockItem[];
  onAddToStock: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
}) {
  const [section, setSection] = useState<'inverters' | 'batteries' | 'accessories'>('inverters');
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [search, setSearch] = useState('');

  const sectionOptions = [
    { value: 'inverters' as const, label: 'Inversores', count: inverterCatalog.length },
    { value: 'batteries' as const, label: 'Baterias', count: batteryCatalog.length },
    { value: 'accessories' as const, label: 'Acessórios', count: accessoryCatalog.length },
  ];

  const normalizedSearch = search.trim().toLowerCase();
  const filteredInverters = inverterCatalog.filter((item) => item.model.toLowerCase().includes(normalizedSearch));
  const filteredBatteries = batteryCatalog.filter((item) => item.model.toLowerCase().includes(normalizedSearch));
  const filteredAccessories = accessoryCatalog.filter((item) => item.model.toLowerCase().includes(normalizedSearch));

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Produtos cadastrados disponíveis para dimensionamento.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:inline-grid sm:w-fit sm:grid-cols-3">
        {sectionOptions.map((tab) => {
          const active = section === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={active}
              onClick={() => setSection(tab.value)}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition',
                active
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.7rem]',
                  active ? 'bg-primary/10 text-primary' : 'bg-background'
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {!initialLoading && (
        <div className="max-w-xs">
          <SearchInput value={search} onChange={setSearch} placeholder="Pesquisar modelo..." />
        </div>
      )}

      {initialLoading ? (
        <BatteryCardsSkeleton />
      ) : section === 'inverters' ? (
        inverterCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhum inversor cadastrado." />
        ) : filteredInverters.length === 0 ? (
          <CatalogEmptyState label="Nenhum inversor encontrado para essa pesquisa." />
        ) : (
          <div className="space-y-4">
            {inverterPhaseGroups.map((group) => {
              const inverters = filteredInverters.filter((inverter) => inverter.phases === group.phases);
              if (inverters.length === 0) return null;
              return (
                <div key={group.phases} className="space-y-2">
                  <p className="text-sm font-medium">{group.label}</p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {inverters.map((inverter) => (
                      <CatalogProductCard
                        key={inverter.id}
                        fallbackIcon={<Zap className="h-8 w-8 text-muted-foreground" />}
                        model={inverter.model}
                        imageUrl={inverter.imageUrl}
                        documents={inverter.documents}
                        badges={[inverter.topology, `${inverter.phases} fase${inverter.phases === 1 ? '' : 's'}`]}
                        specs={[
                          [
                            'Potência',
                            `${inverter.standardPowerKva ?? '-'} kVA · pico ${inverter.peakPowerKva ?? '-'} kVA`,
                          ],
                        ]}
                        onPreviewImage={setPreviewImage}
                        onPreviewDoc={setPreviewDoc}
                        stockControl={
                          <StockControl
                            productType="inverter"
                            productModel={inverter.model}
                            userStockItems={userStockItems}
                            onAdd={onAddToStock}
                          />
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : section === 'batteries' ? (
        batteryCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhuma bateria cadastrada." />
        ) : filteredBatteries.length === 0 ? (
          <CatalogEmptyState label="Nenhuma bateria encontrada para essa pesquisa." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredBatteries.map((battery) => {
              const usefulEnergyKwh = battery.capacityKwh * (1 - battery.minSocPercent / 100);
              return (
                <CatalogProductCard
                  key={battery.id}
                  fallbackIcon={<Battery className="h-8 w-8 text-muted-foreground" />}
                  model={battery.model}
                  imageUrl={battery.imageUrl}
                  documents={battery.documents}
                  badges={[battery.topology]}
                  specs={[
                    ['Capacidade', `${battery.capacityKwh} kWh · útil ${usefulEnergyKwh.toFixed(2)} kWh`],
                    ['Potência', `${battery.standardPowerKw ?? '-'} kW · pico ${battery.peakPowerKw ?? '-'} kW`],
                  ]}
                  onPreviewImage={setPreviewImage}
                  onPreviewDoc={setPreviewDoc}
                  stockControl={
                    <StockControl
                      productType="battery"
                      productModel={battery.model}
                      userStockItems={userStockItems}
                      onAdd={onAddToStock}
                    />
                  }
                />
              );
            })}
          </div>
        )
      ) : section === 'accessories' ? (
        accessoryCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhum acessório cadastrado." />
        ) : filteredAccessories.length === 0 ? (
          <CatalogEmptyState label="Nenhum acessório encontrado para essa pesquisa." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredAccessories.map((accessory) => (
              <CatalogProductCard
                key={accessory.id}
                fallbackIcon={<Boxes className="h-8 w-8 text-muted-foreground" />}
                model={accessory.model}
                imageUrl={accessory.imageUrl}
                documents={accessory.documents}
                description={accessory.description}
                onPreviewImage={setPreviewImage}
                onPreviewDoc={setPreviewDoc}
                stockControl={
                  <StockControl
                    productType="accessory"
                    productModel={accessory.model}
                    userStockItems={userStockItems}
                    onAdd={onAddToStock}
                  />
                }
              />
            ))}
          </div>
        )
      ) : null}

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

function StockControl({
  productType,
  productModel,
  userStockItems,
  onAdd,
}: {
  productType: StockProductType;
  productModel: string;
  userStockItems: UserStockItem[];
  onAdd: (input: { productType: StockProductType; productModel: string; unitValue: number }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const inStock = userStockItems.some(
    (item) => item.productType === productType && item.productModel === productModel
  );

  if (inStock) {
    return (
      <div className="border-t pt-2">
        <Badge variant="secondary" className="w-fit gap-1">
          <Check className="h-3 w-3" />
          No estoque
        </Badge>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        try {
          await onAdd({ productType, productModel, unitValue: 0 });
        } finally {
          setSaving(false);
        }
      }}
    >
      <Plus className="h-3.5 w-3.5" />
      Adicionar ao meu estoque
    </Button>
  );
}
