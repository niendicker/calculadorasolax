// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { useWizardStore } from '@/lib/store/wizard-store';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';
import type { MarginSettings, Solution, UserStockItem } from '@/lib/types';
import { calculateTariffSavings, formatCurrencyBRL } from '../helpers';
import { renderWithShell, Shell } from '../test-helpers/render-with-shell';
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
  minInverterQty: null,
  gridType: null,
  loads: [] as unknown[],
  desiredFeatures: [] as never[],
  operationHours: 4,
  whiteTariff: null,
  microgrid: null,
  generator: null,
  pv: null,
  atsPhotoUrl: null,
  atsBackupAcknowledged: false,
  maxPowerPerPhaseW: null,
  peakCalcMode: 'sum' as const,
};

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    projectName: '',
    currentProjectId: null,
    onBackToProject: vi.fn(),
    loadingLabel: 'Calculando...',
    calculateLabel: 'Calcular',
    residentialOptions: emptyResidentialOptions,
    batteryCatalog: [battery, lvBattery],
    inverterCatalog: [inverter],
    availableInverterModels: null,
    availableInverterModelsByTopology: null,
    solution: null,
    secondarySolution: null,
    secondaryError: null,
    nominalW: 0,
    peakW: 0,
    dailyKwh: 0,
    canCalculate: false,
    hasUncalculatedChanges: true,
    loading: false,
    initialLoading: false,
    error: null,
    setTopology: vi.fn(),
    setBatteryModel: vi.fn(),
    setSecondaryBatteryModel: vi.fn(),
    setInverterModel: vi.fn(),
    setMinInverterQty: vi.fn(),
    setGridType: vi.fn(),
    setDesiredFeatures: vi.fn(),
    setWhiteTariffConfig: vi.fn(),
    setMicrogridConfig: vi.fn(),
    setGeneratorConfig: vi.fn(),
    setPvConfig: vi.fn(),
    setAtsPhotoUrl: vi.fn(),
    setAtsBackupAcknowledged: vi.fn(),
    onUploadFeaturePhoto: vi.fn(),
    resetResidential: vi.fn(),
    calculate: vi.fn(),
    exportPdf: vi.fn(),
    exportingPdf: false,
    onSendQuote: vi.fn(),
    sendingQuote: false,
    canSendQuoteByWhatsApp: true,
    onQuoteSolution: vi.fn(),
    autosaveStatus: 'idle' as const,
    autosaveLastSavedAt: null,
    productMedia: {},
    userStockItems: [] as UserStockItem[],
    marginSettings: { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 } as MarginSettings,
    onChooseMicrogridVariant: vi.fn(),
    summaryDrawerOpen: false,
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
  it('always shows "Dimensionamento" as the visible heading', () => {
    setup({ projectName: '' });
    expect(screen.getByRole('heading', { name: 'Dimensionamento' })).toBeInTheDocument();
  });

  it('shows the project name as a subtitle under the heading when a project is loaded', () => {
    setup({ projectName: 'Casa de praia' });
    expect(screen.getByRole('heading', { name: 'Dimensionamento' })).toBeInTheDocument();
    expect(screen.getByText('Casa de praia')).toBeInTheDocument();
  });

  it('omits the subtitle when no project is loaded yet', () => {
    setup({ projectName: '' });
    expect(screen.queryByText('Casa de praia')).not.toBeInTheDocument();
  });

  it('makes the project name a link back to Projetos when it is an already-saved project', () => {
    const { props } = setup({ projectName: 'Casa de praia', currentProjectId: 'p1' });
    fireEvent.click(screen.getByRole('button', { name: /Casa de praia/ }));
    expect(props.onBackToProject).toHaveBeenCalled();
  });

  it('keeps the project name as plain text (not a link) for a not-yet-saved draft', () => {
    setup({ projectName: 'Casa de praia', currentProjectId: null });
    expect(screen.queryByRole('button', { name: /Casa de praia/ })).not.toBeInTheDocument();
    expect(screen.getByText('Casa de praia')).toBeInTheDocument();
  });

  it('wires Calcular to its callback', () => {
    const { props } = setup({ canCalculate: true });

    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    expect(props.calculate).toHaveBeenCalled();
  });

  it('asks for confirmation before clearing the sizing, and only calls resetResidential once confirmed', async () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar dimensionamento' }));
    expect(props.resetResidential).not.toHaveBeenCalled();

    const confirmButton = await screen.findByRole('button', { name: 'Limpar' }, { timeout: 1000 });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(props.resetResidential).toHaveBeenCalled());
  });

  it('does not clear the sizing when the confirmation is dismissed', async () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar dimensionamento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Limpar dimensionamento?' }, { timeout: 1000 });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(props.resetResidential).not.toHaveBeenCalled();
  });

  it('no longer shows a manual "Salvar projeto" button — saving is now automatic', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Salvar projeto/ })).not.toBeInTheDocument();
  });

  it('shows nothing for the autosave indicator while idle', () => {
    setup({ autosaveStatus: 'idle' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a pending indicator, with detail in its tooltip, once an edit is queued for autosave', () => {
    setup({ autosaveStatus: 'pending' });
    expect(screen.getByRole('status')).toHaveAccessibleName('Alterações pendentes de salvamento.');
  });

  it('shows a saving indicator while the autosave request is in flight', () => {
    setup({ autosaveStatus: 'saving' });
    expect(screen.getByRole('status')).toHaveAccessibleName('Salvando alterações...');
  });

  it('shows the last-saved time in the indicator tooltip once autosave succeeds', () => {
    setup({ autosaveStatus: 'saved', autosaveLastSavedAt: new Date('2026-01-01T14:32:00') });
    expect(screen.getByRole('status')).toHaveAccessibleName('Salvo automaticamente às 14:32.');
  });

  it('shows an error indicator when autosave fails', () => {
    setup({ autosaveStatus: 'error' });
    expect(screen.getByRole('status')).toHaveAccessibleName('Não foi possível salvar automaticamente.');
  });

  it('disables Calcular until canCalculate is true, and shows the loading label while loading', () => {
    setup({ canCalculate: false });
    expect(screen.getByRole('button', { name: 'Calcular' })).toBeDisabled();

    setup({ canCalculate: true, loading: true });
    expect(screen.getByRole('button', { name: 'Calculando...' })).toBeDisabled();
  });

  it('disables Calcular once the current configuration was already calculated, with a tooltip explaining why', () => {
    setup({ canCalculate: true, hasUncalculatedChanges: false });
    const button = screen.getByRole('button', { name: 'Calcular' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Nenhuma alteração desde o último cálculo.');
  });

  it('keeps Calcular enabled when there are uncalculated changes', () => {
    setup({ canCalculate: true, hasUncalculatedChanges: true });
    const button = screen.getByRole('button', { name: 'Calcular' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('title');
  });

  // "Baixar relatório" lives in both summary sub-tabs (Resumo and Solução,
  // not the title bar anymore) so it stays reachable regardless of which one
  // a finished calculation auto-switches to — only one is actually mounted
  // at a time (summaryTab), but getAllByRole is used defensively instead of
  // assuming exactly one match.
  it('shows Baixar relatório disabled (not hidden) before a solution exists, and enabled once one does', () => {
    setup({ solution: null, canCalculate: true });
    for (const button of screen.getAllByRole('button', { name: /Baixar relatório/ })) {
      expect(button).toBeDisabled();
    }

    setup({ solution: fakeSolution, canCalculate: true });
    expect(screen.getAllByRole('button', { name: /Baixar relatório/ }).length).toBeGreaterThan(0);
  });

  it('disables Baixar relatório (header and Solução tab) when canCalculate is false, even with a stale solution', () => {
    setup({ solution: fakeSolution, canCalculate: false });
    for (const button of screen.getAllByRole('button', { name: /Baixar relatório/ })) {
      expect(button).toBeDisabled();
    }
  });

  it('keeps Baixar relatório enabled when canCalculate is true', () => {
    setup({ solution: fakeSolution, canCalculate: true });
    for (const button of screen.getAllByRole('button', { name: /Baixar relatório/ })) {
      expect(button).toBeEnabled();
    }
  });

  it('disables Baixar relatório while a calculation is in flight, even with an otherwise-exportable stale solution', () => {
    setup({ solution: fakeSolution, canCalculate: true, loading: true });
    expect(screen.getByRole('button', { name: /Baixar relatório/ })).toBeDisabled();
  });

  // The Edge Function now intentionally falls back to the largest available
  // combination when nothing fully meets the customer's power/energy
  // requirements (see calculate-residential/logic.ts's rankByLeastShortfall)
  // instead of erroring out — the frontend must block export in that case
  // even though canCalculate itself is unaffected (it's an input-completeness
  // gate, unrelated to whether the found solution is actually adequate).
  it('disables Baixar relatório when the solution falls short of the required power, even though canCalculate is true', () => {
    setup({
      solution: fakeSolution, // inverterPeakPowerW: 7000
      canCalculate: true,
      peakW: 10000,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'] },
    });
    for (const button of screen.getAllByRole('button', { name: /Baixar relatório/ })) {
      expect(button).toBeDisabled();
    }
  });

  it('disables Baixar relatório when only the secondary/expansion solution falls short, even with an adequate primary', () => {
    const shortSecondary: Solution = { ...fakeSolution, inverterPeakPowerW: 100 };
    setup({
      solution: fakeSolution, // inverterPeakPowerW: 7000, adequate
      secondarySolution: shortSecondary,
      canCalculate: true,
      peakW: 5000,
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['backup'],
        secondaryBatteryModel: 'TP-HS7.2',
      },
    });
    for (const button of screen.getAllByRole('button', { name: /Baixar relatório/ })) {
      expect(button).toBeDisabled();
    }
  });

  it('keeps Baixar relatório enabled when both the primary and secondary solutions are adequate', () => {
    setup({
      solution: fakeSolution, // inverterPeakPowerW: 7000
      secondarySolution: fakeSolution,
      canCalculate: true,
      peakW: 5000,
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['backup'],
        secondaryBatteryModel: 'TP-HS7.2',
      },
    });
    for (const button of screen.getAllByRole('button', { name: /Baixar relatório/ })) {
      expect(button).toBeEnabled();
    }
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
    // Master qty is 1 here — not worth calling out, so the quantity line is omitted.
    expect(masterCard).not.toHaveTextContent('unidade');

    const expansionCard = screen.getByText('Bateria (expansão)', { selector: 'div' }).parentElement;
    expect(expansionCard).toHaveTextContent('T58 Slave');
    expect(expansionCard).toHaveTextContent('2 unidades');
  });

  it('shows the port breakdown on the battery card when more than one port is in use', () => {
    setup({
      solution: { ...fakeSolution, batteryQty: 8, inverterQty: 2, batteryPortsUsed: 1 },
    });

    const batteryCard = screen.getByText('Bateria', { selector: 'div' }).parentElement;
    expect(batteryCard).toHaveTextContent('4 baterias/porta');
  });

  it('differentiates the per-port count between the Master and expansion cards', () => {
    const masterBattery: BatteryCatalogOption = { ...battery, model: 'T58 V2 Master', expansionModel: 'T58 Slave' };
    setup({
      batteryCatalog: [masterBattery, lvBattery],
      // 2 ports total; 6 batteries -> 2 masters (1/port) + 4 slaves (2/port).
      solution: { ...fakeSolution, batteryModel: 'T58 V2 Master', batteryQty: 6, inverterQty: 2, batteryPortsUsed: 1 },
    });

    const masterCard = screen.getByText('Bateria', { selector: 'div' }).parentElement;
    expect(masterCard).toHaveTextContent('2 unidades');
    expect(masterCard).toHaveTextContent('1 baterias/porta');

    const expansionCard = screen.getByText('Bateria (expansão)', { selector: 'div' }).parentElement;
    expect(expansionCard).toHaveTextContent('4 unidades');
    expect(expansionCard).toHaveTextContent('2 baterias/porta');
  });

  it('hides the port breakdown on the battery card when only one port is in use', () => {
    setup({
      solution: { ...fakeSolution, batteryQty: 4, inverterQty: 1, batteryPortsUsed: 1 },
    });

    const batteryCard = screen.getByText('Bateria', { selector: 'div' }).parentElement;
    expect(batteryCard).not.toHaveTextContent('porta');
  });

  it('always shows the battery port count on the inverter card, even with a single port', () => {
    setup({
      solution: { ...fakeSolution, batteryQty: 4, inverterQty: 1, batteryPortsUsed: 1 },
    });

    const inverterCard = screen.getByText('Inversor', { selector: 'div' }).parentElement;
    expect(inverterCard).toHaveTextContent('1 porta de bateria');
  });

  it('shows the total battery port count on the inverter card across multiple inverters', () => {
    setup({
      solution: { ...fakeSolution, batteryQty: 8, inverterQty: 2, batteryPortsUsed: 1 },
    });

    const inverterCard = screen.getByText('Inversor', { selector: 'div' }).parentElement;
    expect(inverterCard).toHaveTextContent('2 portas de bateria');
  });

  it('shows Nominal/Pico/Energia metrics from nominalW/peakW/dailyKwh on the Resumo tab, while Backup is enabled', () => {
    setup({
      nominalW: 3000,
      peakW: 5500,
      dailyKwh: 12.34,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'] },
    });
    const resumo = screen.getByRole('group', { name: 'Resumo do sistema' });
    expect(within(resumo).getByText('3.00')).toBeInTheDocument();
    expect(within(resumo).getByText('5.50')).toBeInTheDocument();
    expect(within(resumo).getByText('12.34')).toBeInTheDocument();
    expect(within(resumo).getByText('kWh/dia')).toBeInTheDocument();
  });

  it('zeroes out the Resumo Nominal/Pico/Energia cards once Backup is disabled, even with loads still registered', () => {
    setup({ nominalW: 3000, peakW: 5500, dailyKwh: 12.34 });
    const resumo = screen.getByRole('group', { name: 'Resumo do sistema' });
    expect(within(resumo).getAllByText('0.00')).toHaveLength(3);
    expect(within(resumo).queryByText('3.00')).not.toBeInTheDocument();
    expect(within(resumo).queryByText('5.50')).not.toBeInTheDocument();
    expect(within(resumo).queryByText('12.34')).not.toBeInTheDocument();
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
            pontaEnergyWh: 8000,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 1.2,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
      },
    });
    // Power floor is a plain max(), applied to both Nominal and Pico the same
    // way, so both cards land on the same 6.00 value; energy uses just
    // pontaEnergyWh + intermediateEnergyWh, adjusted by the same 90%
    // efficiency used in the Tarifa Branca panel (8.89 kWh/dia) since
    // Backup isn't selected, not added on top of the loads.
    const resumo = screen.getByRole('group', { name: 'Resumo do sistema' });
    expect(within(resumo).getAllByText('6.00')).toHaveLength(2);
    expect(within(resumo).getByText('8.89')).toBeInTheDocument();
    expect(within(resumo).queryByText('3.00')).not.toBeInTheDocument();
  });

  it('adds the backup reserve on top of the Tarifa Branca energy floor when Backup is also selected', () => {
    setup({
      nominalW: 1000,
      peakW: 2000,
      dailyKwh: 3,
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['backup', 'white_tariff'],
        whiteTariff: {
            requiredPowerW: 500,
            pontaEnergyWh: 8000,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 1.2,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
      },
    });
    // Power floor (500W) is below the loads (1000W), so the loads value wins.
    const resumo = screen.getByRole('group', { name: 'Resumo do sistema' });
    expect(within(resumo).getByText('1.00')).toBeInTheDocument();
    // Energy: (pontaEnergyWh + intermediateEnergyWh) / 90% + base
    // (8000 / 0.9 + 3000 = 11.89 kWh/dia).
    expect(within(resumo).getByText('11.89')).toBeInTheDocument();
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
    // Displayed as absolute headroom instead: peak +1000W = +1.00 kVA; energy +240Wh = +0.24 kWh.
    setup({
      solution: fakeSolution,
      nominalW: 3000,
      peakW: 6000,
      dailyKwh: 3,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'] },
    });

    const marginCard = screen.getByText('Margem sobre a necessidade do cliente').closest('.rounded-lg') as HTMLElement;
    const energyRow = within(marginCard).getByText('Energia', { selector: 'span' }).closest('.px-2');
    expect(energyRow).toHaveTextContent('Fator decisivo');
    expect(energyRow).toHaveTextContent('+0.24 kWh');

    const peakRow = within(marginCard).getByText('Potência máxima').closest('.px-2');
    expect(peakRow).not.toHaveTextContent('Fator decisivo');
    expect(peakRow).toHaveTextContent('+1.00 kVA');
  });

  it('flags a margin as "Insuficiente" instead of "Fator decisivo" when the solution falls short', () => {
    // A peak target the solution can't meet (8000 > the 7000 the inverter provides) forces a negative margin.
    setup({
      solution: fakeSolution,
      nominalW: 3000,
      peakW: 8000,
      dailyKwh: 3,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'] },
    });

    const marginCard = screen.getByText('Margem sobre a necessidade do cliente').closest('.rounded-lg') as HTMLElement;
    const peakRow = within(marginCard).getByText('Potência máxima').closest('.px-2');
    expect(peakRow).toHaveTextContent('Insuficiente');
    expect(peakRow).not.toHaveTextContent('Fator decisivo');
  });
});

describe('SizingTab: summary drawer defaults to Resumo when opened', () => {
  it('resets to Resumo when the mobile summary drawer opens, even after a solution jumped it to Solução', () => {
    const { rerender, props } = setup({ solution: fakeSolution, canCalculate: true, summaryDrawerOpen: false });
    expect(screen.getByRole('tab', { name: 'Solução' })).toHaveAttribute('aria-selected', 'true');

    // Rerendering wrapped in the same <Shell> as renderWithShell (see its own
    // rerender note further down this file) — without it, the tree's root
    // type changes and React remounts everything from scratch, losing both
    // SizingTab's internal summaryTab state and the portal target Shell
    // provides, which is exactly what this test needs to stay intact to
    // prove the reset happens on an actual prop change, not a fresh mount.
    rerender(
      <Shell>
        <NextIntlClientProvider locale="pt" messages={ptMessages}>
          <SizingTab {...(props as Parameters<typeof SizingTab>[0])} summaryDrawerOpen />
        </NextIntlClientProvider>
      </Shell>
    );

    expect(screen.getByRole('tab', { name: 'Resumo' })).toHaveAttribute('aria-selected', 'true');
  });

  it('leaves Solução selected when summaryDrawerOpen stays false (desktop never toggles it)', () => {
    setup({ solution: fakeSolution, canCalculate: true, summaryDrawerOpen: false });
    expect(screen.getByRole('tab', { name: 'Solução' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('SizingTab: rede e configuração', () => {
  it('selects a grid type', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));
    const radiogroup = screen.getByRole('radiogroup', { name: 'Tipo de rede' });
    fireEvent.click(within(radiogroup).getByRole('radio', { name: 'Monofásico220V' }));
    expect(props.setGridType).toHaveBeenCalledWith('singlePhase_220');
  });

  it('clicking the LV tab requests a topology switch (battery visibility follows the topology prop from the parent)', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));
    fireEvent.click(screen.getByRole('button', { name: /^LV/ }));
    expect(props.setTopology).toHaveBeenCalledWith('LowVoltage');
  });

  it('selects a battery already matching the active topology without re-requesting it', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, topology: 'LowVoltage' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

    fireEvent.click(screen.getByText('TP-LD53'));

    expect(props.setBatteryModel).toHaveBeenCalledWith('TP-LD53');
    expect(props.setTopology).not.toHaveBeenCalled();
  });

  it('selects a second battery of the same topology as the secondary comparison model', () => {
    const { props } = setup({
      batteryCatalog: [battery, battery2, lvBattery],
      residentialOptions: { ...emptyResidentialOptions, topology: 'HighVoltage', batteryModel: 'TP-HS3.6' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

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
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

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
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

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
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

    fireEvent.click(screen.getByText('TP-HS9.0'));

    expect(props.setBatteryModel).not.toHaveBeenCalled();
    expect(props.setSecondaryBatteryModel).not.toHaveBeenCalled();
  });

  it('excludes an expansion/Slave battery from the picker and its HV/LV count badge', () => {
    const master: BatteryCatalogOption = { ...battery, model: 'T58 V2 Master', expansionModel: 'T58 Slave' };
    const slave: BatteryCatalogOption = { ...battery, id: 'b-slave', model: 'T58 Slave' };
    setup({ batteryCatalog: [master, slave, lvBattery] });
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

    expect(screen.getByText('T58 V2 Master')).toBeInTheDocument();
    expect(screen.queryByText('T58 Slave')).not.toBeInTheDocument();
    // Only the Master counts toward HV — the Slave doesn't inflate the badge.
    expect(screen.getByRole('button', { name: /^HV/ })).toHaveTextContent('1');
  });

  it('selects an inverter model, and falls back to "Todos"', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, inverterModel: 'X1-Hybrid-5.0kW-G4' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));

    fireEvent.click(screen.getByText('Todos'));
    expect(props.setInverterModel).toHaveBeenCalledWith(null);
  });

  it('restricts inverter choices to availableInverterModelsByTopology when given', () => {
    setup({
      availableInverterModelsByTopology: { HV: new Set(['some-other-model']), LV: new Set(['some-other-model']) },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));
    expect(screen.queryByText('X1-Hybrid-5.0kW-G4')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum inversor HV com solução aprovada para este tipo de rede.')).toBeInTheDocument();
  });

  it('defaults the minimum-parallel-inverters control to "Automático"', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));

    const group = screen.getByRole('tablist', { name: 'Mínimo de inversores em paralelo' });
    expect(within(group).getByRole('tab', { name: 'Automático' })).toHaveAttribute('aria-selected', 'true');
    expect(within(group).getByRole('tab', { name: '2+' })).toHaveAttribute('aria-selected', 'false');
  });

  it('picks a minimum number of parallel inverters', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));

    const group = screen.getByRole('tablist', { name: 'Mínimo de inversores em paralelo' });
    fireEvent.click(within(group).getByRole('tab', { name: '2+' }));
    expect(props.setMinInverterQty).toHaveBeenCalledWith(2);
  });

  it('reflects an already-chosen minimum back onto its own control', () => {
    setup({ residentialOptions: { ...emptyResidentialOptions, minInverterQty: 3 } });
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));

    const group = screen.getByRole('tablist', { name: 'Mínimo de inversores em paralelo' });
    expect(within(group).getByRole('tab', { name: '3+' })).toHaveAttribute('aria-selected', 'true');
    expect(within(group).getByRole('tab', { name: 'Automático' })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('SizingTab: funcionalidades desejadas', () => {
  it('toggling Backup Total reveals its photo upload field once the parent reflects the new selection', () => {
    const { rerender, props } = setup();

    // The tab's accessible name includes its tooltip copy too, so match loosely.
    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));
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
    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));
    expect(screen.getByText('Foto do disjuntor geral')).toBeInTheDocument();
  });

  it('shows a warning icon on Backup once enabled with no loads registered', () => {
    setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'], loads: [] },
    });
    expect(screen.getByRole('tab', { name: 'Backup' }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('shows an inline alert in the open Backup tab when no loads were added', () => {
    setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'], loads: [] },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Nenhuma carga adicionada ao projeto');
    expect(screen.getByRole('alert')).toHaveTextContent('Adicione ao menos uma carga abaixo para dimensionar o backup.');
  });

  it('hides the Backup warning icon once at least one load is registered', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['backup'],
        loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }],
      },
    });
    expect(screen.getByRole('tab', { name: 'Backup' }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('shows a warning icon on Backup Total once enabled with the backup notice unacknowledged', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: false,
      },
    });
    expect(screen.getByRole('tab', { name: /^Backup Total/ }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('hides the Backup Total warning icon once the backup notice is acknowledged', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: true,
      },
    });
    expect(screen.getByRole('tab', { name: /^Backup Total/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('never shows a warning icon on a disabled feature tab', () => {
    setup();
    expect(screen.getByRole('tab', { name: /^Backup Total/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
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

  it('does not show a warning icon on Gerador when power/ATS/phases-voltage are all fine', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        gridType: 'singlePhase_220',
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 9000, photoUrl: null, ownAtsAcknowledged: true },
      },
    });
    expect(screen.getByRole('tab', { name: /^Gerador/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('shows a warning icon on Gerador when the own-ATS notice is unacknowledged', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        gridType: 'singlePhase_220',
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 6000, photoUrl: null, ownAtsAcknowledged: false },
      },
    });
    expect(screen.getByRole('tab', { name: /^Gerador/ }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
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
    expect(screen.getByRole('tab', { name: /^Backup Total/ }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
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
    expect(screen.getByRole('tab', { name: /^Backup Total/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('does not show a warning icon for the inverter-support check before Configurações narrows anything down', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: true,
      },
    });
    expect(screen.getByRole('tab', { name: /^Backup Total/ }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('switches tabs without changing the enabled features, and shows only the active tab panel', () => {
    setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] } });

    // The tab's accessible name includes its tooltip copy too, so match loosely.
    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));
    expect(screen.getByText('Foto do disjuntor geral')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Tarifa Branca/ }));

    // Switching tabs is just navigation: it must not toggle any feature.
    expect(screen.queryByText('Foto do disjuntor geral')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Tarifa Branca/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Backup Total/ })).toHaveAttribute('aria-selected', 'false');
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
      expect.objectContaining({ requiredPowerW: 0, pontaEnergyWh: 0, intermediateEnergyWh: 0 })
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

  it('enabling Gerador from scratch seeds its default config', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));
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

  it('seeds Gerador phases/voltage matching the grid type already chosen in Configurações', () => {
    const { props } = setup({
      residentialOptions: { ...emptyResidentialOptions, gridType: 'splitPhase_220' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 2, voltageV: 220 }));
  });

  it('falls back to monofásico 220V when no grid type has been chosen yet', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, gridType: null } });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 1, voltageV: 220 }));
  });
});

describe('SizingTab: Resumo panel warning bubbling', () => {
  it('turns the feature icon red in the Resumo panel when the feature has a pending issue, without swapping it for a triangle', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: false,
      },
    });
    const row = screen.getByRole('button', { name: /^Backup Total/ });
    const icon = row.querySelector('svg');
    expect(icon).toHaveClass('lucide-cable');
    expect(icon).toHaveClass('text-destructive');
  });

  it('does not turn the feature icon red in the Resumo panel once the pending issue is acknowledged', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_ats'],
        atsBackupAcknowledged: true,
      },
    });
    const row = screen.getByRole('button', { name: /^Backup Total/ });
    const icon = row.querySelector('svg');
    expect(icon).toHaveClass('lucide-cable');
    expect(icon).not.toHaveClass('text-destructive');
  });

  it('shows a warning icon on the Configurações main tab when no inverter is available for the current grid/battery combo', () => {
    setup({ availableInverterModels: new Set() });
    expect(screen.getByRole('tab', { name: 'Rede e inversor' }).querySelector('svg.lucide-triangle-alert')).toBeInTheDocument();
  });

  it('does not show a warning icon on Configurações when there is at least one available inverter', () => {
    setup({ availableInverterModels: new Set(['X1-Hybrid-5.0kW-G4']) });
    expect(screen.getByRole('tab', { name: 'Rede e inversor' }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
  });

  it('does not show a warning icon on Configurações before any grid/battery combo has narrowed the inverters down', () => {
    setup({ availableInverterModels: null });
    expect(screen.getByRole('tab', { name: 'Rede e inversor' }).querySelector('svg.lucide-triangle-alert')).not.toBeInTheDocument();
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
    expect(screen.getByRole('tab', { name: 'Baterias' })).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the clicked feature as the active item', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Backup(?!\s*Total)/ }));
    expect(screen.getByRole('tab', { name: 'Backup' })).toHaveAttribute('aria-selected', 'true');
  });

  it('re-clicking an already-active tab (Resumo, Backup) is a no-op', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: /^Resumo/ }));
    expect(screen.getByRole('tab', { name: /^Resumo/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));
    expect(screen.getByRole('tab', { name: 'Backup' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));
    expect(screen.getByRole('tab', { name: 'Backup' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the external_generator, white_tariff and pv summary values', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_generator', 'white_tariff', 'pv'],
        generator: { voltageV: 220, apparentPowerVA: 5000, phases: 1, photoUrl: null },
        whiteTariff: {
            requiredPowerW: 0,
            pontaEnergyWh: 0,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 1.35,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 1,
          },
      },
    });
    expect(screen.getByText('Ativado · 5.0 kVA')).toBeInTheDocument();
    expect(screen.getByText('Ativado · R$ 1.35/0.95/1 por kWh')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fotovoltaico/ })).toHaveTextContent('Ativado');
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

  it('updates white tariff power, energies and tariffs', () => {
    const props = enable(/^Tarifa Branca/, 'white_tariff');
    fireEvent.change(screen.getByLabelText('Potência máxima nos horários caros (kW)'), { target: { value: '3' } });
    // 22 kWh/mês ÷ 22 dias úteis/mês = 1000 Wh/dia, a clean value to assert on.
    fireEvent.change(screen.getByLabelText('Ponta · Energia (kWh/mês)'), { target: { value: '22' } });
    fireEvent.change(screen.getByLabelText('Intermediária · Energia (kWh/mês)'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Ponta · Tarifa (R$/kWh)'), { target: { value: '1.35' } });
    fireEvent.change(screen.getByLabelText('Intermediária · Tarifa (R$/kWh)'), { target: { value: '1.05' } });
    fireEvent.change(screen.getByLabelText('Fora ponta · Tarifa (R$/kWh)'), { target: { value: '0.85' } });

    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ requiredPowerW: 3000 }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ pontaEnergyWh: 1000 }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ intermediateEnergyWh: 500 }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ pontaTariffPerKwh: 1.35 }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ intermediateTariffPerKwh: 1.05 }));
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({ foraPontaTariffPerKwh: 0.85 }));
  });

  it('derives tariff-window energy and power from the bill in basic mode', () => {
    const props = enable(/^Tarifa Branca/, 'white_tariff', {
      whiteTariff: {
        inputMode: 'basic', totalMonthlyConsumptionKwh: 0,
        pontaConsumptionPercent: 20, intermediateConsumptionPercent: 10,
        businessDaysPerMonth: 22, pontaWindowHours: 3, intermediateWindowHours: 2,
        requiredPowerW: 0, pontaEnergyWh: 0, intermediateEnergyWh: 0,
        pontaTariffPerKwh: 0,
        intermediateTariffPerKwh: 0, foraPontaTariffPerKwh: 0,
      },
    });
    fireEvent.change(screen.getByLabelText('Consumo total mensal (kWh/mês)'), { target: { value: '220' } });
    expect(props.setWhiteTariffConfig).toHaveBeenCalledWith(expect.objectContaining({
      totalMonthlyConsumptionKwh: 220,
      pontaEnergyWh: 2000,
      intermediateEnergyWh: 1000,
      requiredPowerW: 667,
    }));
  });

  it('shows the derived ponta and intermediária spreads below the tariff inputs', () => {
    enable(/^Tarifa Branca/, 'white_tariff', {
      whiteTariff: {
            requiredPowerW: 0,
            pontaEnergyWh: 0,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 1.35,
            intermediateTariffPerKwh: 1.1,
            foraPontaTariffPerKwh: 0.85,
          },
    });
    expect(screen.getByText(/Diferença para fora ponta: R\$ 0.50\/kWh/)).toBeInTheDocument();
    expect(screen.getByText(/Diferença para fora ponta: R\$ 0.25\/kWh/)).toBeInTheDocument();
  });

  it('shows the white tariff ponta energy field converted to kWh/mês, with the equivalent kWh/dia noted below', () => {
    enable(/^Tarifa Branca/, 'white_tariff', {
      whiteTariff: {
            requiredPowerW: 0,
            pontaEnergyWh: 1000,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 0,
            intermediateTariffPerKwh: 0,
            foraPontaTariffPerKwh: 0,
          },
    });
    expect(screen.getByLabelText('Ponta · Energia (kWh/mês)')).toHaveValue(22);
    expect(screen.getByText('1.00 kWh/dia')).toBeInTheDocument();
  });

  it('keeps showing exactly what the user typed, instead of reformatting it into a lossy decimal on every keystroke', () => {
    // pontaEnergyWh (Wh/dia) and the displayed kWh/mês only round-trip
    // cleanly by coincidence (÷22 rarely lands on a round number) — the field
    // must echo the typed text, not a value recomputed from the rounded Wh
    // storage, or "100" would flicker into "99.99" as soon as it's typed.
    const { props, rerender } = setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['white_tariff'] },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Tarifa Branca/ }));

    function rerenderWithLatestWhiteTariff() {
      const latest = (props.setWhiteTariffConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] ?? null;
      rerender(
        <Shell>
          <NextIntlClientProvider locale="pt" messages={ptMessages}>
            <SizingTab
              {...(props as Parameters<typeof SizingTab>[0])}
              residentialOptions={{ ...emptyResidentialOptions, desiredFeatures: ['white_tariff'], whiteTariff: latest }}
            />
          </NextIntlClientProvider>
        </Shell>
      );
    }

    fireEvent.change(screen.getByLabelText('Ponta · Energia (kWh/mês)'), { target: { value: '1' } });
    rerenderWithLatestWhiteTariff();
    expect(screen.getByLabelText('Ponta · Energia (kWh/mês)')).toHaveValue(1);

    fireEvent.change(screen.getByLabelText('Ponta · Energia (kWh/mês)'), { target: { value: '10' } });
    rerenderWithLatestWhiteTariff();
    expect(screen.getByLabelText('Ponta · Energia (kWh/mês)')).toHaveValue(10);

    fireEvent.change(screen.getByLabelText('Ponta · Energia (kWh/mês)'), { target: { value: '100' } });
    rerenderWithLatestWhiteTariff();
    expect(screen.getByLabelText('Ponta · Energia (kWh/mês)')).toHaveValue(100);
  });

  it('updates microgrid power and phases (phase change auto-picks a valid voltage)', () => {
    const props = enable(/^Microrrede/, 'microgrid');
    fireEvent.change(screen.getByLabelText('Potência nominal AC (kW)'), { target: { value: '4' } });
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

  it('summarizes the microgrid limits with the fixed 20% margin', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['microgrid'],
        microgrid: {
          voltageV: 220,
          onGridPhases: 3,
          onGridApparentPowerVA: 5000,
          isFundamentalRequirement: true,
          photoUrl: null,
          powerNoticeAcknowledged: false,
        },
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Microrrede/ }));
    expect(screen.getByText('5.00 kW')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('mín. 6.00 kW')).toBeInTheDocument();
    expect(screen.getByText('mín. 2.00 kW/fase')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('updates generator power and phases (phase change auto-picks a valid voltage)', () => {
    const props = enable(/^Gerador/, 'external_generator');
    fireEvent.change(screen.getByLabelText('Potência nominal (kVA)'), { target: { value: '5' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fases do gerador' })).getByRole('radio', { name: 'Trifásico' }));

    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ apparentPowerVA: 5000 }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 3, voltageV: 220 }));
  });

  it('summarizes generator limits for loads and battery charging', () => {
    setup({
      peakW: 5500,
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 10000, powerFactor: 0.8, safetyMarginW: 1000, photoUrl: null, ownAtsAcknowledged: false },
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));
    expect(screen.getByText(/alimenta as cargas e usa a potência restante para carregar as baterias/i)).toBeInTheDocument();
    expect(screen.getAllByText('8.00 kW').length).toBeGreaterThan(0);
    expect(screen.getByText('2.50 kW')).toBeInTheDocument();
    expect(screen.getByText('8.1 kVA')).toBeInTheDocument();
    expect(screen.getByText('Dentro do limite')).toBeInTheDocument();
  });

  it('updates generator voltage when trifásico is already selected', () => {
    const props = enable(/^Gerador/, 'external_generator', {
      generator: { voltageV: 220, phases: 3, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: false },
    });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tensão do gerador' })).getByRole('radio', { name: '380V' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ voltageV: 380 }));
  });

  it('shows only 220V as a voltage option for monofásico', () => {
    enable(/^Gerador/, 'external_generator');
    const voltageGroup = screen.getByRole('radiogroup', { name: 'Tensão do gerador' });
    expect(within(voltageGroup).getByRole('radio', { name: '220V' })).toBeInTheDocument();
    expect(within(voltageGroup).queryByRole('radio', { name: '380V' })).not.toBeInTheDocument();
  });

  it('shows only 110/220V as a voltage option for bifásico', () => {
    enable(/^Gerador/, 'external_generator', {
      generator: { voltageV: 220, phases: 2, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: false },
    });
    const voltageGroup = screen.getByRole('radiogroup', { name: 'Tensão do gerador' });
    expect(within(voltageGroup).getByRole('radio', { name: '110/220V' })).toBeInTheDocument();
    expect(within(voltageGroup).queryByRole('radio', { name: '220V' })).not.toBeInTheDocument();
  });

  it('shows both 220V and 380V as voltage options for trifásico', () => {
    enable(/^Gerador/, 'external_generator', {
      generator: { voltageV: 220, phases: 3, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: false },
    });
    const voltageGroup = screen.getByRole('radiogroup', { name: 'Tensão do gerador' });
    expect(within(voltageGroup).getByRole('radio', { name: '220V' })).toBeInTheDocument();
    expect(within(voltageGroup).getByRole('radio', { name: '380V' })).toBeInTheDocument();
  });

  it('resets voltage to 220 when switching from Trifásico 380V to Monofásico', () => {
    const props = enable(/^Gerador/, 'external_generator', {
      generator: { voltageV: 380, phases: 3, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: false },
    });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fases do gerador' })).getByRole('radio', { name: 'Monofásico' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ phases: 1, voltageV: 220 }));
  });

  it('warns when the generator phases/voltage do not match the configured grid type, stating the correct selection', () => {
    enable(/^Gerador/, 'external_generator', { gridType: 'threePhase_220' });
    expect(
      screen.getByText(
        /A tensão\/fases selecionadas \(Monofásico 220V\) são incompatíveis com o tipo de rede configurado \(Trifásico 220V\)\. Selecione Trifásico e 220V/
      )
    ).toBeInTheDocument();
  });

  it('highlights the correct phase option on the picker button when the generator phase is incompatible', () => {
    enable(/^Gerador/, 'external_generator', { gridType: 'threePhase_220' });
    const phaseOption = within(screen.getByRole('radiogroup', { name: 'Fases do gerador' })).getByRole('radio', {
      name: 'Trifásico',
    });
    expect(phaseOption).toHaveClass('ring-emerald-500/70');
  });

  it('highlights the correct voltage option on the picker button when only the voltage is incompatible', () => {
    enable(/^Gerador/, 'external_generator', {
      gridType: 'threePhase_380',
      generator: { voltageV: 220, phases: 3, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: false },
    });
    const voltageOption = within(screen.getByRole('radiogroup', { name: 'Tensão do gerador' })).getByRole('radio', {
      name: '380V',
    });
    expect(voltageOption).toHaveClass('ring-emerald-500/70');
  });

  it('does not highlight any phase/voltage option when the generator selection is already compatible', () => {
    enable(/^Gerador/, 'external_generator', { gridType: 'singlePhase_220' });
    const radios = [
      ...within(screen.getByRole('radiogroup', { name: 'Fases do gerador' })).getAllByRole('radio'),
      ...within(screen.getByRole('radiogroup', { name: 'Tensão do gerador' })).getAllByRole('radio'),
    ];
    for (const radio of radios) {
      expect(radio).not.toHaveClass('ring-emerald-500/70');
    }
  });

  it('does not warn about generator phases/voltage when they exactly match the configured grid type', () => {
    enable(/^Gerador/, 'external_generator', { gridType: 'singlePhase_220' });
    expect(screen.queryByText(/são incompatíveis com o tipo de rede configurado/)).not.toBeInTheDocument();
  });

  it('does not warn when no grid type is configured yet', () => {
    enable(/^Gerador/, 'external_generator', { gridType: null });
    expect(screen.queryByText(/são incompatíveis com o tipo de rede configurado/)).not.toBeInTheDocument();
  });

  it('allows the microgrid exception: 380V trifásico or 220V bifásico network with a 220V monofásico ongrid inverter', () => {
    enable(/^Microrrede/, 'microgrid', { gridType: 'threePhase_380' });
    expect(screen.queryByText(/são incompatíveis com o tipo de rede configurado/)).not.toBeInTheDocument();
  });

  it('still warns for microgrid when the mismatch is not the documented exception, stating the correct selection', () => {
    enable(/^Microrrede/, 'microgrid', {
      gridType: 'singlePhase_220',
      microgrid: { voltageV: 220, onGridPhases: 3, onGridApparentPowerVA: 0, isFundamentalRequirement: true, photoUrl: null },
    });
    expect(
      screen.getByText(/são incompatíveis com o tipo de rede configurado \(Monofásico 220V\)\. Selecione Monofásico e 220V/)
    ).toBeInTheDocument();
    // No documented exception applies to a Monofásico network, so it shouldn't be mentioned.
    expect(screen.queryByText(/aceito como exceção/)).not.toBeInTheDocument();
  });

  it('mentions the documented microgrid exception when the network would allow it, alongside the exact match', () => {
    enable(/^Microrrede/, 'microgrid', {
      gridType: 'threePhase_380',
      microgrid: { voltageV: 220, onGridPhases: 3, onGridApparentPowerVA: 0, isFundamentalRequirement: true, photoUrl: null },
    });
    expect(
      screen.getByText(/Selecione Trifásico e 380V \(ou Monofásico 220V, aceito como exceção para microrrede\)/)
    ).toBeInTheDocument();
  });

  it('does not highlight the alternate exception phase when the current phase is already valid and only the voltage is off', () => {
    // threePhase_380 accepts both Trifásico (network match) and Monofásico 220V
    // (documented exception). With Trifásico already selected, only the
    // voltage is wrong — recommending Monofásico too would be a confusing
    // detour, so no phase option should be highlighted, only the voltage.
    enable(/^Microrrede/, 'microgrid', {
      gridType: 'threePhase_380',
      microgrid: { voltageV: 220, onGridPhases: 3, onGridApparentPowerVA: 0, isFundamentalRequirement: true, photoUrl: null },
    });
    const phaseRadios = within(screen.getByRole('radiogroup', { name: 'Fases do sistema ongrid' })).getAllByRole('radio');
    for (const radio of phaseRadios) {
      expect(radio).not.toHaveClass('ring-emerald-500/70');
    }
    const voltageOption = within(screen.getByRole('radiogroup', { name: 'Tensão do sistema ongrid' })).getByRole('radio', {
      name: '380V',
    });
    expect(voltageOption).toHaveClass('ring-emerald-500/70');
  });

  it('highlights both the network phase and the documented 1-phase exception for microgrid, but not the current selection', () => {
    enable(/^Microrrede/, 'microgrid', {
      gridType: 'threePhase_380',
      microgrid: { voltageV: 220, onGridPhases: 3, onGridApparentPowerVA: 0, isFundamentalRequirement: true, photoUrl: null },
    });
    const phaseGroup = screen.getByRole('radiogroup', { name: 'Fases do sistema ongrid' });
    const threePhaseOption = within(phaseGroup).getByRole('radio', { name: 'Trifásico' });
    // Trifásico is already the active selection (compatible), so it's not marked "recommended".
    expect(threePhaseOption).not.toHaveClass('ring-emerald-500/70');
  });

  it('shows how many registered inverters support Gerador when the tab is enabled', () => {
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

    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));

    expect(
      screen.getByLabelText('1 de 2 inversores cadastrados no catálogo suportam Gerador.')
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
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));
    expect(
      screen.getByLabelText('1 de 1 inversores das opções selecionadas em Configurações suportam Gerador.')
    ).toBeInTheDocument();
  });

  it('shows the own-ATS acknowledgement checkbox for Gerador, unchecked by default', () => {
    enable(/^Gerador/, 'external_generator');
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
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));
    expect(screen.getByText(/O gerador fornece aproximadamente 1.60 kW/)).toBeInTheDocument();
  });

  it('does not warn when the generator power covers the loads peak power', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 9000, photoUrl: null, ownAtsAcknowledged: false },
      },
      peakW: 5500,
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));
    expect(screen.queryByText(/O gerador fornece aproximadamente/)).not.toBeInTheDocument();
  });

  it('checks the own-ATS acknowledgement checkbox', () => {
    const props = enable(/^Gerador/, 'external_generator');
    fireEvent.click(screen.getByRole('checkbox', { name: /Ciente/ }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(expect.objectContaining({ ownAtsAcknowledged: true }));
  });

  it('renders the own-ATS field in a warning style until acknowledged, then in a neutral style', () => {
    enable(/^Gerador/, 'external_generator');
    const unacknowledgedField = screen.getByRole('checkbox', { name: /Ciente/ }).closest('label') as HTMLElement;
    expect(unacknowledgedField.className).toContain('amber');

    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 0, photoUrl: null, ownAtsAcknowledged: true },
      },
    });
    fireEvent.click(screen.getAllByRole('tab', { name: /^Gerador/ })[1]);
    const acknowledgedField = screen.getByRole('checkbox', { name: /Confirmado/ }).closest('label') as HTMLElement;
    expect(acknowledgedField.className).not.toContain('amber');
  });

  it('shows how many registered inverters support Backup Total when the tab is enabled', () => {
    const atsInverter: InverterCatalogOption = { ...inverter, id: 'i2', model: 'X1-Hybrid-7.5-ATS', flags: ['external_ats'] };
    setup({
      inverterCatalog: [inverter, atsInverter],
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));
    expect(
      screen.getByLabelText('1 de 2 inversores cadastrados no catálogo suportam Backup Total.')
    ).toBeInTheDocument();
  });

  it('shows the ATS backup-acknowledgement field in a warning style until checked, then in a neutral style', () => {
    enable(/^Backup Total/, 'external_ats');
    expect(screen.getByText('Um QTA deve ser usado para backup total.')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox).not.toBeChecked();
    const unacknowledgedField = checkbox.closest('label') as HTMLElement;
    expect(unacknowledgedField.className).toContain('amber');

    setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'], atsBackupAcknowledged: true },
    });
    fireEvent.click(screen.getAllByRole('tab', { name: /^Backup Total/ })[1]);
    expect(screen.getByText('Confirmado: um QTA é usado para backup total.')).toBeInTheDocument();
    const acknowledgedCheckbox = screen.getAllByRole('checkbox')[1] as HTMLInputElement;
    expect(acknowledgedCheckbox).toBeChecked();
    expect((acknowledgedCheckbox.closest('label') as HTMLElement).className).not.toContain('amber');
  });

  it('checks the ATS backup-acknowledgement checkbox', () => {
    const props = enable(/^Backup Total/, 'external_ats');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(props.setAtsBackupAcknowledged).toHaveBeenCalledWith(true);
  });

  it('uploads a photo for a feature and surfaces an upload error', async () => {
    const onUploadPhoto = vi.fn().mockRejectedValueOnce(new Error('boom'));
    setup({
      onUploadFeaturePhoto: onUploadPhoto,
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));

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
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));

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
    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));

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
    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));

    const input = document.getElementById('photo-upload-ats') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });

    expect(onUploadPhoto).not.toHaveBeenCalled();
  });

  it('shows Trocar foto/Remover for an already-attached photo, and clears it via Remover', () => {
    const { props } = setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'], atsPhotoUrl: 'https://cdn.example.com/x.png' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));

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
    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Habilitado' }));
    expect(props.setGeneratorConfig).toHaveBeenCalledWith(null);
  });
});

describe('SizingTab: feature tab pending-issue indicator', () => {
  it('uses icons and status tags without extra alert styling', () => {
    setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['external_ats'] } });

    const atsTab = screen.getByRole('tab', { name: /^Backup Total/ });
    expect(atsTab.querySelector('.lucide-triangle-alert')).toBeInTheDocument();
    expect(atsTab.className).not.toContain('tab-alert');
  });

  it('does not add the alert styling to a tab with no pending issue', () => {
    setup({ residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['backup'], loads: [{ id: 'l1', name: 'Chuveiro', powerW: 5500, hoursPerDay: 1, qty: 1, ipInRatio: 1 }] } });

    const backupTab = screen.getByRole('tab', { name: 'Backup' });
    expect(backupTab.className).not.toContain('tab-alert');
  });
});

describe('SizingTab: pv (Fotovoltaico) fields', () => {
  function enablePv(extraOptions: Record<string, unknown> = {}) {
    const { props } = setup({
      residentialOptions: { ...emptyResidentialOptions, desiredFeatures: ['pv'], ...extraOptions },
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Fotovoltaico/ }));
    return props;
  }

  it('updates monthly consumption and HSP', () => {
    const props = enablePv();
    fireEvent.change(screen.getByLabelText('Consumo médio mensal (kWh)'), { target: { value: '450' } });
    fireEvent.change(screen.getByLabelText('HSP da instalação (h/dia)'), { target: { value: '4.5' } });

    expect(props.setPvConfig).toHaveBeenCalledWith(expect.objectContaining({ monthlyConsumptionKwh: 450 }));
    expect(props.setPvConfig).toHaveBeenCalledWith(expect.objectContaining({ hsp: 4.5 }));
  });

  it('no longer shows an energy cost field — pricing lives in Tarifa Branca now', () => {
    enablePv({ pv: { monthlyConsumptionKwh: 450, hsp: 4.5 } });
    expect(screen.queryByLabelText(/Custo de energia/)).not.toBeInTheDocument();
  });

  it('shows a warning while monthly consumption or HSP is missing', () => {
    enablePv();
    expect(screen.getByText('Informe o consumo médio mensal e o HSP para calcular o FV.')).toBeInTheDocument();
  });

  it('hides the warning once both monthly consumption and HSP are filled', () => {
    enablePv({ pv: { monthlyConsumptionKwh: 450, hsp: 4.5 } });
    expect(screen.queryByText('Informe o consumo médio mensal e o HSP para calcular o FV.')).not.toBeInTheDocument();
  });

  it('disabling an already-enabled pv feature clears its config', () => {
    const props = enablePv({ pv: { monthlyConsumptionKwh: 450, hsp: 4.5 } });
    fireEvent.click(screen.getByRole('button', { name: 'Habilitado' }));
    expect(props.setPvConfig).toHaveBeenCalledWith(null);
  });
});

describe('SizingTab: battery/inverter picker image and document previews', () => {
  it('opens an image preview modal when the battery thumbnail is clicked, and shows the in-stock badge', () => {
    const batteryWithImage: BatteryCatalogOption = { ...battery, imageUrl: 'https://cdn.example.com/battery.png' };
    setup({
      batteryCatalog: [batteryWithImage, lvBattery],
      userStockItems: [{ id: 's1', productType: 'battery', productModel: batteryWithImage.model } as UserStockItem],
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

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
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

    fireEvent.click(screen.getByRole('button', { name: 'Datasheet' }));
    expect(screen.getByRole('dialog', { name: 'Datasheet' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects a battery when no topology has been chosen yet', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

    fireEvent.click(screen.getByText(battery.model));
    expect(props.setTopology).toHaveBeenCalledWith('HighVoltage');
    expect(props.setBatteryModel).toHaveBeenCalledWith(battery.model);
  });

  it('selects a battery via keyboard (Enter/Space) same as a click', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Baterias' }));

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
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));

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
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));
    expect(screen.getByRole('dialog', { name: 'Manual' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects "Todos" and an inverter via keyboard (Enter/Space), and via a plain click', () => {
    const { props } = setup({ residentialOptions: { ...emptyResidentialOptions, inverterModel: inverter.model } });
    fireEvent.click(screen.getByRole('tab', { name: 'Rede e inversor' }));

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

describe('SizingTab: Solução tab PV recommendation', () => {
  it('shows the recommended PV power together with monthly generation', () => {
    setup({
      solution: { ...fakeSolution, pvPowerKw: 3, pvMonthlyGenerationKwh: 450 },
    });
    expect(screen.getByText('FV recomendado')).toBeInTheDocument();
    expect(screen.getByText('3.00 kWp')).toBeInTheDocument();
    expect(screen.getByText('· 450 kWh/mês estimados')).toBeInTheDocument();
  });

  it('omits generation when it is not present, without hiding the PV power itself', () => {
    setup({
      solution: { ...fakeSolution, pvPowerKw: 3, pvMonthlyGenerationKwh: null },
    });
    expect(screen.getByText('3.00 kWp')).toBeInTheDocument();
    expect(screen.queryByText(/kWh\/mês estimados/)).not.toBeInTheDocument();
  });

  it('hides the whole PV card when pvPowerKw is null', () => {
    setup({ solution: { ...fakeSolution, pvPowerKw: null } });
    expect(screen.queryByText('FV recomendado')).not.toBeInTheDocument();
  });
});

describe('SizingTab: Solução tab battery/Tarifa Branca savings', () => {
  it('highlights the combined SolaX savings, leading with the annual figure and the monthly one de-emphasized', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        whiteTariff: {
            requiredPowerW: 0,
            pontaEnergyWh: 0,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 1.3,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
      },
      solution: fakeSolution,
    });
    const heading = screen.getByText('Ganho com SolaX');
    const card = heading.closest('div')!.parentElement!;
    expect(card).toHaveClass('border-primary/30', 'bg-primary/5');
    const value = within(card).getByText(/\/ano$/);
    expect(value).toHaveClass('text-primary');
    expect(within(card).getByText(/\/mês/)).toBeInTheDocument();
  });

  it('shows the absolute sem/com SolaX costs when pv is also enabled with a consistent total consumption', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        whiteTariff: {
            requiredPowerW: 0,
            pontaEnergyWh: 4000,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 1.2,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
        pv: { monthlyConsumptionKwh: 400, hsp: 4.5 },
      },
      solution: fakeSolution,
    });
    expect(screen.getByText(/Sem SolaX/)).toBeInTheDocument();
    expect(screen.getByText(/Com SolaX/)).toBeInTheDocument();
  });

  it('omits the absolute sem/com SolaX costs when pv is not enabled', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        whiteTariff: {
            requiredPowerW: 0,
            pontaEnergyWh: 4000,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 1.2,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
      },
      solution: fakeSolution,
    });
    expect(screen.queryByText(/Sem SolaX/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Com SolaX/)).not.toBeInTheDocument();
  });

  it('folds the PV generation gain into the combined SolaX figure, noting the solar-only portion', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        whiteTariff: {
            requiredPowerW: 0,
            pontaEnergyWh: 0,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 1.3,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
      },
      // No ponta/intermediária need, so all PV generation is "excess", valued
      // at fora ponta over the full 30 days: 450 kWh/mês * R$0.80/kWh = R$360/mês, R$4.320/ano.
      solution: { ...fakeSolution, pvPowerKw: 3, pvMonthlyGenerationKwh: 450 },
    });
    const heading = screen.getByText('Ganho com SolaX');
    const card = heading.closest('div')!.parentElement!;
    expect(card).toHaveClass('border-primary/30', 'bg-primary/5');
    const paragraphs = Array.from(card.querySelectorAll('p')).map((p) => p.textContent);
    expect(paragraphs.some((text) => text?.includes('4.320,00') && text?.includes('/ano'))).toBe(true);
    expect(paragraphs.some((text) => text?.includes('360,00') && text?.includes('dias úteis/mês'))).toBe(true);
    expect(paragraphs.some((text) => text?.includes('dos quais') && text?.includes('360,00') && text?.includes('de geração solar'))).toBe(true);
  });

  it('caps the PV generation credited at ponta/intermediária tariffs by the battery daily capacity', () => {
    const whiteTariff = {
      requiredPowerW: 0,
      pontaEnergyWh: 4000,
      intermediateEnergyWh: 0,
      pontaTariffPerKwh: 1.3,
      intermediateTariffPerKwh: 0.95,
      foraPontaTariffPerKwh: 0.8,
    };
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        whiteTariff,
      },
      // Battery holds 3.24 kWh/dia (fakeSolution.availableEnergyWh); ponta needs 4 kWh/dia.
      // PV generates 15 kWh/dia (450/30), far more than the battery can store, so only
      // 3.24 kWh/dia gets credited at the ponta tariff, the rest at fora ponta.
      solution: { ...fakeSolution, pvPowerKw: 3, pvMonthlyGenerationKwh: 450 },
    });
    const estimate = calculateTariffSavings(whiteTariff, {
      availableEnergyWh: fakeSolution.availableEnergyWh,
      pvMonthlyGenerationKwh: 450,
      batteryRoundTripEfficiencyPercent: 95,
      inverterChargeEfficiencyPercent: 97,
      inverterDischargeEfficiencyPercent: 97,
      initialSohPercent: 100,
      annualSohLossPercent: 2,
    })!;

    const heading = screen.getByText('Ganho com SolaX');
    const card = heading.closest('div')!.parentElement!;
    const paragraphs = Array.from(card.querySelectorAll('p')).map((p) => p.textContent ?? '');
    const monthlyText = formatCurrencyBRL(estimate.monthlySavings);
    const pvText = formatCurrencyBRL(estimate.pvMonthlySavings);
    expect(paragraphs.some((text) => text.includes(monthlyText) && text.includes('dias úteis/mês'))).toBe(true);
    expect(paragraphs.some((text) => text.includes('dos quais') && text.includes(pvText) && text.includes('de geração solar'))).toBe(
      true
    );
  });

  it('omits the combined SolaX card entirely when white tariff is not configured', () => {
    setup({
      solution: { ...fakeSolution, pvPowerKw: 3, pvMonthlyGenerationKwh: 450 },
    });
    expect(screen.queryByText('Ganho com SolaX')).not.toBeInTheDocument();
  });

  it('shows no solar-portion note when the solution has no generation estimate', () => {
    setup({
      residentialOptions: {
        ...emptyResidentialOptions,
        whiteTariff: {
            requiredPowerW: 0,
            pontaEnergyWh: 0,
            intermediateEnergyWh: 0,
            pontaTariffPerKwh: 1.3,
            intermediateTariffPerKwh: 0.95,
            foraPontaTariffPerKwh: 0.8,
          },
      },
      solution: { ...fakeSolution, pvPowerKw: null, pvMonthlyGenerationKwh: null },
    });
    expect(screen.getByText('Ganho com SolaX')).toBeInTheDocument();
    expect(screen.queryByText(/de geração solar/)).not.toBeInTheDocument();
  });
});

describe('SizingTab: Solução tab accessories and microgrid variant choice', () => {
  it('renders accessories with their quantity, required/optional flag and comment', () => {
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
    // The model shows below the nickname, de-emphasized — but only when there
    // is a nickname to be secondary to (Kit CFTV has none, so it's not duplicated).
    expect(within(accessoriesSection).getByText('Smart Meter')).toBeInTheDocument();
    expect(within(accessoriesSection).queryByText('Kit CFTV', { selector: 'p' })).not.toBeInTheDocument();
    expect(within(accessoriesSection).getByText('2 unidades')).toBeInTheDocument();
    // Kit CFTV has qty 1 — not worth calling out, so its quantity line is omitted.
    expect(within(accessoriesSection).queryByText('1 unidades')).not.toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Obrigatório')).toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Kit CFTV')).toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Opcional')).toBeInTheDocument();
    expect(within(accessoriesSection).queryByText('Inversor')).not.toBeInTheDocument();
    expect(within(accessoriesSection).getByText('Instalar próximo ao quadro.')).toBeInTheDocument();
  });

  it('shows an "Incluso" badge instead of Obrigatório/Opcional for a bundled accessory', () => {
    setup({
      solution: {
        ...fakeSolution,
        accessories: [
          { model: 'WiFi Dongle', qty: 1, optional: false, appliesTo: 'system', comment: null, bundled: true },
        ],
      },
    });
    const accessoriesSection = screen.getByText('Acessórios').closest('div') as HTMLElement;
    expect(within(accessoriesSection).getByText('Incluso')).toBeInTheDocument();
    expect(within(accessoriesSection).queryByText('Obrigatório')).not.toBeInTheDocument();
    expect(within(accessoriesSection).queryByText('Opcional')).not.toBeInTheDocument();
  });

  it("shows the accessory's description below the model when present", () => {
    setup({
      solution: {
        ...fakeSolution,
        accessories: [{ model: 'Smart Meter', qty: 1, optional: false, appliesTo: 'system', comment: null }],
      },
      productMedia: {
        'Smart Meter': {
          model: 'Smart Meter',
          nickname: 'Medidor',
          description: 'Mede o consumo em tempo real.',
          imageUrl: null,
          documents: [],
        },
      },
    });
    const accessoriesSection = screen.getByText('Acessórios').closest('div') as HTMLElement;
    expect(within(accessoriesSection).getByText('Mede o consumo em tempo real.')).toBeInTheDocument();
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
    // qty 1 — not worth calling out, so the quantity line is omitted.
    expect(within(batteryCardA).queryByText(/unidade/)).not.toBeInTheDocument();

    fireEvent.click(within(switcher).getByRole('tab', { name: 'Bateria B' }));
    expect(within(switcher).getByRole('tab', { name: 'Bateria B' })).toHaveAttribute('aria-selected', 'true');
    const batteryCardB = screen.getByText('Bateria B', { selector: 'p' }).closest('.rounded-lg') as HTMLElement;
    expect(within(batteryCardB).getByText('2 unidades')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));

    // Backup starts disabled, so — same as every other feature tab — its
    // content (the loads UI) stays collapsed.
    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeInTheDocument();
    expect(screen.queryByText('Presets')).not.toBeInTheDocument();
    const disabledHeader = screen.getByRole('button', { name: 'Habilitar' }).parentElement?.parentElement;
    expect(disabledHeader).not.toHaveClass('border-b');
  });

  it('describes disabled features by their benefit instead of inverter requirements', () => {
    setup();

    fireEvent.click(screen.getByRole('tab', { name: /^Backup Total/ }));
    expect(screen.getAllByText('Mantém toda a instalação alimentada durante uma falta de energia.').some((element) => element.tagName === 'P')).toBe(true);
    expect(screen.queryByText(/Exige um inversor compatível/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Microrrede/ }));
    expect(screen.getAllByText(/manter a geração fotovoltaica existente operando/i).some((element) => element.tagName === 'P')).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: /^Gerador/ }));
    expect(screen.getAllByText(/ampliar a autonomia durante interrupções/i).some((element) => element.tagName === 'P')).toBe(true);
  });

  it('reveals the LoadSelector under the Backup tab once enabled, and hides it again when disabled', () => {
    const { rerender, props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));

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
    // rerender remounts (no Shell wrapper), so activeItem resets to the
    // overview grid — reopen Backup to land on the now-enabled panel.
    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));
    expect(screen.getByText('Predefinições')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Habilitado' }));
    expect(props.setDesiredFeatures).toHaveBeenCalledWith([]);

    rerender(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <SizingTab {...(props as Parameters<typeof SizingTab>[0])} residentialOptions={emptyResidentialOptions} />
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));

    expect(screen.getByRole('button', { name: 'Minhas' })).toHaveClass('border-primary');
  });
});

describe('SizingTab: Resumo tab "Cotar solução"', () => {
  it('calls onQuoteSolution when a solution is available', () => {
    const { props } = setup({
      residentialOptions: { ...emptyResidentialOptions, loads: [{ id: 'l1' }] },
      solution: fakeSolution,
    });

    fireEvent.click(screen.getByRole('tab', { name: /^Resumo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cotar solução' }));

    expect(props.onQuoteSolution).toHaveBeenCalledTimes(1);
  });
});
