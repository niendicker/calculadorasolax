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
  batteryId: 'b1',
  batteryModel: 'TP-HS3.6',
  batteryQty: 1,
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
  it('shows the requirement checklist with no solution yet', () => {
    setup();
    expect(screen.getByText('Configure os dados para ver a solução recomendada.')).toBeInTheDocument();
    expect(screen.getByText('Topologia da bateria')).toBeInTheDocument();
  });

  it('shows the error alert when present', () => {
    setup({ error: 'Não foi possível calcular.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível calcular.');
  });

  it('shows the resolved solution once calculated', () => {
    setup({ solution: fakeSolution });
    // The same model names also appear in the picker cards below, so scope
    // to the "Inversor"/"Bateria" result blocks specifically.
    expect(screen.getByText('Inversor').closest('div')?.parentElement).toHaveTextContent('X1-Hybrid-5.0kW-G4');
    expect(screen.getByText('Bateria').closest('div')?.parentElement).toHaveTextContent('TP-HS3.6');
  });

  it('shows Pico/Consumo metrics from peakW/dailyKwh', () => {
    setup({ peakW: 5500, dailyKwh: 12.34 });
    expect(screen.getByText('5.50 kVA')).toBeInTheDocument();
    expect(screen.getByText('12.34 kWh/dia')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('tab', { name: 'ATS Externo' }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'ATS Externo' }));
    expect(screen.getByText('Foto do disjuntor geral')).toBeInTheDocument();
  });

  it('switches tabs without changing the enabled features, and shows only the active tab panel', () => {
    setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] } });

    fireEvent.click(screen.getByRole('tab', { name: 'ATS Externo' }));
    expect(screen.getByText('Foto do disjuntor geral')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Tarifa Branca' }));

    // Switching tabs is just navigation: it must not toggle any feature.
    expect(screen.queryByText('Foto do disjuntor geral')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tarifa Branca' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'ATS Externo' })).toHaveAttribute('aria-selected', 'false');
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
});

describe('SizingTab: cargas', () => {
  it('renders the LoadSelector under the Backup tab, which is active by default', () => {
    setup();
    expect(screen.getByText('Presets')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'ATS Externo' }));
    expect(screen.queryByText('Presets')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));
    expect(screen.getByText('Presets')).toBeInTheDocument();
  });

  it('shows a real Habilitar/Habilitado toggle for Backup, and the loads UI works regardless of the toggle state', () => {
    const { props } = setup();

    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeInTheDocument();
    // Cargas UI is available even before Backup is enabled — loads feed the
    // general system sizing, not just the backup requirement.
    expect(screen.getByText('Presets')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setDesiredFeatures).toHaveBeenCalledWith(['backup']);
  });

  it('turns off the Backup requirement without hiding the cargas UI', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'] } });

    expect(screen.getByRole('button', { name: 'Habilitado' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Habilitado' }));
    expect(props.setDesiredFeatures).toHaveBeenCalledWith([]);
    expect(screen.getByText('Presets')).toBeInTheDocument();
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
    setup();

    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    expect(screen.getByRole('button', { name: 'Minhas' })).toHaveClass('border-primary');
  });
});
