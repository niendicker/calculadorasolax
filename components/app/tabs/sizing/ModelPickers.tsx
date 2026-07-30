'use client';

import { useState } from 'react';
import { Battery, Check, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TooltipBubble, useTooltipFlip } from '@/components/ui/tooltip';
import { expansionModelSet } from '@/lib/battery-quantity-breakdown';
import { batteryTopologyToCatalog, catalogToBatteryTopology } from '@/lib/types';
import type { BatteryTopology, ProductDocument, Solution, UserStockItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BatteryCardsSkeleton, DocPreviewModal, ImagePreviewModal } from '../../shared-ui';
import { topologyLabels, type BatteryCatalogOption, type InverterCatalogOption } from '../../types';

function InStockBadge() {
  const { ref, openUp, visible, onMouseEnter, onMouseLeave, onFocus, onBlur } = useTooltipFlip<HTMLSpanElement>();
  return (
    <Badge
      ref={ref}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      variant="secondary"
      className="relative gap-1"
    >
      <Check className="h-3 w-3" />
      No catálogo
      <TooltipBubble triggerRef={ref} openUp={openUp} visible={visible}>
        Você tem esse modelo no seu catálogo
      </TooltipBubble>
    </Badge>
  );
}

export function BatteryModelPicker({
  batteries,
  topology,
  selectedModel,
  secondarySelectedModel,
  loading,
  setTopology,
  setBatteryModel,
  setSecondaryBatteryModel,
  userStockItems,
  solution,
}: {
  batteries: BatteryCatalogOption[];
  topology: BatteryTopology | null;
  selectedModel: string | null;
  secondarySelectedModel: string | null;
  loading: boolean;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setSecondaryBatteryModel: (batteryModel: string | null) => void;
  userStockItems: UserStockItem[];
  solution: Solution | null;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const activeTopology = topology ? batteryTopologyToCatalog[topology] : 'HV';
  const slaveModels = expansionModelSet(batteries);
  const selectableBatteries = batteries.filter((battery) => !slaveModels.has(battery.model));
  const visibleBatteries = selectableBatteries.filter((battery) => battery.topology === activeTopology);
  const counts = {
    HV: selectableBatteries.filter((battery) => battery.topology === 'HV').length,
    LV: selectableBatteries.filter((battery) => battery.topology === 'LV').length,
  };

  const selectedBattery = batteries.find((battery) => battery.model === selectedModel);
  const secondarySelectedBattery = batteries.find((battery) => battery.model === secondarySelectedModel);
  const summary = selectedBattery
    ? `${selectedBattery.model} · ${selectedBattery.capacityKwh} kWh${
        solution?.batteryModel === selectedBattery.model ? ` · x${solution.batteryQty}` : ''
      }${secondarySelectedBattery ? ` + ${secondarySelectedBattery.model} · ${secondarySelectedBattery.capacityKwh} kWh` : ''}`
    : topology
      ? `${topologyLabels[topology]} · modelo pendente`
      : 'Nenhuma seleção';

  function selectTab(nextTopology: 'HV' | 'LV') {
    setTopology(catalogToBatteryTopology[nextTopology]);
  }

  function selectBattery(battery: BatteryCatalogOption) {
    if (battery.topology !== activeTopology || !topology) {
      setTopology(catalogToBatteryTopology[battery.topology]);
    }

    if (battery.model === selectedModel) {
      // Unmark the primary; promote the secondary (if any) into its place.
      setBatteryModel(secondarySelectedModel ?? null);
      setSecondaryBatteryModel(null);
      return;
    }
    if (battery.model === secondarySelectedModel) {
      setSecondaryBatteryModel(null);
      return;
    }
    if (!selectedModel) {
      setBatteryModel(battery.model);
      return;
    }
    if (!secondarySelectedModel) {
      setSecondaryBatteryModel(battery.model);
    }
    // Both slots already filled — unmark one before picking a third.
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{summary}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Selecione até 2 modelos para comparar soluções.</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(['HV', 'LV'] as const).map((tab) => {
            const active = activeTopology === tab;
            return (
              <button
                key={tab}
                type="button"
                className={cn(
                  'flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition',
                  active
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
                aria-pressed={active}
                onClick={() => selectTab(tab)}
              >
                {tab}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[0.7rem]', active ? 'bg-primary/10 text-primary' : 'bg-background')}>
                  {counts[tab]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <BatteryCardsSkeleton />
      ) : visibleBatteries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma bateria {activeTopology} cadastrada.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleBatteries.map((battery) => {
            const selected = selectedModel === battery.model;
            const selectedSecondary = secondarySelectedModel === battery.model;
            const usefulEnergyKwh = battery.capacityKwh * (1 - battery.minSocPercent / 100);
            const inStock = userStockItems.some(
              (item) => item.productType === 'battery' && item.productModel === battery.model
            );
            return (
              <div
                key={battery.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected || selectedSecondary}
                onClick={() => selectBattery(battery)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectBattery(battery);
                  }
                }}
                className={cn(
                  'relative grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[88px_1fr]',
                  selected || selectedSecondary
                    ? 'border-accent bg-primary/10 shadow-sm'
                    : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                {secondarySelectedModel && (selected || selectedSecondary) && (
                  <span className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[0.7rem] font-semibold text-accent-foreground shadow-sm">
                    {selected ? '1' : '2'}
                  </span>
                )}
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg bg-background">
                  {battery.imageUrl ? (
                    <button
                      type="button"
                      className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewImage({ url: battery.imageUrl as string, alt: battery.model });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={battery.imageUrl} alt={battery.model} className="h-full w-full object-contain p-2" />
                    </button>
                  ) : (
                    <Battery className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {battery.nickname ? (
                        <>
                          <p className="min-w-0 break-words text-base font-bold leading-snug">{battery.nickname}</p>
                          <p className="min-w-0 break-words text-xs text-muted-foreground">{battery.model}</p>
                        </>
                      ) : (
                        <p className="min-w-0 break-words text-sm font-semibold leading-snug">{battery.model}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {inStock && (
                        <InStockBadge />
                      )}
                      <Badge variant="secondary">{battery.topology}</Badge>
                    </div>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Capacidade: {battery.capacityKwh} kWh</span>
                    <span>
                      Energia útil: {usefulEnergyKwh.toFixed(2)} kWh · SOC mín. {battery.minSocPercent}%
                    </span>
                    <span>
                      Potência: {battery.standardPowerKw ?? '-'} kW · máxima {battery.peakPowerKw ?? '-'} kW
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {battery.documents.length > 0 ? (
                      battery.documents.map((document) => (
                        <button
                          key={`${battery.id}-${document.url}`}
                          type="button"
                          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          onClick={(event) => { event.stopPropagation(); setPreviewDoc(document); }}
                        >
                          {document.name || 'Documento'}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem anexos</span>
                    )}
                  </div>
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

export function InverterModelPicker({
  inverters,
  availableModels,
  selectedModel,
  loading,
  setInverterModel,
  userStockItems,
}: {
  inverters: InverterCatalogOption[];
  availableModels: Set<string> | null;
  selectedModel: string | null;
  loading: boolean;
  setInverterModel: (inverterModel: string | null) => void;
  userStockItems: UserStockItem[];
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const visibleInverters = availableModels
    ? inverters.filter((inverter) => availableModels.has(inverter.model))
    : inverters;

  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <p className="text-sm font-medium">Modelo do inversor</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha um modelo específico ou deixe em &quot;Todos&quot; para o sistema escolher automaticamente.
        </p>
      </div>

      {loading ? (
        <BatteryCardsSkeleton />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div
            role="button"
            tabIndex={0}
            aria-pressed={selectedModel === null}
            onClick={() => setInverterModel(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setInverterModel(null);
              }
            }}
            className={cn(
              'grid cursor-pointer place-items-center gap-2 rounded-lg border bg-card p-3 text-center transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              selectedModel === null ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
            )}
          >
            <Zap className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Todos</p>
              <p className="text-xs text-muted-foreground">O sistema escolhe o melhor inversor</p>
            </div>
          </div>

          {visibleInverters.map((inverter) => {
            const selected = selectedModel === inverter.model;
            const inStock = userStockItems.some(
              (item) => item.productType === 'inverter' && item.productModel === inverter.model
            );
            return (
              <div
                key={inverter.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => setInverterModel(inverter.model)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setInverterModel(inverter.model);
                  }
                }}
                className={cn(
                  'grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[88px_1fr]',
                  selected ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg bg-background">
                  {inverter.imageUrl ? (
                    <button
                      type="button"
                      className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewImage({ url: inverter.imageUrl as string, alt: inverter.model });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={inverter.imageUrl} alt={inverter.model} className="h-full w-full object-contain p-2" />
                    </button>
                  ) : (
                    <Zap className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {inverter.nickname ? (
                        <>
                          <p className="min-w-0 break-words text-base font-bold leading-snug">{inverter.nickname}</p>
                          <p className="min-w-0 break-words text-xs text-muted-foreground">{inverter.model}</p>
                        </>
                      ) : (
                        <p className="min-w-0 break-words text-sm font-semibold leading-snug">{inverter.model}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {inStock && (
                        <InStockBadge />
                      )}
                      <Badge variant="secondary">{inverter.topology}</Badge>
                    </div>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Fases: {inverter.phases}</span>
                    <span>
                      Potência: {inverter.standardPowerKva ?? '-'} kVA · máxima {inverter.peakPowerKva ?? '-'} kVA
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {inverter.documents.length > 0 ? (
                      inverter.documents.map((document) => (
                        <button
                          key={`${inverter.id}-${document.url}`}
                          type="button"
                          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          onClick={(event) => { event.stopPropagation(); setPreviewDoc(document); }}
                        >
                          {document.name || 'Documento'}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem anexos</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {visibleInverters.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhum inversor com solução aprovada para este tipo de rede.
            </div>
          )}
        </div>
      )}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
