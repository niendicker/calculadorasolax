import { describe, expect, it } from 'vitest';
import { emptyAddress } from '@/lib/address';
import type { Client, ProjectInfo } from '@/lib/types';
import type { CiBessProductRecord } from '@/lib/data/ci-bess-products-repository';
import type { CommercialIndustrialResult, DispatchPoint } from '@/supabase/functions/_shared/commercial-industrial/types';
import type { InlineProfile } from '../../types';
import { buildCiMemorialPdfBlob, type CiMemorialPdfInput } from './ci-memorial-pdf';

const projectInfo: ProjectInfo = {
  name: 'Fábrica Alfa',
  clientId: 'c1',
  address: { ...emptyAddress(), street: 'Rua Industrial, 100' },
  notes: '',
};

const client: Client = {
  id: 'c1',
  name: 'Indústria Alfa Ltda',
  email: 'contato@alfa.com',
  phone: '11999999999',
  document: '12.345.678/0001-90',
  notes: '',
  createdAt: '',
  updatedAt: '',
};

const product: CiBessProductRecord = {
  id: 'p1',
  model: 'PowerStack 100',
  manufacturer: 'SolaX',
  description: 'BESS industrial modular',
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

function buildDispatch(points: number): DispatchPoint[] {
  return Array.from({ length: points }, (_, index) => {
    const hour = index % 24;
    const isPeak = hour >= 18 && hour < 21;
    const loadKw = 200 + 80 * Math.sin(index / 8);
    const dischargeKw = isPeak ? 40 : 0;
    const chargeKw = !isPeak && hour < 6 ? 30 : 0;
    return {
      timestamp: new Date(2026, 0, 1, hour).toISOString(),
      tariffPeriod: isPeak ? 'peak' : 'offPeak',
      loadKw,
      chargeKw,
      dischargeKw,
      gridImportKw: Math.max(0, loadKw - dischargeKw + chargeKw),
      socKwh: 50 + 30 * Math.sin(index / 12),
    };
  });
}

function makeResult(overrides: Partial<CommercialIndustrialResult> = {}): CommercialIndustrialResult {
  const recommended = {
    scenarioId: 's-2',
    moduleCount: 2,
    strategy: 'HYBRID' as const,
    technicalValidity: true,
    technicalWarnings: [] as string[],
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
    inputFingerprint: 'fingerprint-abc123def456',
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
    selected: {
      ...recommended,
      dispatch: buildDispatch(96),
      cashFlow: [
        { year: 0, nominalCashFlow: -500000, discountedCashFlow: -500000, cumulativeNominalCashFlow: -500000 },
        { year: 1, nominalCashFlow: 120000, discountedCashFlow: 107143, cumulativeNominalCashFlow: -380000 },
        { year: 2, nominalCashFlow: 120000, discountedCashFlow: 95663, cumulativeNominalCashFlow: -260000 },
      ],
    },
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
      loadCurve: {
        resolutionMinutes: 15,
        profileBasis: 'representative_period',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-07',
        timezone: 'America/Sao_Paulo',
      },
    },
    warnings: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<CiMemorialPdfInput> = {}): CiMemorialPdfInput {
  return { projectInfo, client, profile: null, result: makeResult(), product, ...overrides };
}

async function pdfMagicBytes(blob: Blob): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  return buffer.toString('latin1', 0, 5);
}

describe('buildCiMemorialPdfBlob', () => {
  it('renders a non-empty, valid PDF blob with dispatch/cash-flow charts and tables', async () => {
    const blob = await buildCiMemorialPdfBlob(baseInput());
    expect(blob.size).toBeGreaterThan(100);
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders with a company profile and logo', async () => {
    const profile: InlineProfile = {
      id: 'u1',
      email: 'a@b.com',
      fullName: '',
      phone: '',
      role: 'user',
      companyName: 'Integradora XPTO',
      companyAddress: { ...emptyAddress(), street: 'Av. Principal, 100' },
      companyLogoUrl: 'https://cdn.example.com/logo.png',
      companyDocument: '',
    };
    const blob = await buildCiMemorialPdfBlob(baseInput({ profile }));
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders without a product (deactivated or removed from the catalog since the run)', async () => {
    const blob = await buildCiMemorialPdfBlob(baseInput({ product: null }));
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders without a client, notes or ranking criterion', async () => {
    const blob = await buildCiMemorialPdfBlob(
      baseInput({ client: null, projectInfo: { ...projectInfo, notes: '' }, rankingCriterion: undefined })
    );
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders engine warnings and scenario technical warnings', async () => {
    const result = makeResult({ warnings: ['Curva com lacuna detectada em um intervalo.'] });
    result.selected = { ...result.selected!, technicalWarnings: ['Potência insuficiente em um intervalo de pico.'] };
    const blob = await buildCiMemorialPdfBlob(baseInput({ result }));
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders a full 672-point representative week without crashing (chart and table pagination)', async () => {
    const result = makeResult({});
    result.selected = { ...result.selected!, dispatch: buildDispatch(672) };
    const blob = await buildCiMemorialPdfBlob(baseInput({ result }));
    expect(blob.size).toBeGreaterThan(100);
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders when no scenario has been selected/materialized yet', async () => {
    const result = makeResult({ selected: null });
    const blob = await buildCiMemorialPdfBlob(baseInput({ result }));
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders when the selected scenario has no dispatch or cash-flow points', async () => {
    const result = makeResult({});
    result.selected = { ...result.selected!, dispatch: [], cashFlow: [] };
    const blob = await buildCiMemorialPdfBlob(baseInput({ result }));
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });
});
