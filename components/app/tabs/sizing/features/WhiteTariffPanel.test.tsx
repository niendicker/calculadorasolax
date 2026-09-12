// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesiredFeatureId, PvConfig, WhiteTariffConfig } from '@/lib/types';
import { emptyWhiteTariffConfig, WhiteTariffPanel } from './WhiteTariffPanel';

const completeWhiteTariff: WhiteTariffConfig = {
  ...emptyWhiteTariffConfig,
  totalMonthlyConsumptionKwh: 1000,
  pontaConsumptionPercent: 20,
  intermediateConsumptionPercent: 10,
  requiredPowerW: 5000,
  pontaEnergyWh: 0,
  intermediateEnergyWh: 0,
  pontaTariffPerKwh: 1.35,
  intermediateTariffPerKwh: 1.05,
  foraPontaTariffPerKwh: 0.85,
};

function renderPanel({
  whiteTariff = completeWhiteTariff,
  value = ['white_tariff'],
  dailyKwh = 4,
  pv = null,
  onWhiteTariffChange = vi.fn(),
}: {
  whiteTariff?: WhiteTariffConfig | null;
  value?: DesiredFeatureId[];
  dailyKwh?: number;
  pv?: PvConfig | null;
  onWhiteTariffChange?: (whiteTariff: WhiteTariffConfig | null) => void;
} = {}) {
  const utils = render(
    <WhiteTariffPanel
      value={value}
      dailyKwh={dailyKwh}
      whiteTariff={whiteTariff}
      onWhiteTariffChange={onWhiteTariffChange}
      pv={pv}
    />
  );
  return { ...utils, onWhiteTariffChange };
}

function StatefulPanel({
  initialValue = completeWhiteTariff,
  onChange,
}: {
  initialValue?: WhiteTariffConfig;
  onChange: (value: WhiteTariffConfig | null) => void;
}) {
  const [whiteTariff, setWhiteTariff] = useState<WhiteTariffConfig | null>(initialValue);
  return (
    <WhiteTariffPanel
      value={['white_tariff']}
      dailyKwh={4}
      whiteTariff={whiteTariff}
      onWhiteTariffChange={(next) => {
        onChange(next);
        setWhiteTariff(next);
      }}
      pv={null}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ distributors: ['Distribuidora Teste'], latestDate: '2026-01-15' }),
    })
  );
});

describe('WhiteTariffPanel', () => {
  it('renders the calculated summary and loads the tariff metadata endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ distributors: ['Distribuidora Teste'], latestDate: '2026-01-15' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPanel({ value: ['white_tariff', 'backup'] });

    expect(screen.getByText('Resumo instantâneo')).toBeInTheDocument();
    expect(screen.getByText(/300\.0 kWh\/mês/)).toBeInTheDocument();
    expect(screen.getByText('5.00 kW')).toBeInTheDocument();
    expect(screen.getByText('Backup está ativo: +4.00 kWh/dia considerados.')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tariffs/distributors');
      expect(fetchMock).toHaveBeenCalledWith('/api/tariffs/latest-date');
    });
  });

  it('updates power, consumption and tariffs through the wheel controls', async () => {
    const onChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<StatefulPanel onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Potência máxima nos horários caros' }));
    const powerDialog = screen.getByRole('dialog', { name: 'Selecionar Potência máxima nos horários caros' });
    fireEvent.click(within(powerDialog).getByRole('button', { name: '3 kW' }));

    fireEvent.click(screen.getByRole('button', { name: 'Consumo total mensal' }));
    const consumptionDialog = screen.getByRole('dialog', { name: 'Selecionar Consumo total mensal' });
    fireEvent.click(within(consumptionDialog).getByRole('button', { name: '500 centenas' }));
    fireEvent.click(within(consumptionDialog).getByRole('button', { name: '00 unidades' }));

    fireEvent.click(screen.getByRole('button', { name: 'Abrir seletor de tarifa Ponta' }));
    const tariffDialog = screen.getByRole('dialog', { name: 'Selecionar tarifa Ponta' });
    fireEvent.click(within(tariffDialog).getByRole('button', { name: '1 reais' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Selecionar tarifa Ponta' })).getByRole('button', { name: '35 centavos' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ requiredPowerW: 3000 }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      totalMonthlyConsumptionKwh: 500,
      pontaEnergyWh: 4545,
      intermediateEnergyWh: 2273,
    }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      pontaTariffPerKwh: 1.35,
      manuallyEditedFields: ['pontaTariffPerKwh'],
    }));
  });

  it('reports required-field errors and closes the premise picker with Escape or outside click', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderPanel({
      whiteTariff: {
        ...emptyWhiteTariffConfig,
        totalMonthlyConsumptionKwh: 0,
        requiredPowerW: 0,
      },
    });

    fireEvent.blur(screen.getByRole('button', { name: 'Consumo total mensal' }));
    fireEvent.blur(screen.getByRole('button', { name: 'Potência máxima nos horários caros' }));
    fireEvent.blur(screen.getByRole('button', { name: 'Diminuir tarifa Ponta' }));

    expect(screen.getByText('Informe o consumo mensal.')).toBeInTheDocument();
    expect(screen.getByText('Informe a potência máxima nos horários caros.')).toBeInTheDocument();
    expect(screen.getByText('Informe uma tarifa válida.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Janela de ponta' }));
    expect(screen.getByRole('dialog', { name: 'Selecionar Janela de ponta' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Selecionar Janela de ponta' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dias úteis' }));
    expect(screen.getByRole('dialog', { name: 'Selecionar Dias úteis' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'Selecionar Dias úteis' })).not.toBeInTheDocument();
  });
});
