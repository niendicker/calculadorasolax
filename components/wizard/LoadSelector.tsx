'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, Plus, Trash2, Search } from 'lucide-react';
import { useWizardStore } from '@/lib/store/wizard-store';
import type { CatalogItem, SingleLoad } from '@/lib/types';

function newLoad(partial: Omit<SingleLoad, 'id'>): SingleLoad {
  return { ...partial, id: crypto.randomUUID() };
}

const loadPresets: {
  id: string;
  name: string;
  description: string;
  loads: Omit<SingleLoad, 'id'>[];
}[] = [
  {
    id: 'residential-essential',
    name: 'Residencial essencial',
    description: 'Cargas básicas para simulação rápida de uma residência pequena.',
    loads: [
      { name: 'Geladeira', powerW: 180, hoursPerDay: 12, qty: 1 },
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
      { name: 'Geladeira', powerW: 180, hoursPerDay: 12, qty: 1 },
      { name: 'Freezer', powerW: 220, hoursPerDay: 10, qty: 1 },
      { name: 'Iluminação LED', powerW: 12, hoursPerDay: 5, qty: 12 },
      { name: 'Televisão', powerW: 120, hoursPerDay: 5, qty: 2 },
      { name: 'Roteador', powerW: 15, hoursPerDay: 24, qty: 1 },
      { name: 'Máquina de lavar', powerW: 600, hoursPerDay: 1, qty: 1 },
      { name: 'Micro-ondas', powerW: 1200, hoursPerDay: 0.5, qty: 1 },
    ],
  },
  {
    id: 'home-office-comfort',
    name: 'Home office + conforto',
    description: 'Inclui estação de trabalho, ar-condicionado e cargas de uso prolongado.',
    loads: [
      { name: 'Geladeira', powerW: 180, hoursPerDay: 12, qty: 1 },
      { name: 'Iluminação LED', powerW: 12, hoursPerDay: 6, qty: 10 },
      { name: 'Roteador', powerW: 15, hoursPerDay: 24, qty: 1 },
      { name: 'Notebook', powerW: 90, hoursPerDay: 8, qty: 2 },
      { name: 'Monitor', powerW: 45, hoursPerDay: 8, qty: 2 },
      { name: 'Ar-condicionado 9.000 BTU', powerW: 900, hoursPerDay: 6, qty: 1 },
      { name: 'Televisão', powerW: 120, hoursPerDay: 4, qty: 1 },
    ],
  },
];

export function LoadSelector() {
  const t = useTranslations('loads');
  const locale = useLocale();
  const { residentialOptions, loadCatalog, addLoad, removeLoad, updateLoad } =
    useWizardStore();

  const [tab, setTab] = useState<'presets' | 'catalog' | 'manual'>('presets');
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPower, setManualPower] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualQty, setManualQty] = useState('1');

  const nameKey = locale === 'zh' ? 'nameZh' : locale === 'en' ? 'nameEn' : 'namePt';

  const filtered = loadCatalog.filter((item) =>
    item[nameKey as keyof CatalogItem]
      ?.toString()
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function handleAddFromCatalog(item: CatalogItem) {
    addLoad(
      newLoad({
        name: item[nameKey as keyof CatalogItem] as string,
        powerW: item.powerW,
        hoursPerDay: 4,
        qty: 1,
      })
    );
  }

  function handleAddManual() {
    if (!manualName || !manualPower) return;
    addLoad(
      newLoad({
        name: manualName,
        powerW: Number(manualPower),
        hoursPerDay: Number(manualHours) || 4,
        qty: Number(manualQty) || 1,
      })
    );
    setManualName('');
    setManualPower('');
    setManualHours('');
    setManualQty('1');
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
            const peakW = preset.loads.reduce((acc, load) => acc + load.powerW * load.qty, 0);
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
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="manual-power">{t('power')}</Label>
                <Input
                  id="manual-power"
                  type="number"
                  min={1}
                  value={manualPower}
                  onChange={(e) => setManualPower(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="manual-hours">{t('hours')}</Label>
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
                <Label htmlFor="manual-qty">{t('qty')}</Label>
                <Input
                  id="manual-qty"
                  type="number"
                  min={1}
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
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
        <div className="space-y-2">
          {residentialOptions.loads.map((load) => (
            <div
              key={load.id}
              className="flex items-center gap-2 p-2 rounded-md border bg-card text-sm"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{load.name}</span>
                <span className="text-muted-foreground text-xs">
                  {load.powerW}W · {load.hoursPerDay}h/dia · ×{load.qty}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Input
                  aria-label={`Horas por dia para ${load.name}`}
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={load.hoursPerDay}
                  onChange={(e) =>
                    updateLoad(load.id, { hoursPerDay: Number(e.target.value) })
                  }
                  className="w-14 h-7 text-xs"
                />
                <Input
                  aria-label={`Quantidade para ${load.name}`}
                  type="number"
                  min={1}
                  value={load.qty}
                  onChange={(e) =>
                    updateLoad(load.id, { qty: Number(e.target.value) })
                  }
                  className="w-12 h-7 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removeLoad(load.id)}
                  aria-label="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
