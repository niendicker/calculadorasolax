'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, Plus, Trash2, Search, CircleHelp, X } from 'lucide-react';
import { useWizardStore } from '@/lib/store/wizard-store';
import type { CatalogItem, SingleLoad } from '@/lib/types';

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

function NumberFieldWithClear({
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
  return { ipInRatio: 1, ...partial, id: crypto.randomUUID() };
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

  const [tab, setTab] = useState<'presets' | 'catalog' | 'manual'>('presets');
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPower, setManualPower] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualIpIn, setManualIpIn] = useState('1');

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
    saveManualLoadToCatalog({ name: manualName, powerW, ipInRatio });
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
                  <Badge variant="outline">{(peakW / 1000).toFixed(2)} kW pico</Badge>
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
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={t('search_placeholder')}
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
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
                    <span className="text-muted-foreground ml-1 shrink-0">{item.powerW}W</span>
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
                  <span className="text-muted-foreground ml-1 shrink-0">{item.powerW}W</span>
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
                  <InfoLabel label={t('power')} tip="Potência aparente nominal do equipamento, informada na etiqueta ou manual (em Watts)." />
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
          </CardContent>
        </Card>
      )}

      {residentialOptions.loads.length > 0 && (
        <div className="space-y-3">
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
              <LoadCard key={load.id} load={load} onUpdate={updateLoad} onRemove={removeLoad} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadCard({
  load,
  onUpdate,
  onRemove,
}: {
  load: SingleLoad;
  onUpdate: (id: string, partial: Partial<SingleLoad>) => void;
  onRemove: (id: string) => void;
}) {
  const [hours, setHours] = useState(String(load.hoursPerDay));
  const [qty, setQty] = useState(String(load.qty));
  const [ipIn, setIpIn] = useState(String(load.ipInRatio ?? 1));

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
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{load.name}</p>
          <p className="text-xs text-muted-foreground">
            {load.powerW} W nominal · {loadPeakW.toFixed(0)} W pico · {loadEnergyKwh.toFixed(2)} kWh/dia
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 md:h-7 md:w-7"
          onClick={() => onRemove(load.id)}
          aria-label={`Remover ${load.name}`}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
    </div>
  );
}
