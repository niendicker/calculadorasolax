'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useWizardStore, totalDailyKwh, totalPeakW } from '@/lib/store/wizard-store';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import type { CatalogItem } from '@/lib/types';

export default function LoadsPage() {
  const t = useTranslations('loads');
  const tc = useTranslations('common');
  const router = useRouter();
  const { residentialOptions, setSolution, setLoadCatalog } = useWizardStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCatalog() {
      const supabase = createClient();
      const { data } = await supabase
        .from('load_catalog')
        .select('id, name_pt, name_en, name_zh, power_w, category, ip_in_ratio')
        .order('category');

      if (data) {
        const catalog: CatalogItem[] = data.map((r) => ({
          id: r.id,
          namePt: r.name_pt,
          nameEn: r.name_en,
          nameZh: r.name_zh,
          powerW: r.power_w,
          category: r.category,
          ipInRatio: r.ip_in_ratio ?? 1,
        }));
        setLoadCatalog(catalog);
      }
    }
    fetchCatalog();
  }, [setLoadCatalog]);

  async function handleCalculate() {
    if (residentialOptions.loads.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: fnErr } = await supabase.functions.invoke(
        'calculate-residential',
        { body: residentialOptions }
      );

      if (fnErr || !data) {
        router.push('../error');
        return;
      }

      setSolution(data);
      router.push('../result');
    } catch {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  }

  const dailyKwh = totalDailyKwh(residentialOptions.loads);
  const peakW = totalPeakW(residentialOptions.loads, residentialOptions.peakCalcMode ?? 'sum');

  return (
    <WizardLayout currentStep={3} totalSteps={4}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t('title')}</h2>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        <LoadSelector />

        {residentialOptions.loads.length > 0 && (
          <>
            <Separator />
            <div className="flex justify-between text-sm bg-muted/50 rounded-lg p-3">
              <div>
                <p className="text-muted-foreground">{t('total_consumption')}</p>
                <p className="font-bold text-lg">
                  {dailyKwh.toFixed(2)} <span className="text-xs font-normal">{t('daily_kwh')}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Pico</p>
                <p className="font-bold text-lg">
                  {(peakW / 1000).toFixed(2)} <span className="text-xs font-normal">kW</span>
                </p>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button
          className="w-full"
          size="lg"
          onClick={handleCalculate}
          disabled={residentialOptions.loads.length === 0 || loading}
        >
          {loading ? tc('loading') : tc('calculate')}
        </Button>
      </div>
    </WizardLayout>
  );
}
