'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWizardStore } from '@/lib/store/wizard-store';

export default function IndustrialParams1Page() {
  const t = useTranslations('industrial');
  const tc = useTranslations('common');
  const router = useRouter();
  const { industrialOptions, setIndustrialOption } = useWizardStore();

  function handleNext() {
    router.push('./params-2');
  }

  const canProceed =
    industrialOptions.gridPowerKw !== null && industrialOptions.pvPowerKwp !== null;

  return (
    <WizardLayout currentStep={1} totalSteps={3}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t('params1_title')}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="grid-power">{t('grid_power')}</Label>
            <Input
              id="grid-power"
              type="number"
              min={0}
              step={0.5}
              value={industrialOptions.gridPowerKw ?? ''}
              onChange={(e) =>
                setIndustrialOption('gridPowerKw', e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>
          <div>
            <Label htmlFor="pv-power">{t('pv_power')}</Label>
            <Input
              id="pv-power"
              type="number"
              min={0}
              step={0.5}
              value={industrialOptions.pvPowerKwp ?? ''}
              onChange={(e) =>
                setIndustrialOption('pvPowerKwp', e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>
        </div>

        <Button className="w-full" size="lg" onClick={handleNext} disabled={!canProceed}>
          {tc('next')}
        </Button>
      </div>
    </WizardLayout>
  );
}
