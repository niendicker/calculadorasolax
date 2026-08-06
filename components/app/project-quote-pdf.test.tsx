import { describe, expect, it } from 'vitest';
import { emptyAddress } from '@/lib/address';
import type { Client, ProjectInfo, Solution, UserStockItem } from '@/lib/types';
import type { AccessoryCatalogOption, BatteryCatalogOption, InlineProfile, InverterCatalogOption } from './types';
import { buildProjectQuotePdfBlob, type ProjectQuotePdfInput } from './project-quote-pdf';

const projectInfo: ProjectInfo = {
  name: 'Casa de praia',
  clientId: 'c1',
  address: { ...emptyAddress(), street: 'Rua X, 1' },
  notes: '',
};

const client: Client = {
  id: 'c1',
  name: 'Fulano',
  email: 'fulano@x.com',
  phone: '11999999999',
  document: '123.456.789-00',
  notes: '',
  createdAt: '',
  updatedAt: '',
};

const solution: Solution = {
  inverterId: 'i1',
  inverterModel: 'X1-Hybrid-5.0kW-G4',
  inverterQty: 1,
  inverterRatedPowerW: 5000,
  batteryId: 'b1',
  batteryModel: 'TP-HS3.6',
  batteryQty: 1,
  availableEnergyWh: 3200,
  pvPowerKw: 5,
  accessories: [],
  comments: [],
};

const load = { id: 'l1', name: 'Chuveiro', powerW: 5500, qty: 1 };

function baseInput(overrides: Partial<ProjectQuotePdfInput> = {}): ProjectQuotePdfInput {
  return {
    projectInfo,
    client,
    profile: null as InlineProfile | null,
    solution,
    loads: [load],
    topology: 'HighVoltage',
    selectedBatteryModel: 'TP-HS3.6',
    gridType: 'singlePhase_220',
    nominalW: 3000,
    peakW: 5500,
    dailyKwh: 5.5,
    operationHours: 4,
    userStockItems: [] as UserStockItem[],
    whiteTariff: null,
    batteryCatalog: [] as BatteryCatalogOption[],
    ...overrides,
  };
}

async function pdfMagicBytes(blob: Blob): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  return buffer.toString('latin1', 0, 5);
}

describe('buildProjectQuotePdfBlob', () => {
  it('renders a non-empty, valid PDF blob for the minimal case', async () => {
    const blob = await buildProjectQuotePdfBlob(baseInput());
    expect(blob.size).toBeGreaterThan(100);
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders with a company profile, logo and address', async () => {
    const profile: InlineProfile = {
      id: 'u1',
      email: 'a@b.com',
      fullName: '',
      phone: '',
      role: 'user',
      companyName: 'Integradora XPTO',
      companyAddress: { ...emptyAddress(), street: 'Av. Principal, 100' },
      companyLogoUrl: 'https://cdn.example.com/logo.png',
    };
    const blob = await buildProjectQuotePdfBlob(baseInput({ profile }));
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders with no client and no notes', async () => {
    const blob = await buildProjectQuotePdfBlob(
      baseInput({ client: null, projectInfo: { ...projectInfo, name: '', address: emptyAddress() } })
    );
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders accessories, a secondary comparison solution and desired features', async () => {
    const blob = await buildProjectQuotePdfBlob(
      baseInput({
        solution: {
          ...solution,
          accessories: [
            { model: 'Smart Meter - M1-40', qty: 1, optional: false, appliesTo: 'system', comment: null, bundled: false },
            { model: 'WiFi Dongle', qty: 1, optional: false, appliesTo: 'inverter', comment: null, bundled: true },
          ],
        },
        secondarySolution: { ...solution, batteryModel: 'TP-HS5.8', batteryId: 'b2' },
        secondaryBatteryModel: 'TP-HS5.8',
        desiredFeatures: ['backup', 'external_ats', 'microgrid', 'external_generator', 'pv', 'white_tariff'],
        whiteTariff: {
          requiredPowerW: 3000,
          pontaEnergyWh: 2000,
          intermediateEnergyWh: 1000,
          pontaTariffPerKwh: 1.5,
          intermediateTariffPerKwh: 1.2,
          foraPontaTariffPerKwh: 0.6,
          totalMonthlyConsumptionKwh: 400,
        },
        microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 1000, isFundamentalRequirement: true, photoUrl: 'x', powerNoticeAcknowledged: false },
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 5000, photoUrl: 'x', ownAtsAcknowledged: true },
        atsPhotoUrl: 'x',
        atsBackupAcknowledged: true,
        accessoryCatalog: [
          { id: 'a1', model: 'Smart Meter - M1-40', description: 'Medidor inteligente', imageUrl: null, documents: [] },
        ] as AccessoryCatalogOption[],
      })
    );
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders pricing, tariff savings and payback when a stock price and a valid tariff order are given', async () => {
    const blob = await buildProjectQuotePdfBlob(
      baseInput({
        userStockItems: [
          { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 5000, createdAt: '', updatedAt: '' },
          { id: 's2', productType: 'battery', productModel: 'TP-HS3.6', unitValue: 8000, createdAt: '', updatedAt: '' },
        ] as UserStockItem[],
        whiteTariff: {
          requiredPowerW: 3000,
          pontaEnergyWh: 2000,
          intermediateEnergyWh: 1000,
          pontaTariffPerKwh: 1.5,
          intermediateTariffPerKwh: 1.2,
          foraPontaTariffPerKwh: 0.6,
          totalMonthlyConsumptionKwh: 400,
        },
        batteryCatalog: [
          { id: 'b1', model: 'TP-HS3.6', capacityKwh: 3.6, topology: 'HV', standardPowerKw: 1.8, peakPowerKw: 2.5, minSocPercent: 10, imageUrl: null, documents: [] },
        ] as BatteryCatalogOption[],
        inverterCatalog: [
          { id: 'i1', model: 'X1-Hybrid-5.0kW-G4', topology: 'HV', phases: 1, standardPowerKva: 5, peakPowerKva: 7, maxPowerPerPhaseW: null, imageUrl: null, documents: [], flags: [] },
        ] as InverterCatalogOption[],
      })
    );
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders an invalid tariff order (fora ponta more expensive than ponta) without crashing', async () => {
    const blob = await buildProjectQuotePdfBlob(
      baseInput({
        whiteTariff: {
          requiredPowerW: 3000,
          pontaEnergyWh: 2000,
          intermediateEnergyWh: 1000,
          pontaTariffPerKwh: 0.5,
          intermediateTariffPerKwh: 0.5,
          foraPontaTariffPerKwh: 0.9,
          totalMonthlyConsumptionKwh: 400,
        },
      })
    );
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });

  it('renders many loads without crashing (table pagination)', async () => {
    const manyLoads = Array.from({ length: 40 }, (_, index) => ({
      id: `l${index}`,
      name: `Carga ${index}`,
      powerW: 100 + index,
      qty: 1,
    }));
    const blob = await buildProjectQuotePdfBlob(baseInput({ loads: manyLoads, desiredFeatures: ['backup'] }));
    expect(blob.size).toBeGreaterThan(100);
    expect(await pdfMagicBytes(blob)).toBe('%PDF-');
  });
});
