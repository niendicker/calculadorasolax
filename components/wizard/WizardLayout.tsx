'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft } from 'lucide-react';

interface WizardLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
}

export function WizardLayout({
  children,
  currentStep,
  totalSteps,
  onBack,
}: WizardLayoutProps) {
  const t = useTranslations('common');
  const router = useRouter();

  const progress = Math.round((currentStep / totalSteps) * 100);

  function handleBack() {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-4 bg-white sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label={t('back')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <Progress value={progress} className="h-2" />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
          {currentStep}/{totalSteps}
        </span>
      </header>

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
