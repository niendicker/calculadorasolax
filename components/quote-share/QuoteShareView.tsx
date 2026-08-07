import { Battery, Boxes, Sun, Zap } from 'lucide-react';
import { calculateDegradedPaybackMonths, formatCurrencyBRL, type QuoteShareSnapshot } from '@/components/app/helpers';
import { desiredFeatureLabel } from '@/lib/desired-features';
import type { QuoteShareStatus } from '@/lib/types';
import { QuoteResponseActions } from './QuoteResponseActions';

const categoryIcon: Record<string, typeof Zap> = {
  Inversor: Zap,
  Bateria: Battery,
  'Bateria (expansão)': Battery,
  Acessório: Boxes,
};

function paybackLabel(months: number | null): string | null {
  if (!months) return null;
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const yearsLabel = `${years} ${years === 1 ? 'ano' : 'anos'}`;
  return remainder === 0 ? yearsLabel : `${yearsLabel} e ${remainder} ${remainder === 1 ? 'mês' : 'meses'}`;
}

/** Renders the frozen quote_shares.snapshot for the public, no-login quote
 *  page — mirrors project-quote-pdf.tsx's sections (products, services,
 *  desired features, technical margin, financial analysis) in plain HTML
 *  instead of @react-pdf/renderer primitives, since this runs in a regular
 *  browser page, not a downloadable file. */
export function QuoteShareView({
  token,
  status,
  snapshot,
  respondedAt,
}: {
  token: string;
  status: QuoteShareStatus;
  snapshot: QuoteShareSnapshot;
  respondedAt: string | null;
}) {
  const canShowPayback = Boolean(
    snapshot.systemCost?.isComplete && snapshot.systemCost.totalCost > 0 && snapshot.tariffSavings?.tariffOrderValid && snapshot.tariffSavings.annualSavings > 0
  );
  const payback = canShowPayback && snapshot.systemCost && snapshot.tariffSavings
    ? paybackLabel(calculateDegradedPaybackMonths(snapshot.systemCost.totalCost, snapshot.tariffSavings))
    : null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-6">
      <header className="flex items-center gap-3">
        {snapshot.companyLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- same tradeoff as ProfileTab.tsx's own logo preview.
          <img src={snapshot.companyLogoUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{snapshot.companyName ?? 'Orçamento'}</p>
          <p className="text-xs text-muted-foreground">
            Gerado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(snapshot.generatedAt))}
          </p>
        </div>
      </header>

      <div className="rounded-xl border bg-card p-4">
        <h1 className="text-lg font-semibold">{snapshot.projectName}</h1>
        {snapshot.clientName && <p className="text-sm text-muted-foreground">Cliente: {snapshot.clientName}</p>}

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg border bg-background p-2">
            <p className="text-muted-foreground">Nominal</p>
            <p className="font-semibold">{(snapshot.nominalW / 1000).toFixed(2)} kVA</p>
          </div>
          <div className="rounded-lg border bg-background p-2">
            <p className="text-muted-foreground">Máxima</p>
            <p className="font-semibold">{(snapshot.peakW / 1000).toFixed(2)} kVA</p>
          </div>
          <div className="rounded-lg border bg-background p-2">
            <p className="text-muted-foreground">Energia/dia</p>
            <p className="font-semibold">{snapshot.dailyKwh.toFixed(2)} kWh</p>
          </div>
        </div>

        {snapshot.desiredFeatures.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {snapshot.desiredFeatures.map((feature) => (
              <span key={feature} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {desiredFeatureLabel(feature)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold">Produtos</p>
        <div className="mt-2 space-y-2">
          {snapshot.products.map((product, index) => {
            const Icon = categoryIcon[product.category] ?? Sun;
            return (
              <div key={`${product.category}-${product.model}-${index}`} className="flex items-center gap-2.5 rounded-lg border bg-background p-2.5 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{product.category}</p>
                  <p className="truncate font-medium">{product.model}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">×{product.qty}</span>
              </div>
            );
          })}
          {snapshot.pvPowerKw != null && (
            <div className="flex items-center gap-2.5 rounded-lg border bg-background p-2.5 text-sm">
              <Sun className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Potência FV recomendada</p>
                <p className="font-medium">{snapshot.pvPowerKw.toFixed(2)} kWp</p>
              </div>
              {snapshot.pvMonthlyGenerationKwh != null && (
                <span className="shrink-0 text-xs text-muted-foreground">{snapshot.pvMonthlyGenerationKwh.toFixed(0)} kWh/mês</span>
              )}
            </div>
          )}
        </div>

        {snapshot.services.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Serviços inclusos</p>
            <ul className="mt-1.5 space-y-1 text-sm">
              {snapshot.services.map((service) => (
                <li key={service.name}>
                  {service.name}
                  {service.qty !== 1 ? ` × ${service.qty}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {snapshot.marginRows.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Folga técnica sobre a necessidade informada</p>
            <div className="mt-1.5 space-y-1 text-xs">
              {snapshot.marginRows.map((row) => {
                const unitLabel = row.unit === 'W' ? 'kVA' : 'kWh';
                const toKilo = (value: number) => (value / 1000).toFixed(2);
                return (
                  <div key={row.key} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium">
                      Necessário {toKilo(row.requiredValue)} {unitLabel} · Oferecido {toKilo(row.providedValue)} {unitLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {(snapshot.systemCost || snapshot.tariffSavings) && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Análise financeira estimada</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {snapshot.systemCost && (
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Investimento estimado</p>
                <p className="text-base font-semibold">{formatCurrencyBRL(snapshot.systemCost.totalCost)}</p>
                {!snapshot.systemCost.isComplete && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Valor parcial</p>}
              </div>
            )}
            {snapshot.tariffSavings?.tariffOrderValid && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground">Ganho com SolaX</p>
                <p className="text-base font-semibold text-primary">{formatCurrencyBRL(snapshot.tariffSavings.annualSavings)}/ano</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatCurrencyBRL(snapshot.tariffSavings.monthlySavings)}/mês</p>
              </div>
            )}
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Retorno simples estimado</p>
              <p className="text-base font-semibold">{payback ?? 'Indisponível'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4">
        {status === 'sent' ? (
          <QuoteResponseActions token={token} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Você já respondeu este orçamento:{' '}
            <span className="font-medium text-foreground">{status === 'accepted' ? 'Aceito' : 'Recusado'}</span>
            {respondedAt && ` em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(respondedAt))}`}.
          </p>
        )}
      </div>
    </main>
  );
}
