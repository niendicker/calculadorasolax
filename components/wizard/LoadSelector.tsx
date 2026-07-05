'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Layers, Plus, Trash2, Search, CircleHelp, X } from 'lucide-react';
import { gridTypePhaseCount, gridTypePhaseToPhaseVoltages, gridTypeVoltages, loadPhases, totalPowerByPhase, useWizardStore } from '@/lib/store/wizard-store';
import type { CatalogItem, LoadPhase, ResidentialGridType, SingleLoad } from '@/lib/types';
import { cn } from '@/lib/utils';

function InfoLabel({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <span className="group relative inline-flex">
        <CircleHelp
          className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary"
          tabIndex={0}
          aria-label={tip}
        />
        <span className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 w-56 max-w-[calc(100vw-2rem)] rounded-md border bg-popover px-2 py-1.5 text-xs font-normal leading-snug text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {tip}
        </span>
      </span>
    </span>
  );
}

export function NumberFieldWithClear({
  id,
  value,
  placeholder,
  min,
  max,
  step,
  ariaLabel,
  onChange,
  onBlur,
  onClear,
}: {
  id?: string;
  value: string;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onClear: () => void;
}) {
  return (
    <div className="relative mt-1">
      <Input
        id={id}
        aria-label={ariaLabel}
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="h-10 pr-8 text-base md:h-8 md:pr-6 md:text-xs"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Limpar campo"
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
          className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground md:size-5"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function newLoad(partial: Omit<SingleLoad, 'id' | 'ipInRatio'> & { ipInRatio?: number }): SingleLoad {
  return { ipInRatio: 1, voltageV: 220, phaseType: 'mono', phase: 'L1', ...partial, id: crypto.randomUUID() };
}

const loadPresets: {
  id: string;
  name: string;
  description: string;
  loads: (Omit<SingleLoad, 'id' | 'ipInRatio'> & { ipInRatio?: number })[];
}[] = [
  {
    id: 'residential-essential',
    name: 'Residencial essencial',
    description: 'Cargas básicas para simulação rápida de uma residência pequena.',
    loads: [
      { name: 'Geladeira', powerW: 180, hoursPerDay: 12, qty: 1, ipInRatio: 3 },
      { name: 'Iluminação LED', powerW: 12, hoursPerDay: 5, qty: 8 },
      { name: 'Televisão', powerW: 120, hoursPerDay: 4, qty: 1 },
      { name: 'Roteador', powerW: 15, hoursPerDay: 24, qty: 1 },
      { name: 'Ventilador', powerW: 80, hoursPerDay: 6, qty: 2 },
    ],
  },
  {
    id: 'residential-standard',
    name: 'Residencial médio',
    description: 'Perfil comum com cozinha, lavanderia, iluminação e eletrônicos.',
    loads: [
      { name: 'Geladeira', powerW: 180, hoursPerDay: 12, qty: 1, ipInRatio: 3 },
      { name: 'Freezer', powerW: 220, hoursPerDay: 10, qty: 1, ipInRatio: 3 },
      { name: 'Iluminação LED', powerW: 12, hoursPerDay: 5, qty: 12 },
      { name: 'Televisão', powerW: 120, hoursPerDay: 5, qty: 2 },
      { name: 'Roteador', powerW: 15, hoursPerDay: 24, qty: 1 },
      { name: 'Máquina de lavar', powerW: 600, hoursPerDay: 1, qty: 1, ipInRatio: 2 },
      { name: 'Micro-ondas', powerW: 1200, hoursPerDay: 0.5, qty: 1 },
    ],
  },
  {
    id: 'home-office-comfort',
    name: 'Home office + conforto',
    description: 'Inclui estação de trabalho, ar-condicionado e cargas de uso prolongado.',
    loads: [
      { name: 'Geladeira', powerW: 180, hoursPerDay: 12, qty: 1, ipInRatio: 3 },
      { name: 'Iluminação LED', powerW: 12, hoursPerDay: 6, qty: 10 },
      { name: 'Roteador', powerW: 15, hoursPerDay: 24, qty: 1 },
      { name: 'Notebook', powerW: 90, hoursPerDay: 8, qty: 2 },
      { name: 'Monitor', powerW: 45, hoursPerDay: 8, qty: 2 },
      { name: 'Ar-condicionado 9.000 BTU', powerW: 900, hoursPerDay: 6, qty: 1, ipInRatio: 3 },
      { name: 'Televisão', powerW: 120, hoursPerDay: 4, qty: 1 },
    ],
  },
];

export function LoadSelector() {
  const t = useTranslations('loads');
  const locale = useLocale();
  const {
    residentialOptions,
    loadCatalog,
    userLoadCatalog,
    addLoad,
    removeLoad,
    updateLoad,
    setPeakCalcMode,
    saveManualLoadToCatalog,
  } = useWizardStore();

  const gridType = residentialOptions.gridType;
  const maxPowerPerPhaseW = residentialOptions.maxPowerPerPhaseW;
  const phaseTotals = totalPowerByPhase(residentialOptions.loads);

  const [tab, setTab] = useState<'presets' | 'catalog' | 'manual'>('presets');
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPower, setManualPower] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualIpIn, setManualIpIn] = useState('1');
  const [catalogSaveWarning, setCatalogSaveWarning] = useState<string | null>(null);

  const nameKey = locale === 'zh' ? 'nameZh' : locale === 'en' ? 'nameEn' : 'namePt';

  const filtered = loadCatalog.filter((item) =>
    item[nameKey as keyof CatalogItem]
      ?.toString()
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const filteredUserItems = userLoadCatalog.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleAddFromCatalog(item: CatalogItem) {
    addLoad(
      newLoad({
        name: item[nameKey as keyof CatalogItem] as string,
        powerW: item.powerW,
        hoursPerDay: 4,
        qty: 1,
        ipInRatio: item.ipInRatio ?? 1,
      })
    );
  }

  function handleAddFromUserCatalog(item: (typeof userLoadCatalog)[number]) {
    addLoad(
      newLoad({
        name: item.name,
        powerW: item.powerW,
        hoursPerDay: 4,
        qty: 1,
        ipInRatio: item.ipInRatio,
      })
    );
  }

  function handleAddManual() {
    if (!manualName || !manualPower) return;
    const powerW = Number(manualPower);
    const ipInRatio = Number(manualIpIn) || 1;
    addLoad(
      newLoad({
        name: manualName,
        powerW,
        hoursPerDay: Number(manualHours) || 4,
        qty: Number(manualQty) || 1,
        ipInRatio,
      })
    );
    setCatalogSaveWarning(null);
    saveManualLoadToCatalog({ name: manualName, powerW, ipInRatio }).catch(() => {
      setCatalogSaveWarning('Carga adicionada ao cálculo, mas não foi possível salvá-la em "Minhas Cargas" para reutilizar depois.');
    });
    setManualName('');
    setManualPower('');
    setManualHours('');
    setManualQty('1');
    setManualIpIn('1');
  }

  function handleAddPreset(preset: (typeof loadPresets)[number]) {
    preset.loads.forEach((load) => addLoad(newLoad(load)));
    setTab('catalog');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Modo de seleção de cargas">
        <Button
          type="button"
          role="tab"
          aria-selected={tab === 'presets'}
          variant={tab === 'presets' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('presets')}
        >
          Presets
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={tab === 'catalog'}
          variant={tab === 'catalog' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('catalog')}
        >
          {t('catalog')}
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={tab === 'manual'}
          variant={tab === 'manual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('manual')}
        >
          {t('manual')}
        </Button>
      </div>

      {tab === 'presets' && (
        <div className="grid gap-2 md:grid-cols-3">
          {loadPresets.map((preset) => {
            const peakW = preset.loads.reduce(
              (acc, load) => acc + load.powerW * (load.ipInRatio ?? 1) * load.qty,
              0
            );
            const dailyKwh = preset.loads.reduce(
              (acc, load) => acc + (load.powerW * load.hoursPerDay * load.qty) / 1000,
              0
            );

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleAddPreset(preset)}
                className="rounded-lg border bg-card p-3 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-center gap-2 font-medium">
                  <Layers className="h-4 w-4 text-primary" />
                  {preset.name}
                </div>
                <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">
                  {preset.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">{preset.loads.length} cargas</Badge>
                  <Badge variant="outline">{(peakW / 1000).toFixed(2)} kVA pico</Badge>
                  <Badge variant="outline">{dailyKwh.toFixed(1)} kWh/dia</Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'catalog' && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t('search_placeholder')}
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 md:pl-8"
            />
          </div>
          {filteredUserItems.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Minhas Cargas</p>
              <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {filteredUserItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAddFromUserCatalog(item)}
                    className="flex items-center justify-between rounded-md border bg-card p-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="text-muted-foreground ml-1 shrink-0">{item.powerW}VA</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            {filteredUserItems.length > 0 && (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catálogo geral</p>
            )}
            <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAddFromCatalog(item)}
                  className="flex items-center justify-between rounded-md border bg-card p-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="truncate">{item[nameKey as keyof CatalogItem] as string}</span>
                  <span className="text-muted-foreground ml-1 shrink-0">{item.powerW}VA</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'manual' && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label htmlFor="manual-name">{t('name')}</Label>
              <Input
                id="manual-name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <Label htmlFor="manual-power">
                  <InfoLabel label={t('power')} tip="Potência aparente nominal do equipamento, informada na etiqueta ou manual (em VA)." />
                </Label>
                <Input
                  id="manual-power"
                  type="number"
                  min={1}
                  value={manualPower}
                  onChange={(e) => setManualPower(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="manual-hours">
                  <InfoLabel label={t('hours')} tip="Tempo médio de uso diário desse equipamento. Usado para calcular o consumo em kWh/dia." />
                </Label>
                <Input
                  id="manual-hours"
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="manual-qty">
                  <InfoLabel label={t('qty')} tip="Número de unidades desse equipamento na instalação." />
                </Label>
                <Input
                  id="manual-qty"
                  type="number"
                  min={1}
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="manual-ip-in">
                  <InfoLabel
                    label="IP/IN"
                    tip="Relação entre a potência aparente de partida (pico) e a nominal. Motores e compressores (ar-condicionado, geladeira, bombas) costumam partir com 2 a 3× a potência nominal; cargas resistivas/eletrônicas usam 1."
                  />
                </Label>
                <Input
                  id="manual-ip-in"
                  type="number"
                  min={1}
                  step={0.1}
                  value={manualIpIn}
                  onChange={(e) => setManualIpIn(e.target.value)}
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleAddManual}
              disabled={!manualName || !manualPower}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('add_load')}
            </Button>
            {catalogSaveWarning && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {catalogSaveWarning}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {residentialOptions.loads.length > 0 && (
        <div className="space-y-3">
          {gridType && gridTypePhaseCount[gridType] > 1 && (
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs font-medium">
                <InfoLabel
                  label="Potência por fase"
                  tip="Soma da potência nominal das cargas em cada fase. Cargas trifásicas dividem a potência igualmente entre as três fases."
                />
              </p>
              <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${gridTypePhaseCount[gridType]}, minmax(0, 1fr))` }}>
                {loadPhases.slice(0, gridTypePhaseCount[gridType]).map((phase) => {
                  const phaseW = phaseTotals[phase];
                  const overLimit = Boolean(maxPowerPerPhaseW) && phaseW > (maxPowerPerPhaseW as number);
                  return (
                    <div
                      key={phase}
                      className={cn(
                        'rounded-lg border p-2 text-center',
                        overLimit ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40'
                      )}
                    >
                      <p className="text-[0.7rem] font-medium uppercase text-muted-foreground">Fase {phase}</p>
                      <p className={cn('text-sm font-semibold', overLimit && 'text-destructive')}>
                        {phaseW.toFixed(0)} VA
                      </p>
                    </div>
                  );
                })}
              </div>
              {maxPowerPerPhaseW && Object.values(phaseTotals).some((value) => value > maxPowerPerPhaseW) && (
                <p className="mt-2 text-xs text-destructive">
                  Uma ou mais fases ultrapassam o máximo configurado ({maxPowerPerPhaseW.toFixed(0)} VA). Redistribua as cargas entre as fases.
                </p>
              )}
            </div>
          )}
          <div className="rounded-md border bg-card p-3">
            <p className="text-xs font-medium">
              <InfoLabel
                label="Modo de cálculo do pico (IP/IN)"
                tip="Define como as cargas com maior corrente de partida somam no pico de potência aparente do sistema, usado para escolher o inversor."
              />
            </p>
            <div className="mt-2 grid grid-cols-1 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-2">
              {(
                [
                  {
                    value: 'sum' as const,
                    label: 'Soma de todas',
                    tip: 'Pico = soma de (potência × IP/IN) de todas as cargas, como se todas partissem ao mesmo tempo. Mais conservador.',
                  },
                  {
                    value: 'largest-surge' as const,
                    label: 'Só a maior carga',
                    tip: 'Pico = soma nominal de todas as cargas + o excedente de partida apenas da carga com maior IP/IN, assumindo que só um motor/compressor parte por vez.',
                  },
                ]
              ).map((option) => {
                const active = (residentialOptions.peakCalcMode ?? 'sum') === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    title={option.tip}
                    onClick={() => setPeakCalcMode(option.value)}
                    className={`h-10 rounded-md px-2 text-sm font-medium transition md:h-8 md:text-xs ${
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {residentialOptions.loads.map((load) => (
              <LoadCard key={load.id} load={load} gridType={residentialOptions.gridType} onUpdate={updateLoad} onRemove={removeLoad} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadCard({
  load,
  gridType,
  onUpdate,
  onRemove,
}: {
  load: SingleLoad;
  gridType: ResidentialGridType | null;
  onUpdate: (id: string, partial: Partial<SingleLoad>) => void;
  onRemove: (id: string) => void;
}) {
  const [hours, setHours] = useState(String(load.hoursPerDay));
  const [qty, setQty] = useState(String(load.qty));
  const [ipIn, setIpIn] = useState(String(load.ipInRatio ?? 1));
  const [expanded, setExpanded] = useState(false);

  const phaseCount = gridType ? gridTypePhaseCount[gridType] : 3;
  const validVoltages = gridType ? gridTypeVoltages[gridType] : [110, 220, 380];
  const phaseToPhaseVoltages = useMemo(
    () => (gridType ? gridTypePhaseToPhaseVoltages[gridType] : []),
    [gridType]
  );
  const phaseType = load.phaseType ?? 'mono';
  const voltageV = load.voltageV ?? 220;
  // A trifásica load draws from all three phases at once, so it can only be
  // rated at the network's phase-to-phase voltage, not the phase-neutral one.
  const voltageOptions = phaseType === 'trifasica' && phaseToPhaseVoltages.length > 0 ? phaseToPhaseVoltages : validVoltages;
  const voltageValid = voltageOptions.includes(voltageV);
  const needsTwoPhases = phaseType === 'mono' && phaseCount > 1 && phaseToPhaseVoltages.includes(voltageV);
  const phase = load.phase ?? 'L1';
  const phasePairs: [LoadPhase, LoadPhase][] = [['L1', 'L2'], ['L2', 'L3'], ['L1', 'L3']];

  useEffect(() => {
    if (phaseCount < 3 && phaseType === 'trifasica') {
      onUpdate(load.id, { phaseType: 'mono' });
    }
  }, [phaseCount, phaseType, load.id, onUpdate]);

  useEffect(() => {
    if (phaseType === 'trifasica' && phaseToPhaseVoltages.length > 0 && !phaseToPhaseVoltages.includes(voltageV)) {
      onUpdate(load.id, { voltageV: phaseToPhaseVoltages[0] as 110 | 220 | 380 });
    }
  }, [phaseType, phaseToPhaseVoltages, voltageV, load.id, onUpdate]);

  useEffect(() => {
    if (needsTwoPhases && !load.phase2) {
      onUpdate(load.id, { phase: 'L1', phase2: 'L2' });
    } else if (!needsTwoPhases && load.phase2) {
      onUpdate(load.id, { phase2: null });
    }
  }, [needsTwoPhases, load.phase2, load.id, onUpdate]);

  function handleChange(
    field: 'hoursPerDay' | 'qty' | 'ipInRatio',
    raw: string,
    setLocal: (value: string) => void
  ) {
    setLocal(raw);
    const parsed = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(parsed) && parsed > 0) {
      onUpdate(load.id, { [field]: parsed } as Partial<SingleLoad>);
    }
  }

  function revertIfInvalid(raw: string, fallback: number, setLocal: (value: string) => void) {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setLocal(String(fallback));
    }
  }

  const loadPeakW = load.powerW * (load.ipInRatio ?? 1) * load.qty;
  const loadEnergyKwh = (load.powerW * load.hoursPerDay * load.qty) / 1000;

  return (
    <div className="rounded-lg border bg-card text-sm">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
        className="flex w-full cursor-pointer items-start justify-between gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="min-w-0">
          <p className="font-medium truncate">{load.name}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{load.powerW} VA</span> nominal
            </span>
            <span>
              <span className="font-medium text-foreground">{loadPeakW.toFixed(0)} VA</span> pico
            </span>
            <span>
              <span className="font-medium text-foreground">{loadEnergyKwh.toFixed(2)} kWh</span>/dia
            </span>
            <span className={cn(!voltageValid && 'font-medium text-destructive')}>
              {voltageV}V ·{' '}
              {phaseType === 'trifasica'
                ? 'Trifásica'
                : load.phase2
                  ? `Mono · Fases ${phase}-${load.phase2}`
                  : `Mono${phaseCount > 1 ? ` · Fase ${phase}` : ''}`}
              {!voltageValid && ' · tensão incompatível'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:h-7 md:w-7"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(load.id);
            }}
            aria-label={`Remover ${load.name}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </div>
      </div>
      {expanded && (
      <div className="grid grid-cols-1 gap-2 border-t p-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`hours-${load.id}`} className="text-xs font-normal text-muted-foreground">
            <InfoLabel
              label="Horas/dia"
              tip="Tempo médio de uso diário desse equipamento. Usado para calcular o consumo em kWh/dia."
            />
          </Label>
          <NumberFieldWithClear
            id={`hours-${load.id}`}
            value={hours}
            placeholder="Ex.: 4"
            min={0.5}
            max={24}
            step={0.5}
            onChange={(value) => handleChange('hoursPerDay', value, setHours)}
            onBlur={() => revertIfInvalid(hours, load.hoursPerDay, setHours)}
            onClear={() => setHours('')}
          />
        </div>
        <div>
          <Label htmlFor={`qty-${load.id}`} className="text-xs font-normal text-muted-foreground">
            <InfoLabel label="Quantidade" tip="Número de unidades desse equipamento na instalação." />
          </Label>
          <NumberFieldWithClear
            id={`qty-${load.id}`}
            value={qty}
            placeholder="Ex.: 1"
            min={1}
            onChange={(value) => handleChange('qty', value, setQty)}
            onBlur={() => revertIfInvalid(qty, load.qty, setQty)}
            onClear={() => setQty('')}
          />
        </div>
        <div>
          <Label htmlFor={`ip-in-${load.id}`} className="text-xs font-normal text-muted-foreground">
            <InfoLabel
              label="IP/IN"
              tip="Relação entre a potência aparente de partida (pico) e a nominal. Motores e compressores (ar-condicionado, geladeira, bombas) costumam partir com 2 a 3× a potência nominal; cargas resistivas/eletrônicas usam 1."
            />
          </Label>
          <NumberFieldWithClear
            id={`ip-in-${load.id}`}
            value={ipIn}
            placeholder="Ex.: 1"
            min={1}
            step={0.1}
            onChange={(value) => handleChange('ipInRatio', value, setIpIn)}
            onBlur={() => revertIfInvalid(ipIn, load.ipInRatio ?? 1, setIpIn)}
            onClear={() => setIpIn('')}
          />
        </div>
      </div>
      )}
      {expanded && (
      <div className="grid grid-cols-1 gap-2 border-t p-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs font-normal text-muted-foreground">
            <InfoLabel label="Tensão" tip="Tensão de operação da carga. Só mostra as tensões disponíveis na rede escolhida." />
          </Label>
          <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
            {(voltageValid ? voltageOptions : [...voltageOptions, voltageV]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={voltageV === option}
                onClick={() => onUpdate(load.id, { voltageV: option as 110 | 220 | 380 })}
                className={cn(
                  'h-7 flex-1 rounded-md text-xs font-medium transition',
                  voltageV === option
                    ? !voltageValid
                      ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/40'
                      : 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
              >
                {option}V
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs font-normal text-muted-foreground">
            <InfoLabel label="Tipo" tip="Se a carga liga em uma única fase (mono) ou distribui a potência pelas três fases (trifásica)." />
          </Label>
          <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              aria-pressed={phaseType === 'mono'}
              onClick={() => onUpdate(load.id, { phaseType: 'mono' })}
              className={cn(
                'h-7 flex-1 rounded-md text-xs font-medium transition',
                phaseType === 'mono'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              Mono
            </button>
            {phaseCount === 3 && (
              <button
                type="button"
                aria-pressed={phaseType === 'trifasica'}
                onClick={() => onUpdate(load.id, { phaseType: 'trifasica' })}
                className={cn(
                  'h-7 flex-1 rounded-md text-xs font-medium transition',
                  phaseType === 'trifasica'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
              >
                Trifásica
              </button>
            )}
          </div>
        </div>
        {phaseCount > 1 && phaseType === 'mono' && needsTwoPhases && phaseCount === 3 && (
          <div>
            <Label className="text-xs font-normal text-muted-foreground">
              <InfoLabel
                label="Fases"
                tip="Essa tensão é obtida ligando a carga entre duas fases (não fase-neutro), então a potência soma nas duas fases escolhidas."
              />
            </Label>
            <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
              {phasePairs.map(([a, b]) => {
                const active = phase === a && load.phase2 === b;
                return (
                  <button
                    key={`${a}${b}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onUpdate(load.id, { phase: a, phase2: b })}
                    className={cn(
                      'h-7 flex-1 rounded-md text-xs font-medium transition',
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    {a}-{b}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {phaseCount === 2 && phaseType === 'mono' && needsTwoPhases && (
          <div>
            <Label className="text-xs font-normal text-muted-foreground">Fases</Label>
            <p className="mt-1 flex h-7 items-center rounded-lg bg-muted px-2 text-xs text-muted-foreground">
              Ligada entre as duas fases da rede (L1-L2)
            </p>
          </div>
        )}
        {phaseCount > 1 && phaseType === 'mono' && !needsTwoPhases && (
          <div>
            <Label className="text-xs font-normal text-muted-foreground">
              <InfoLabel label="Fase" tip="Em qual fase da rede essa carga está conectada, para acompanhar o equilíbrio entre fases." />
            </Label>
            <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
              {loadPhases.slice(0, phaseCount).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={phase === option}
                  onClick={() => onUpdate(load.id, { phase: option })}
                  className={cn(
                    'h-7 flex-1 rounded-md text-xs font-medium transition',
                    phase === option
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
