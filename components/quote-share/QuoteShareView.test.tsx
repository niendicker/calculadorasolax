// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QuoteShareSnapshot } from '@/components/app/helpers';
import { QuoteShareView } from './QuoteShareView';

vi.mock('./QuoteResponseActions', () => ({
  QuoteResponseActions: ({ token }: { token: string }) => <div data-testid="response-actions">actions for {token}</div>,
}));

function makeSnapshot(partial: Partial<QuoteShareSnapshot> = {}): QuoteShareSnapshot {
  return {
    companyName: 'Empresa Teste',
    companyLogoUrl: null,
    projectName: 'Projeto do Cliente',
    clientName: 'Maria Silva',
    generatedAt: '2026-01-01T12:00:00.000Z',
    nominalW: 3000,
    peakW: 6000,
    dailyKwh: 5,
    desiredFeatures: ['backup'],
    whiteTariff: null,
    pv: null,
    pvPowerKw: null,
    pvMonthlyGenerationKwh: null,
    microgrid: null,
    generator: null,
    products: [
      { category: 'Inversor', model: 'X1-Hybrid-5.0-D', qty: 1 },
      { category: 'Bateria', model: 'T-BAT-SYS HV 5.8 V2', qty: 1 },
    ],
    services: [],
    marginRows: [],
    systemCost: null,
    tariffSavings: null,
    ...partial,
  };
}

describe('QuoteShareView', () => {
  it('renders the project/client name and product lines', () => {
    render(<QuoteShareView token="token-1" status="sent" snapshot={makeSnapshot()} respondedAt={null} />);
    expect(screen.getByText('Projeto do Cliente')).toBeInTheDocument();
    expect(screen.getByText('Cliente: Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('X1-Hybrid-5.0-D')).toBeInTheDocument();
    expect(screen.getByText('T-BAT-SYS HV 5.8 V2')).toBeInTheDocument();
  });

  it('shows the response actions when status is sent', () => {
    render(<QuoteShareView token="token-1" status="sent" snapshot={makeSnapshot()} respondedAt={null} />);
    expect(screen.getByTestId('response-actions')).toBeInTheDocument();
  });

  it('hides the response actions and shows the accepted confirmation once already responded', () => {
    render(
      <QuoteShareView token="token-1" status="accepted" snapshot={makeSnapshot()} respondedAt="2026-01-02T00:00:00.000Z" />
    );
    expect(screen.queryByTestId('response-actions')).not.toBeInTheDocument();
    expect(screen.getByText('Aceito')).toBeInTheDocument();
  });

  it('shows the recusado confirmation when status is rejected', () => {
    render(<QuoteShareView token="token-1" status="rejected" snapshot={makeSnapshot()} respondedAt={null} />);
    expect(screen.getByText('Recusado')).toBeInTheDocument();
  });

  it('omits the financial analysis card when there is neither systemCost nor tariffSavings', () => {
    render(<QuoteShareView token="token-1" status="sent" snapshot={makeSnapshot()} respondedAt={null} />);
    expect(screen.queryByText('Análise financeira estimada')).not.toBeInTheDocument();
  });

  it('shows the investment total when systemCost is present', () => {
    render(
      <QuoteShareView
        token="token-1"
        status="sent"
        snapshot={makeSnapshot({ systemCost: { totalCost: 12345, isComplete: true } })}
        respondedAt={null}
      />
    );
    expect(screen.getByText('Análise financeira estimada')).toBeInTheDocument();
    expect(screen.getByText('Investimento estimado')).toBeInTheDocument();
  });

  it('renders the complete customer-facing snapshot', () => {
    const { container } = render(
      <QuoteShareView
        token="token-completo"
        status="accepted"
        snapshot={
          makeSnapshot({
            companyLogoUrl: 'https://example.com/logo.png',
            desiredFeatures: ['backup', 'pv'],
            pvPowerKw: 4.25,
            pvMonthlyGenerationKwh: 512,
            products: [
              { category: 'Acessório', model: 'Smart Meter', qty: 2 },
              { category: 'Outro', model: 'Produto complementar', qty: 1 },
            ],
            services: [
              { name: 'Instalação', qty: 2, unitLabel: 'un.', total: 1234.56 },
              { name: 'Projeto', qty: null, unitLabel: 'serviço', total: null },
            ],
            marginRows: [
              { key: 'power', label: 'Potência nominal', requiredValue: 2000, providedValue: 3000, unit: 'W' },
              { key: 'energy', label: 'Energia disponível', requiredValue: 4000, providedValue: 5800, unit: 'Wh' },
            ],
            systemCost: { totalCost: 1300, isComplete: true },
            tariffSavings: {
              monthlySavings: 100,
              annualSavings: 1200,
              businessDaysPerMonth: 22,
              monthlyCostWithoutSolaxBrl: null,
              monthlyCostWithSolaxBrl: null,
              pvMonthlySavings: 0,
              batteryMonthlySavings: 100,
              tariffOrderValid: true,
              effectiveRoundTripEfficiencyPct: 90,
              initialSohPercent: 100,
              annualSohLossPercent: 0,
              standbyMonthlyCost: 0,
              dailyPontaServedKwh: 1,
              dailyIntermediateServedKwh: 0.5,
            },
          })
        }
        respondedAt="2026-01-02T00:00:00.000Z"
      />
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/logo.png');
    expect(screen.getByText('Backup')).toBeInTheDocument();
    expect(screen.getByText('Fotovoltaico')).toBeInTheDocument();
    expect(screen.getByText('Produto complementar')).toBeInTheDocument();
    expect(screen.getByText('Potência FV recomendada')).toBeInTheDocument();
    expect(screen.getByText('4.25 kWp')).toBeInTheDocument();
    expect(screen.getByText('512 kWh/mês')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'LI' && element.textContent?.includes('Instalação × 2 un.'))).toHaveTextContent(/R\$\s*1\.234,56/);
    expect(screen.getByText('Projeto')).toBeInTheDocument();
    expect(screen.getByText(/Necessário 2\.00 kVA · Oferecido 3\.00 kVA/)).toBeInTheDocument();
    expect(screen.getByText(/Necessário 4\.00 kWh · Oferecido 5\.80 kWh/)).toBeInTheDocument();
    expect(screen.getByText('1 ano e 1 mês')).toBeInTheDocument();
    expect(screen.getByText(/Aceito/)).toBeInTheDocument();
  });

  it('uses safe fallbacks when optional company and client fields are absent', () => {
    render(
      <QuoteShareView
        token="token-fallback"
        status="rejected"
        snapshot={makeSnapshot({ companyName: null, clientName: null, companyLogoUrl: null })}
        respondedAt={null}
      />
    );

    expect(screen.getByText('Orçamento')).toBeInTheDocument();
    expect(screen.queryByText(/Cliente:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
