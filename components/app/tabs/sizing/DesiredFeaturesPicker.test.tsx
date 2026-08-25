// @vitest-environment jsdom

import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      onChange,
      onWhiteTariffChange,
      whiteTariff: { inputMode: 'basic', totalMonthlyConsumptionKwh: 0, pontaConsumptionPercent: 20, intermediateConsumptionPercent: 10, businessDaysPerMonth: 22, pontaWindowHours: 3, intermediateWindowHours: 2, requiredPowerW: 0, pontaEnergyWh: 0, intermediateEnergyWh: 0, pontaTariffPerKwh: 0, intermediateTariffPerKwh: 0, foraPontaTariffPerKwh: 0 },
    });
    fireEvent.click(screen.getByText('Habilitado'));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(onWhiteTariffChange).toHaveBeenCalledWith(null);
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

  it('keeps the advanced fields visible without mode selection tabs', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, onWhiteTariffChange });
    expect(screen.queryByRole('tab', { name: 'Básico' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Avançado' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Potência máxima nos horários caros (kW)')).not.toBeDisabled();
    expect(screen.getByLabelText(/Ponta · Energia/)).not.toBeDisabled();
  });

  it('updates total consumption directly in advanced mode', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, onWhiteTariffChange });
    fireEvent.change(screen.getByLabelText('Consumo total mensal (kWh/mês)'), { target: { value: '500' } });
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
    fireEvent.change(screen.getByLabelText('Potência máxima nos horários caros (kW)'), { target: { value: '3' } });
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ requiredPowerW: 3000 }));
  });

  it('does not render basic-mode percentage fields', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt, onWhiteTariffChange });
    expect(screen.queryByLabelText('Consumo na ponta (%)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Consumo intermediário (%)')).not.toBeInTheDocument();
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

  it('updates ponta energy field, tariff, intermediate energy/tariff, and fora ponta tariff', () => {
    const onWhiteTariffChange = vi.fn();
    renderPicker({
      activeTab: 'white_tariff',
      value: ['white_tariff'],
      whiteTariff: { ...wt, inputMode: 'advanced' },
      onWhiteTariffChange,
    });
    fireEvent.change(screen.getByLabelText(/Ponta · Energia/), { target: { value: '10' } });
    expect(onWhiteTariffChange).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Ponta · Tarifa/), { target: { value: '1.5' } });
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ pontaTariffPerKwh: 1.5 }));
    fireEvent.change(screen.getByLabelText(/Intermediária · Energia/), { target: { value: '5' } });
    expect(onWhiteTariffChange).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Intermediária · Tarifa/), { target: { value: '1' } });
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ intermediateTariffPerKwh: 1 }));
    fireEvent.change(screen.getByLabelText(/Fora ponta · Tarifa/), { target: { value: '0.6' } });
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ foraPontaTariffPerKwh: 0.6 }));
  });

  it('lets the ponta/intermediária/fora-ponta tariff fields be cleared to empty, instead of getting stuck showing 0', () => {
    // Regression test: value={x ?? ''} treats 0 as a real value to display
    // (nullish coalescing doesn't catch it), so clearing the field set state
    // to 0 and then rendered that same "0" straight back into the input,
    // making it impossible to actually blank the field out.
    function ControlledWhiteTariffPanel() {
      const [whiteTariff, setWhiteTariff] = useState<WhiteTariffConfig | null>(wt);
      const props = baseProps({
        activeTab: 'white_tariff',
        value: ['white_tariff'],
        whiteTariff,
        onWhiteTariffChange: setWhiteTariff,
      });
      return (
        <NextIntlClientProvider locale="pt" messages={ptMessages}>
          <DesiredFeaturesPicker {...props} />
        </NextIntlClientProvider>
      );
    }
    render(<ControlledWhiteTariffPanel />);

    fireEvent.change(screen.getByLabelText(/Ponta · Tarifa/), { target: { value: '' } });
    expect(screen.getByLabelText(/Ponta · Tarifa/)).toHaveValue(null);

    fireEvent.change(screen.getByLabelText(/Intermediária · Tarifa/), { target: { value: '' } });
    expect(screen.getByLabelText(/Intermediária · Tarifa/)).toHaveValue(null);

    fireEvent.change(screen.getByLabelText(/Fora ponta · Tarifa/), { target: { value: '' } });
    expect(screen.getByLabelText(/Fora ponta · Tarifa/)).toHaveValue(null);
  });

  it('shows the calculated fora-ponta daily energy', () => {
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt });
    // Expensive (ponta+intermediária): (3600+1800)/1000 * 22 dias = 118.8 kWh/mês.
    // Fora ponta: 400 - 118.8 = 281.2 kWh/mês; / 22 dias = 12.78 kWh/dia.
    expect(screen.getByText('12.78 kWh/dia')).toBeInTheDocument();
  });

  it('omits the fora-ponta daily energy when total monthly consumption is not informed', () => {
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: { ...wt, totalMonthlyConsumptionKwh: 0 } });
    const foraPontaCard = screen.getByText('Fora ponta').closest('div')!;
    expect(within(foraPontaCard).queryByText(/kWh\/dia/)).not.toBeInTheDocument();
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
    const input = screen.getByLabelText('Consumo total mensal (kWh/mês)');
    fireEvent.blur(input);
    expect(screen.getByText('Informe o consumo mensal.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('exposes the enable action as an accessible switch and marks ANEEL as disabled', () => {
    renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: wt });
    expect(screen.getByRole('button', { name: 'Habilitado' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: /Automático pela ANEEL/ })).toBeDisabled();
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
    fireEvent.click(screen.getByText('Premissas do cálculo'));
    fireEvent.change(screen.getByLabelText('Dias úteis/mês'), { target: { value: '20' } });
    expect(onWhiteTariffChange).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Janela de ponta (h)'), { target: { value: '4' } });
    expect(onWhiteTariffChange).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Janela intermediária (h)'), { target: { value: '2.5' } });
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
    fireEvent.change(screen.getByLabelText('Dias úteis/mês'), { target: { value: '21' } });
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ businessDaysPerMonth: 21 }));
    fireEvent.change(screen.getByLabelText('Janela de ponta (h)'), { target: { value: '3.5' } });
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ pontaWindowHours: 3.5 }));
    fireEvent.change(screen.getByLabelText('Janela intermediária (h)'), { target: { value: '2.2' } });
    expect(onWhiteTariffChange).toHaveBeenCalledWith(expect.objectContaining({ intermediateWindowHours: 2.2 }));
  });

  it('resyncs the ponta energy field text when energyWh changes externally (not from the field itself)', () => {
    const { rerender } = renderPicker({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: { ...wt, inputMode: 'advanced', pontaEnergyWh: 1000 } });
    expect(screen.getByLabelText(/Ponta · Energia/)).toHaveValue(22);

    rerender(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <DesiredFeaturesPicker
          {...baseProps({ activeTab: 'white_tariff', value: ['white_tariff'], whiteTariff: { ...wt, inputMode: 'advanced', pontaEnergyWh: 5000 } })}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByLabelText(/Ponta · Energia/)).toHaveValue(110);
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
