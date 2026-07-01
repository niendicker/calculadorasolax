'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  Battery,
  Boxes,
  Calculator,
  Gauge,
  Home,
  LayoutDashboard,
  Settings,
  ShieldUser,
  Sun,
  UserRound,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { createClient } from '@/lib/supabase/client';
import { useWizardStore, totalDailyKwh, totalPeakW } from '@/lib/store/wizard-store';
import type { BatteryTopology, CatalogItem, ResidentialGridType, Solution } from '@/lib/types';
import { cn } from '@/lib/utils';

const topologyOptions: { value: BatteryTopology; label: string; badge: string }[] = [
  { value: 'HighVoltage', label: 'Alta tensão', badge: 'HV' },
  { value: 'LowVoltage', label: 'Baixa tensão', badge: 'LV' },
];

const gridOptions: { value: ResidentialGridType; label: string; detail: string }[] = [
  { value: 'singlePhase_220', label: 'Monofásico', detail: '220V' },
  { value: 'splitPhase_220', label: 'Bifásico', detail: '220V' },
  { value: 'threePhase_220', label: 'Trifásico', detail: '220V' },
  { value: 'threePhase_380', label: 'Trifásico', detail: '380V' },
];

export function SinglePageApp() {
  const locale = useLocale();
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);
  const {
    residentialOptions,
    solution,
    setTopology,
    setGridType,
    setSolution,
    setLoadCatalog,
    resetResidential,
  } = useWizardStore();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInitialData() {
      const [{ data: userData }, { data: catalogData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('load_catalog')
          .select('id, name_pt, name_en, name_zh, power_w, category')
          .order('category'),
      ]);

      setUserEmail(userData.user?.email ?? null);

      if (catalogData) {
        const catalog: CatalogItem[] = catalogData.map((row) => ({
          id: row.id,
          namePt: row.name_pt,
          nameEn: row.name_en,
          nameZh: row.name_zh,
          powerW: row.power_w,
          category: row.category,
        }));
        setLoadCatalog(catalog);
      }
    }

    loadInitialData();
  }, [setLoadCatalog, supabase]);

  const dailyKwh = totalDailyKwh(residentialOptions.loads);
  const peakW = totalPeakW(residentialOptions.loads);
  const canCalculate =
    residentialOptions.topology &&
    residentialOptions.gridType &&
    residentialOptions.loads.length > 0;

  async function calculate() {
    if (!canCalculate) return;

    setLoading(true);
    setError(null);

    const { data, error: functionError } = await supabase.functions.invoke(
      'calculate-residential',
      { body: residentialOptions }
    );

    setLoading(false);

    if (functionError || !data) {
      setSolution(null);
      setError('Não foi possível encontrar uma solução compatível.');
      return;
    }

    setSolution(data as Solution);
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-rows-[auto_1fr_auto] lg:grid-cols-[240px_1fr] lg:grid-rows-[1fr]">
        <aside className="hidden border-r bg-background px-4 py-5 lg:flex lg:flex-col">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sun className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold leading-tight">SolaX</p>
              <p className="text-xs text-muted-foreground">Calculator</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            <a className="flex h-9 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-medium">
              <LayoutDashboard className="h-4 w-4" />
              Dimensionamento
            </a>
            <Link
              href={`/${locale}/profile`}
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <UserRound className="h-4 w-4" />
              Perfil
            </Link>
            <Link
              href={`/${locale}/admin`}
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ShieldUser className="h-4 w-4" />
              Administração
            </Link>
          </nav>

          <div className="mt-auto rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            {userEmail ? (
              <>
                <p className="font-medium text-foreground">Sessão ativa</p>
                <p className="mt-1 truncate">{userEmail}</p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">Acesso restrito</p>
                <p className="mt-1">Entre para editar perfil e catálogo.</p>
              </>
            )}
          </div>
        </aside>

        <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sun className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold leading-tight">SolaX</p>
                <p className="text-xs text-muted-foreground">Web app</p>
              </div>
            </div>
            <Link href={`/${locale}/profile`}>
              <Button variant="outline" size="icon">
                <UserRound className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </header>

        <section className="min-w-0 px-4 py-4 lg:px-6 lg:py-5">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
              <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => resetResidential()}>
                Limpar
              </Button>
              <Button onClick={calculate} disabled={!canCalculate || loading}>
                <Calculator className="h-4 w-4" />
                {loading ? tc('loading') : tc('calculate')}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings className="h-4 w-4" />
                    Configuração
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Topologia da bateria</p>
                    <div className="grid grid-cols-2 gap-2">
                      {topologyOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setTopology(option.value)}
                          className={cn(
                            'flex h-16 items-center gap-3 rounded-lg border px-3 text-left text-sm transition-colors',
                            residentialOptions.topology === option.value
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted'
                          )}
                        >
                          <Badge variant="secondary">{option.badge}</Badge>
                          <span className="font-medium">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Tipo de rede</p>
                    <div className="grid grid-cols-2 gap-2">
                      {gridOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setGridType(option.value)}
                          className={cn(
                            'flex h-16 flex-col justify-center rounded-lg border px-3 text-left text-sm transition-colors',
                            residentialOptions.gridType === option.value
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted'
                          )}
                        >
                          <span className="font-medium">{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.detail}</span>
                        </button>
                      ))}
                    </div>
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

            <div className="space-y-4 xl:sticky xl:top-5 xl:self-start">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Gauge className="h-4 w-4" />
                    Resumo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Pico" value={`${(peakW / 1000).toFixed(2)} kW`} />
                    <Metric label="Consumo" value={`${dailyKwh.toFixed(2)} kWh/dia`} />
                  </div>
                  <Separator />
                  {error && (
                    <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  {!solution ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Configure a rede, adicione as cargas e calcule para ver a solução recomendada.
                    </div>
                  ) : (
                    <ResultSummary solution={solution} />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <nav className="sticky bottom-0 z-20 grid grid-cols-3 border-t bg-background lg:hidden">
          <a className="flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium">
            <Calculator className="h-4 w-4" />
            Calcular
          </a>
          <Link
            href={`/${locale}/profile`}
            className="flex h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
          >
            <UserRound className="h-4 w-4" />
            Perfil
          </Link>
          <Link
            href={`/${locale}/admin`}
            className="flex h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
          >
            <Boxes className="h-4 w-4" />
            Admin
          </Link>
        </nav>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function ResultSummary({ solution }: { solution: Solution }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-orange-600" />
          Inversor
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.inverterModel}</p>
        {solution.inverterQty && solution.inverterQty > 1 && (
          <p className="text-sm text-muted-foreground">Quantidade: x{solution.inverterQty}</p>
        )}
      </div>

      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Battery className="h-4 w-4 text-emerald-700" />
          Bateria
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.batteryModel}</p>
        <p className="text-sm text-muted-foreground">Quantidade: x{solution.batteryQty}</p>
      </div>

      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sun className="h-4 w-4 text-yellow-600" />
          FV recomendado
        </div>
        <p className="mt-1 text-lg font-semibold">{solution.pvPowerKw.toFixed(2)} kWp</p>
      </div>

      {solution.accessories.length > 0 && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Acessórios</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {solution.accessories.map((accessory) => (
              <Badge key={accessory} variant="secondary">
                {accessory}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
