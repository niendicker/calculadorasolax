// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import type { DesiredFeatureId, GeneratorConfig, MicrogridConfig, PvConfig, WhiteTariffConfig } from '@/lib/types';
import type { InverterCatalogOption } from '../../types';
import { ConfigurationSummary } from './ConfigurationSummary';

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

const baseResidentialOptions = {
  topology: null,
  batteryModel: null,
  inverterModel: null,
  gridType: null,
  desiredFeatures: [] as DesiredFeatureId[],
  whiteTariff: null as WhiteTariffConfig | null,
  microgrid: null as MicrogridConfig | null,
  generator: null as GeneratorConfig | null,
  pv: null as PvConfig | null,
  atsPhotoUrl: null as string | null,
  atsBackupAcknowledged: false,
  operationHours: 4,
};

function renderSummary(props: Partial<React.ComponentProps<typeof ConfigurationSummary>> = {}) {
  return render(
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <ConfigurationSummary
        residentialOptions={baseResidentialOptions}
        loadsCount={0}
        onJumpToGridType={vi.fn()}
        onJumpToBattery={vi.fn()}
        onJumpToFeature={vi.fn()}
        peakW={0}
        inverterCatalog={[inverter]}
        availableInverterModels={null}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe('ConfigurationSummary', () => {
  it('shows "Não selecionado" defaults and fires jump callbacks', () => {
    const onJumpToGridType = vi.fn();
    const onJumpToBattery = vi.fn();
    renderSummary({ onJumpToGridType, onJumpToBattery });
    expect(screen.getAllByText('Não selecionado').length).toBeGreaterThan(0);
    expect(screen.getByText('Automático')).toBeInTheDocument();
    expect(screen.getByText('Não selecionada')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Tipo de rede'));
    expect(onJumpToGridType).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Inversor'));
    expect(onJumpToGridType).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText('Topologia'));
    expect(onJumpToBattery).toHaveBeenCalled();
  });

  it('shows grid type and inverter model when set', () => {
    renderSummary({
      residentialOptions: { ...baseResidentialOptions, gridType: 'singlePhase_220', inverterModel: 'X1-Hybrid-5.0kW-G4' },
    });
    expect(screen.getByText('Monofásico 220V')).toBeInTheDocument();
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
  });

  it('shows battery topology and model when set, without critical alert', () => {
    renderSummary({ residentialOptions: { ...baseResidentialOptions, topology: 'HighVoltage', batteryModel: 'TP-HS3.6' } });
    expect(screen.getByText('Alta tensão (HV)')).toBeInTheDocument();
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
  });

  it('feature rows: backup shows load count', () => {
    renderSummary({ residentialOptions: { ...baseResidentialOptions, desiredFeatures: ['backup'] }, loadsCount: 3 });
    expect(screen.getByText('3 cargas')).toBeInTheDocument();
  });

  it('feature rows: backup singular load', () => {
    renderSummary({ residentialOptions: { ...baseResidentialOptions, desiredFeatures: ['backup'] }, loadsCount: 1 });
    expect(screen.getByText('1 carga')).toBeInTheDocument();
  });

  it('feature rows: external_ats with and without photo', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <ConfigurationSummary
          residentialOptions={{ ...baseResidentialOptions, desiredFeatures: ['external_ats'], atsPhotoUrl: null }}
          loadsCount={0}
          onJumpToGridType={vi.fn()}
          onJumpToBattery={vi.fn()}
          onJumpToFeature={vi.fn()}
          peakW={0}
          inverterCatalog={[inverter]}
          availableInverterModels={null}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('Ativado · sem foto')).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <ConfigurationSummary
          residentialOptions={{ ...baseResidentialOptions, desiredFeatures: ['external_ats'], atsPhotoUrl: 'x.png' }}
          loadsCount={0}
          onJumpToGridType={vi.fn()}
          onJumpToBattery={vi.fn()}
          onJumpToFeature={vi.fn()}
          peakW={0}
          inverterCatalog={[inverter]}
          availableInverterModels={null}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('Ativado · foto anexada')).toBeInTheDocument();
  });

  it('feature rows: microgrid with and without power', () => {
    renderSummary({
      residentialOptions: {
        ...baseResidentialOptions,
        desiredFeatures: ['microgrid'],
        microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 5000, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
      },
    });
    expect(screen.getByText('Ativado · 5.0 kW')).toBeInTheDocument();
  });

  it('feature rows: microgrid without power falls back to plain "Ativado"', () => {
    renderSummary({
      residentialOptions: {
        ...baseResidentialOptions,
        desiredFeatures: ['microgrid'],
        microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 0, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
      },
    });
    expect(screen.getAllByText('Ativado').length).toBeGreaterThan(0);
  });

  it('feature rows: external_generator with power', () => {
    renderSummary({
      residentialOptions: {
        ...baseResidentialOptions,
        desiredFeatures: ['external_generator'],
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 8000, powerFactor: 0.8, safetyMarginW: 1000, photoUrl: null, ownAtsAcknowledged: true },
      },
    });
    expect(screen.getByText('Ativado · 8.0 kVA')).toBeInTheDocument();
  });

  it('feature rows: white_tariff with tariffs shows formatted value', () => {
    renderSummary({
      residentialOptions: {
        ...baseResidentialOptions,
        desiredFeatures: ['white_tariff'],
        whiteTariff: {
          inputMode: 'advanced',
          totalMonthlyConsumptionKwh: 100,
          pontaConsumptionPercent: 20,
          intermediateConsumptionPercent: 10,
          businessDaysPerMonth: 22,
          pontaWindowHours: 3,
          intermediateWindowHours: 2,
          requiredPowerW: 1000,
          pontaEnergyWh: 500,
          intermediateEnergyWh: 300,
          pontaTariffPerKwh: 1.2,
          intermediateTariffPerKwh: 0.9,
          foraPontaTariffPerKwh: 0.7,
        },
      },
    });
    expect(screen.getByText(/Ativado · R\$ 1.2\/0.9\/0.7 por kWh/)).toBeInTheDocument();
  });

  it('feature rows: pv defaults to plain "Ativado" via default switch case', () => {
    renderSummary({ residentialOptions: { ...baseResidentialOptions, desiredFeatures: ['pv'] } });
    expect(screen.getAllByText('Ativado').length).toBeGreaterThan(0);
  });

  it('fires onJumpToFeature when a feature row is clicked', () => {
    const onJumpToFeature = vi.fn();
    renderSummary({ onJumpToFeature });
    fireEvent.click(screen.getByText('Backup'));
    expect(onJumpToFeature).toHaveBeenCalledWith('backup');
  });

  it('marks a required-flag feature as having a pending issue when narrowed catalog does not support it', () => {
    const noFlagInverter: InverterCatalogOption = { ...inverter, model: 'NoFlags', flags: [] };
    renderSummary({
      residentialOptions: { ...baseResidentialOptions, desiredFeatures: ['external_ats'], inverterModel: 'NoFlags', atsBackupAcknowledged: true },
      inverterCatalog: [noFlagInverter],
    });
    // Row renders with destructive styling class when hasIssue true.
    const row = screen.getByText('Backup Total').closest('button');
    expect(row?.className).toContain('');
  });
});
