// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { useWizardStore } from '@/lib/store/wizard-store';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';
import type { Solution, UserStockItem } from '@/lib/types';
import { renderWithShell } from '../test-helpers/render-with-shell';
import type { BatteryCatalogOption, InverterCatalogOption } from '../types';
import { SizingTab } from './SizingTab';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

const battery: BatteryCatalogOption = {
  id: 'b1',
  model: 'TP-HS3.6',
  capacityKwh: 3.6,
  topology: 'HV',
  standardPowerKw: 1.8,
  peakPowerKw: 2.5,
  minSocPercent: 10,
  imageUrl: null,
  documents: [],
};

const lvBattery: BatteryCatalogOption = { ...battery, id: 'b2', model: 'TP-LD53', topology: 'LV' };

const battery2: BatteryCatalogOption = { ...battery, id: 'b3', model: 'TP-HS7.2', topology: 'HV' };

const inverter: InverterCatalogOption = {
  id: 'i1',
  model: 'X1-Hybrid-5.0kW-G4',
  topology: 'HV',
  phases: 1,
  standardPowerKva: 5,
  peakPowerKva: 7,
  maxPowerPerPhaseW: null,
  imageUrl: null,
  documents: [],
  flags: [],
};

const fakeSolution: Solution = {
  inverterId: 'i1',
  inverterModel: 'X1-Hybrid-5.0kW-G4',
  inverterRatedPowerW: 5000,
  inverterPeakPowerW: 7000,
  batteryId: 'b1',
  batteryModel: 'TP-HS3.6',
  batteryQty: 1,
  availableEnergyWh: 3240,
  pvPowerKw: 5,
  accessories: [],
};

const emptyResidentialOptions = {
  topology: null,
  batteryModel: null,
  secondaryBatteryModel: null,
  inverterModel: null,
  gridType: null,
  loads: [] as unknown[],
  desiredFeatures: [] as never[],
  whiteTariff: null,
  microgrid: null,
  generator: null,
  atsPhotoUrl: null,
  atsBackupAcknowledged: false,
  maxPowerPerPhaseW: null,
};

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    title: 'Cargas',
    subtitle: 'Informe os equipamentos que serão alimentados pelo sistema',
    projectName: '',
    loadingLabel: 'Calculando...',
    calculateLabel: 'Calcular',
    residentialOptions: emptyResidentialOptions,
    batteryCatalog: [battery, lvBattery],
    inverterCatalog: [inverter],
    availableInverterModels: null,
    solution: null,
    secondarySolution: null,
    secondaryError: null,
    nominalW: 0,
    peakW: 0,
    dailyKwh: 0,
    canCalculate: false,
    loading: false,
    initialLoading: false,
    error: null,
    setTopology: vi.fn(),
    setBatteryModel: vi.fn(),
    setSecondaryBatteryModel: vi.fn(),
    setInverterModel: vi.fn(),
    setGridType: vi.fn(),
    setDesiredFeatures: vi.fn(),
    setWhiteTariffConfig: vi.fn(),
    setMicrogridConfig: vi.fn(),
    setGeneratorConfig: vi.fn(),
    setAtsPhotoUrl: vi.fn(),
    setAtsBackupAcknowledged: vi.fn(),
    onUploadFeaturePhoto: vi.fn(),
    resetResidential: vi.fn(),
    calculate: vi.fn(),
    exportPdf: vi.fn(),
    saveProject: vi.fn(),
    productMedia: {},
    userStockItems: [] as UserStockItem[],
    onChooseMicrogridVariant: vi.fn(),
    ...overrides,
  };

  const utils = renderWithShell(
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <SizingTab {...(props as Parameters<typeof SizingTab>[0])} />
    </NextIntlClientProvider>
  );
  return { ...utils, props };
}

beforeEach(() => {
  resetWizardStore();
  createClientMock.mockReset();
  createClientMock.mockReturnValue(createSupabaseMock());
});

describe('SizingTab: title bar', () => {
  it('shows the title, subtitle and project badge when a project is loaded', () => {
    setup({ projectName: 'Casa de praia' });
    expect(screen.getByRole('heading', { name: 'Cargas' })).toBeInTheDocument();
    expect(screen.getByText('Informe os equipamentos que serão alimentados pelo sistema')).toBeInTheDocument();
    expect(screen.getByText('Casa de praia')).toBeInTheDocument();
  });

  it('wires Salvar projeto, Limpar and Calcular to their callbacks', () => {
    const { props } = setup({ canCalculate: true });

    fireEvent.click(screen.getByRole('button', { name: /Salvar projeto/ }));
    expect(props.saveProject).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(props.resetResidential).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    expect(props.calculate).toHaveBeenCalled();
  });

  it('disables Calcular until canCalculate is true, and shows the loading label while loading', () => {
    setup({ canCalculate: false });
    expect(screen.getByRole('button', { name: 'Calcular' })).toBeDisabled();

    setup({ canCalculate: true, loading: true });
    expect(screen.getByRole('button', { name: 'Calculando...' })).toBeDisabled();
  });

  it('only shows Exportar PDF once a solution exists', () => {
    setup({ solution: null });
    expect(screen.queryByRole('button', { name: /Exportar PDF/ })).not.toBeInTheDocument();

    setup({ solution: fakeSolution });
    expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeInTheDocument();
  });

  it('disables Exportar PDF (header and Solução tab) when canCalculate is false, even with a stale solution', () => {
    setup({ solution: fakeSolution, canCalculate: false });
    expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));
    expect(screen.getByRole('button', { name: 'Exportar relatório em PDF' })).toBeDisabled();
  });

  it('keeps Exportar PDF enabled when canCalculate is true', () => {
    setup({ solution: fakeSolution, canCalculate: true });
    expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));
    expect(screen.getByRole('button', { name: 'Exportar relatório em PDF' })).toBeEnabled();
  });
});

describe('SizingTab: summary panel', () => {
  it('shows the requirement checklist with no solution yet, and the placeholder in Solução', () => {
    setup();
    // Defaults to the "Resumo" tab.
    expect(screen.getByText('Topologia')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));
    expect(screen.getByText('Configure os dados na aba Resumo e calcule para ver a solução recomendada.')).toBeInTheDocument();
  });

  it('shows the error alert when present', () => {
    setup({ error: 'Não foi possível calcular.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível calcular.');
  });

  it('shows the resolved solution once calculated', () => {
    setup({ solution: fakeSolution });
    // "Inversor"/"Bateria" also label rows in the summary panel above, so
    // scope to the <div> icon+label header of the result blocks specifically
    // (the summary panel uses a <span> for its row label).
    expect(screen.getByText('Inversor', { selector: 'div' }).parentElement).toHaveTextContent('X1-Hybrid-5.0kW-G4');
    expect(screen.getByText('Bateria', { selector: 'div' }).parentElement).toHaveTextContent('TP-HS3.6');
  });

  it('lays the Inversor card out with the image as a sibling column next to the text/attachments column', () => {
    setup({
      solution: fakeSolution,
      productMedia: {
        'X1-Hybrid-5.0kW-G4': {
          model: 'X1-Hybrid-5.0kW-G4',
          nickname: null,
          imageUrl: 'https://cdn.example.com/inverter.png',
          documents: [{ name: 'Datasheet', url: 'https://cdn.example.com/datasheet.pdf' }],
        },
      },
    });

    const inverterCard = screen.getByText('Inversor', { selector: 'div' }).closest('.rounded-lg') as HTMLElement;
    const grid = inverterCard.querySelector('.sm\\:grid-cols-\\[1fr_88px\\]') as HTMLElement;
    expect(grid.children).toHaveLength(2);

    const [textColumn, imageColumn] = Array.from(grid.children);
    expect(textColumn).toHaveTextContent('X1-Hybrid-5.0kW-G4');
    expect(textColumn).toHaveTextContent('Datasheet');
    expect(imageColumn.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/inverter.png');
    expect(within(textColumn as HTMLElement).queryByRole('img')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('img', { name: 'X1-Hybrid-5.0kW-G4' }));
    expect(screen.getByRole('dialog', { name: 'X1-Hybrid-5.0kW-G4' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Datasheet' }));
    expect(screen.getByRole('dialog', { name: 'Datasheet' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('gives the expansion/Slave battery its own card when the Master has an expansionModel and qty > 1', () => {
    const masterBattery: BatteryCatalogOption = { ...battery, model: 'T58 V2 Master', expansionModel: 'T58 Slave' };
    setup({
      batteryCatalog: [masterBattery, lvBattery],
      solution: { ...fakeSolution, batteryModel: 'T58 V2 Master', batteryQty: 3 },
    });

    const masterCard = screen.getByText('Bateria', { selector: 'div' }).parentElement;
    expect(masterCard).toHaveTextContent('T58 V2 Master');
    expect(masterCard).toHaveTextContent('Quantidade: x1');

    const expansionCard = screen.getByText('Bateria (expansão)', { selector: 'div' }).parentElement;
    expect(expansionCard).toHaveTextContent('T58 Slave');
    expect(expansionCard).toHaveTextContent('Quantidade: x2');
  });

  it('shows Nominal/Pico/Energia metrics from nominalW/peakW/dailyKwh on the Resumo tab, while Backup is enabled', () => {
    setup({
      nominalW: 3000,
      peakW: 5500,
      dailyKwh: 12.34,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'] },
    });
    expect(screen.getByText('3.00')).toBeInTheDocument();
    expect(screen.getByText('5.50')).toBeInTheDocument();
    expect(screen.getByText('12.34')).toBeInTheDocument();
    expect(screen.getByText('kWh/dia')).toBeInTheDocument();
  });

  it('zeroes out the Resumo Nominal/Pico/Energia cards once Backup is disabled, even with loads still registered', () => {
    setup({ nominalW: 3000, peakW: 5500, dailyKwh: 12.34 });
    expect(screen.getAllByText('0.00')).toHaveLength(3);
    expect(screen.queryByText('3.00')).not.toBeInTheDocument();
    expect(screen.queryByText('5.50')).not.toBeInTheDocument();
    expect(screen.queryByText('12.34')).not.toBeInTheDocument();
  });

  it('raises the Resumo Nominal/Pico/Energia cards to the Tarifa Branca floor when it exceeds the loads', () => {
    setup({
      nominalW: 3000,
      peakW: 5500,
      dailyKwh: 3,
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['white_tariff'],
        whiteTariff: {
          requiredPowerW: 6000,
          requiredEnergyWh: 8000,
          includeBackupReserve: false,
          tariffSpreadPerKwh: 0.4,
        },
      },
    });
    // Power floor is a plain max(), applied to both Nominal and Pico the same
    // way, so both cards land on the same 6.00 value; energy without
    // includeBackupReserve is *replaced* by requiredEnergyWh (8000 Wh = 8.00
    // kWh/dia), not added.
    expect(screen.getAllByText('6.00')).toHaveLength(2);
    expect(screen.getByText('8.00')).toBeInTheDocument();
    expect(screen.queryByText('3.00')).not.toBeInTheDocument();
  });

  it('adds the backup reserve on top of the Tarifa Branca energy floor when includeBackupReserve is on', () => {
    setup({
      nominalW: 1000,
      peakW: 2000,
      dailyKwh: 3,
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['backup', 'white_tariff'],
        whiteTariff: {
          requiredPowerW: 500,
          requiredEnergyWh: 8000,
          includeBackupReserve: true,
          tariffSpreadPerKwh: 0.4,
        },
      },
    });
    // Power floor (500W) is below the loads (1000W), so the loads value wins.
    expect(screen.getByText('1.00')).toBeInTheDocument();
    // Energy: requiredEnergyWh + base (8000 + 3000 = 11000 Wh = 11.00 kWh/dia).
    expect(screen.getByText('11.00')).toBeInTheDocument();
  });

  it('shows solution Nominal/Pico/Energia on the Solução tab, capped by the weaker of battery vs inverter', () => {
    setup({ solution: fakeSolution });
    // Battery: 1.8kW/2.5kW peak x1; Inverter: 5000W rated/7000W peak — battery is the bottleneck for both.
    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.getByText('2.50')).toBeInTheDocument();
    // availableEnergyWh: 3240 -> 3.24 kWh
    expect(screen.getByText('3.24')).toBeInTheDocument();
    expect(screen.getByText('kWh', { selector: 'p' })).toBeInTheDocument();
  });

  it('shows a margin summary that highlights the tightest constraint as the decisive factor', () => {
    // nominal margin: (5000-3000)/3000 = +67%; peak margin: (7000-6000)/6000 = +17%;
    // energy margin: (3240-3000)/3000 = +8% — energy is the tightest, so it's decisive.
    setup({ solution: fakeSolution, nominalW: 3000, peakW: 6000, dailyKwh: 3 });

    const marginCard = screen.getByText('Margem sobre a necessidade do cliente').closest('.rounded-lg') as HTMLElement;
    const energyRow = within(marginCard).getByText('Energia', { selector: 'span' }).closest('.px-2');
    expect(energyRow).toHaveTextContent('Fator decisivo');
    expect(energyRow).toHaveTextContent('+8%');

    const peakRow = within(marginCard).getByText('Potência máxima').closest('.px-2');
    expect(peakRow).not.toHaveTextContent('Fator decisivo');
    expect(peakRow).toHaveTextContent('+17%');
  });

  it('flags a margin as "Insuficiente" instead of "Fator decisivo" when the solution falls short', () => {
    // A peak target the solution can't meet (8000 > the 7000 the inverter provides) forces a negative margin.
    setup({ solution: fakeSolution, nominalW: 3000, peakW: 8000, dailyKwh: 3 });

    const marginCard = screen.getByText('Margem sobre a necessidade do cliente').closest('.rounded-lg') as HTMLElement;
    const peakRow = within(marginCard).getByText('Potência máxima').closest('.px-2');
    expect(peakRow).toHaveTextContent('Insuficiente');
    expect(peakRow).not.toHaveTextContent('Fator decisivo');
  });
});

describe('SizingTab: rede e configuração', () => {
  it('selects a grid type', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    const radiogroup = screen.getByRole('radiogroup', { name: 'Tipo de rede' });
    fireEvent.click(within(radiogroup).getByRole('radio', { name: 'Monofásico220V' }));
    expect(props.setGridType).toHaveBeenCalledWith('singlePhase_220');
  });

  it('clicking the LV tab requests a topology switch (battery visibility follows the topology prop from the parent)', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));
    fireEvent.click(screen.getByRole('button', { name: /^LV/ }));
    expect(props.setTopology).toHaveBeenCalledWith('LowVoltage');
  });

  it('selects a battery already matching the active topology without re-requesting it', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, topology: 'LowVoltage' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    fireEvent.click(screen.getByText('TP-LD53'));

    expect(props.setBatteryModel).toHaveBeenCalledWith('TP-LD53');
    expect(props.setTopology).not.toHaveBeenCalled();
  });

  it('selects a second battery of the same topology as the secondary comparison model', () => {
    const { props } = setup({
      batteryCatalog: [battery, battery2, lvBattery],
      residentialOptions: { ...emptyResidentialOptions, topology: 'HighVoltage', batteryModel: 'TP-HS3.6' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    fireEvent.click(screen.getByText('TP-HS7.2'));

    expect(props.setSecondaryBatteryModel).toHaveBeenCalledWith('TP-HS7.2');
    expect(props.setBatteryModel).not.toHaveBeenCalled();
  });

  it('unmarking the primary battery promotes the secondary into its place', () => {
    const { props } = setup({
      batteryCatalog: [battery, battery2, lvBattery],
      residentialOptions: {
        ...emptyResidentialOptions,
        topology: 'HighVoltage',
        batteryModel: 'TP-HS3.6',
        secondaryBatteryModel: 'TP-HS7.2',
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    const card = screen.getAllByText('TP-HS3.6').find((el) => el.closest('[role="button"]'));
    fireEvent.click(card as HTMLElement);

    expect(props.setBatteryModel).toHaveBeenCalledWith('TP-HS7.2');
    expect(props.setSecondaryBatteryModel).toHaveBeenCalledWith(null);
  });

  it('unmarking the secondary battery only clears the secondary slot', () => {
    const { props } = setup({
      batteryCatalog: [battery, battery2, lvBattery],
      residentialOptions: {
        ...emptyResidentialOptions,
        topology: 'HighVoltage',
        batteryModel: 'TP-HS3.6',
        secondaryBatteryModel: 'TP-HS7.2',
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    fireEvent.click(screen.getByText('TP-HS7.2'));

    expect(props.setSecondaryBatteryModel).toHaveBeenCalledWith(null);
    expect(props.setBatteryModel).not.toHaveBeenCalled();
  });

  it('does nothing when clicking a third battery while both slots are already filled', () => {
    const battery3: BatteryCatalogOption = { ...battery, id: 'b4', model: 'TP-HS9.0', topology: 'HV' };
    const { props } = setup({
      batteryCatalog: [battery, battery2, battery3, lvBattery],
      residentialOptions: {
        ...emptyResidentialOptions,
        topology: 'HighVoltage',
        batteryModel: 'TP-HS3.6',
        secondaryBatteryModel: 'TP-HS7.2',
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    fireEvent.click(screen.getByText('TP-HS9.0'));

    expect(props.setBatteryModel).not.toHaveBeenCalled();
    expect(props.setSecondaryBatteryModel).not.toHaveBeenCalled();
  });

  it('excludes an expansion/Slave battery from the picker and its HV/LV count badge', () => {
    const master: BatteryCatalogOption = { ...battery, model: 'T58 V2 Master', expansionModel: 'T58 Slave' };
    const slave: BatteryCatalogOption = { ...battery, id: 'b-slave', model: 'T58 Slave' };
    setup({ batteryCatalog: [master, slave, lvBattery] });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    expect(screen.getByText('T58 V2 Master')).toBeInTheDocument();
    expect(screen.queryByText('T58 Slave')).not.toBeInTheDocument();
    // Only the Master counts toward HV — the Slave doesn't inflate the badge.
    expect(screen.getByRole('button', { name: /^HV/ })).toHaveTextContent('1');
  });

  it('selects an inverter model, and falls back to "Todos"', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, inverterModel: 'X1-Hybrid-5.0kW-G4' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));

    fireEvent.click(screen.getByText('Todos'));
    expect(props.setInverterModel).toHaveBeenCalledWith(null);
  });

  it('restricts inverter choices to availableInverterModels when given', () => {
    setup({ availableInverterModels: new Set(['some-other-model']) });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    expect(screen.queryByText('X1-Hybrid-5.0kW-G4')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum inversor com solução aprovada para este tipo de rede.')).toBeInTheDocument();
  });
});

describe('SizingTab: funcionalidades desejadas', () => {
  it('toggling ATS Externo reveals its photo upload field once the parent reflects the new selection', () => {
    const { rerender, props } = setup();

    // The tab's accessible name includes its tooltip copy too, so match loosely.
    fireEvent.click(screen.getByRole('tab', { name: /^ATS Externo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setDesiredFeatures).toHaveBeenCalledWith(['external_ats']);

    rerender(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <SizingTab
          {...(props as Parameters<typeof SizingTab>[0])}
          residentialOptions={{ ...emptyResidentialOptions, desiredFeatures: ['external_ats'] }}
        />
      </NextIntlClientProvider>
    );

    // rerender() here swaps in a tree without the Shell wrapper used by
    // renderWithShell, so React remounts SizingTab and its tab state resets.
    // The tab's accessible name includes its tooltip copy too, so match loosely.
    fireEvent.click(screen.getByRole('tab', { name: /^ATS Externo/ }));
    expect(screen.getByText('Foto do disjuntor geral')).toBeInTheDocument();
  });

  it('shows a warning icon on Backup once enabled with no loads registered', () => {
    setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'], loads: [] },
    });
    expect(screen.getByRole('tab', { name: /^Backup/ }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('hides the Backup warning icon once at least one load is registered', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['backup'],
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    });
    expect(screen.getByRole('tab', { name: /^Backup/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('shows a warning icon on ATS Externo once enabled with the backup notice unacknowledged', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: false,
      },
    });
    expect(screen.getByRole('tab', { name: /^ATS Externo/ }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('hides the ATS Externo warning icon once the backup notice is acknowledged', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: true,
      },
    });
    expect(screen.getByRole('tab', { name: /^ATS Externo/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('never shows a warning icon on a disabled feature tab', () => {
    setup();
    expect(screen.getByRole('tab', { name: /^ATS Externo/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('does not show a warning icon on Microrrede once the power notice is acknowledged and phases/voltage match', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        gridType: 'singlePhase_220',
        desiredFeatures: ['microgrid'],
        microgrid: {
          voltageV: 220,
          onGridPhases: 1,
          onGridApparentPowerVA: 500,
          isFundamentalRequirement: true,
          photoUrl: null,
          powerNoticeAcknowledged: true,
        },
      },
    });
    expect(screen.getByRole('tab', { name: /^Microrrede/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('shows a warning icon on Microrrede when the phases/voltage are incompatible with the grid type', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        gridType: 'singlePhase_220',
        desiredFeatures: ['microgrid'],
        microgrid: {
          voltageV: 380,
          onGridPhases: 3,
          onGridApparentPowerVA: 500,
          isFundamentalRequirement: true,
          photoUrl: null,
          powerNoticeAcknowledged: true,
        },
      },
    });
    expect(screen.getByRole('tab', { name: /^Microrrede/ }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('does not show a warning icon on Gerador Externo when power/ATS/phases-voltage are all fine', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        gridType: 'singlePhase_220',
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 6000, photoUrl: null, ownAtsAcknowledged: true },
      },
    });
    expect(screen.getByRole('tab', { name: /^Gerador Externo/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('shows a warning icon on Gerador Externo when the own-ATS notice is unacknowledged', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        gridType: 'singlePhase_220',
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 6000, photoUrl: null, ownAtsAcknowledged: false },
      },
    });
    expect(screen.getByRole('tab', { name: /^Gerador Externo/ }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('shows a warning icon when no inverter among the ones narrowed down in Configurações supports the feature', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: true,
        inverterModel: inverter.model,
      },
    });
    // `inverter` (the fixture default) has flags: [] — it doesn't support external_ats.
    expect(screen.getByRole('tab', { name: /^ATS Externo/ }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('does not show a warning icon when the selected inverter does support the feature', () => {
    const atsInverter: InverterCatalogOption = { ...inverter, id: 'i2', model: 'X1-ATS', flags: ['external_ats'] };
    setup({
      inverterCatalog: [inverter, atsInverter],
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: true,
        inverterModel: atsInverter.model,
      },
    });
    expect(screen.getByRole('tab', { name: /^ATS Externo/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('does not show a warning icon for the inverter-support check before Configurações narrows anything down', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: true,
      },
    });
    expect(screen.getByRole('tab', { name: /^ATS Externo/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('switches tabs without changing the enabled features, and shows only the active tab panel', () => {
    setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] } });

    // The tab's accessible name includes its tooltip copy too, so match loosely.
    fireEvent.click(screen.getByRole('tab', { name: /^ATS Externo/ }));
    expect(screen.getByText('Foto do disjuntor geral')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Tarifa Branca/ }));

    // Switching tabs is just navigation: it must not toggle any feature.
    expect(screen.queryByText('Foto do disjuntor geral')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Tarifa Branca/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^ATS Externo/ })).toHaveAttribute('aria-selected', 'false');
    // The Tarifa Branca tab isn't enabled, so its panel shows the "Habilitar" prompt, not its fields.
    expect(screen.queryByLabelText('Potência (W)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeInTheDocument();
  });

  it('shows how many registered inverters support microrrede when the tab is enabled', () => {
    const microgridInverter: InverterCatalogOption = { ...inverter, id: 'i2', model: 'X1-Hybrid-7.5-MG', flags: ['microgrid'] };
    setup({
      inverterCatalog: [inverter, microgridInverter],
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['microgrid'] },
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Microrrede' }));

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(
      screen.getByLabelText('1 de 2 inversores cadastrados no catálogo suportam microrrede.')
    ).toBeInTheDocument();
  });

  it('enabling Tarifa Branca from scratch seeds its default config', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: /^Tarifa Branca/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPowerW: 0, requiredEnergyWh: 0 })
    );
  });

  it('enabling Microrrede from scratch seeds its default config, always fundamental', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: /^Microrrede/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setMicrogridConfig).toHaveBeenCalledWith(
      expect.objectContaining({ onGridPhases: 1, voltageV: 220, isFundamentalRequirement: true })
    );
  });

  it('enabling Gerador Externo from scratch seeds its default config', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 1 }));
  });

  it('seeds Microrrede phases/voltage matching the grid type already chosen in Configurações', () => {
    const { props } = setup({
      residentialOptions: { ...emptyResidentialOptions, gridType: 'threePhase_380' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Microrrede/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setMicrogridConfig).toHaveBeenCalledWith(
      expect.objectContaining({ onGridPhases: 3, voltageV: 380 })
    );
  });

  it('seeds Gerador Externo phases/voltage matching the grid type already chosen in Configurações', () => {
    const { props } = setup({
      residentialOptions: { ...emptyResidentialOptions, gridType: 'splitPhase_220' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 2, voltageV: 220 }));
  });

  it('falls back to monofásico 220V when no grid type has been chosen yet', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, gridType: null } });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 1, voltageV: 220 }));
  });
});

describe('SizingTab: main tab (Funcionalidades/Configurações) warning bubbling', () => {
  it('shows a warning icon on the Funcionalidades main tab when Backup is enabled with no loads registered', () => {
    setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'], loads: [] },
    });
    expect(screen.getByRole('tab', { name: 'Funcionalidades' }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('shows a warning icon on the Funcionalidades main tab when an enabled feature has a pending issue', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: false,
      },
    });
    expect(screen.getByRole('tab', { name: 'Funcionalidades' }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('does not show a warning icon on Funcionalidades when every enabled feature is fully acknowledged', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: true,
      },
    });
    expect(screen.getByRole('tab', { name: 'Funcionalidades' }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('does not show a warning icon on Funcionalidades when no feature is enabled', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'Funcionalidades' }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('shows a warning icon on the Configurações main tab when no inverter is available for the current grid/battery combo', () => {
    setup({ availableInverterModels: new Set() });
    expect(screen.getByRole('tab', { name: 'Configurações' }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('does not show a warning icon on Configurações when there is at least one available inverter', () => {
    setup({ availableInverterModels: new Set(['X1-Hybrid-5.0kW-G4']) });
    expect(screen.getByRole('tab', { name: 'Configurações' }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('does not show a warning icon on Configurações before any grid/battery combo has narrowed the inverters down', () => {
    setup({ availableInverterModels: null });
    expect(screen.getByRole('tab', { name: 'Configurações' }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });
});

describe('SizingTab: configuration summary row jumps', () => {
  it('jumps to Configurações → Tipo de rede when the "Tipo de rede" row is clicked', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Tipo de rede/ }));
    expect(screen.getByRole('radiogroup', { name: 'Tipo de rede' })).toBeInTheDocument();
  });

  it('jumps to Configurações → Modelo bateria when the "Bateria" row is clicked', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Bateria/ }));
    expect(screen.getByRole('tab', { name: 'Modelo bateria' })).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to Funcionalidades with the clicked feature as the active tab', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Backup/ }));
    expect(screen.getByRole('tab', { name: 'Funcionalidades' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Backup/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('re-clicking an already-active tab (Resumo, Funcionalidades, Tipo de rede) is a no-op', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: /^Resumo/ }));
    expect(screen.getByRole('tab', { name: /^Resumo/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Funcionalidades' }));
    expect(screen.getByRole('tab', { name: 'Funcionalidades' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Inversores Híbridos' }));
    expect(screen.getByRole('tab', { name: 'Inversores Híbridos' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the external_generator, white_tariff and no_pv summary values', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_generator', 'white_tariff', 'no_pv'],
        generator: { voltageV: 220, apparentPowerVA: 5000, phases: 1, photoUrl: null },
        whiteTariff: { requiredPowerW: 0, requiredEnergyWh: 0, tariffSpreadPerKwh: 0.35, includeBackupReserve: false },
      },
    });
    expect(screen.getByText('Ativado · 5000 VA')).toBeInTheDocument();
    expect(screen.getByText('Ativado · R$ 0.35/kWh')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sem FV/ })).toHaveTextContent('Ativado');
  });
});

describe('SizingTab: white tariff / microgrid / generator fields', () => {
  function enable(featureName: RegExp, feature: 'white_tariff' | 'microgrid' | 'external_generator' | 'external_ats', extraOptions: Record<string, unknown> = {}) {
    const { props } = setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: [feature], ...extraOptions },
    });
    fireEvent.click(screen.getByRole('tab', { name: featureName }));
    return props;
  }

  it('updates white tariff power, energy, spread and the backup-reserve checkbox', () => {
    const props = enable(/^Tarifa Branca/, 'white_tariff');
    fireEvent.change(screen.getByLabelText('Potência (W)'), { target: { value: '3000' } });
    fireEvent.change(screen.getByLabelText('Energia (Wh)'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Spread (R$/kWh)'), { target: { value: '0.35' } });
    fireEvent.click(screen.getByLabelText('Reservar para backup das cargas'));

    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ requiredPowerW: 3000 }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ requiredEnergyWh: 5000 }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ tariffSpreadPerKwh: 0.35 }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ includeBackupReserve: true }));
  });

  it('updates microgrid power and phases (phase change auto-picks a valid voltage)', () => {
    const props = enable(/^Microrrede/, 'microgrid');
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '4000' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fases do sistema ongrid' })).getByRole('radio', { name: 'Trifásico' }));

    expect(props.setMicrogridConfig).toHaveBeenCalledWith(expect.objectContaining({ onGridApparentPowerVA: 4000 }));
    expect(props.setMicrogridConfig).toHaveBeenCalledWith(expect.objectContaining({ onGridPhases: 3, voltageV: 220 }));
    expect(screen.queryByLabelText('Requisito fundamental')).not.toBeInTheDocument();
  });

  it('updates microgrid voltage when trifásico is already selected', () => {
    const props = enable(/^Microrrede/, 'microgrid', {
      microgrid: { voltageV: 220, onGridPhases: 3, onGridApparentPowerVA: 0, isFundamentalRequirement: true, photoUrl: null },
    });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tensão do sistema ongrid' })).getByRole('radio', { name: '380V' }));
    expect(props.setMicrogridConfig).toHaveBeenCalledWith(expect.objectContaining({ voltageV: 380 }));
  });

  it('checks the microgrid power-notice acknowledgement checkbox', () => {
    const props = enable(/^Microrrede/, 'microgrid');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(props.setMicrogridConfig).toHaveBeenCalledWith(expect.objectContaining({ powerNoticeAcknowledged: true }));
  });

  it('renders the microgrid power-notice field in a warning style until acknowledged, then in a neutral style', () => {
    enable(/^Microrrede/, 'microgrid');
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox).not.toBeChecked();
    const unacknowledgedField = checkbox.closest('label') as HTMLElement;
    expect(unacknowledgedField.className).toContain('amber');

    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['microgrid'],
        microgrid: {
          voltageV: 220,
          onGridPhases: 1,
          onGridApparentPowerVA: 0,
          isFundamentalRequirement: true,
          photoUrl: null,
          powerNoticeAcknowledged: true,
        },
      },
    });
    fireEvent.click(screen.getAllByRole('tab', { name: /^Microrrede/ })[1]);
    expect(
      screen.getByText('Confirmado: a potência do sistema ongrid é menor que a do inversor e das baterias da solução.')
    ).toBeInTheDocument();
    const acknowledgedCheckbox = screen.getAllByRole('checkbox')[1] as HTMLInputElement;
    expect(acknowledgedCheckbox).toBeChecked();
    expect((acknowledgedCheckbox.closest('label') as HTMLElement).className).not.toContain('amber');
  });

  it('places the microgrid power-notice field right before the photo upload area', () => {
    enable(/^Microrrede/, 'microgrid');
    const checkboxLabel = screen.getByRole('checkbox').closest('label') as HTMLElement;
    const photoField = screen.getByText('Anexar foto');
    expect(checkboxLabel.compareDocumentPosition(photoField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('Potência (VA)').compareDocumentPosition(checkboxLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('updates generator power and phases (phase change auto-picks a valid voltage)', () => {
    const props = enable(/^Gerador Externo/, 'external_generator');
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '5000' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fases do gerador' })).getByRole('radio', { name: 'Trifásico' }));

    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ apparentPowerVA: 5000 }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 3, voltageV: 220 }));
  });

  it('updates generator voltage when trifásico is already selected', () => {
    const props = enable(/^Gerador Externo/, 'external_generator', {
      generator: { voltageV: 220, phases: 3, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: false },
    });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tensão do gerador' })).getByRole('radio', { name: '380V' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ voltageV: 380 }));
  });

  it('shows only 220V as a voltage option for monofásico', () => {
    enable(/^Gerador Externo/, 'external_generator');
    const voltageGroup = screen.getByRole('radiogroup', { name: 'Tensão do gerador' });
    expect(within(voltageGroup).getByRole('radio', { name: '220V' })).toBeInTheDocument();
    expect(within(voltageGroup).queryByRole('radio', { name: '380V' })).not.toBeInTheDocument();
  });

  it('shows only 110/220V as a voltage option for bifásico', () => {
    enable(/^Gerador Externo/, 'external_generator', {
      generator: { voltageV: 220, phases: 2, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: false },
    });
    const voltageGroup = screen.getByRole('radiogroup', { name: 'Tensão do gerador' });
    expect(within(voltageGroup).getByRole('radio', { name: '110/220V' })).toBeInTheDocument();
    expect(within(voltageGroup).queryByRole('radio', { name: '220V' })).not.toBeInTheDocument();
  });

  it('shows both 220V and 380V as voltage options for trifásico', () => {
    enable(/^Gerador Externo/, 'external_generator', {
      generator: { voltageV: 220, phases: 3, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: false },
    });
    const voltageGroup = screen.getByRole('radiogroup', { name: 'Tensão do gerador' });
    expect(within(voltageGroup).getByRole('radio', { name: '220V' })).toBeInTheDocument();
    expect(within(voltageGroup).getByRole('radio', { name: '380V' })).toBeInTheDocument();
  });

  it('resets voltage to 220 when switching from Trifásico 380V to Monofásico', () => {
    const props = enable(/^Gerador Externo/, 'external_generator', {
      generator: { voltageV: 380, phases: 3, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: false },
    });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fases do gerador' })).getByRole('radio', { name: 'Monofásico' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 1, voltageV: 220 }));
  });

  it('warns when the generator phases/voltage do not match the configured grid type', () => {
    enable(/^Gerador Externo/, 'external_generator', { gridType: 'threePhase_220' });
    expect(
      screen.getByText(/A tensão\/fases selecionadas \(Monofásico 220V\) são incompatíveis com o tipo de rede configurado \(Trifásico 220V\)/)
    ).toBeInTheDocument();
  });

  it('does not warn about generator phases/voltage when they exactly match the configured grid type', () => {
    enable(/^Gerador Externo/, 'external_generator', { gridType: 'singlePhase_220' });
    expect(screen.queryByText(/são incompatíveis com o tipo de rede configurado/)).not.toBeInTheDocument();
  });

  it('does not warn when no grid type is configured yet', () => {
    enable(/^Gerador Externo/, 'external_generator', { gridType: null });
    expect(screen.queryByText(/são incompatíveis com o tipo de rede configurado/)).not.toBeInTheDocument();
  });

  it('allows the microgrid exception: 380V trifásico or 220V bifásico network with a 220V monofásico ongrid inverter', () => {
    enable(/^Microrrede/, 'microgrid', { gridType: 'threePhase_380' });
    expect(screen.queryByText(/são incompatíveis com o tipo de rede configurado/)).not.toBeInTheDocument();
  });

  it('still warns for microgrid when the mismatch is not the documented exception', () => {
    enable(/^Microrrede/, 'microgrid', {
      gridType: 'singlePhase_220',
      microgrid: { voltageV: 220, onGridPhases: 3, onGridApparentPowerVA: 0, isFundamentalRequirement: true, photoUrl: null },
    });
    expect(
      screen.getByText(/são incompatíveis com o tipo de rede configurado \(Monofásico 220V\)/)
    ).toBeInTheDocument();
  });

  it('shows how many registered inverters support Gerador Externo when the tab is enabled', () => {
    const generatorInverter: InverterCatalogOption = {
      ...inverter,
      id: 'i2',
      model: 'X1-Hybrid-7.5-GEN',
      flags: ['external_generator'],
    };
    setup({
      inverterCatalog: [inverter, generatorInverter],
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_generator'] },
    });

    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));

    expect(
      screen.getByLabelText('1 de 2 inversores cadastrados no catálogo suportam Gerador Externo.')
    ).toBeInTheDocument();
  });

  it('shows a neutral chip when no grid type/model is selected yet in Configurações', () => {
    setup({
      inverterCatalog: [inverter],
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['microgrid'] },
      availableInverterModels: null,
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Microrrede/ }));
    expect(
      screen.getByLabelText(/Selecione o tipo de rede em Configurações para ver quantos inversores compatíveis/)
    ).toBeInTheDocument();
  });

  it('shows a clear zero-support chip when none of the selected options support the feature', () => {
    const otherInverter: InverterCatalogOption = { ...inverter, id: 'i2', model: 'Other-Model', flags: [] };
    setup({
      inverterCatalog: [inverter, otherInverter],
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['microgrid'], inverterModel: 'Other-Model' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Microrrede/ }));
    expect(
      screen.getByLabelText('Nenhum inversor das opções selecionadas em Configurações suporta microrrede.')
    ).toBeInTheDocument();
  });

  it('shows the selected-options support count when a specific inverter model is chosen and supports the feature', () => {
    const generatorInverter: InverterCatalogOption = {
      ...inverter,
      id: 'i2',
      model: 'X1-Hybrid-7.5-GEN',
      flags: ['external_generator'],
    };
    setup({
      inverterCatalog: [inverter, generatorInverter],
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_generator'],
        inverterModel: 'X1-Hybrid-7.5-GEN',
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));
    expect(
      screen.getByLabelText('1 de 1 inversores das opções selecionadas em Configurações suportam Gerador Externo.')
    ).toBeInTheDocument();
  });

  it('shows the own-ATS acknowledgement checkbox for Gerador Externo, unchecked by default', () => {
    enable(/^Gerador Externo/, 'external_generator');
    expect(screen.getByText('O gerador externo precisa ter a própria chave ATS.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Ciente/ })).not.toBeChecked();
  });

  it('warns when the generator power is below the loads peak power', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 2000, photoUrl: null, ownAtsAcknowledged: false },
      },
      peakW: 5500,
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));
    expect(screen.getByText('Potência do gerador insuficiente para carregar as baterias')).toBeInTheDocument();
  });

  it('does not warn when the generator power covers the loads peak power', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 6000, photoUrl: null, ownAtsAcknowledged: false },
      },
      peakW: 5500,
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));
    expect(screen.queryByText('Potência do gerador insuficiente para carregar as baterias')).not.toBeInTheDocument();
  });

  it('checks the own-ATS acknowledgement checkbox', () => {
    const props = enable(/^Gerador Externo/, 'external_generator');
    fireEvent.click(screen.getByRole('checkbox', { name: /Ciente/ }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ ownAtsAcknowledged: true }));
  });

  it('renders the own-ATS field in a warning style until acknowledged, then in a neutral style', () => {
    enable(/^Gerador Externo/, 'external_generator');
    const unacknowledgedField = screen.getByRole('checkbox', { name: /Ciente/ }).closest('label') as HTMLElement;
    expect(unacknowledgedField.className).toContain('amber');

    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: true },
      },
    });
    fireEvent.click(screen.getAllByRole('tab', { name: /^Gerador Externo/ })[1]);
    const acknowledgedField = screen.getByRole('checkbox', { name: /Confirmado/ }).closest('label') as HTMLElement;
    expect(acknowledgedField.className).not.toContain('amber');
  });

  it('shows how many registered inverters support ATS Externo when the tab is enabled', () => {
    const atsInverter: InverterCatalogOption = { ...inverter, id: 'i2', model: 'X1-Hybrid-7.5-ATS', flags: ['external_ats'] };
    setup({
      inverterCatalog: [inverter, atsInverter],
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^ATS Externo/ }));
    expect(
      screen.getByLabelText('1 de 2 inversores cadastrados no catálogo suportam ATS Externo.')
    ).toBeInTheDocument();
  });

  it('shows the ATS backup-acknowledgement field in a warning style until checked, then in a neutral style', () => {
    enable(/^ATS Externo/, 'external_ats');
    expect(screen.getByText('O ATS externo deve ser usado para backup completo.')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox).not.toBeChecked();
    const unacknowledgedField = checkbox.closest('label') as HTMLElement;
    expect(unacknowledgedField.className).toContain('amber');

    setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'], atsBackupAcknowledged: true },
    });
    fireEvent.click(screen.getAllByRole('tab', { name: /^ATS Externo/ })[1]);
    expect(screen.getByText('Confirmado: o ATS externo é usado para backup completo.')).toBeInTheDocument();
    const acknowledgedCheckbox = screen.getAllByRole('checkbox')[1] as HTMLInputElement;
    expect(acknowledgedCheckbox).toBeChecked();
    expect((acknowledgedCheckbox.closest('label') as HTMLElement).className).not.toContain('amber');
  });

  it('checks the ATS backup-acknowledgement checkbox', () => {
    const props = enable(/^ATS Externo/, 'external_ats');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(props.setAtsBackupAcknowledged).toHaveBeenCalledWith(true);
  });

  it('uploads a photo for a feature and surfaces an upload error', async () => {
    const onUploadPhoto = vi.fn().mockRejectedValueOnce(new Error('boom'));
    setup({
      onUploadFeaturePhoto: onUploadPhoto,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^ATS Externo/ }));

    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    const input = document.getElementById('photo-upload-ats') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('Não foi possível enviar a imagem. Tente novamente.')).toBeInTheDocument();
    expect(onUploadPhoto).toHaveBeenCalledWith(file, 'ats');
  });

  it('uploads a microgrid photo and stores its URL on the microgrid config', async () => {
    const onUploadPhoto = vi.fn().mockResolvedValueOnce('https://cdn.example.com/mg.png');
    const { props } = setup({
      onUploadFeaturePhoto: onUploadPhoto,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['microgrid'] },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Microrrede/ }));

    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(document.getElementById('photo-upload-microgrid') as HTMLInputElement, { target: { files: [file] } });

    await vi.waitFor(() =>
      expect(props.setMicrogridConfig).toHaveBeenCalledWith(expect.objectContaining({ photoUrl: 'https://cdn.example.com/mg.png' }))
    );
  });

  it('uploads a generator photo and stores its URL on the generator config', async () => {
    const onUploadPhoto = vi.fn().mockResolvedValueOnce('https://cdn.example.com/gen.png');
    const { props } = setup({
      onUploadFeaturePhoto: onUploadPhoto,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_generator'] },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));

    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(document.getElementById('photo-upload-generator') as HTMLInputElement, { target: { files: [file] } });

    await vi.waitFor(() =>
      expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ photoUrl: 'https://cdn.example.com/gen.png' }))
    );
  });

  it('uploads a photo successfully and lets the user replace or remove it', async () => {
    const onUploadPhoto = vi.fn().mockResolvedValueOnce('https://cdn.example.com/uploaded.png');
    const { props } = setup({
      onUploadFeaturePhoto: onUploadPhoto,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^ATS Externo/ }));

    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    const input = document.getElementById('photo-upload-ats') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => expect(props.setAtsPhotoUrl).toHaveBeenCalledWith('https://cdn.example.com/uploaded.png'));
  });

  it('does nothing when the file input changes with no file selected', () => {
    const onUploadPhoto = vi.fn();
    setup({
      onUploadFeaturePhoto: onUploadPhoto,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^ATS Externo/ }));

    const input = document.getElementById('photo-upload-ats') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });

    expect(onUploadPhoto).not.toHaveBeenCalled();
  });

  it('shows Trocar foto/Remover for an already-attached photo, and clears it via Remover', () => {
    const { props } = setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'], atsPhotoUrl: 'https://cdn.example.com/x.png' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^ATS Externo/ }));

    expect(screen.getByText('Trocar foto')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remover/ }));
    expect(props.setAtsPhotoUrl).toHaveBeenCalledWith(null);
  });

  it('disabling an already-enabled white tariff feature clears its config', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['white_tariff'] } });
    fireEvent.click(screen.getByRole('tab', { name: /^Tarifa Branca/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitado' }));
    expect(props.setDesiredFeatures).toHaveBeenCalledWith([]);
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(null);
  });

  it('disabling an already-enabled microgrid feature clears its config', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['microgrid'] } });
    fireEvent.click(screen.getByRole('tab', { name: /^Microrrede/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitado' }));
    expect(props.setMicrogridConfig).toHaveBeenCalledWith(null);
  });

  it('disabling an already-enabled generator feature clears its config', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_generator'] } });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitado' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(null);
  });
});

describe('SizingTab: battery/inverter picker image and document previews', () => {
  it('opens an image preview modal when the battery thumbnail is clicked, and shows the in-stock badge', () => {
    const batteryWithImage: BatteryCatalogOption = { ...battery, imageUrl: 'https://cdn.example.com/battery.png' };
    setup({
      batteryCatalog: [batteryWithImage, lvBattery],
      userStockItems: [{ id: 's1', productType: 'battery', productModel: batteryWithImage.model } as UserStockItem],
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    expect(screen.getByText('No catálogo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('img', { name: batteryWithImage.model }));
    expect(screen.getByRole('dialog', { name: batteryWithImage.model })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a document preview modal when a battery attachment is clicked', () => {
    const batteryWithDoc: BatteryCatalogOption = {
      ...battery,
      documents: [{ name: 'Datasheet', url: 'https://cdn.example.com/doc.pdf' }],
    };
    setup({ batteryCatalog: [batteryWithDoc, lvBattery] });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    fireEvent.click(screen.getByRole('button', { name: 'Datasheet' }));
    expect(screen.getByRole('dialog', { name: 'Datasheet' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects a battery when no topology has been chosen yet', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    fireEvent.click(screen.getByText(battery.model));
    expect(props.setTopology).toHaveBeenCalledWith('HighVoltage');
    expect(props.setBatteryModel).toHaveBeenCalledWith(battery.model);
  });

  it('selects a battery via keyboard (Enter/Space) same as a click', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo bateria' }));

    const card = screen.getByText(battery.model).closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(props.setBatteryModel).toHaveBeenCalledWith(battery.model);

    fireEvent.keyDown(card, { key: 'Tab' });
    expect(props.setBatteryModel).toHaveBeenCalledTimes(1);
  });

  it('opens an image preview modal when the inverter thumbnail is clicked, and shows the in-stock badge', () => {
    const inverterWithImage: InverterCatalogOption = { ...inverter, imageUrl: 'https://cdn.example.com/inverter.png' };
    setup({
      inverterCatalog: [inverterWithImage],
      userStockItems: [{ id: 's2', productType: 'inverter', productModel: inverterWithImage.model } as UserStockItem],
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));

    expect(screen.getByText('No catálogo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('img', { name: inverterWithImage.model }));
    expect(screen.getByRole('dialog', { name: inverterWithImage.model })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a document preview modal when an inverter attachment is clicked', () => {
    const inverterWithDoc: InverterCatalogOption = {
      ...inverter,
      documents: [{ name: 'Manual', url: 'https://cdn.example.com/manual.pdf' }],
    };
    setup({ inverterCatalog: [inverterWithDoc] });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));

    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));
    expect(screen.getByRole('dialog', { name: 'Manual' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects "Todos" and an inverter via keyboard (Enter/Space), and via a plain click', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, inverterModel: inverter.model } });
    fireEvent.click(screen.getByRole('tab', { name: 'Configurações' }));

    const allCard = screen.getByText('Todos').closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(allCard, { key: ' ' });
    expect(props.setInverterModel).toHaveBeenCalledWith(null);

    const inverterCard = screen.getAllByText(inverter.model)
      .map((el) => el.closest('[role="button"]'))
      .find((el): el is HTMLElement => el !== null) as HTMLElement;
    fireEvent.keyDown(inverterCard, { key: 'Enter' });
    fireEvent.click(inverterCard);
    expect(props.setInverterModel).toHaveBeenCalledWith(inverter.model);
  });
});

describe('SizingTab: Solução tab accessories and microgrid variant choice', () => {
  it('renders accessories with their quantity, required/optional flag, appliesTo and comment', () => {
    setup({
      solution: {
        ...fakeSolution,
        accessories: [
          { model: 'Smart Meter', qty: 2, optional: false, appliesTo: 'system', comment: null },
          {
            model: 'Kit CFTV',
            qty: 1,
            optional: true,
            appliesTo: 'inverter',
            comment: 'Instalar próximo ao quadro.',
          },
        ],
      },
      productMedia: {
        'Smart Meter': { model: 'Smart Meter', nickname: 'Medidor', imageUrl: null, documents: [] },
      },
    });
    const accessoriesSection = screen.getByText('Acessórios').closest('div') as HTMLElement;
    expect(within(accessoriesSection).getByText('Medidor')).toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Quantidade: x2')).toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Obrigatório')).toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Kit CFTV')).toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Opcional')).toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Inversor')).toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Instalar próximo ao quadro.')).toBeInTheDocument();
  });

  it('lets the user choose between the economic and microgrid variants', () => {
    const microgridSolution: Solution = { ...fakeSolution, inverterModel: 'X1-MG', batteryQty: 2 };
    const economicSolution: Solution = { ...fakeSolution, microgridAlternative: microgridSolution };
    const { props } = setup({ solution: economicSolution });

    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));
    expect(screen.getByText('Versão Econômica')).toBeInTheDocument();
    expect(screen.getByText('Versão c/ Microrrede')).toBeInTheDocument();

    const microgridCard = screen.getByText('Versão c/ Microrrede').closest('.rounded-lg') as HTMLElement;
    fireEvent.click(within(microgridCard).getByRole('button', { name: 'Usar esta versão' }));
    expect(props.onChooseMicrogridVariant).toHaveBeenCalledWith('microgrid');
  });

  it('shows a joined "qty x model" list for the microgrid variant when it needs a battery expansion', () => {
    const masterBattery: BatteryCatalogOption = { ...battery, model: 'T58 Master', expansionModel: 'T58 Slave' };
    const microgridSolution: Solution = { ...fakeSolution, batteryModel: 'T58 Master', batteryQty: 3 };
    const economicSolution: Solution = { ...fakeSolution, batteryModel: 'T58 Master', batteryQty: 1, microgridAlternative: microgridSolution };
    setup({ solution: economicSolution, batteryCatalog: [masterBattery, lvBattery] });

    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));
    const microgridCard = screen.getByText('Versão c/ Microrrede').closest('.rounded-lg') as HTMLElement;
    expect(within(microgridCard).getByText('1× T58 Master + 2× T58 Slave')).toBeInTheDocument();
  });

  it('falls back to the inverter value alone when the battery is missing from the catalog', () => {
    setup({ solution: { ...fakeSolution, batteryModel: 'unknown-model' }, batteryCatalog: [battery, lvBattery] });
    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));
    // Battery not found -> both nominal/peak fall back to the inverter's own 5000W/7000W.
    expect(screen.getByText('5.00')).toBeInTheDocument();
    expect(screen.getByText('7.00')).toBeInTheDocument();
  });

  it('falls back to the battery value alone when the inverter has no rated/peak power', () => {
    setup({
      solution: { ...fakeSolution, inverterRatedPowerW: null, inverterPeakPowerW: null },
      batteryCatalog: [battery, lvBattery],
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));
    // Inverter has no rated/peak power -> both fall back to the battery's own 1.8kW/2.5kW.
    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.getByText('2.50')).toBeInTheDocument();
  });
});

describe('SizingTab: comparação de duas baterias', () => {
  it('does not show a battery tab switcher when only one battery model is selected', () => {
    setup({ solution: fakeSolution });
    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));
    expect(screen.queryByRole('tablist', { name: 'Bateria da solução' })).not.toBeInTheDocument();
  });

  it('shows a tab per battery, labeled with its nickname, and switches between independent solutions/errors', () => {
    const secondarySolution: Solution = { ...fakeSolution, batteryModel: 'TP-HS7.2', batteryQty: 2 };
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        batteryModel: 'TP-HS3.6',
        secondaryBatteryModel: 'TP-HS7.2',
      },
      solution: fakeSolution,
      secondarySolution,
      productMedia: {
        'TP-HS3.6': { model: 'TP-HS3.6', nickname: 'Bateria A', imageUrl: null, documents: [] },
        'TP-HS7.2': { model: 'TP-HS7.2', nickname: 'Bateria B', imageUrl: null, documents: [] },
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));

    const switcher = screen.getByRole('tablist', { name: 'Bateria da solução' });
    expect(within(switcher).getByRole('tab', { name: 'Bateria A' })).toHaveAttribute('aria-selected', 'true');
    expect(within(switcher).getByRole('tab', { name: 'Bateria B' })).toHaveAttribute('aria-selected', 'false');
    const batteryCardA = screen.getByText('Bateria A', { selector: 'p' }).closest('.rounded-lg') as HTMLElement;
    expect(within(batteryCardA).getByText('Quantidade: x1')).toBeInTheDocument();

    fireEvent.click(within(switcher).getByRole('tab', { name: 'Bateria B' }));
    expect(within(switcher).getByRole('tab', { name: 'Bateria B' })).toHaveAttribute('aria-selected', 'true');
    const batteryCardB = screen.getByText('Bateria B', { selector: 'p' }).closest('.rounded-lg') as HTMLElement;
    expect(within(batteryCardB).getByText('Quantidade: x2')).toBeInTheDocument();
  });

  it('shows the secondary battery error isolated in its own tab, without affecting the primary tab', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        batteryModel: 'TP-HS3.6',
        secondaryBatteryModel: 'TP-HS7.2',
      },
      solution: fakeSolution,
      secondarySolution: null,
      secondaryError: 'Nenhuma solução compatível foi encontrada.',
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Solução/ }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const switcher = screen.getByRole('tablist', { name: 'Bateria da solução' });
    fireEvent.click(within(switcher).getByRole('tab', { name: 'TP-HS7.2' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Nenhuma solução compatível foi encontrada.');
  });
});

describe('SizingTab: cargas', () => {
  it('collapses the Backup tab like any other feature tab until it is enabled', () => {
    setup();

    // Backup is the default active tab but starts disabled, so — same as
    // every other feature tab — its content (the loads UI) stays collapsed.
    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeInTheDocument();
    expect(screen.queryByText('Presets')).not.toBeInTheDocument();
  });

  it('reveals the LoadSelector under the Backup tab once enabled, and hides it again when disabled', () => {
    const { rerender, props } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setDesiredFeatures).toHaveBeenCalledWith(['backup']);

    rerender(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <SizingTab
          {...(props as Parameters<typeof SizingTab>[0])}
          residentialOptions={{ ...emptyResidentialOptions, desiredFeatures: ['backup'] }}
        />
      </NextIntlClientProvider>
    );
    // rerender remounts (no Shell wrapper), so activeTab resets to its
    // 'backup' default and we land straight on the now-enabled panel.
    expect(screen.getByText('Presets')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Habilitado' }));
    expect(props.setDesiredFeatures).toHaveBeenCalledWith([]);

    rerender(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <SizingTab {...(props as Parameters<typeof SizingTab>[0])} residentialOptions={emptyResidentialOptions} />
      </NextIntlClientProvider>
    );
    expect(screen.queryByText('Presets')).not.toBeInTheDocument();
  });

  it('defaults the Backup tab catalog to the "Minhas" filter when the user has personal items', () => {
    useWizardStore.setState({
      loadCatalog: [
        { id: 'c1', namePt: 'Chuveiro', nameEn: 'Shower', nameZh: '', powerW: 5500, category: 'Aquecimento', ipInRatio: 1 },
      ],
      userLoadCatalog: [
        { id: 'u1', name: 'Item pessoal', powerW: 100, ipInRatio: 1, createdAt: '', updatedAt: '' },
      ],
    });
    setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'] } });

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    expect(screen.getByRole('button', { name: 'Minhas' })).toHaveClass('border-primary');
  });
});
