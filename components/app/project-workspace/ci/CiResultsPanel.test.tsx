import { evaluateSts } from '@/supabase/functions/_shared/commercial-industrial/sts';
import { stsFixture, stsBackup } from '@/supabase/functions/_shared/commercial-industrial/sts.test-fixtures';
// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import type { Client, ProjectInfo } from '@/lib/types';
import type { CommercialIndustrialOptions, CommercialIndustrialResult } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiResultsPanel } from './CiResultsPanel';
import { generateCiGroupedSolutions } from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import { modularFixture } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import { cabinetFixture } from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions.test-fixtures';

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
  fetchProductImages: vi.fn().mockResolvedValue({}),
}));

vi.mock('./ci-memorial-pdf', () => ({ buildCiMemorialPdfBlob: dynamicMocks.buildMemorialPdf }));
vi.mock('@/lib/data/ci-bess-products-repository', () => ({ listActiveCiBessProducts: dynamicMocks.listProducts }));
vi.mock('@/lib/data/ci-product-images', () => ({ fetchCiProductImages: dynamicMocks.fetchProductImages }));

vi.mock('uplot', () => ({
  default: class FakeUPlot {
    root = document.createElement('div');
    over = document.createElement('div');
    scales = { x: { min: 0, max: 1 } };
    constructor(_opts: unknown, _data: unknown, target?: HTMLElement) {
      target?.appendChild(this.root);
    }
    posToVal() {
      return 0;
    }
    setScale() {}
    setSelect() {}
    setData() {}
    setSize() {}
    redraw() {}
    destroy() {
      this.root.remove();
    }
  },
}));

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
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  dynamicMocks.buildMemorialPdf.mockResolvedValue(new Blob(['pdf']));
  dynamicMocks.listProducts.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CiResultsPanel', () => {
  it.each(['grouped', 'modular', 'cabinet'] as const)('presents %s equipment and quantities before baseline, without duplicating STS or accessories', (kind) => {
    const result = makeResult();
    const solutions = generateCiGroupedSolutions(modularFixture(), [cabinetFixture()]).solutions;
    const group = solutions.find((item) => kind === 'cabinet' ? item.source.kind === 'cabinet' : item.source.kind === 'assembly')!;
    const sts = evaluateSts(stsBackup(), [], stsFixture(), 1)!;
    const transfer = sts.selected!;
    const accessories = [
      { productId: 'controller', model: 'Controlador EMS', quantity: 1, unitPriceBrl: 0, totalBrl: 0, bundled: true, reasons: ['Incluído no equipamento'], ruleIds: [] },
      { productId: transfer.spec.accessory_id, model: transfer.spec.model, quantity: 1, unitPriceBrl: transfer.unitPriceBrl, totalBrl: transfer.totalBrl, bundled: false, reasons: [], ruleIds: [] },
    ];
    const equipment = group.components.filter((item) => item.productType !== 'ci_accessory').map((item) => ({ ...item, unitPriceBrl: 100, totalBrl: 100 * item.quantity }));
    result.selected = { ...result.selected!, sts, accessories, ...(kind === 'modular'
      ? { composition: { ...group.composition!, items: equipment.map((item) => ({ ...item, productType: item.productType === 'ci_pcs' ? 'inverter' as const : 'battery' as const })) } }
      : { group, billOfMaterials: [...equipment, ...accessories] }) };
    render(<CiResultsPanel {...panelProps('project')} initialSnapshot={{ result, optionsFingerprint: JSON.stringify(testCiOptions) }} />);

    const products = screen.getByRole('region', { name: 'Produtos da solução' });
    for (const item of equipment) {
      const heading = within(products).getByRole('heading', { name: item.model });
      expect(heading.closest('li')).toHaveTextContent(`${item.quantity} ${item.quantity === 1 ? 'unidade' : 'unidades'}`);
    }
    expect(within(products).getAllByText(/Controlador EMS/)).toHaveLength(1);
    expect(within(products).getByText('Incluso')).toBeInTheDocument();
    expect(within(products).getAllByText(new RegExp(transfer.spec.model))).toHaveLength(1);
    expect(products.compareDocumentPosition(screen.getByText('Linha de base (sem BESS)')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const details = screen.getByText('Detalhes de conexão e compatibilidade').closest('details')!;
    expect(details.open).toBe(false);
  });

  it('keeps products visible but hides placeholder prices when the selected BOM is not fully priced', () => {
    const result = makeResult();
    result.selected = { ...result.selected!, pricingComplete: false, missingPrices: ['BESS teste'], billOfMaterials: [
      { productId: 'bess', model: 'BESS teste', quantity: 2, unitPriceBrl: 0, totalBrl: 0 },
    ] };
    render(<CiResultsPanel {...panelProps('project')} initialSnapshot={{ result, optionsFingerprint: JSON.stringify(testCiOptions) }} />);
    const products = screen.getByRole('region', { name: 'Produtos da solução' });
    expect(within(products).getByRole('heading', { name: 'BESS teste' })).toBeInTheDocument();
    expect(within(products).getByText('Preço pendente')).toBeInTheDocument();
    expect(within(products).queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar memorial (PDF)' })).toBeDisabled();
  });

  it('shows technical suitability and pending prices without presenting placeholder finances',()=>{
    const result=makeResult();
    result.scenarios=result.scenarios.map(s=>({...s,pricingComplete:false,missingPrices:['PCS sem preço']}));
    result.selected={...result.selected!,pricingComplete:false,missingPrices:['PCS sem preço']};
    result.technicalSelection={scenarioId:result.selected.scenarioId,reason:'Atende tecnicamente, financeiro pendente.'};
    result.recommendation={scenarioId:null,reason:'Preços pendentes.'};
    render(<CiResultsPanel {...panelProps('project')} initialSnapshot={{result,optionsFingerprint:JSON.stringify(testCiOptions)}}/>);
    expect(screen.getByText(/Solução que atende tecnicamente/)).toBeInTheDocument();
    expect(screen.getByText(/Preencha os preços no Portfólio/)).toHaveTextContent('PCS sem preço');
    expect(screen.getByRole('button',{name:'Gerar memorial (PDF)'})).toBeDisabled();
    expect(screen.queryByText('R$ 500.000,00')).not.toBeInTheDocument();
  });
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
    expect(screen.getByText(/Solução que atende tecnicamente — 2 módulos/)).toBeInTheDocument();
    expect(screen.getByText('Melhor payback dentro da faixa avaliada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recalcular' })).toBeInTheDocument();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Inspecionar cenário/})).not.toBeInTheDocument();
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

  it('shows specific technical failures without alternatives, finances or PDF', async () => {
    const result = makeResult({
      recommendation: { scenarioId: null, reason: 'Nenhum cenário atende ao retorno mínimo.' },
      warnings: ['A curva possui lacunas.'],
    });
    result.selected={...result.selected!,technicalValidity:false};
    result.technicalSelection={scenarioId:null,reason:'Nenhuma atende.'};
    result.technicalIssues=[{code:'power',message:'Potência insuficiente: exige 150 kVA; máximo aprovado 120 kVA.'}];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve(result) });
    render(<CiResultsPanel {...panelProps('ci-project-1')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    expect(await screen.findByText('Nenhuma solução atende aos requisitos técnicos')).toBeInTheDocument();
    expect(screen.getByText('Potência insuficiente: exige 150 kVA; máximo aprovado 120 kVA.')).toBeInTheDocument();
    expect(screen.queryByText('CAPEX')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Gerar memorial (PDF)'})).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Memorial baixado!' })).toBeInTheDocument();
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

  it('renders peak shaving dispatch metrics and chart when dispatch points are present', async () => {
    const base = makeResult();
    const resultWithDispatch = makeResult({
      selected: {
        ...base.selected!,
        demandSavings: 45000,
        dispatch: [
          {
            timestamp: '2026-01-01T17:00:00Z',
            tariffPeriod: 'offPeak',
            loadKw: 150,
            chargeKw: 0,
            dischargeKw: 0,
            gridImportKw: 150,
            socKwh: 100,
          },
          {
            timestamp: '2026-01-01T18:00:00Z',
            tariffPeriod: 'peak',
            loadKw: 350,
            chargeKw: 0,
            dischargeKw: 100,
            gridImportKw: 250,
            socKwh: 50,
          },
        ],
      },
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(resultWithDispatch),
    });

    render(<CiResultsPanel {...panelProps('ci-project-1')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    expect(await screen.findByText('Operação e Despacho BESS')).toBeInTheDocument();
    expect(screen.getByText('Pico de Carga Original')).toBeInTheDocument();
    expect(screen.getAllByText('350,0 kVA')).toHaveLength(2); // baseline + peak shaving
    expect(screen.getByText('Pico com BESS (Rede)')).toBeInTheDocument();
    expect(screen.getByText('250,0 kVA')).toBeInTheDocument();
    expect(screen.getByText('Redução no Pico')).toBeInTheDocument();
    expect(screen.getByText(/100,0 kVA \(28.6%\)/)).toBeInTheDocument();
    expect(screen.getByText('Economia em Demanda')).toBeInTheDocument();
  });

  it('renders solar PV generation metric card when solarGenerationKw is present in dispatch', async () => {
    const base = makeResult();
    const resultWithSolar = makeResult({
      selected: {
        ...base.selected!,
        demandSavings: 45000,
        dispatch: [
          {
            timestamp: '2026-01-01T12:00:00Z',
            tariffPeriod: 'offPeak',
            loadKw: 150,
            chargeKw: 0,
            dischargeKw: 0,
            gridImportKw: 100,
            socKwh: 100,
            solarGenerationKw: 50,
          },
        ],
      },
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(resultWithSolar),
    });

    render(<CiResultsPanel {...panelProps('ci-project-1')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    expect(await screen.findByText('Geração Solar FV (período simulado)')).toBeInTheDocument();
  });

  it('renders readiness checklist empty state before calculation and allows selecting scenarios', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeResult()),
    });

    render(<CiResultsPanel {...panelProps('ci-project-1')} />);

    // Readiness empty state
    expect(screen.getByText('Revise as pendências do estudo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calcular' })).toBeInTheDocument();

    // Trigger calculation
    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    expect(await screen.findByText('Solução que atende tecnicamente — 2 módulos')).toBeInTheDocument();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cenário inspecionado/)).not.toBeInTheDocument();
  });

  it('displays a warning banner when options are modified after calculation', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeResult()),
    });

    const { rerender } = render(<CiResultsPanel {...panelProps('ci-project-1')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));

    expect(await screen.findByText('Solução que atende tecnicamente — 2 módulos')).toBeInTheDocument();
    expect(screen.queryByText(/Os parâmetros do estudo foram alterados/)).not.toBeInTheDocument();

    // Rerender with modified options
    const modifiedOptions = { ...testCiOptions, strategy: 'PEAK_SHAVING' as const };
    rerender(<CiResultsPanel {...panelProps('ci-project-1')} ciOptions={modifiedOptions} />);

    expect(screen.getByText(/Os parâmetros do estudo foram alterados nas outras abas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recalcular agora' })).toBeInTheDocument();
  });
  it('blocks PDF export for changed parameters and during recalculation', async () => {
    const snapshot = { result: makeResult(), optionsFingerprint: JSON.stringify(testCiOptions) };
    const { rerender } = render(<CiResultsPanel {...panelProps('ci-project-1')} initialSnapshot={snapshot} />);
    expect(screen.getByRole('button', { name: 'Gerar memorial (PDF)' })).toBeEnabled();
    rerender(<CiResultsPanel {...panelProps('ci-project-1')} initialSnapshot={snapshot} ciOptions={{ ...testCiOptions, strategy: 'PEAK_SHAVING' }} />);
    expect(screen.getByRole('button', { name: 'Gerar memorial (PDF)' })).toBeDisabled();
    expect(dynamicMocks.buildMemorialPdf).not.toHaveBeenCalled();
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular' }));
    expect(screen.queryByRole('button', { name: 'Gerar memorial (PDF)' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Salvando parâmetros');
  });

  it('opens a pending step directly and returns to identification for an unsaved project', () => {
    const onNavigateToSection = vi.fn();
    const { rerender } = render(<CiResultsPanel {...panelProps('ci-project-1')} onNavigateToSection={onNavigateToSection} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Curvas e aplicações' }));
    expect(onNavigateToSection).toHaveBeenCalledWith('curve');
    expect(screen.getAllByRole('button', { name: 'Calcular' })).toHaveLength(1);
    rerender(<CiResultsPanel {...panelProps(null)} onNavigateToSection={onNavigateToSection} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para Visão geral' }));
    expect(onNavigateToSection).toHaveBeenCalledWith('overview');
  });

  it('shows only the technically selected solution without alternative controls', () => {
    render(<CiResultsPanel {...panelProps('ci-project-1')} initialSnapshot={{result:makeResult(),optionsFingerprint:JSON.stringify(testCiOptions)}}/>);
    expect(screen.getByText(/Solução que atende tecnicamente/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Inspecionar/})).not.toBeInTheDocument();
  });

  it('switches between internal tabs and toggles visibility of the respective panels', () => {
    const result = makeResult();
    const { container } = render(<CiResultsPanel {...panelProps('ci-project-1')} initialSnapshot={{ result, optionsFingerprint: JSON.stringify(testCiOptions) }} />);

    const productsTab = screen.getByRole('tab', { name: /Produtos & Valores/ });
    const dispatchTab = screen.getByRole('tab', { name: /Operação & Despacho/ });
    const engineeringTab = screen.getByRole('tab', { name: /Engenharia & Confiabilidade/ });

    expect(productsTab).toHaveAttribute('aria-selected', 'true');
    expect(dispatchTab).toHaveAttribute('aria-selected', 'false');
    expect(engineeringTab).toHaveAttribute('aria-selected', 'false');

    const productsPanel = container.querySelector('#ci-results-panel-products');
    const dispatchPanel = container.querySelector('#ci-results-panel-dispatch');
    const engineeringPanel = container.querySelector('#ci-results-panel-engineering');

    expect(productsPanel).not.toHaveAttribute('hidden');
    expect(dispatchPanel).toHaveAttribute('hidden');
    expect(engineeringPanel).toHaveAttribute('hidden');

    fireEvent.click(dispatchTab);
    expect(dispatchTab).toHaveAttribute('aria-selected', 'true');
    expect(productsTab).toHaveAttribute('aria-selected', 'false');
    expect(dispatchPanel).not.toHaveAttribute('hidden');
    expect(productsPanel).toHaveAttribute('hidden');

    fireEvent.click(engineeringTab);
    expect(engineeringTab).toHaveAttribute('aria-selected', 'true');
    expect(engineeringPanel).not.toHaveAttribute('hidden');
    expect(dispatchPanel).toHaveAttribute('hidden');
  });

  it('renders the executive KPI ribbon with main figures', () => {
    const result = makeResult();
    render(<CiResultsPanel {...panelProps('ci-project-1')} initialSnapshot={{ result, optionsFingerprint: JSON.stringify(testCiOptions) }} />);

    const ribbon = screen.getByRole('region', { name: 'Indicadores executivos' });
    expect(ribbon).toHaveTextContent('Investimento (CAPEX)');
    expect(ribbon).toHaveTextContent('Economia anual');
    expect(ribbon).toHaveTextContent('Payback simples');
    expect(ribbon).toHaveTextContent('Capacidade do sistema');
  });

  it('renders product images when provided and falls back to icons when missing', async () => {
    dynamicMocks.fetchProductImages.mockResolvedValueOnce({
      'bess-1': 'https://cdn.example.com/bess-product.png',
    });
    const result = makeResult();
    result.selected = {
      ...result.selected!,
      billOfMaterials: [
        { productId: 'bess-1', model: 'BESS Comercial 100kW', quantity: 1, unitPriceBrl: 100000, totalBrl: 100000 },
        { productId: 'inv-1', model: 'Inversor Sem Imagem', quantity: 1, unitPriceBrl: 50000, totalBrl: 50000 },
      ],
    };

    render(<CiResultsPanel {...panelProps('ci-project-1')} initialSnapshot={{ result, optionsFingerprint: JSON.stringify(testCiOptions) }} />);

    const img = await screen.findByRole('img', { name: 'BESS Comercial 100kW' });
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/bess-product.png');
    expect(screen.queryByRole('img', { name: 'Inversor Sem Imagem' })).not.toBeInTheDocument();
  });

  it('passes rechargeWindow to dispatch chart and shows active recharge window badge', async () => {
    const onUpdateCiOptions = vi.fn();
    const base = makeResult();
    const result = makeResult({
      selected: {
        ...base.selected!,
        dispatch: [
          {
            timestamp: '2026-01-01T17:00:00Z',
            tariffPeriod: 'offPeak',
            loadKw: 150,
            chargeKw: 0,
            dischargeKw: 0,
            gridImportKw: 150,
            socKwh: 50,
          },
        ],
      },
    });
    const optionsWithRecharge = { ...testCiOptions, rechargeWindow: { start: '08:00', end: '16:00' } };

    render(
      <CiResultsPanel
        {...panelProps('ci-project-1')}
        ciOptions={optionsWithRecharge}
        onUpdateCiOptions={onUpdateCiOptions}
        initialSnapshot={{ result, optionsFingerprint: JSON.stringify(optionsWithRecharge) }}
      />
    );

    const dispatchTab = screen.getByRole('tab', { name: /operação & despacho/i });
    fireEvent.click(dispatchTab);

    expect(await screen.findByText(/carga permitida:/i)).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('16:00')).toBeInTheDocument();
  });

});

it('shows the chosen STS, its cost and configurable PCS limit in results',()=>{
  const result=makeResult();const sts=evaluateSts(stsBackup(),[],stsFixture(),1)!;
  result.scenarios=result.scenarios.map(s=>({...s,sts}));result.selected={...result.selected!,sts};
  render(<CiResultsPanel {...panelProps('ci-project-1')} initialSnapshot={{result,optionsFingerprint:JSON.stringify(testCiOptions)}}/>);
  const panel=screen.getByRole('region',{name:'STS selecionada'});
  expect(panel).toHaveTextContent('ZERO-125 teste');expect(panel).toHaveTextContent('incluído no CAPEX');expect(panel).toHaveTextContent('Limite aprovado: 2');
});
