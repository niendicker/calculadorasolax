'use client';

import { useState } from 'react';
import { Battery, Calculator, FileText, Gauge, Home, Save, Settings, Sun, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import type { BatteryTopology, ProductDocument, ResidentialGridType, Solution } from '@/lib/types';
import { cn } from '@/lib/utils';
import { parseAccessoryLabel } from '../helpers';
import {
  BatteryCardsSkeleton,
  DocPreviewModal,
  ImagePreviewModal,
  Metric,
  ProductAttachments,
  Requirement,
  SolutionSkeleton,
} from '../shared-ui';
import { gridOptions, type BatteryCatalogOption, type InverterCatalogOption, type ProductMedia } from '../types';

export function SizingTab({
  title,
  subtitle,
  loadingLabel,
  calculateLabel,
  residentialOptions,
  batteryCatalog,
  inverterCatalog,
  availableInverterModels,
  solution,
  peakW,
  dailyKwh,
  canCalculate,
  loading,
  initialLoading,
  error,
  setTopology,
  setBatteryModel,
  setInverterModel,
  setGridType,
  resetResidential,
  calculate,
  exportPdf,
  saveProject,
  productMedia,
}: {
  title: string;
  subtitle: string;
  loadingLabel: string;
  calculateLabel: string;
  residentialOptions: {
    topology: BatteryTopology | null;
    batteryModel: string | null;
    inverterModel: string | null;
    gridType: ResidentialGridType | null;
    loads: unknown[];
    maxPowerPerPhaseW: number | null;
  };
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  solution: Solution | null;
  peakW: number;
  dailyKwh: number;
  canCalculate: boolean;
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
  setInverterModel: (inverterModel: string | null) => void;
  setGridType: (gridType: ResidentialGridType) => void;
  resetResidential: () => void;
  calculate: () => void;
  exportPdf: () => void;
  saveProject: () => void;
  productMedia: Record<string, ProductMedia>;
}) {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="sticky top-0 z-20 flex flex-col gap-3 border-b bg-background/95 py-3 backdrop-blur lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={saveProject}>
                <Save className="h-4 w-4" />
                Salvar projeto
              </Button>
              <Button variant="outline" onClick={() => resetResidential()}>
                Limpar
              </Button>
              {solution && (
                <Button variant="outline" onClick={exportPdf}>
                  <FileText className="h-4 w-4" />
                  Exportar PDF
                </Button>
              )}
              <Button onClick={calculate} disabled={!canCalculate || loading}>
                <Calculator className="h-4 w-4" />
                {loading ? loadingLabel : calculateLabel}
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4" />
                Configuração
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <BatteryModelPicker
                batteries={batteryCatalog}
                topology={residentialOptions.topology}
                selectedModel={residentialOptions.batteryModel}
                loading={initialLoading}
                setTopology={setTopology}
                setBatteryModel={setBatteryModel}
              />

              <div className="space-y-3 rounded-lg border bg-background p-3">
                <p className="text-sm font-medium">Tipo de rede</p>
                <div
                  className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4"
                  role="radiogroup"
                  aria-label="Tipo de rede"
                >
                  {gridOptions.map((option) => {
                    const active = residentialOptions.gridType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setGridType(option.value)}
                        className={cn(
                          'flex h-14 flex-col items-center justify-center gap-1 rounded-md px-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                          active
                            ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                            : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                        )}
                      >
                        {option.label}
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[0.7rem]',
                            active ? 'bg-primary/10 text-primary' : 'bg-background'
                          )}
                        >
                          {option.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <InverterModelPicker
                  inverters={inverterCatalog}
                  availableModels={availableInverterModels}
                  selectedModel={residentialOptions.inverterModel}
                  loading={initialLoading}
                  setInverterModel={setInverterModel}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="h-4 w-4" />
                Cargas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LoadSelector />
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-0 xl:h-[calc(100vh_-_1.25rem)]">
          <Card className="xl:flex xl:h-full xl:flex-col">
            <CardHeader className="pb-3 xl:shrink-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4" />
                Resumo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Pico" value={`${(peakW / 1000).toFixed(2)} kVA`} />
                <Metric label="Consumo" value={`${dailyKwh.toFixed(2)} kWh/dia`} />
              </div>
              <Separator />
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              {loading ? (
                <SolutionSkeleton />
              ) : !solution ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <p>Configure os dados para ver a solução recomendada.</p>
                  <ul className="mt-3 space-y-1">
                    <Requirement done={Boolean(residentialOptions.topology)} label="Topologia da bateria" />
                    <Requirement done={Boolean(residentialOptions.batteryModel)} label="Modelo da bateria" />
                    <Requirement done={Boolean(residentialOptions.gridType)} label="Tipo de rede" />
                    <Requirement done={residentialOptions.loads.length > 0} label="Cargas da instalação" />
                  </ul>
                </div>
              ) : (
                <ResultSummary solution={solution} onExport={exportPdf} productMedia={productMedia} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function BatteryModelPicker({
  batteries,
  topology,
  selectedModel,
  loading,
  setTopology,
  setBatteryModel,
}: {
  batteries: BatteryCatalogOption[];
  topology: BatteryTopology | null;
  selectedModel: string | null;
  loading: boolean;
  setTopology: (topology: BatteryTopology) => void;
  setBatteryModel: (batteryModel: string | null) => void;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const activeTopology = topology === 'LowVoltage' ? 'LV' : 'HV';
  const visibleBatteries = batteries.filter((battery) => battery.topology === activeTopology);
  const counts = {
    HV: batteries.filter((battery) => battery.topology === 'HV').length,
    LV: batteries.filter((battery) => battery.topology === 'LV').length,
  };

  function selectTab(nextTopology: 'HV' | 'LV') {
    setTopology(nextTopology === 'HV' ? 'HighVoltage' : 'LowVoltage');
  }

  function selectBattery(battery: BatteryCatalogOption) {
    if (battery.topology !== activeTopology) {
      setTopology(battery.topology === 'HV' ? 'HighVoltage' : 'LowVoltage');
    } else if (!topology) {
      setTopology(battery.topology === 'HV' ? 'HighVoltage' : 'LowVoltage');
    }
    setBatteryModel(battery.model);
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Modelo da bateria</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Selecione um modelo cadastrado pelo admin.
          </p>
        </div>
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
            const usefulEnergyKwh = battery.capacityKwh * (1 - battery.minSocPercent / 100);
            return (
              <div
                key={battery.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => selectBattery(battery)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectBattery(battery);
                  }
                }}
                className={cn(
                  'grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[72px_1fr]',
                  selected ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-background">
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
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug">{battery.model}</p>
                    <Badge variant="secondary">{battery.topology}</Badge>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Capacidade: {battery.capacityKwh} kWh</span>
                    <span>
                      Energia útil: {usefulEnergyKwh.toFixed(2)} kWh · SOC mín. {battery.minSocPercent}%
                    </span>
                    <span>
                      Potência: {battery.standardPowerKw ?? '-'} kW · pico {battery.peakPowerKw ?? '-'} kW
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

function InverterModelPicker({
  inverters,
  availableModels,
  selectedModel,
  loading,
  setInverterModel,
}: {
  inverters: InverterCatalogOption[];
  availableModels: Set<string> | null;
  selectedModel: string | null;
  loading: boolean;
  setInverterModel: (inverterModel: string | null) => void;
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
                  'grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[72px_1fr]',
                  selected ? 'border-accent bg-primary/10 shadow-sm' : 'hover:border-primary/50 hover:bg-muted/60'
                )}
              >
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-background">
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
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug">{inverter.model}</p>
                    <Badge variant="secondary">{inverter.topology}</Badge>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>Fases: {inverter.phases}</span>
                    <span>
                      Potência: {inverter.standardPowerKva ?? '-'} kVA · pico {inverter.peakPowerKva ?? '-'} kVA
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

function ResultSummary({
  solution,
  onExport,
  productMedia,
}: {
  solution: Solution;
  onExport: () => void;
  productMedia: Record<string, ProductMedia>;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const inverterMedia = productMedia[solution.inverterModel];
  const batteryMedia = productMedia[solution.batteryModel];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-accent" />
          Inversor
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.inverterModel}</p>
        <p className="text-sm text-muted-foreground">Quantidade: x{solution.inverterQty ?? 1}</p>
        <ProductAttachments media={inverterMedia} onPreview={setPreviewDoc} onPreviewImage={setPreviewImage} />
      </div>

      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Battery className="h-4 w-4 text-primary" />
          Bateria
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.batteryModel}</p>
        <p className="text-sm text-muted-foreground">Quantidade: x{solution.batteryQty}</p>
        <ProductAttachments media={batteryMedia} onPreview={setPreviewDoc} onPreviewImage={setPreviewImage} />
      </div>

      {solution.pvPowerKw !== null && (
        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sun className="h-4 w-4 text-primary" />
            FV recomendado
          </div>
          <p className="mt-1 text-lg font-semibold">{solution.pvPowerKw.toFixed(2)} kWp</p>
        </div>
      )}

      {solution.accessories.length > 0 && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Acessórios</p>
          <div className="mt-2 space-y-2">
            {solution.accessories.map((accessory) => {
              const { model, qty, optional } = parseAccessoryLabel(accessory);
              return (
                <div key={accessory}>
                  <Badge variant="secondary">
                    {model}
                    {optional ? ' (opcional)' : ''}
                  </Badge>
                  <p className="mt-1 text-sm text-muted-foreground">Quantidade: x{qty}</p>
                  <ProductAttachments
                    media={productMedia[model]}
                    onPreview={setPreviewDoc}
                    onPreviewImage={setPreviewImage}
                    inline
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Button className="w-full" variant="outline" onClick={onExport}>
        <FileText className="h-4 w-4" />
        Exportar relatório em PDF
      </Button>

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
