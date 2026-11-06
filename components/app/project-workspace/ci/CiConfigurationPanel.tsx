'use client';

// Fase 6, section 8.1 item 2 ("Configuração BESS") — pick a product from the
// admin-managed catalog and how many modules to evaluate. Strategy (item 5)
// and the load curve/tariff panels are separate, still-to-come pieces of the
// same workspace; this only owns bessProductId/sizing.

import { useEffect, useState } from 'react';
import { Battery, Check, ChevronDown, ChevronLeft, ChevronUp, ChevronRight, Gauge, ShieldCheck, Sliders, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listActiveCiBessProducts, type CiBessProductRecord } from '@/lib/data/ci-bess-products-repository';
import type { CommercialIndustrialOptions, SizingMode } from '@/supabase/functions/_shared/commercial-industrial/types';
import { cn } from '@/lib/utils';
import { BatteryCardsSkeleton } from '../../shared-ui';
import { CiAccessoriesPanel } from './CiAccessoriesPanel';
import { CiModularConfigurationPanel, emptyModularSelection } from './CiModularConfigurationPanel';

const sizingModeOptions: { value: SizingMode; label: string; hint: string }[] = [
  { value: 'auto', label: 'Faixa automática', hint: 'Compara várias quantidades dentro de um intervalo.' },
  { value: 'fixed', label: 'Quantidade fixa', hint: 'Simula um único número de módulos.' },
];

function CiIntegratedConfigurationPanel({
  ciOptions,
  onChange,
  onNavigatePrev,
  onNavigateNext,
}: {
  ciOptions: CommercialIndustrialOptions;
  onChange: (partial: Partial<CommercialIndustrialOptions>) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
}) {
  const [products, setProducts] = useState<CiBessProductRecord[] | null>(null);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isCustomSizing =
    ciOptions.sizing.mode === 'fixed' ||
    (ciOptions.sizing.mode === 'auto' && (ciOptions.sizing.minModules !== 1 || ciOptions.sizing.maxModules !== 6));
  const [showCustomSizing, setShowCustomSizing] = useState(isCustomSizing);

  useEffect(() => {
    let cancelled = false;
    listActiveCiBessProducts()
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'Não foi possível carregar o catálogo de produtos BESS.');
      });
    return () => {
      cancelled = true;
    };
  }, [catalogAttempt]);

  const selectedProduct = products?.find((product) => product.id === ciOptions.bessProductId) ?? null;

  function selectProduct(product: CiBessProductRecord) {
    onChange({ bessProductId: product.id === ciOptions.bessProductId ? null : product.id });
  }

  function setSizingMode(mode: SizingMode) {
    onChange({ sizing: { ...ciOptions.sizing, mode, ...(mode === 'fixed' ? { moduleCount: ciOptions.sizing.moduleCount ?? 1 } : { minModules: ciOptions.sizing.minModules ?? 1, maxModules: ciOptions.sizing.maxModules ?? 6 }) } });
  }

  function setModuleCount(value: number) {
    onChange({ sizing: { ...ciOptions.sizing, moduleCount: Math.max(1, Math.round(value) || 1) } });
  }

  function setMinModules(value: number) {
    const minModules = Math.max(1, Math.round(value) || 1);
    onChange({ sizing: { ...ciOptions.sizing, minModules, maxModules: Math.max(minModules, ciOptions.sizing.maxModules ?? 6) } });
  }

  function setMaxModules(value: number) {
    onChange({ sizing: { ...ciOptions.sizing, maxModules: Math.max(ciOptions.sizing.minModules ?? 1, Math.round(value) || 1) } });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Produto BESS</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedProduct
              ? `${selectedProduct.model} · ${selectedProduct.manufacturer}`
              : 'Escolha um produto do catálogo administrado para dimensionar este projeto.'}
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <p role="alert">{error}</p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => { setError(null); setProducts(null); setCatalogAttempt((attempt) => attempt + 1); }}>
              Tentar novamente
            </Button>
          </div>
        ) : products === null ? (
          <BatteryCardsSkeleton />
        ) : products.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum produto BESS ativo cadastrado. Peça a um administrador para cadastrar um produto em
            Administração → C&amp;I BESS antes de continuar o dimensionamento.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {products.map((product) => {
              const selected = product.id === ciOptions.bessProductId;
              const usefulCapacityKwh = product.module_capacity_kwh * ((product.soc_max_percent - product.soc_min_percent) / 100);
              return (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => selectProduct(product)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectProduct(product);
                    }
                  }}
                  className={cn(
                    'relative grid cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected
                      ? 'border-primary bg-primary/[0.06] shadow-sm ring-1 ring-primary/20'
                      : 'hover:border-primary/50 hover:bg-muted/60'
                  )}
                >
                  {selected && (
                    <span className="absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0 space-y-1.5 pr-6">
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug">{product.model}</p>
                    <p className="text-xs text-muted-foreground">{product.manufacturer}</p>
                    <div className="grid gap-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Potência: {product.module_power_kw} kW/módulo
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Battery className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Capacidade: {product.module_capacity_kwh} kWh/módulo · útil {usefulCapacityKwh.toFixed(2)} kWh
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Eficiência: {product.efficiency_percent}%
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Garantia: {product.warranty_years} anos
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                {ciOptions.sizing.mode === 'fixed'
                  ? `Quantidade fixa: ${ciOptions.sizing.moduleCount ?? 1} módulo(s)`
                  : 'Dimensionamento automático ativado'}
              </p>
              <button
                type="button"
                aria-expanded={showCustomSizing}
                aria-controls="ci-custom-sizing"
                onClick={() => setShowCustomSizing(!showCustomSizing)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{showCustomSizing ? 'Ocultar personalização' : 'Ajustar faixa ou quantidade fixa'}</span>
                {showCustomSizing ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {ciOptions.sizing.mode === 'fixed'
                ? 'A calculadora simulará exclusivamente a quantidade fixa definida abaixo.'
                : `A calculadora simula cenários de ${ciOptions.sizing.minModules ?? 1} a ${ciOptions.sizing.maxModules ?? 6} módulos e recomenda a quantidade com melhor retorno de investimento (Payback/ROI).`}
            </p>
          </div>
        </div>

        {showCustomSizing && (
          <div id="ci-custom-sizing" className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Configuração de módulos para a simulação:</p>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:w-fit">
              {sizingModeOptions.map((option) => {
                const active = ciOptions.sizing.mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSizingMode(option.value)}
                    title={option.hint}
                    className={cn(
                      'flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition',
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {ciOptions.sizing.mode === 'fixed' ? (
              <label className="flex max-w-40 flex-col gap-1.5 text-sm font-medium">
                <span>Módulos</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={ciOptions.sizing.moduleCount ?? 1}
                  onChange={(event) => setModuleCount(Number(event.target.value))}
                />
              </label>
            ) : (
              <div className="flex flex-wrap gap-3">
                <label className="flex max-w-40 flex-col gap-1.5 text-sm font-medium">
                  <span>Mínimo</span>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={ciOptions.sizing.minModules ?? 1}
                    onChange={(event) => setMinModules(Number(event.target.value))}
                  />
                </label>
                <label className="flex max-w-40 flex-col gap-1.5 text-sm font-medium">
                  <span>Máximo</span>
                  <Input
                    type="number"
                    min={ciOptions.sizing.minModules ?? 1}
                    step={1}
                    value={ciOptions.sizing.maxModules ?? ciOptions.sizing.minModules ?? 1}
                    onChange={(event) => setMaxModules(Number(event.target.value))}
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {(onNavigatePrev || onNavigateNext) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {onNavigatePrev ? (
            <Button type="button" variant="outline" onClick={onNavigatePrev} className="gap-1.5 rounded-lg text-xs">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Voltar para Visão geral
            </Button>
          ) : (
            <div />
          )}

          {onNavigateNext && (
            <Button
              type="button"
              onClick={onNavigateNext}
              disabled={!selectedProduct}
              className="gap-1.5 rounded-lg text-xs font-semibold"
            >
              Avançar para Solar FV
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}


export function CiConfigurationPanel(props: Parameters<typeof CiIntegratedConfigurationPanel>[0]) {
  const modular = props.ciOptions.bessSystem?.kind === 'modular';
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2" aria-label="Tipo de solução BESS">
      <Button type="button" variant={!modular ? 'default' : 'outline'} aria-pressed={!modular} onClick={() => props.onChange({ bessSystem: { kind: 'integrated' } })}>BESS integrado</Button>
      <Button type="button" variant={modular ? 'default' : 'outline'} aria-pressed={modular} onClick={() => { if (!modular) props.onChange({ bessSystem: emptyModularSelection, bessProductId: null }); }}>PCS + baterias</Button>
    </div>
    {modular ? <CiModularConfigurationPanel {...props} /> : <CiIntegratedConfigurationPanel {...props} />}
    <CiAccessoriesPanel {...props}/>
  </div>;
}
