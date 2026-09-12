// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultCiOptions, defaultProjectInfo } from '@/lib/store/defaults';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CommercialIndustrialWorkspace } from './CommercialIndustrialWorkspace';

const { listActiveCiBessProducts } = vi.hoisted(() => ({ listActiveCiBessProducts: vi.fn() }));
vi.mock('@/lib/data/ci-bess-products-repository', () => ({ listActiveCiBessProducts }));

function renderWorkspace(overrides: { currentCiProjectId?: string | null; ciOptions?: CommercialIndustrialOptions } = {}) {
  return render(
    <CommercialIndustrialWorkspace
      projectInfo={defaultProjectInfo}
      clients={[]}
      profile={null}
      onUpdateProjectInfo={vi.fn()}
      onSaveProject={vi.fn()}
      onBackToProjects={vi.fn()}
      ciOptions={overrides.ciOptions ?? defaultCiOptions}
      onUpdateCiOptions={vi.fn()}
      currentCiProjectId={overrides.currentCiProjectId ?? null}
      calculationResult={null}
      onFlushSave={vi.fn().mockResolvedValue(undefined)}
      autosaveStatus="idle"
      autosaveLastSavedAt={null}
    />
  );
}

describe('CommercialIndustrialWorkspace', () => {
  beforeEach(() => {
    listActiveCiBessProducts.mockResolvedValue([]);
  });

  it('indicates which configuration tabs still have missing values', () => {
    renderWorkspace();

    expect(screen.getByRole('status', { name: 'Faltam valores na aba Configuração BESS' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Faltam valores na aba Curva de carga' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Faltam valores na aba Tarifa' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Faltam valores na aba Estratégia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Faltam valores na aba Resultados' })).not.toBeInTheDocument();
  });

  it('removes pending indicators after the required configuration is filled', () => {
    renderWorkspace({
      ciOptions: {
        ...defaultCiOptions,
        bessProductId: 'bess-product-1',
        loadCurve: {
          points: [{ timestamp: '2026-01-01T00:00:00-03:00', powerKw: 10 }],
          resolutionMinutes: 60,
          timezone: 'America/Sao_Paulo',
          profileBasis: 'representative_period',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-07',
          source: 'manual',
        },
        tariff: {
          energyRatePeakBrlPerMwh: 100,
          energyRateOffPeakBrlPerMwh: 50,
          demandRateBrlPerKwMonth: 10,
          contractedDemandKw: 10,
          peakStart: '18:00',
          peakEnd: '21:00',
          tariffModality: 'verde',
          market: 'cativo',
          icmsPercent: 0,
          pisCofinsPercent: 0,
        },
      },
    });

    expect(screen.queryByText('Pendente')).not.toBeInTheDocument();
  });

  it('shows the project identification card on Visão geral, and the BESS panel on Configuração BESS', async () => {
    listActiveCiBessProducts.mockResolvedValue([]);
    renderWorkspace();

    expect(screen.getByLabelText('Nome do projeto')).toBeInTheDocument();
    expect(screen.queryByText('Produto BESS')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Configuração BESS' }));

    expect(await screen.findByText('Produto BESS')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do projeto')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Visão geral' }));
    expect(screen.getByLabelText('Nome do projeto')).toBeInTheDocument();
  });

  it('shows the tariff panel on Tarifa', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Tarifa' }));
    expect(screen.getByText('Tarifa de energia')).toBeInTheDocument();
  });

  it('shows the strategy panel on Estratégia', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Estratégia' }));
    expect(screen.getByText('Estratégia de despacho')).toBeInTheDocument();
  });

  it('shows the results panel on Resultados, prompting to save first when there is no saved project yet', () => {
    renderWorkspace({ currentCiProjectId: null });
    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));
    expect(screen.getByText(/Salve o projeto/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Calcular/ })).not.toBeInTheDocument();
  });

  it('shows the Calcular button once the project has been saved', () => {
    renderWorkspace({ currentCiProjectId: 'ci-project-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));
    expect(screen.getByRole('button', { name: 'Calcular' })).toBeInTheDocument();
  });
});
