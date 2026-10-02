// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import { defaultCiOptions, defaultProjectInfo } from '@/lib/store/defaults';
import type { CiBessProductRecord } from '@/lib/data/ci-bess-products-repository';
import type { Client } from '@/lib/types';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiOverviewPanel } from './CiOverviewPanel';

const { listActiveCiBessProducts } = vi.hoisted(() => ({ listActiveCiBessProducts: vi.fn() }));
vi.mock('@/lib/data/ci-bess-products-repository', () => ({ listActiveCiBessProducts }));

const client: Client = {
  id: 'c1',
  name: 'Indústria Alfa Ltda',
  email: 'contato@alfa.com',
  phone: '',
  document: '',
  notes: '',
  createdAt: '',
  updatedAt: '',
};

function renderPanel(
  overrides: Partial<{
    ciOptions: CommercialIndustrialOptions;
    calculationResult: CommercialIndustrialResult | null;
    onNavigateToSection: (section: string) => void;
    onUpdateProjectInfo: (partial: unknown) => void;
    onSaveProject: () => void;
    isSaved: boolean;
    client: Client | null;
    clients: Client[];
  }> = {}
) {
  const onUpdateProjectInfo = overrides.onUpdateProjectInfo ?? vi.fn();
  const onSaveProject = overrides.onSaveProject ?? vi.fn();
  render(
    <CiOverviewPanel
      projectInfo={{ ...defaultProjectInfo, name: 'Fábrica Alfa', clientId: 'c1', address: emptyAddress() }}
      clients={overrides.clients ?? [client]}
      client={overrides.client === undefined ? client : overrides.client}
      onUpdateProjectInfo={onUpdateProjectInfo}
      onSaveProject={onSaveProject}
      onBackToProjects={vi.fn()}
      isSaved={overrides.isSaved ?? true}
      ciOptions={overrides.ciOptions ?? defaultCiOptions}
      calculationResult={overrides.calculationResult ?? null}
      onNavigateToSection={overrides.onNavigateToSection ?? vi.fn()}
    />
  );
  return { onUpdateProjectInfo, onSaveProject };
}

const product: CiBessProductRecord = {
  id: 'p1',
  model: 'PowerStack 100',
  manufacturer: 'SolaX',
  description: null,
  active: true,
  module_power_kw: 50,
  module_capacity_kwh: 100,
  efficiency_percent: 92,
  soc_min_percent: 10,
  soc_max_percent: 95,
  warranty_years: 10,
  image_url: null,
  documents: [],
  created_at: '',
  updated_at: '',
};

function makeResult(): CommercialIndustrialResult {
  const scenario = {
    scenarioId: 's-2',
    moduleCount: 2,
    strategy: 'HYBRID' as const,
    technicalValidity: true,
    technicalWarnings: [],
    totalPowerKw: 100,
    totalCapacityKwh: 200,
    usefulCapacityKwh: 180,
    capex: 500000,
    annualSavings: 120000,
    energySavings: 80000,
    demandSavings: 40000,
    paybackYearsSimple: 4.2,
    paybackYearsDiscounted: 5.1,
    roiPercent: 24,
    npv: 300000,
    marginalGain: null,
  };
  return {
    engineVersion: 'ci-v1',
    inputFingerprint: 'fp',
    baseline: {
      annualCostBrl: 900000,
      maxDemandPeakKw: 350,
      maxDemandOffPeakKw: 300,
      energyImportedPeakKwh: 50000,
      energyImportedOffPeakKwh: 120000,
      weeklyEnergyImportedPeakKwh: 950,
      weeklyEnergyImportedOffPeakKwh: 2300,
    },
    scenarios: [scenario],
    recommendation: { scenarioId: 's-2', reason: 'Melhor payback dentro da faixa avaliada.' },
    selected: { ...scenario, dispatch: [], cashFlow: [] },
    assumptions: {
      tariff: {
        energyRatePeakBrlPerMwh: 900,
        energyRateOffPeakBrlPerMwh: 400,
        demandRateBrlPerKwMonth: 30,
        contractedDemandKw: 300,
        peakStart: '18:00',
        peakEnd: '21:00',
        tariffModality: 'verde',
        market: 'cativo',
        icmsPercent: 18,
        pisCofinsPercent: 9.25,
      },
      financial: { discountRatePercent: 12, analysisHorizonYears: 10, annualEnergyInflationPercent: 0, monthsPerYear: 12 },
      loadCurve: { resolutionMinutes: 15, profileBasis: 'representative_period', periodStart: '2026-01-01', periodEnd: '2026-01-07', timezone: 'America/Sao_Paulo' },
    },
    warnings: [],
  };
}

beforeEach(() => {
  listActiveCiBessProducts.mockReset();
  listActiveCiBessProducts.mockResolvedValue([]);
});

describe('CiOverviewPanel', () => {
  it('shows every configuration area as pending when nothing has been set up', async () => {
    const onNavigateToSection = vi.fn();
    renderPanel({ onNavigateToSection });

    await waitFor(() => expect(listActiveCiBessProducts).toHaveBeenCalled());

    expect(screen.getByText('Nenhum produto selecionado')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma curva importada')).toBeInTheDocument();
    expect(screen.getByText('Tarifa não configurada')).toBeInTheDocument();
    // Strategy always has a default, so it alone starts "Configurado".
    expect(screen.getByText('1 de 4 configurados')).toBeInTheDocument();
  });

  it('navigates to the right section when a configuration card is clicked', () => {
    const onNavigateToSection = vi.fn();
    renderPanel({ onNavigateToSection });

    fireEvent.click(screen.getByText('Nenhuma curva importada'));
    expect(onNavigateToSection).toHaveBeenCalledWith('curve');
  });

  it('shows the resolved BESS product name and module count once configured', async () => {
    listActiveCiBessProducts.mockResolvedValue([product]);
    const ciOptions = { ...defaultCiOptions, bessProductId: 'p1', sizing: { mode: 'fixed' as const, moduleCount: 4, minModules: null, maxModules: null } };

    renderPanel({ ciOptions });

    expect(await screen.findByText('PowerStack 100 · SolaX · 4 módulo(s)')).toBeInTheDocument();
    expect(screen.getByText('2 de 4 configurados')).toBeInTheDocument();
  });

  it('shows an empty state and a CTA to Resultados when there is no calculation yet', () => {
    const onNavigateToSection = vi.fn();
    renderPanel({ onNavigateToSection });

    expect(screen.getByText('Resultado ainda não calculado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para Resultados' }));
    expect(onNavigateToSection).toHaveBeenCalledWith('results');
  });

  it('shows the recommended scenario metrics when a result is already calculated', () => {
    const onNavigateToSection = vi.fn();
    renderPanel({ calculationResult: makeResult(), onNavigateToSection });

    expect(screen.getByText('Calculado')).toBeInTheDocument();
    expect(screen.getByText('R$ 500.000,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 120.000,00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ver resultados completos/ }));
    expect(onNavigateToSection).toHaveBeenCalledWith('results');
  });

  describe('identification (nome/cliente/endereço)', () => {
    it('shows the full ProjectInfoEditor form for a brand-new, unsaved project', () => {
      renderPanel({ isSaved: false });

      expect(screen.getByLabelText('Nome do projeto')).toBeInTheDocument();
      expect(screen.queryByText('Instalação')).not.toBeInTheDocument();
    });

    it('shows a summary card with Nome/Cliente/Endereço rows for an already-saved project', () => {
      renderPanel({ isSaved: true });

      expect(screen.getByText('Instalação')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Nome do projeto: Fábrica Alfa/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cliente: Indústria Alfa Ltda/ })).toBeInTheDocument();
      expect(screen.queryByLabelText('Nome do projeto')).not.toBeInTheDocument();
    });

    it('opens the name modal, saves it, and calls onUpdateProjectInfo + onSaveProject', () => {
      const { onUpdateProjectInfo, onSaveProject } = renderPanel({ isSaved: true });

      fireEvent.click(screen.getByRole('button', { name: /Nome do projeto: Fábrica Alfa/ }));
      const dialog = screen.getByRole('dialog', { name: 'Nome da instalação' });
      fireEvent.change(within(dialog).getByLabelText('Nome da instalação'), { target: { value: 'Fábrica Beta' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

      expect(onUpdateProjectInfo).toHaveBeenCalledWith({ name: 'Fábrica Beta' });
      expect(onSaveProject).toHaveBeenCalledTimes(1);
    });

    it('opens the client modal and lets the user pick a different client', () => {
      const otherClient: Client = { ...client, id: 'c2', name: 'Comércio Beta' };
      const { onUpdateProjectInfo } = renderPanel({ isSaved: true, clients: [client, otherClient] });

      fireEvent.click(screen.getByRole('button', { name: /Cliente: Indústria Alfa Ltda/ }));
      const dialog = screen.getByRole('dialog', { name: 'Cliente' });
      fireEvent.change(within(dialog).getByLabelText('Cliente'), { target: { value: otherClient.id } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

      expect(onUpdateProjectInfo).toHaveBeenCalledWith({ clientId: otherClient.id });
    });
  });
});
