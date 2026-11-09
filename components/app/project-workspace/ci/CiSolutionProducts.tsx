import { Battery, Box, Package, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ScenarioCandidate } from '@/supabase/functions/_shared/commercial-industrial/types';
import { formatCurrencyBRL } from '../../helpers';

export function CiSolutionProducts({ scenario }: { scenario: ScenarioCandidate }) {
  const accessoryIds = new Set(scenario.accessories?.map((item) => item.productId));
  const sts = scenario.sts?.selected;
  if (sts) accessoryIds.add(sts.spec.accessory_id);

  const items = scenario.billOfMaterials?.length
    ? scenario.billOfMaterials
    : scenario.composition?.items ?? [];
  const productType = (productId: string) => {
    const grouped = scenario.group?.components.find((item) => item.productId === productId)?.productType;
    const modular = scenario.composition?.items.find((item) => item.productId === productId)?.productType;
    if (grouped === 'ci_pcs' || modular === 'inverter') return 'PCS / Inversor';
    if (grouped === 'ci_battery' || modular === 'battery') return 'Bateria';
    if (grouped === 'ci_accessory' || modular === 'accessory' || accessoryIds.has(productId)) return 'Acessório';
    return 'BESS integrado';
  };
  const mainItems = items.filter((item) => productType(item.productId) !== 'Acessório');
  // The current BOM already includes accessories and STS; older snapshots
  // can carry them separately. Keep one line per product in either format.
  const extraItems = new Map<string, { productId: string; model: string; quantity: number; unitPriceBrl: number; totalBrl: number; bundled?: boolean; reasons: string[] }>(items.filter((item) => productType(item.productId) === 'Acessório').map((item) => [item.productId, {
    ...item, reasons: [] as string[],
  }]));
  for (const item of scenario.accessories ?? []) extraItems.set(item.productId, item);
  if (sts && !extraItems.has(sts.spec.accessory_id)) extraItems.set(sts.spec.accessory_id, {
    productId: sts.spec.accessory_id, model: sts.spec.model, quantity: sts.quantity,
    unitPriceBrl: sts.unitPriceBrl, totalBrl: sts.totalBrl, bundled: false, reasons: [],
  });

  return (
    <section aria-label="Produtos da solução" className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Produtos da solução</h3>
        <p className="mt-1 text-xs text-muted-foreground">Equipamentos e quantidades dimensionados para este projeto.</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {mainItems.map((item) => {
          const type = productType(item.productId);
          const Icon = type === 'Bateria' ? Battery : type === 'PCS / Inversor' ? Zap : Box;
          return (
            <li key={item.productId} className="min-w-0">
              <Card className="h-full shadow-none">
                <CardContent className="flex h-full items-start gap-3">
                  <div className="shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="h-6 w-6" aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs text-muted-foreground">{type}</p>
                    <h4 className="break-words text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{item.model}</h4>
                    <Badge variant="secondary">{item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'}</Badge>
                    <div className="border-t pt-2 text-xs">
                      {scenario.pricingComplete === false ? <p className="text-muted-foreground">Preço pendente</p> : <>
                        <p className="text-muted-foreground">{formatCurrencyBRL(item.unitPriceBrl)} / un.</p>
                        <p className="mt-1 break-words text-sm font-semibold">{formatCurrencyBRL(item.totalBrl)}</p>
                      </>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
        {mainItems.length === 0 && <li className="min-w-0 rounded-lg border bg-card p-4 md:col-span-2">
          <p className="text-xs text-muted-foreground">Sistema BESS</p>
          <h4 className="mt-1 break-words text-lg font-semibold">{scenario.equipmentLabel || 'Solução BESS dimensionada'}</h4>
          <p className="mt-2 text-sm">{scenario.moduleCount} {scenario.moduleCount === 1 ? 'módulo' : 'módulos'}</p>
        </li>}
      </ul>
      {extraItems.size > 0 && <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-medium"><Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Acessórios e transferência</h4>
        <ul className="divide-y rounded-lg border bg-card px-3">
          {[...extraItems.values()].map((item) => <li key={item.productId} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
            <div className="min-w-0 flex-1 basis-48">
              <p className="break-words font-medium [overflow-wrap:anywhere]">{item.quantity} × {item.model}</p>
              {item.productId === sts?.spec.accessory_id && <p className="mt-1 text-xs text-muted-foreground">Transferência / STS · incluído no CAPEX</p>}
              {item.reasons.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">{item.reasons.join('; ')}</p>}
            </div>
            {item.bundled ? <Badge variant="secondary">Incluso</Badge> : <span className="text-xs font-medium">{scenario.pricingComplete === false ? 'Preço pendente' : formatCurrencyBRL(item.totalBrl)}</span>}
          </li>)}
        </ul>
      </div>}
    </section>
  );
}
