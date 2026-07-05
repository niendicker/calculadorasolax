'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWizardStore } from '@/lib/store/wizard-store';
import { Zap, Battery, Sun, Package, RotateCcw } from 'lucide-react';

export default function IndustrialResultPage() {
  const t = useTranslations('result');
  const router = useRouter();
  const { solution, resetIndustrial } = useWizardStore();

  if (!solution) {
    return (
      <WizardLayout currentStep={3} totalSteps={3}>
        <p className="text-muted-foreground text-center py-12">{t('no_solution')}</p>
      </WizardLayout>
    );
  }

  return (
    <WizardLayout currentStep={3} totalSteps={3}>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('title')}</h2>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" />
              <CardTitle className="text-base">{t('inverter')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{solution.inverterModel}</p>
            {solution.inverterQty && solution.inverterQty > 1 && (
              <p className="text-muted-foreground text-sm mt-1">
                {t('inverter_qty')}: <span className="font-semibold text-foreground">x{solution.inverterQty}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Battery className="h-4 w-4 text-green-500" />
              <CardTitle className="text-base">{t('battery')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{solution.batteryModel}</p>
            <p className="text-muted-foreground text-sm mt-1">
              {t('battery_qty')}: <span className="font-semibold text-foreground">x{solution.batteryQty}</span>
            </p>
          </CardContent>
        </Card>

        {solution.pvPowerKw !== null && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-yellow-500" />
                <CardTitle className="text-base">{t('pv_power')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{solution.pvPowerKw.toFixed(2)} kWp</p>
            </CardContent>
          </Card>
        )}

        {solution.accessories.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t('accessories')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {solution.accessories.map((acc) => (
                  <Badge key={acc} variant="secondary">{acc}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => { resetIndustrial(); router.push('../../../'); }}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Novo cálculo
        </Button>
      </div>
    </WizardLayout>
  );
}
