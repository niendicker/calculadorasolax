// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultCiOptions, defaultProjectInfo } from '@/lib/store/defaults';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';
import type { InlineProfile } from '../types';
import { CommercialIndustrialWorkspace } from './CommercialIndustrialWorkspace';

const { listActiveCiBessProducts } = vi.hoisted(() => ({ listActiveCiBessProducts: vi.fn() }));
vi.mock('@/lib/data/ci-generated-solutions-repository',()=>({queryCiGeneratedSolutions:vi.fn().mockResolvedValue({solutions:[]})}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({})}));
vi.mock('./ci/CiAccessoriesPanel',()=>({CiAccessoriesPanel:()=>null}));
vi.mock('@/lib/data/ci-bess-products-repository', () => ({ listActiveCiBessProducts }));

function renderWorkspace(overrides: { currentCiProjectId?: string | null; ciOptions?: CommercialIndustrialOptions; profile?: InlineProfile | null } = {}) {
  return render(
    <CommercialIndustrialWorkspace
      projectInfo={defaultProjectInfo}
      clients={[]}
      profile={overrides.profile ?? null}
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
    expect(screen.getByRole('status', { name: 'Faltam valores na aba Curvas e aplicações' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Faltam valores na aba Tarifa' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Faltam valores na aba Estratégia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Faltam valores na aba Resultados' })).not.toBeInTheDocument();
  });

  it('removes pending indicators after the required configuration is filled', () => {
    renderWorkspace({
      ciOptions: {
        ...defaultCiOptions,
        bessProductId: 'bess-product-1',
        bessSystem:{kind:'model',sourceKind:'cabinet',productId:'bess-product-1'},lineVoltageV:380,
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

    expect(await screen.findByRole('heading',{name:'Configurações BESS'})).toBeInTheDocument();
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

  it('hides the Falta de rede tab for users without ci_backup flag', () => {
    renderWorkspace({ profile: null });
    expect(screen.queryByRole('button', { name: 'Falta de rede' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Curvas e aplicações'}));
    expect(screen.getByRole('button',{name:'Configurar FV'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Configurar backup'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Configurar gerador'})).not.toBeInTheDocument();
  });

  it('opens backup adjustments from the unified curve page for authorized users', () => {
    const profileWithBackup: InlineProfile = {
      id: 'u1',
      email: 'user@test.com',
      fullName: 'Test User',
      phone: '',
      role: 'user',
      companyName: '',
      companyAddress: {} as never,
      companyLogoUrl: '',
      companyDocument: '',
      featureFlags: ['ci', 'ci_backup'],
    };

    renderWorkspace({ profile: profileWithBackup });
    expect(screen.queryByRole('button',{name:'Falta de rede'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Solar FV'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Curvas e aplicações'}));
    fireEvent.click(screen.getByRole('button',{name:'Configurar backup'}));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Proteção para Falta de Rede (Backup C&I)')).toBeInTheDocument();
  });
  it('retains a calculation across tabs and warns after editing the strategy', async () => {
    const result = {
      baseline: { annualCostBrl: 1000, maxDemandPeakKw: 10, maxDemandOffPeakKw: 10, energyImportedPeakKwh: 10, energyImportedOffPeakKwh: 10 },
      scenarios: [], selected: null, recommendation: { scenarioId: null, reason: '' },
      assumptions: { loadCurve: { resolutionMinutes: 60 } }, warnings: [],
    } as unknown as CommercialIndustrialResult;
    const fetchCalculation = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal('fetch', fetchCalculation);
    function Session() {
      const [options, setOptions] = useState(defaultCiOptions);
      return <CommercialIndustrialWorkspace
        projectInfo={defaultProjectInfo} clients={[]} profile={null}
        onUpdateProjectInfo={vi.fn()} onSaveProject={vi.fn()} onBackToProjects={vi.fn()}
        ciOptions={options} onUpdateCiOptions={(partial) => setOptions((current) => ({ ...current, ...partial }))}
        currentCiProjectId="ci-project-1" calculationResult={null} onFlushSave={async () => undefined}
        autosaveStatus="idle" autosaveLastSavedAt={null}
      />;
    }
    try {
      render(<Session />);
      fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));
      fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));
      await screen.findByText('Nenhuma solução atende aos requisitos técnicos');
      fireEvent.click(screen.getByRole('button', { name: 'Estratégia' }));
      fireEvent.click(screen.getByRole('button', { name: /^Peak Shaving/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));
      expect(screen.getByText('Nenhuma solução atende aos requisitos técnicos')).toBeInTheDocument();
      expect(screen.getByText(/Os parâmetros do estudo foram alterados/)).toBeInTheDocument();
      expect(fetchCalculation).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

});
