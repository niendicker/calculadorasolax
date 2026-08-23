'use client';

import { useState } from 'react';
import { Battery, Boxes, Check, Plus, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProductDocument, StockProductType, UserStockItem } from '@/lib/types';
import { isLimitError } from '@/lib/limits';
import { cn } from '@/lib/utils';
import { expansionModelSet } from '../helpers';
import { PageHeader } from '../shell/slots';
import {
  BatteryCardsSkeleton,
  CatalogEmptyState,
  CatalogProductCard,
  DocPreviewModal,
  ImagePreviewModal,
} from '../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';

const inverterPhaseGroups = [
  { phases: 1, label: 'Monofásico' },
  { phases: 2, label: 'Bifásico' },
  { phases: 3, label: 'Trifásico' },
];

/** Groups battery topology; inverters also use a "BOTH" group (see
 *  inverterTopologyGroups below) for models compatible with either. */
const batteryTopologyGroups = [
  { value: 'HV' as const, label: 'Alta tensão (HV)' },
  { value: 'LV' as const, label: 'Baixa tensão (LV)' },
];

const inverterTopologyGroups = [
  ...batteryTopologyGroups,
  { value: 'BOTH' as const, label: 'Ambas as tensões (HV/LV)' },
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

  const sectionOptions = [
    { value: 'inverters' as const, label: 'Inversores', count: inverterCatalog.length, icon: Zap },
    { value: 'batteries' as const, label: 'Baterias', count: batteryCatalog.length, icon: Battery },
    { value: 'accessories' as const, label: 'Acessórios', count: accessoryCatalog.length, icon: Boxes },
  ];

  const batteryExpansionModels = expansionModelSet(batteryCatalog);

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
          <p className="text-sm text-muted-foreground">
            Produtos cadastrados disponíveis para dimensionamento.
          </p>
        </div>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3" role="tablist" aria-label="Tipo de produto">
        {sectionOptions.map((tab) => {
          const active = section === tab.value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(tab.value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border p-4 text-center transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:gap-3 sm:text-left',
                active
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
              )}
            >
              <Icon className={cn('h-6 w-6 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
              <div className="min-w-0">
                <p className={cn('text-sm font-semibold', active ? 'text-primary' : 'text-foreground')}>{tab.label}</p>
                <p className="text-xs text-muted-foreground">
                  {tab.count} produto{tab.count === 1 ? '' : 's'}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {initialLoading ? (
        <BatteryCardsSkeleton />
      ) : section === 'inverters' ? (
        inverterCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhum inversor cadastrado." />
        ) : (
          <div className="space-y-4">
            {inverterPhaseGroups.map((group) => {
              const inverters = inverterCatalog.filter((inverter) => inverter.phases === group.phases);
              if (inverters.length === 0) return null;
              return (
                <div key={group.phases} className="space-y-3">
                  <p className="text-sm font-medium">{group.label}</p>
                  {inverterTopologyGroups.map((topologyGroup) => {
                    const topologyInverters = inverters.filter((inverter) => inverter.topology === topologyGroup.value);
                    if (topologyInverters.length === 0) return null;
                    return (
                      <div key={topologyGroup.value} className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{topologyGroup.label}</p>
                        <div className="grid gap-3 lg:grid-cols-2">
                          {topologyInverters.map((inverter) => (
                            <CatalogProductCard
                              key={inverter.id}
                              fallbackIcon={<Zap className="h-8 w-8 text-muted-foreground" />}
                              model={inverter.model}
                              nickname={inverter.nickname}
                              imageUrl={inverter.imageUrl}
                              documents={inverter.documents}
                              badges={[inverter.topology, group.label]}
                              specs={[
                                [
                                  'Potência',
                                  `${inverter.standardPowerKva ?? '-'} kVA · pico ${inverter.peakPowerKva ?? '-'} kVA`,
                                ],
                                ['Garantia', `${inverter.warrantyYears ?? 10} anos`],
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
              );
            })}
          </div>
        )
      ) : section === 'batteries' ? (
        batteryCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhuma bateria cadastrada." />
        ) : (
          <div className="space-y-4">
            {batteryTopologyGroups.map((group) => {
              const batteries = batteryCatalog.filter((battery) => battery.topology === group.value);
              if (batteries.length === 0) return null;
              return (
                <div key={group.value} className="space-y-2">
                  <p className="text-sm font-medium">{group.label}</p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {batteries.map((battery) => {
                      const usefulEnergyKwh = battery.capacityKwh * (1 - battery.minSocPercent / 100);
                      const roleBadge = battery.expansionModel
                        ? 'Master'
                        : batteryExpansionModels.has(battery.model)
                          ? 'Expansão'
                          : null;
                      return (
                        <CatalogProductCard
                          key={battery.id}
                          fallbackIcon={<Battery className="h-8 w-8 text-muted-foreground" />}
                          model={battery.model}
                          nickname={battery.nickname}
                          imageUrl={battery.imageUrl}
                          documents={battery.documents}
                          badges={roleBadge ? [battery.topology, roleBadge] : [battery.topology]}
                          specs={[
                            ['Capacidade', `${battery.capacityKwh} kWh · útil ${usefulEnergyKwh.toFixed(2)} kWh`],
                            ['Potência', `${battery.standardPowerKw ?? '-'} kW · pico ${battery.peakPowerKw ?? '-'} kW`],
                            ['Garantia', `${battery.warrantyYears ?? 10} anos ou ${battery.warrantyCycles ?? 6000} ciclos`],
                            ...(battery.expansionModel ? [['Expansão', battery.expansionModel] as [string, string]] : []),
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
                </div>
              );
            })}
          </div>
        )
      ) : section === 'accessories' ? (
        accessoryCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhum acessório cadastrado." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {accessoryCatalog.map((accessory) => (
              <CatalogProductCard
                key={accessory.id}
                fallbackIcon={<Boxes className="h-8 w-8 text-muted-foreground" />}
                model={accessory.model}
                nickname={accessory.nickname}
                imageUrl={accessory.imageUrl}
                documents={accessory.documents}
                description={accessory.description}
                specs={[['Garantia', `${accessory.warrantyYears ?? 2} anos`]]}
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
  const [error, setError] = useState<string | null>(null);
  const inStock = userStockItems.some(
    (item) => item.productType === productType && item.productModel === productModel
  );

  if (inStock) {
    return (
      <div className="border-t pt-2">
        <Badge variant="secondary" className="w-fit gap-1">
          <Check className="h-3 w-3" />
          No catálogo
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await onAdd({ productType, productModel, unitValue: 0 });
          } catch (err) {
            setError(isLimitError(err) ? err.message : 'Não foi possível adicionar ao catálogo. Tente novamente.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar ao meu catálogo
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
