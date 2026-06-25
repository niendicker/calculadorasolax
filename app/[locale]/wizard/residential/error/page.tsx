'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function ErrorPage() {
  const t = useTranslations('error');
  const router = useRouter();

  return (
    <WizardLayout currentStep={4} totalSteps={4}>
      <div className="flex flex-col items-center text-center space-y-6 py-8">
        <div className="p-4 bg-destructive/10 rounded-full">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">{t('title')}</h2>
          <p className="text-muted-foreground mt-2 max-w-sm">{t('message')}</p>
        </div>
        <Button onClick={() => router.back()}>{t('review_loads')}</Button>
      </div>
    </WizardLayout>
  );
}
