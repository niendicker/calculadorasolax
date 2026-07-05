'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { useWizardStore } from '@/lib/store/wizard-store';
import type { BatteryTopology } from '@/lib/types';
import { cn } from '@/lib/utils';

const options: { value: BatteryTopology; badge: string }[] = [
  { value: 'HighVoltage', badge: 'HV' },
  { value: 'LowVoltage', badge: 'LV' },
];

export default function TopologyPage() {
  const t = useTranslations('topology');
  const router = useRouter();
  const { residentialOptions, setTopology } = useWizardStore();

  function handleSelect(topology: BatteryTopology) {
    setTopology(topology);
    router.push('./grid-type');
  }

  return (
    <WizardLayout currentStep={1} totalSteps={4}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t('title')}</h2>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {options.map((opt) => {
            const isHV = opt.value === 'HighVoltage';
            const selected = residentialOptions.topology === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  'w-full text-left rounded-lg border-2 p-4 transition-all hover:shadow-sm',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                      isHV
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-blue-700'
                    )}
                  >
                    {opt.badge}
                  </div>
                  <div>
                    <p className="font-semibold">{t(isHV ? 'hv' : 'lv')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t(isHV ? 'hv_desc' : 'lv_desc')}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </WizardLayout>
  );
}
