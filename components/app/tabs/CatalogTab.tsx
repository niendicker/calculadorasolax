'use client';

import { useState } from 'react';
import { Battery, Boxes, Zap } from 'lucide-react';
import type { ProductDocument } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  BatteryCardsSkeleton,
  CatalogEmptyState,
  CatalogProductCard,
  DocPreviewModal,
  ImagePreviewModal,
} from '../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InverterCatalogOption } from '../types';

export function CatalogTab({
  initialLoading,
  inverterCatalog,
  batteryCatalog,
  accessoryCatalog,
}: {
  initialLoading: boolean;
  inverterCatalog: InverterCatalogOption[];
  batteryCatalog: BatteryCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
}) {
  const [section, setSection] = useState<'inverters' | 'batteries' | 'accessories'>('inverters');
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);

  const sectionOptions = [
    { value: 'inverters' as const, label: 'Inversores', count: inverterCatalog.length },
    { value: 'batteries' as const, label: 'Baterias', count: batteryCatalog.length },
    { value: 'accessories' as const, label: 'Acessórios', count: accessoryCatalog.length },
  ];

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

      {initialLoading ? (
        <BatteryCardsSkeleton />
      ) : section === 'inverters' ? (
        inverterCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhum inversor cadastrado." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {inverterCatalog.map((inverter) => (
              <CatalogProductCard
                key={inverter.id}
                fallbackIcon={<Zap className="h-8 w-8 text-muted-foreground" />}
                model={inverter.model}
                imageUrl={inverter.imageUrl}
                documents={inverter.documents}
                badges={[inverter.topology, `${inverter.phases} fase${inverter.phases === 1 ? '' : 's'}`]}
                specs={[
                  ['Potência', `${inverter.standardPowerKva ?? '-'} kVA · pico ${inverter.peakPowerKva ?? '-'} kVA`],
                ]}
                onPreviewImage={setPreviewImage}
                onPreviewDoc={setPreviewDoc}
              />
            ))}
          </div>
        )
      ) : section === 'batteries' ? (
        batteryCatalog.length === 0 ? (
          <CatalogEmptyState label="Nenhuma bateria cadastrada." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {batteryCatalog.map((battery) => {
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
                />
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
                imageUrl={accessory.imageUrl}
                documents={accessory.documents}
                description={accessory.description}
                onPreviewImage={setPreviewImage}
                onPreviewDoc={setPreviewDoc}
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
