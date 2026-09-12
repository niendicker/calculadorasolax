// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import type { Client, ProjectInfo } from '@/lib/types';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiResultsPanel } from './CiResultsPanel';

const testProjectInfo: ProjectInfo = { name: 'Fábrica Teste', clientId: null, address: emptyAddress(), notes: '' };
const testClient: Client | null = null;
const testCiOptions: CommercialIndustrialOptions = {
  loadCurve: null,
  tariff: null,
  bessProductId: null,
  strategy: 'HYBRID',
  sizing: { mode: 'fixed', moduleCount: 2, minModules: null, maxModules: null },
  financialAssumptions: { discountRatePercent: 12, analysisHorizonYears: 10, annualEnergyInflationPercent: 0, monthsPerYear: 12 },
  rankingCriterion: 'PAYBACK',
};

const dynamicMocks = vi.hoisted(() => ({
  buildMemorialPdf: vi.fn(),
  listProducts: vi.fn(),
}));

vi.mock('./ci-memorial-pdf', () => ({ buildCiMemorialPdfBlob: dynamicMocks.buildMemorialPdf }));
vi.mock('@/lib/data/ci-bess-products-repository', () => ({ listActiveCiBessProducts: dynamicMocks.listProducts }));

function panelProps(projectId: string | null, overrides: { onFlushSave?: () => Promise<unknown> } = {}) {
  return {
    projectId,
    projectInfo: testProjectInfo,
    client: testClient,
    profile: null,
    ciOptions: testCiOptions,
    onFlushSave: overrides.onFlushSave ?? vi.fn().mockResolvedValue(undefined),
  };
}

function makeResult(overrides: Partial<CommercialIndustrialResult> = {}): CommercialIndustrialResult {
  const recommended = {
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
    marginalGain: 15000,
  };
  const smaller = { ...recommended, scenarioId: 's-1', moduleCount: 1, capex: 250000, marginalGain: null };

  return {
    engineVersion: 'ci-v1',
    inputFingerprint: 'abc123',
    baseline: {
      annualCostBrl: 900000,
      maxDemandPeakKw: 350,
      maxDemandOffPeakKw: 300,
      energyImportedPeakKwh: 50000,
      energyImportedOffPeakKwh: 120000,
      weeklyEnergyImportedPeakKwh: 950,
      weeklyEnergyImportedOffPeakKwh: 2300,
    },
    scenarios: [smaller, recommended],
    recommendation: { scenarioId: 's-2', reason: 'Melhor payback dentro da faixa avaliada.' },
    selected: { ...recommended, dispatch: [], cashFlow: [] },
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
      loadCurve: { resolutionMinutes: 60, profileBasis: 'representative_period', periodStart: '2026-01-01', periodEnd: '2026-01-07', timezone: 'America/Sao_Paulo' },
    },
    warnings: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  dynamicMocks.buildMemorialPdf.mockResolvedValue(new Blob(['pdf']));
  dynamicMocks.listProducts.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CiResultsPanel', () => {
  it('prompts to save the project first when there is no saved project yet', () => {
    render(<CiResultsPanel {...panelProps(null)} />);
    expect(screen.getByText(/Salve o projeto/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Calcular/ })).not.toBeInTheDocument();
  });

  it('runs the calculation and renders baseline, recommendation and the comparison table', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve(makeResult()) });
    render(<CiResultsPanel {...panelProps('ci-project-1')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    expect(await screen.findByText('Linha de base (sem BESS)')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/projects/ci-project-1/calculations', { method: 'POST' });
    expect(screen.getByText(/Cenário recomendado — 2 módulos/)).toBeInTheDocument();
    expect(screen.getByText('Melhor payback dentro da faixa avaliada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recalcular' })).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 scenarios
    expect(screen.getByText('Recomendado')).toBeInTheDocument();
  });

  it('shows the server error message and lets the user try again', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Configure a curva de carga, a tarifa e o produto BESS antes de calcular.' }),
    });
    render(<CiResultsPanel {...panelProps('ci-project-1')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    expect(await screen.findByText('Configure a curva de carga, a tarifa e o produto BESS antes de calcular.')).toBeInTheDocument();
    expect(screen.queryByText('Linha de base (sem BESS)')).not.toBeInTheDocument();
  });

  it('shows a network error message when the request itself fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    render(<CiResultsPanel {...panelProps('ci-project-1')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    await waitFor(() => expect(screen.getByText(/Não foi possível conectar ao servidor/)).toBeInTheDocument());
  });

  // Regression test for the same bug fixed for residential's "Recalcular
  // solução" in 08cab2f6: clicking Calcular right after an edit must not
  // read a stale calculation_options snapshot from before autosave's ~12s
  // debounce caught up. CiResultsPanel can't just send live options in the
  // request body (the route always reads from the DB), so the fix is to
  // force-persist them first via onFlushSave.
  it('flushes the pending save before calculating, so the request reflects the live options', async () => {
    const callOrder: string[] = [];
    const onFlushSave = vi.fn().mockImplementation(async () => {
      callOrder.push('flush');
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('fetch');
      return { ok: true, json: () => Promise.resolve(makeResult()) };
    });
    render(<CiResultsPanel {...panelProps('ci-project-1', { onFlushSave })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    await screen.findByText('Linha de base (sem BESS)');
    expect(onFlushSave).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['flush', 'fetch']);
  });

  it('shows an error and never calculates when the flush save itself fails', async () => {
    const onFlushSave = vi.fn().mockRejectedValue(new Error('boom'));
    render(<CiResultsPanel {...panelProps('ci-project-1', { onFlushSave })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    await waitFor(() =>
      expect(screen.getByText('Não foi possível salvar as alterações antes de calcular. Tente novamente.')).toBeInTheDocument()
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders non-recommended, technically invalid scenarios and warnings', async () => {
    const result = makeResult({
      recommendation: { scenarioId: null, reason: 'Nenhum cenário atende ao retorno mínimo.' },
      warnings: ['A curva possui lacunas.'],
    });
    result.scenarios = [{ ...result.scenarios[0], technicalValidity: false, technicalWarnings: ['Subdimensionado.'] }, ...result.scenarios.slice(1)];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve(result) });
    render(<CiResultsPanel {...panelProps('ci-project-1')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    expect(await screen.findByText(/Nenhum cenário economicamente viável/)).toBeInTheDocument();
    expect(screen.getByText('Inválido')).toBeInTheDocument();
    expect(screen.getByText('Avisos técnicos')).toBeInTheDocument();
    expect(screen.getByText('A curva possui lacunas.')).toBeInTheDocument();
  });

  it('generates and downloads the C&I memorial PDF', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:memorial');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve(makeResult()) });
    render(
      <CiResultsPanel
        {...panelProps('ci-project-1')}
        ciOptions={{ ...testCiOptions, bessProductId: 'product-1' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    await screen.findByRole('button', { name: 'Gerar memorial (PDF)' });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar memorial (PDF)' }));

    await waitFor(() => expect(dynamicMocks.buildMemorialPdf).toHaveBeenCalledOnce());
    expect(dynamicMocks.listProducts).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:memorial');
  });

  it('shows an error when memorial generation fails', async () => {
    dynamicMocks.buildMemorialPdf.mockRejectedValue(new Error('PDF unavailable'));
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve(makeResult()) });
    render(<CiResultsPanel {...panelProps('ci-project-1')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    await screen.findByRole('button', { name: 'Gerar memorial (PDF)' });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar memorial (PDF)' }));

    expect(await screen.findByText('Não foi possível gerar o memorial em PDF. Tente novamente.')).toBeInTheDocument();
  });
});
