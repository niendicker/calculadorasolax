'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Search } from 'lucide-react';
import { useWizardStore } from '@/lib/store/wizard-store';
import type { CatalogItem, SingleLoad } from '@/lib/types';

function newLoad(partial: Omit<SingleLoad, 'id'>): SingleLoad {
  return { ...partial, id: crypto.randomUUID() };
}

export function LoadSelector() {
  const t = useTranslations('loads');
  const locale = useLocale();
  const { residentialOptions, loadCatalog, addLoad, removeLoad, updateLoad } =
    useWizardStore();

  const [tab, setTab] = useState<'catalog' | 'manual'>('catalog');
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

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={tab === 'catalog' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('catalog')}
        >
          {t('catalog')}
        </Button>
        <Button
          variant={tab === 'manual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('manual')}
        >
          {t('manual')}
        </Button>
      </div>

      {tab === 'catalog' && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => handleAddFromCatalog(item)}
                className="flex items-center justify-between p-2 rounded-md border text-left text-sm hover:bg-accent transition-colors"
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
