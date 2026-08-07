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
});
