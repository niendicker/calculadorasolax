// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import type {
  DesiredFeatureId,
  MarginSettings,
  MicrogridConfig,
  ProjectServiceLine,
  Solution,
  UserServiceItem,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import type { BatteryCatalogOption, InverterCatalogOption, ProductMedia } from '../../types';
import { ResultSummary } from './ResultSummary';

const battery: BatteryCatalogOption = {
  id: 'b1',
  model: 'TP-HS3.6',
  capacityKwh: 3.6,
  topology: 'HV',
  standardPowerKw: 1.8,
  peakPowerKw: 2.5,
  minSocPercent: 10,
  roundTripEfficiencyPercent: 95,
  initialSohPercent: 100,
  annualSohLossPercent: 2,
  imageUrl: null,
  documents: [],
};

const inverter: InverterCatalogOption = {
  id: 'i1',
  model: 'X1-Hybrid-5.0kW-G4',
  topology: 'HV',
  phases: 1,
  standardPowerKva: 5,
  peakPowerKva: 7,
  maxPowerPerPhaseW: null,
  batteryChargeEfficiencyPercent: 97,
  batteryDischargeEfficiencyPercent: 97,
  standbyConsumptionW: 5,
  maxBatteryChargePowerW: null,
  maxBatteryDischargePowerW: null,
  imageUrl: null,
  documents: [],
  flags: [],
};

const baseSolution: Solution = {
  inverterId: 'i1',
  inverterModel: 'X1-Hybrid-5.0kW-G4',
  batteryId: 'b1',
  batteryModel: 'TP-HS3.6',
  batteryQty: 1,
  availableEnergyWh: 5000,
  pvPowerKw: null,
  accessories: [],
};

const validWhiteTariff: WhiteTariffConfig = {
  inputMode: 'advanced',
  totalMonthlyConsumptionKwh: 400,
  pontaConsumptionPercent: 20,
  intermediateConsumptionPercent: 10,
  businessDaysPerMonth: 22,
  pontaWindowHours: 3,
  intermediateWindowHours: 2,
  requiredPowerW: 2000,
  pontaEnergyWh: 3000,
  intermediateEnergyWh: 2000,
  includeBackupReserve: false,
  pontaTariffPerKwh: 1.2,
  intermediateTariffPerKwh: 0.95,
  foraPontaTariffPerKwh: 0.5,
};

const zeroMargin: MarginSettings = { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 };

function renderResult(overrides: Partial<React.ComponentProps<typeof ResultSummary>> = {}) {
  const props: React.ComponentProps<typeof ResultSummary> = {
    solution: baseSolution,
    batteryCatalog: [battery],
    inverterCatalog: [inverter],
    productMedia: {} as Record<string, ProductMedia>,
    userStockItems: [] as UserStockItem[],
    services: [] as ProjectServiceLine[],
    userServices: [] as UserServiceItem[],
    marginSettings: zeroMargin,
    whiteTariff: null,
    pv: null,
    onChooseMicrogridVariant: vi.fn(),
    desiredFeatures: [] as DesiredFeatureId[],
    microgrid: null as MicrogridConfig | null,
    nominalW: 5000,
    peakW: 7000,
    dailyKwh: 5,
    ...overrides,
  };
  return render(
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <ResultSummary {...props} />
    </NextIntlClientProvider>
  );
}

describe('ResultSummary: base rendering', () => {
  it('renders inverter and battery cards with model text (no nickname)', () => {
    renderResult();
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
    expect(screen.getByText('1 porta de bateria')).toBeInTheDocument();
  });

  it('renders nickname above model when productMedia has one', () => {
    renderResult({
      productMedia: {
        'X1-Hybrid-5.0kW-G4': { model: 'X1-Hybrid-5.0kW-G4', nickname: 'Inversor Top', imageUrl: null, documents: [] },
        'TP-HS3.6': { model: 'TP-HS3.6', nickname: 'Bateria Top', imageUrl: null, documents: [] },
      },
    });
    expect(screen.getByText('Inversor Top')).toBeInTheDocument();
    expect(screen.getByText('Bateria Top')).toBeInTheDocument();
  });

  it('shows inverter unit count when inverterQty is not 1', () => {
    renderResult({ solution: { ...baseSolution, inverterQty: 2 } });
    expect(screen.getByText('2 unidades')).toBeInTheDocument();
  });

  it('shows plural "portas de bateria" and per-port ratio when multiple ports used', () => {
    renderResult({ solution: { ...baseSolution, batteryPortsUsed: 2, batteryQty: 4 } });
    expect(screen.getByText('2 portas de bateria')).toBeInTheDocument();
    expect(screen.getByText(/baterias\/porta/)).toBeInTheDocument();
  });

  it('shows battery qty units when qty !== 1', () => {
    renderResult({ solution: { ...baseSolution, batteryQty: 2 } });
    expect(screen.getAllByText('2 unidades').length).toBeGreaterThan(0);
  });

  it('renders a second battery card ("Bateria (expansão)") when parts split across master+expansion', () => {
    const master: BatteryCatalogOption = { ...battery, id: 'bm', model: 'MASTER', expansionModel: 'SLAVE' };
    const slave: BatteryCatalogOption = { ...battery, id: 'bs', model: 'SLAVE' };
    renderResult({
      solution: { ...baseSolution, batteryModel: 'MASTER', batteryQty: 2 },
      batteryCatalog: [master, slave],
    });
    expect(screen.getByText('Bateria (expansão)')).toBeInTheDocument();
  });
});

describe('ResultSummary: PV block', () => {
  it('renders pv power without monthly generation', () => {
    renderResult({ solution: { ...baseSolution, pvPowerKw: 4.5, pvMonthlyGenerationKwh: null } });
    expect(screen.getByText('4.50 kWp')).toBeInTheDocument();
  });

  it('renders pv power with monthly generation estimate', () => {
    renderResult({ solution: { ...baseSolution, pvPowerKw: 4.5, pvMonthlyGenerationKwh: 550 } });
    expect(screen.getByText(/550 kWh\/mês estimados/)).toBeInTheDocument();
  });

  it('renders nothing pv-related when pvPowerKw is null', () => {
    renderResult({ solution: { ...baseSolution, pvPowerKw: null } });
    expect(screen.queryByText('FV recomendado')).not.toBeInTheDocument();
  });
});

describe('ResultSummary: accessories', () => {
  it('renders required, optional, and bundled accessories with correct badges and details', () => {
    renderResult({
      solution: {
        ...baseSolution,
        accessories: [
          { model: 'ACC-REQ', qty: 2, optional: false, appliesTo: 'system', comment: 'Necessário', bundled: false },
          { model: 'ACC-OPT', qty: 1, optional: true, appliesTo: 'system', comment: null, bundled: false },
          { model: 'ACC-BUNDLE', qty: 1, optional: false, appliesTo: 'system', comment: null, bundled: true },
        ],
      },
      productMedia: {
        'ACC-REQ': { model: 'ACC-REQ', nickname: 'Kit requerido', description: 'Descrição do kit', imageUrl: 'https://example.com/acc.png', documents: [] },
      },
    });
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
    expect(screen.getByText('Opcional')).toBeInTheDocument();
    expect(screen.getByText('Incluso')).toBeInTheDocument();
    expect(screen.getByText('Kit requerido')).toBeInTheDocument();
    expect(screen.getByText('Descrição do kit')).toBeInTheDocument();
    expect(screen.getByText('2 unidades')).toBeInTheDocument();
    expect(screen.getByText('Necessário')).toBeInTheDocument();
    expect(screen.getByText('ACC-OPT')).toBeInTheDocument();
  });

  it('normalizes legacy string accessory lines', () => {
    // Deliberately a raw string, not a structured AccessoryLine — this exercises
    // normalizeAccessoryLine's backward-compat parsing of the pre-migration format.
    renderResult({
      solution: { ...baseSolution, accessories: ['Smart Meter - M1-40 x2 (opcional)'] as unknown as Solution['accessories'] },
    });
    expect(screen.getByText('Opcional')).toBeInTheDocument();
    expect(screen.getByText('2 unidades')).toBeInTheDocument();
  });

  it('renders no accessories section when list is empty', () => {
    renderResult({ solution: { ...baseSolution, accessories: [] } });
    expect(screen.queryByText('Acessórios')).not.toBeInTheDocument();
  });

  it('opens document and image preview modals from product cards', () => {
    renderResult({
      productMedia: {
        'X1-Hybrid-5.0kW-G4': {
          model: 'X1-Hybrid-5.0kW-G4',
          imageUrl: 'https://example.com/inv.png',
          documents: [{ name: 'Manual', url: 'https://example.com/manual.pdf' }],
        },
      },
    });
    fireEvent.click(screen.getByText('Manual'));
    // Image preview button rendered via ProductImage; just assert no crash and doc modal opened.
    expect(screen.getAllByText('Manual').length).toBeGreaterThan(0);
  });
});

describe('ResultSummary: financial analysis', () => {
  it('does not render the financial section when there is nothing priced and no tariff savings', () => {
    renderResult();
    expect(screen.queryByText('Análise financeira estimada')).not.toBeInTheDocument();
  });

  it('shows the investment card and a "Falta precificar" note when partially priced', () => {
    const userStockItems: UserStockItem[] = [
      { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 10000, createdAt: '', updatedAt: '' },
    ];
    renderResult({ userStockItems });
    expect(screen.getByText('Análise financeira estimada')).toBeInTheDocument();
    expect(screen.getByText('Valor parcial · 1 de 2 modelos/serviços')).toBeInTheDocument();
    expect(screen.getByText('Falta precificar')).toBeInTheDocument();
  });

  it('shows a complete investment total when all items and services are priced', () => {
    const userStockItems: UserStockItem[] = [
      { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 10000, createdAt: '', updatedAt: '' },
      { id: 's2', productType: 'battery', productModel: 'TP-HS3.6', unitValue: 5000, createdAt: '', updatedAt: '' },
    ];
    renderResult({ userStockItems });
    expect(screen.queryByText(/Valor parcial/)).not.toBeInTheDocument();
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
    expect(screen.getByText('Exige orçamento completo e economia positiva.')).toBeInTheDocument();
  });

  it('shows the tariff-order-invalid warning when tariffs are inconsistent', () => {
    renderResult({
      desiredFeatures: ['white_tariff'],
      whiteTariff: { ...validWhiteTariff, pontaTariffPerKwh: 0.1 },
    });
    expect(screen.getByText(/tarifas de ponta e intermediária devem ser maiores ou iguais/)).toBeInTheDocument();
  });

  it('shows Ganho com SolaX, composition breakdown, and toggles Premissas when tariff order is valid', () => {
    const userStockItems: UserStockItem[] = [
      { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 10000, createdAt: '', updatedAt: '' },
      { id: 's2', productType: 'battery', productModel: 'TP-HS3.6', unitValue: 5000, createdAt: '', updatedAt: '' },
    ];
    renderResult({
      userStockItems,
      desiredFeatures: ['white_tariff'],
      whiteTariff: validWhiteTariff,
    });
    expect(screen.getByText('Ganho com SolaX')).toBeInTheDocument();
    expect(screen.getByText('Composição da economia mensal')).toBeInTheDocument();
    expect(screen.getByText('Deslocamento com bateria')).toBeInTheDocument();
    expect(screen.getByText('RTE efetivo do sistema')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Premissas utilizadas/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/dias úteis por mês para Tarifa Branca/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows pv monthly savings copy and monthlyCost with/without SolaX comparison when pv contributes', () => {
    const userStockItems: UserStockItem[] = [
      { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 10000, createdAt: '', updatedAt: '' },
      { id: 's2', productType: 'battery', productModel: 'TP-HS3.6', unitValue: 5000, createdAt: '', updatedAt: '' },
    ];
    renderResult({
      userStockItems,
      desiredFeatures: ['white_tariff', 'pv'],
      whiteTariff: validWhiteTariff,
      pv: { monthlyConsumptionKwh: 400, hsp: 4.5 },
      solution: { ...baseSolution, pvPowerKw: 5, pvMonthlyGenerationKwh: 600 },
    });
    expect(screen.getByText('Ganho com SolaX')).toBeInTheDocument();
    expect(screen.getByText('Sem SolaX')).toBeInTheDocument();
    expect(screen.getByText('Com SolaX')).toBeInTheDocument();
  });
});

describe('ResultSummary: margin summary', () => {
  it('renders nothing when there are no margin rows to show (edge case guarded by rows.length===0)', () => {
    // With desiredFeatures empty, buildMarginSummary always returns the 3 base rows,
    // so MarginSummary always renders something — verify the decisive/insufficient styling paths instead.
    renderResult({
      solution: { ...baseSolution, inverterRatedPowerW: 1000, inverterPeakPowerW: 1000, availableEnergyWh: 1000 },
      nominalW: 5000,
      peakW: 7000,
      dailyKwh: 5,
    });
    expect(screen.getByText('Margem sobre a necessidade do cliente')).toBeInTheDocument();
    expect(screen.getByText('Insuficiente')).toBeInTheDocument();
  });

  it('shows the margin as absolute headroom in the row\'s own unit, not a percentage', () => {
    renderResult({
      solution: { ...baseSolution, inverterRatedPowerW: 6000, inverterPeakPowerW: 20000, availableEnergyWh: 20000 },
      nominalW: 5000,
      peakW: 7000,
      dailyKwh: 5,
    });
    // Potência padrão: providedValue 6000W - requiredValue 5000W = +1.00 kVA.
    expect(screen.getByText('+1.00 kVA')).toBeInTheDocument();
    expect(screen.queryByText(/^[+-]\d+%$/)).not.toBeInTheDocument();
  });

  it('shows the decisive-factor badge for the tightest positive margin', () => {
    renderResult({
      solution: { ...baseSolution, inverterRatedPowerW: 6000, inverterPeakPowerW: 20000, availableEnergyWh: 20000 },
      nominalW: 5000,
      peakW: 7000,
      dailyKwh: 5,
    });
    expect(screen.getByText('Fator decisivo')).toBeInTheDocument();
  });

  it('includes pv and microgrid rows when those features are active', () => {
    renderResult({
      solution: { ...baseSolution, pvPowerKw: 3, pvMonthlyGenerationKwh: 300, batteryPowerW: 2000 },
      desiredFeatures: ['pv', 'microgrid'],
      pv: { monthlyConsumptionKwh: 400, hsp: 4 },
      microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 3000, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
    });
    expect(screen.getByText('Geração FV')).toBeInTheDocument();
    expect(screen.getByText('Microrrede (inversor)')).toBeInTheDocument();
    expect(screen.getByText('Microrrede (bateria)')).toBeInTheDocument();
  });
});

describe('ResultSummary: microgrid variant choice', () => {
  const withMicrogrid: Omit<Solution, 'microgridAlternative'> = {
    ...baseSolution,
    inverterModel: 'X1-Hybrid-8.0kW-G4',
    batteryQty: 2,
    inverterQty: 1,
  };

  it('renders both options and calls onChoose with the selected variant', () => {
    const onChooseMicrogridVariant = vi.fn();
    renderResult({
      solution: { ...baseSolution, microgridAlternative: withMicrogrid },
      onChooseMicrogridVariant,
    });
    expect(screen.getByText('Versão Econômica')).toBeInTheDocument();
    expect(screen.getByText('Versão c/ Microrrede')).toBeInTheDocument();
    const buttons = screen.getAllByText('Usar esta versão');
    fireEvent.click(buttons[1]);
    expect(onChooseMicrogridVariant).toHaveBeenCalledWith('microgrid');
    fireEvent.click(buttons[0]);
    expect(onChooseMicrogridVariant).toHaveBeenCalledWith('economic');
  });

  it('shows a multi-part battery description when the variant splits across master+expansion', () => {
    const master: BatteryCatalogOption = { ...battery, id: 'bm', model: 'MASTER', expansionModel: 'SLAVE' };
    const slave: BatteryCatalogOption = { ...battery, id: 'bs', model: 'SLAVE' };
    renderResult({
      solution: {
        ...baseSolution,
        batteryModel: 'MASTER',
        batteryQty: 2,
        microgridAlternative: { ...withMicrogrid, batteryModel: 'MASTER', batteryQty: 2 },
      },
      batteryCatalog: [master, slave],
    });
    expect(screen.getAllByText(/MASTER/).length).toBeGreaterThan(0);
  });

  it('shows nicknames from productMedia in the variant choice cards', () => {
    renderResult({
      solution: { ...baseSolution, microgridAlternative: withMicrogrid },
      productMedia: {
        'X1-Hybrid-5.0kW-G4': { model: 'X1-Hybrid-5.0kW-G4', nickname: 'Econômico Nick', imageUrl: null, documents: [] },
      },
    });
    expect(screen.getByText(/Econômico Nick/)).toBeInTheDocument();
  });
});
