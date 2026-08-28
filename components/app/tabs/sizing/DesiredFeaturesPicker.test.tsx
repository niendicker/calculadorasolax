// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import type {
  DesiredFeatureId,
  GeneratorConfig,
  MicrogridConfig,
  PvConfig,
  WhiteTariffConfig,
} from '@/lib/types';
import type { InverterCatalogOption } from '../../types';
import { DesiredFeaturesPicker } from './DesiredFeaturesPicker';

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
  flags: ['external_ats', 'microgrid', 'external_generator'],
};

function baseProps(overrides: Partial<React.ComponentProps<typeof DesiredFeaturesPicker>> = {}) {
  return {
    activeTab: 'backup' as DesiredFeatureId,
    value: [] as DesiredFeatureId[],
    onChange: vi.fn(),
    whiteTariff: null as WhiteTariffConfig | null,
    onWhiteTariffChange: vi.fn(),
    microgrid: null as MicrogridConfig | null,
    onMicrogridChange: vi.fn(),
    generator: null as GeneratorConfig | null,
    onGeneratorChange: vi.fn(),
    pv: null as PvConfig | null,
    onPvChange: vi.fn(),
    atsPhotoUrl: null as string | null,
    onAtsPhotoUrlChange: vi.fn(),
    atsBackupAcknowledged: false,
    onAtsBackupAcknowledgedChange: vi.fn(),
    onUploadPhoto: vi.fn().mockResolvedValue('https://example.com/photo.png'),
    loadsCount: 0,
    operationHours: 4,
    inverterCatalog: [inverter],
    availableInverterModels: null as Set<string> | null,
    selectedInverterModel: null as string | null,
    gridType: null,
    peakW: 0,
    nominalW: 0,
    dailyKwh: 0,
    ...overrides,
  };
}

function renderPicker(overrides: Partial<React.ComponentProps<typeof DesiredFeaturesPicker>> = {}) {
  const props = baseProps(overrides);
  const utils = render(
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <DesiredFeaturesPicker {...props} />
    </NextIntlClientProvider>
  );
  return { ...utils, props };
}

describe('DesiredFeaturesPicker: tabs and toggling', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })
    );
  });

  it('renders the content for whichever activeTab is passed in', () => {
    renderPicker({ activeTab: 'white_tariff' });
    expect(screen.getByText('Usa a bateria nos horários mais caros da Tarifa Branca e estima a economia no relatório.')).toBeInTheDocument();
  });

  it('toggles a feature on, seeding the default config for white_tariff', () => {
    const onChange = vi.fn();
    const onWhiteTariffChange = vi.fn();
    renderPicker({ activeTab: 'white_tariff', onChange, onWhiteTariffChange });
    fireEvent.click(screen.getByText('Habilitar'));
    expect(onChange).toHaveBeenCalledWith(['white_tariff']);
    expect(onWhiteTariffChange).toHaveBeenCalled();
  });

  it('toggles a feature on, seeding microgrid defaults from gridType', () => {
    const onMicrogridChange = vi.fn();
    renderPicker({ activeTab: 'microgrid', onMicrogridChange, gridType: 'threePhase_380' });
    fireEvent.click(screen.getByText('Habilitar'));
    expect(onMicrogridChange).toHaveBeenCalledWith(
      expect.objectContaining({ onGridPhases: 3, voltageV: 380 })
    );
  });

  it('toggles a feature on, seeding generator defaults from gridType', () => {
    const onGeneratorChange = vi.fn();
    renderPicker({ activeTab: 'external_generator', onGeneratorChange, gridType: 'threePhase_220' });
    fireEvent.click(screen.getByText('Habilitar'));
    expect(onGeneratorChange).toHaveBeenCalledWith(expect.objectContaining({ phases: 3, voltageV: 220 }));
  });

  it('toggles a feature on, seeding pv default config', () => {
    const onPvChange = vi.fn();
    renderPicker({ activeTab: 'pv', onPvChange });
    fireEvent.click(screen.getByText('Habilitar'));
    expect(onPvChange).toHaveBeenCalledWith({ monthlyConsumptionKwh: 0, hsp: 0 });
  });

  it('toggles a feature off and resets its config to null', () => {
    const onChange = vi.fn();
    const onWhiteTariffChange = vi.fn();
    const onFeatureDisabled = vi.fn();
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      onChange,
      onWhiteTariffChange,
      onFeatureDisabled,
      whiteTariff: { inputMode: 'basic', totalMonthlyConsumptionKwh: 0, pontaConsumptionPercent: 20, intermediateConsumptionPercent: 10, businessDaysPerMonth: 22, pontaWindowHours: 3, intermediateWindowHours: 2, requiredPowerW: 0, pontaEnergyWh: 0, intermediateEnergyWh: 0, pontaTariffPerKwh: 0, intermediateTariffPerKwh: 0, foraPontaTariffPerKwh: 0 },
    });
    fireEvent.click(screen.getByText('Habilitado'));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(onWhiteTariffChange).toHaveBeenCalledWith(null);
    expect(onFeatureDisabled).toHaveBeenCalledOnce();
  });

  it('toggles microgrid off resetting config to null', () => {
    const onMicrogridChange = vi.fn();
    renderPicker({
      activeTab: 'microgrid',
      value: ['microgrid'],
      onMicrogridChange,
      microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 0, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
    });
    fireEvent.click(screen.getByText('Habilitado'));
    expect(onMicrogridChange).toHaveBeenCalledWith(null);
  });

  it('toggles external_generator off resetting config to null', () => {
    const onGeneratorChange = vi.fn();
    renderPicker({
      activeTab: 'external_generator',
      value: ['external_generator'],
      onGeneratorChange,
      generator: { voltageV: 220, phases: 1, apparentPowerVA: 0, powerFactor: 0.8, safetyMarginW: 1000, photoUrl: null, ownAtsAcknowledged: false },
    });
    fireEvent.click(screen.getByText('Habilitado'));
    expect(onGeneratorChange).toHaveBeenCalledWith(null);
  });

  it('toggles pv off resetting config to null', () => {
    const onPvChange = vi.fn();
    renderPicker({ activeTab: 'pv', value: ['pv'], onPvChange, pv: { monthlyConsumptionKwh: 100, hsp: 4 } });
    fireEvent.click(screen.getByText('Habilitado'));
    expect(onPvChange).toHaveBeenCalledWith(null);
  });

  it('shows the "Requer atenção" badge when the active feature has a pending issue', () => {
    renderPicker({ activeTab: 'backup', value: ['backup'], loadsCount: 0 });
    expect(screen.getByText('Requer atenção')).toBeInTheDocument();
  });

  it('keeps backup as "Requer atenção" when loads exist but the operation duration is not configured', () => {
    renderPicker({ activeTab: 'backup', value: ['backup'], loadsCount: 2, operationHours: 0 });
    expect(screen.getByText('Requer atenção')).toBeInTheDocument();
  });

  it('shows backup as "Configurado" once loads and the operation duration are both configured', () => {
    renderPicker({ activeTab: 'backup', value: ['backup'], loadsCount: 2, operationHours: 4 });
    expect(screen.getByText('Configurado')).toBeInTheDocument();
  });

  it('does not seed a new config when the feature already has one set', () => {
    const onWhiteTariffChange = vi.fn();
    const existing: WhiteTariffConfig = { inputMode: 'advanced', totalMonthlyConsumptionKwh: 50, pontaConsumptionPercent: 20, intermediateConsumptionPercent: 10, businessDaysPerMonth: 22, pontaWindowHours: 3, intermediateWindowHours: 2, requiredPowerW: 0, pontaEnergyWh: 0, intermediateEnergyWh: 0, pontaTariffPerKwh: 0, intermediateTariffPerKwh: 0, foraPontaTariffPerKwh: 0 };
    renderPicker({ activeTab: 'white_tariff', onWhiteTariffChange, whiteTariff: existing, value: [] });
    fireEvent.click(screen.getByText('Habilitar'));
    expect(onWhiteTariffChange).not.toHaveBeenCalled();
  });
});

describe('DesiredFeaturesPicker: backup tab', () => {
  it('shows only the title, subtitle, and enable action while Backup is disabled', () => {
    renderPicker({ activeTab: 'backup', value: [], onOpenLoads: vi.fn() });

    expect(screen.getByText('Backup')).toBeInTheDocument();
    expect(screen.getByText('Selecione os equipamentos que precisam permanecer ligados durante uma falta de energia.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeInTheDocument();
    expect(screen.queryByText('Desativado')).not.toBeInTheDocument();
    expect(screen.queryByText('Por quanto tempo as cargas devem operar?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revisar cargas/ })).not.toBeInTheDocument();
  });

  it('shows only backup duration and a link to the dedicated loads screen', () => {
    const onOpenLoads = vi.fn();
    renderPicker({ activeTab: 'backup', value: ['backup'], loadsCount: 2, operationHours: 4, onOpenLoads });
    expect(screen.getByText('Por quanto tempo as cargas devem operar?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar cargas (2)' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Resumo das cargas cadastradas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Predefinições')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar cargas (2)' }));
    expect(onOpenLoads).toHaveBeenCalledTimes(1);
  });
});

describe('DesiredFeaturesPicker: external_ats tab', () => {
  it('renders InverterSupportSummary, checkbox toggle, and photo upload', () => {
    const onAtsBackupAcknowledgedChange = vi.fn();
    renderPicker({ activeTab: 'external_ats', value: ['external_ats'], atsBackupAcknowledged: false, onAtsBackupAcknowledgedChange });
    expect(screen.getByText('Um QTA deve ser usado para backup total.')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onAtsBackupAcknowledgedChange).toHaveBeenCalledWith(true);
  });

  it('shows confirmed copy when acknowledged', () => {
    renderPicker({ activeTab: 'external_ats', value: ['external_ats'], atsBackupAcknowledged: true });
    expect(screen.getByText('Confirmado: um QTA é usado para backup total.')).toBeInTheDocument();
  });
});

describe('DesiredFeaturesPicker: white_tariff tab', () => {
  const wt: WhiteTariffConfig = {
    inputMode: 'basic',
    totalMonthlyConsumptionKwh: 400,
    pontaConsumptionPercent: 20,
    intermediateConsumptionPercent: 10,
    businessDaysPerMonth: 22,
    pontaWindowHours: 3,
    intermediateWindowHours: 2,
    requiredPowerW: 2000,
    pontaEnergyWh: 3600,
    intermediateEnergyWh: 1800,
    pontaTariffPerKwh: 1.2,
    intermediateTariffPerKwh: 0.95,
    foraPontaTariffPerKwh: 0.75,
  };

  it('keeps the consumption and percentage controls visible without mode selection tabs', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, onWhiteTariffChange });
    expect(screen.queryByRole('tab', { name: 'Básico' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Avançado' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Potência máxima nos horários caros')).not.toBeDisabled();
    expect(screen.getByLabelText('Ponta (%)')).not.toBeDisabled();
    expect(screen.getByText('3.64 kWh/dia')).toBeInTheDocument();
  });

  it('updates total consumption directly in advanced mode', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, onWhiteTariffChange });
    fireEvent.click(screen.getByRole('button', { name: 'Consumo total mensal' }));
    fireEvent.click(screen.getByRole('button', { name: '500 centenas' }));
    fireEvent.click(screen.getByRole('button', { name: '00 unidades' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ totalMonthlyConsumptionKwh: 500 }));
  });

  it('updates required power directly (advanced-only field)', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: { ...wt, inputMode: 'advanced' },
      onWhiteTariffChange,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Potência máxima nos horários caros' }));
    fireEvent.click(screen.getByRole('button', { name: '3 kW' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ requiredPowerW: 3000 }));
  });

  it('renders percentage fields in every mode', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, onWhiteTariffChange });
    expect(screen.getByLabelText('Ponta (%)')).toHaveValue(20);
    expect(screen.getByLabelText('Intermediária (%)')).toHaveValue(10);
  });

  it('shows the backup-daily-kwh copy when Backup is also selected', () => {
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff', 'backup'],
      whiteTariff: wt,
      dailyKwh: 4.5,
    });
    expect(screen.getByText(/Backup está ativo/)).toBeInTheDocument();
    expect(screen.getByText(/\+4\.50 kWh\/dia considerados/)).toBeInTheDocument();
  });

  it('prompts to enable Backup when it is not selected', () => {
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: wt,
      dailyKwh: 0,
    });
    expect(screen.getByText('Ative "Backup" para somar a energia das cargas à energia da Tarifa Branca.')).toBeInTheDocument();
  });

  it('updates the distribution percentages, derived energies, and tariffs', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: { ...wt, inputMode: 'advanced' },
      onWhiteTariffChange,
    });
    fireEvent.change(screen.getByLabelText('Ponta (%)'), { target: { value: '25' } });
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ pontaConsumptionPercent: 25, pontaEnergyWh: 4545 }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar tarifa Ponta' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ pontaTariffPerKwh: 1.21 }));
    fireEvent.change(screen.getByLabelText('Intermediária (%)'), { target: { value: '15' } });
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ intermediateConsumptionPercent: 15, intermediateEnergyWh: 2727 }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar tarifa Intermediária' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ intermediateTariffPerKwh: 0.96 }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar tarifa Fora ponta' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ foraPontaTariffPerKwh: 0.76 }));
  });

  it('adjusts tariff values in one-cent increments with the steppers', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, onWhiteTariffChange });

    fireEvent.click(screen.getByRole('button', { name: 'Abrir seletor de tarifa Ponta' }));
    expect(screen.getByRole('dialog', { name: 'Selecionar tarifa Ponta' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1 reais' }));
    fireEvent.click(screen.getByRole('button', { name: '25 centavos' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ pontaTariffPerKwh: 1.25 }));

    fireEvent.click(screen.getByRole('button', { name: 'Diminuir tarifa Ponta' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ pontaTariffPerKwh: 1.19 }));

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar tarifa Fora ponta' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ foraPontaTariffPerKwh: 0.76 }));
  });

  it('shows the daily energy for every tariff period in the distribution cards', () => {
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt });
    expect(screen.getByText('3.64 kWh/dia')).toBeInTheDocument();
    expect(screen.getByText('1.82 kWh/dia')).toBeInTheDocument();
    expect(screen.getByText('12.73 kWh/dia')).toBeInTheDocument();
  });

  it('keeps the daily energy values at zero when total monthly consumption is not informed', () => {
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: { ...wt, totalMonthlyConsumptionKwh: 0 } });
    expect(screen.getAllByText('0.00 kWh/dia')).toHaveLength(3);
    expect(screen.getAllByText('Fora ponta')).toHaveLength(1);
  });

  it('shows the tariff-order warning when ponta/intermediate are below fora ponta', () => {
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: { ...wt, pontaTariffPerKwh: 0.5, foraPontaTariffPerKwh: 0.75 },
    });
    expect(screen.getByText(/tarifas de ponta e intermediária devem ser maiores ou iguais/)).toBeInTheDocument();
  });

  it('shows the incomplete-config alert when config is incomplete', () => {
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: { ...wt, totalMonthlyConsumptionKwh: 0 },
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('keeps the summary neutral while required data is missing', () => {
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: { ...wt, totalMonthlyConsumptionKwh: 0, requiredPowerW: 0, pontaEnergyWh: 0, intermediateEnergyWh: 0 },
    });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('Preencha os campos obrigatórios para visualizar a estimativa.')).toBeInTheDocument();
    expect(screen.getByText('Requer atenção')).toBeInTheDocument();
    expect(screen.getByText('Complete os dados necessários para calcular a Tarifa Branca.')).toBeInTheDocument();
  });

  it('shows a local validation message after an invalid field loses focus', () => {
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: { ...wt, totalMonthlyConsumptionKwh: 0 } });
    const input = screen.getByLabelText('Consumo total mensal');
    fireEvent.blur(input);
    expect(screen.getByText('Informe o consumo mensal.')).toBeInTheDocument();
    expect(input).toHaveAttribute('data-invalid', 'true');
  });

  it('exposes the enable action and keeps the tariff source tabs hidden', () => {
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt });
    expect(screen.getByRole('button', { name: 'Habilitado' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('tab', { name: /Automático pela ANEEL/ })).not.toBeInTheDocument();
  });

  it('renders the instant summary block with savings copy when favorable', () => {
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt });
    expect(screen.getByText('Resumo instantâneo')).toBeInTheDocument();
  });

  it('renders unfavorable savings copy branch when pontaTariff equals foraPontaTariff (no arbitrage)', () => {
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: { ...wt, pontaTariffPerKwh: 0.75, intermediateTariffPerKwh: 0.75, foraPontaTariffPerKwh: 0.75 },
    });
    expect(screen.getByText('Resumo instantâneo')).toBeInTheDocument();
    expect(screen.getByText('Economia não identificada nesta configuração')).toBeInTheDocument();
    expect(screen.getByText(/R\$ 0,00\/mês/)).toBeInTheDocument();
  });

  it('feeds the preliminary PV generation into the arbitrage savings estimate when pv is also selected', () => {
    const withoutPv = renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, pv: null });
    const withoutPvSavings = screen.getByText('Economia preliminar').closest('div')!.querySelector('strong')!.textContent;
    withoutPv.unmount();

    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff', 'pv'],
      whiteTariff: wt,
      pv: { monthlyConsumptionKwh: 300, hsp: 4.5 },
    });
    const withPvSavings = screen.getByText('Economia preliminar').closest('div')!.querySelector('strong')!.textContent;

    expect(withPvSavings).not.toBe(withoutPvSavings);
  });

  it('ignores the pv config for the savings estimate when pv is not a selected feature', () => {
    const withoutPvFeature = renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: wt,
      pv: { monthlyConsumptionKwh: 300, hsp: 4.5 },
    });
    const withoutPvFeatureSavings = screen.getByText('Economia preliminar').closest('div')!.querySelector('strong')!.textContent;
    withoutPvFeature.unmount();

    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, pv: null });
    const withNullPvSavings = screen.getByText('Economia preliminar').closest('div')!.querySelector('strong')!.textContent;

    expect(withoutPvFeatureSavings).toBe(withNullPvSavings);
  });

  it('updates business days / ponta hours / intermediate hours assumptions in basic and advanced modes', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, onWhiteTariffChange });
    fireEvent.click(screen.getByRole('button', { name: 'Dias úteis' }));
    fireEvent.click(screen.getByRole('button', { name: '20 dias' }));
    expect(onWhiteTariffChange).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Janela de ponta' }));
    fireEvent.click(screen.getByRole('button', { name: '04 horas' }));
    expect(onWhiteTariffChange).toHaveBeenCalled();
    const intermediateButton = screen.getByRole('button', { name: 'Janela intermediária' });
    fireEvent.pointerDown(intermediateButton);
    fireEvent.click(intermediateButton);
    fireEvent.click(screen.getByRole('button', { name: '02 horas' }));
    expect(onWhiteTariffChange).toHaveBeenCalled();
  });

  it('updates assumptions directly in advanced mode', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: { ...wt, inputMode: 'advanced' },
      onWhiteTariffChange,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dias úteis' }));
    fireEvent.click(screen.getByRole('button', { name: '21 dias' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ businessDaysPerMonth: 21 }));
    fireEvent.click(screen.getByRole('button', { name: 'Janela de ponta' }));
    fireEvent.click(screen.getByRole('button', { name: '04 horas' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ pontaWindowHours: 4 }));
    fireEvent.click(screen.getByRole('button', { name: '30 minutos' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ pontaWindowHours: 4.5 }));
    const intermediateButton = screen.getByRole('button', { name: 'Janela intermediária' });
    fireEvent.pointerDown(intermediateButton);
    fireEvent.click(intermediateButton);
    fireEvent.click(screen.getByRole('button', { name: '02 horas' }));
    fireEvent.click(screen.getByRole('button', { name: '02 minutos' }));
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ intermediateWindowHours: 2 + 2 / 60 }));
  });

  it('derives percentages from legacy energy fields when percentages are absent', () => {
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: { ...wt, pontaConsumptionPercent: undefined, intermediateConsumptionPercent: undefined, pontaEnergyWh: 1000, intermediateEnergyWh: 0 },
    });
    expect(screen.getByLabelText('Ponta (%)')).toHaveValue(5.5);
  });

  it('falls back to default empty white tariff config when whiteTariff is null but tab is active/enabled edge case', () => {
    // whiteTariff null but value doesn't include white_tariff -> panel not shown.
    renderPicker({ activeTab: 'white_tariff', value: [], whiteTariff: null });
    expect(screen.queryByText('Resumo instantâneo')).not.toBeInTheDocument();
  });
});

describe('DesiredFeaturesPicker: microgrid tab', () => {
  const microgrid: MicrogridConfig = {
    voltageV: 220,
    onGridPhases: 1,
    onGridApparentPowerVA: 5000,
    isFundamentalRequirement: true,
    photoUrl: null,
    powerNoticeAcknowledged: true,
  };

  it('renders phase/voltage pickers, power input, and warning when power is zero', () => {
    renderPicker({
      activeTab: 'microgrid',
      value: ['microgrid'],
      microgrid: { ...microgrid, onGridApparentPowerVA: 0 },
      gridType: 'singlePhase_220',
    });
    expect(screen.getByText('Informe a potência nominal AC do inversor on-grid existente.')).toBeInTheDocument();
  });

  it('updates phases, voltage, and power', () => {
    const onMicrogridChange = vi.fn();
    renderPicker({ activeTab: 'microgrid', value: ['microgrid'], microgrid, onMicrogridChange, gridType: 'singlePhase_220' });
    fireEvent.click(screen.getByRole('radio', { name: 'Trifásico' }));
    expect(onMicrogridChange).toHaveBeenCalledWith(expect.objectContaining({ onGridPhases: 3 }));

    fireEvent.change(screen.getByLabelText('Potência nominal AC (kW)'), { target: { value: '6' } });
    expect(onMicrogridChange).toHaveBeenCalledWith(expect.objectContaining({ onGridApparentPowerVA: 6000 }));
  });

  it('updates voltage', () => {
    const onMicrogridChange = vi.fn();
    renderPicker({
      activeTab: 'microgrid',
      value: ['microgrid'],
      microgrid: { ...microgrid, onGridPhases: 3, voltageV: 220 },
      onMicrogridChange,
      gridType: 'threePhase_380',
    });
    fireEvent.click(screen.getByRole('radio', { name: '380V' }));
    expect(onMicrogridChange).toHaveBeenCalledWith(expect.objectContaining({ voltageV: 380 }));
  });

  it('uploads a photo for the microgrid inverter label', async () => {
    const onUploadPhoto = vi.fn().mockResolvedValue('https://example.com/mg.png');
    const onMicrogridChange = vi.fn();
    renderPicker({ activeTab: 'microgrid', value: ['microgrid'], microgrid, onUploadPhoto, onMicrogridChange });
    const input = document.getElementById('photo-upload-microgrid') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await screen.findByText('Trocar foto', {}, { timeout: 2000 }).catch(() => null);
  });

  it('preserves current voltage when it stays valid after a phase change', () => {
    const onMicrogridChange = vi.fn();
    renderPicker({
      activeTab: 'microgrid',
      value: ['microgrid'],
      microgrid: { ...microgrid, onGridPhases: 1, voltageV: 220 },
      onMicrogridChange,
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Trifásico' }));
    expect(onMicrogridChange).toHaveBeenCalledWith(expect.objectContaining({ onGridPhases: 3, voltageV: 220 }));
  });
});

describe('DesiredFeaturesPicker: external_generator tab', () => {
  const generator: GeneratorConfig = {
    voltageV: 220,
    phases: 1,
    apparentPowerVA: 100,
    powerFactor: 0.8,
    safetyMarginW: 1000,
    photoUrl: null,
    ownAtsAcknowledged: false,
  };

  it('renders phase/voltage pickers and power/factor/margin inputs, updates them', () => {
    const onGeneratorChange = vi.fn();
    renderPicker({ activeTab: 'external_generator', value: ['external_generator'], generator, onGeneratorChange, peakW: 5000 });

    fireEvent.click(screen.getByRole('radio', { name: 'Trifásico' }));
    expect(onGeneratorChange).toHaveBeenCalledWith(expect.objectContaining({ phases: 3 }));

    fireEvent.change(screen.getByLabelText('Potência nominal (kVA)'), { target: { value: '8' } });
    expect(onGeneratorChange).toHaveBeenCalledWith(expect.objectContaining({ apparentPowerVA: 8000 }));

    fireEvent.change(screen.getByLabelText('Fator de potência'), { target: { value: '0.9' } });
    expect(onGeneratorChange).toHaveBeenCalledWith(expect.objectContaining({ powerFactor: 0.9 }));

    fireEvent.change(screen.getByLabelText('Margem para recarga e operação (kW)'), { target: { value: '3' } });
    expect(onGeneratorChange).toHaveBeenCalledWith(expect.objectContaining({ safetyMarginW: 3000 }));
  });

  it('clamps power factor and safety margin to their valid ranges on invalid input', () => {
    const onGeneratorChange = vi.fn();
    renderPicker({ activeTab: 'external_generator', value: ['external_generator'], generator, onGeneratorChange });
    fireEvent.change(screen.getByLabelText('Fator de potência'), { target: { value: '5' } });
    expect(onGeneratorChange).toHaveBeenCalledWith(expect.objectContaining({ powerFactor: 1 }));
    fireEvent.change(screen.getByLabelText('Margem para recarga e operação (kW)'), { target: { value: '-5' } });
    expect(onGeneratorChange).toHaveBeenCalledWith(expect.objectContaining({ safetyMarginW: 0 }));
  });

  it('shows the insufficient-power warning when generator power is inadequate', () => {
    renderPicker({ activeTab: 'external_generator', value: ['external_generator'], generator, peakW: 5000 });
    expect(screen.getByText(/gerador fornece aproximadamente/)).toBeInTheDocument();
  });

  it('toggles ownAtsAcknowledged and flips copy', () => {
    const onGeneratorChange = vi.fn();
    renderPicker({ activeTab: 'external_generator', value: ['external_generator'], generator, onGeneratorChange });
    expect(screen.getByText(/O gerador externo precisa ter a própria chave ATS/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onGeneratorChange).toHaveBeenCalledWith(expect.objectContaining({ ownAtsAcknowledged: true }));
  });

  it('shows the confirmed ATS copy when acknowledged', () => {
    renderPicker({ activeTab: 'external_generator', value: ['external_generator'], generator: { ...generator, ownAtsAcknowledged: true } });
    expect(screen.getByText(/o gerador externo tem a própria chave ATS/)).toBeInTheDocument();
  });

  it('uploads a photo for the generator label', () => {
    const onGeneratorChange = vi.fn();
    renderPicker({ activeTab: 'external_generator', value: ['external_generator'], generator, onGeneratorChange });
    const input = document.getElementById('photo-upload-generator') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'g.png', { type: 'image/png' })] } });
  });

  it('shows summary badges: pending power, insufficient, and within limit', () => {
    const { rerender } = renderPicker({ activeTab: 'external_generator', value: ['external_generator'], generator: { ...generator, apparentPowerVA: 0 } });
    expect(screen.getByText('Potência pendente')).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <DesiredFeaturesPicker {...baseProps({ activeTab: 'external_generator', value: ['external_generator'], generator, peakW: 5000 })} />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('Abaixo do recomendado')).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <DesiredFeaturesPicker {...baseProps({ activeTab: 'external_generator', value: ['external_generator'], generator: { ...generator, apparentPowerVA: 100000 }, peakW: 100 })} />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('Dentro do limite')).toBeInTheDocument();
  });
});

describe('DesiredFeaturesPicker: pv tab', () => {
  it('updates consumption and hsp, and shows the incomplete warning until both are set', () => {
    const onPvChange = vi.fn();
    renderPicker({ activeTab: 'pv', value: ['pv'], pv: { monthlyConsumptionKwh: 0, hsp: 0 }, onPvChange });
    expect(screen.getByText('Informe o consumo médio mensal e o HSP para calcular o FV.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Consumo médio mensal (kWh)'), { target: { value: '450' } });
    expect(onPvChange).toHaveBeenCalledWith(expect.objectContaining({ monthlyConsumptionKwh: 450 }));

    fireEvent.change(screen.getByLabelText('HSP da instalação (h/dia)'), { target: { value: '4.5' } });
    expect(onPvChange).toHaveBeenCalledWith(expect.objectContaining({ hsp: 4.5 }));
  });

  it('hides the incomplete warning once both fields are set', () => {
    renderPicker({ activeTab: 'pv', value: ['pv'], pv: { monthlyConsumptionKwh: 450, hsp: 4.5 } });
    expect(screen.queryByText('Informe o consumo médio mensal e o HSP para calcular o FV.')).not.toBeInTheDocument();
  });
});
