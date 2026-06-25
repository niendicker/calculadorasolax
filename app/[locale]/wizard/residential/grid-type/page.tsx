'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { useWizardStore } from '@/lib/store/wizard-store';
import type { ResidentialGridType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

interface GridOption {
  value: ResidentialGridType;
  phases: 1 | 2 | 3;
  voltage: 220 | 380;
}

const options: GridOption[] = [
  { value: 'singlePhase_220', phases: 1, voltage: 220 },
  { value: 'splitPhase_220', phases: 2, voltage: 220 },
  { value: 'threePhase_220', phases: 3, voltage: 220 },
  { value: 'threePhase_380', phases: 3, voltage: 380 },
];

const labelKeys: Record<ResidentialGridType, string> = {
  singlePhase_220: 'single_phase',
  splitPhase_220: 'split_phase',
  threePhase_220: 'three_phase_220',
  threePhase_380: 'three_phase_380',
};

export default function GridTypePage() {
  const t = useTranslations('grid_type');
  const router = useRouter();
  const { residentialOptions, setGridType } = useWizardStore();

  function handleSelect(gridType: ResidentialGridType) {
    setGridType(gridType);
    router.push('./loads');
  }

  return (
    <WizardLayout currentStep={2} totalSteps={4}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t('title')}</h2>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {options.map((opt) => {
            const selected = residentialOptions.gridType === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  'rounded-lg border-2 p-4 text-center transition-all hover:shadow-sm',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="flex justify-center mb-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: opt.phases }).map((_, i) => (
                      <Zap
                        key={i}
                        className={cn(
                          'h-4 w-4',
                          selected ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                    ))}
                  </div>
                </div>
                <p className="font-semibold text-sm">{t(labelKeys[opt.value])}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {opt.phases}F · {opt.voltage}V
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </WizardLayout>
  );
}
