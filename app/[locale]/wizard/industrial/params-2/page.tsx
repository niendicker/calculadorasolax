'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWizardStore } from '@/lib/store/wizard-store';
import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';

export default function IndustrialParams2Page() {
  const t = useTranslations('industrial');
  const tc = useTranslations('common');
  const router = useRouter();
  const { industrialOptions, setIndustrialOption, setSolution } = useWizardStore();
  const [loading, setLoading] = useState(false);

  async function handleCalculate() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke(
        'calculate-industrial',
        { body: industrialOptions }
      );
      if (error || !data) {
        router.push('../../../residential/error');
        return;
      }
      setSolution(data);
      router.push('./result');
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardLayout currentStep={2} totalSteps={3}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t('params2_title')}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="backup-power">{t('backup_power')}</Label>
            <Input
              id="backup-power"
              type="number"
              min={0}
              step={0.5}
              value={industrialOptions.backupPowerKw ?? ''}
              onChange={(e) =>
                setIndustrialOption('backupPowerKw', e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>
          <div>
            <Label htmlFor="backup-hours">{t('backup_hours')}</Label>
            <Input
              id="backup-hours"
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={industrialOptions.backupHours ?? ''}
              onChange={(e) =>
                setIndustrialOption('backupHours', e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>
        </div>

        <Button className="w-full" size="lg" onClick={handleCalculate} disabled={loading}>
          {loading ? tc('loading') : tc('calculate')}
        </Button>
      </div>
    </WizardLayout>
  );
}
