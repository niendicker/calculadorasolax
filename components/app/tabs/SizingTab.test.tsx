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
  inverterModel: null,
  gridType: null,
  loads: [] as unknown[],
  desiredFeatures: [] as never[],
  whiteTariff: null,
  microgrid: null,
  generator: null,
  atsPhotoUrl: null,
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
    nominalW: 0,
    peakW: 0,
    dailyKwh: 0,
    canCalculate: false,
    loading: false,
    initialLoading: false,
    error: null,
    setTopology: vi.fn(),
    setBatteryModel: vi.fn(),
    setInverterModel: vi.fn(),
    setGridType: vi.fn(),
    setDesiredFeatures: vi.fn(),
    setWhiteTariffConfig: vi.fn(),
    setMicrogridConfig: vi.fn(),
    setGeneratorConfig: vi.fn(),
    setAtsPhotoUrl: vi.fn(),
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

  it('shows Nominal/Pico/Energia metrics from nominalW/peakW/dailyKwh on the Resumo tab', () => {
    setup({ nominalW: 3000, peakW: 5500, dailyKwh: 12.34 });
    expect(screen.getByText('3.00')).toBeInTheDocument();
    expect(screen.getByText('5.50')).toBeInTheDocument();
    expect(screen.getByText('12.34')).toBeInTheDocument();
    expect(screen.getByText('kWh/dia')).toBeInTheDocument();
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

    const peakRow = within(marginCard).getByText('Potência de pico').closest('.px-2');
    expect(peakRow).not.toHaveTextContent('Fator decisivo');
    expect(peakRow).toHaveTextContent('+17%');
  });

  it('flags a margin as "Insuficiente" instead of "Fator decisivo" when the solution falls short', () => {
    // A peak target the solution can't meet (8000 > the 7000 the inverter provides) forces a negative margin.
    setup({ solution: fakeSolution, nominalW: 3000, peakW: 8000, dailyKwh: 3 });

    const marginCard = screen.getByText('Margem sobre a necessidade do cliente').closest('.rounded-lg') as HTMLElement;
    const peakRow = within(marginCard).getByText('Potência de pico').closest('.px-2');
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

    expect(screen.getByText('1 de 2 inversores cadastrados com suporte a microrrede')).toBeInTheDocument();
  });

  it('enabling Tarifa Branca from scratch seeds its default config', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: /^Tarifa Branca/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPowerW: 0, requiredEnergyWh: 0 })
    );
  });

  it('enabling Microrrede from scratch seeds its default config', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: /^Microrrede/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setMicrogridConfig).toHaveBeenCalledWith(expect.objectContaining({ onGridPhases: 1 }));
  });

  it('enabling Gerador Externo from scratch seeds its default config', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador Externo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 1 }));
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

  it('updates microgrid power, phases and the fundamental-requirement checkbox', () => {
    const props = enable(/^Microrrede/, 'microgrid');
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '4000' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fases do sistema ongrid' })).getByRole('radio', { name: 'Trifásico' }));
    fireEvent.click(screen.getByLabelText('Requisito fundamental'));

    expect(props.setMicrogridConfig).toHaveBeenCalledWith(expect.objectContaining({ onGridApparentPowerVA: 4000 }));
    expect(props.setMicrogridConfig).toHaveBeenCalledWith(expect.objectContaining({ onGridPhases: 3 }));
    expect(props.setMicrogridConfig).toHaveBeenCalledWith(expect.objectContaining({ isFundamentalRequirement: true }));
  });

  it('updates generator voltage, power and phases', () => {
    const props = enable(/^Gerador Externo/, 'external_generator');
    fireEvent.change(screen.getByLabelText('Tensão (V)'), { target: { value: '220' } });
    fireEvent.change(screen.getByLabelText('Potência (VA)'), { target: { value: '5000' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fases do gerador' })).getByRole('radio', { name: 'Bifásico' }));

    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ voltageV: 220 }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ apparentPowerVA: 5000 }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 2 }));
  });

  it('shows the ATS reminder for Gerador Externo when ATS Externo is not also selected', () => {
    enable(/^Gerador Externo/, 'external_generator');
    expect(screen.getByText(/Gerador Externo normalmente exige ATS Externo/)).toBeInTheDocument();
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
  it('renders accessories with their quantity, optional flag and attachments', () => {
    setup({
      solution: { ...fakeSolution, accessories: ['Smart Meter x2', 'Kit CFTV x1 (opcional)'] },
      productMedia: {
        'Smart Meter': { model: 'Smart Meter', nickname: 'Medidor', imageUrl: null, documents: [] },
      },
    });
    expect(screen.getByText('Medidor')).toBeInTheDocument();
    expect(screen.getByText('Quantidade: x2')).toBeInTheDocument();
    expect(screen.getByText('Kit CFTV (opcional)')).toBeInTheDocument();
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
