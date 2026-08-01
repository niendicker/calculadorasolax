// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ptMessages from '@/messages/pt.json';
import type { Solution, UserStockItem } from '@/lib/types';
import type { BatteryCatalogOption, InverterCatalogOption } from '../../types';
import { BatteryModelPicker, InverterModelPicker } from './ModelPickers';

const hvBattery: BatteryCatalogOption = {
  id: 'b1',
  model: 'TP-HS3.6',
  nickname: 'Bateria HV',
  capacityKwh: 3.6,
  topology: 'HV',
  standardPowerKw: 1.8,
  peakPowerKw: 2.5,
  minSocPercent: 10,
  imageUrl: 'https://example.com/b1.png',
  documents: [{ name: 'Manual', url: 'https://example.com/manual.pdf' }],
};

const hvBattery2: BatteryCatalogOption = {
  ...hvBattery,
  id: 'b2',
  model: 'TP-HS7.2',
  nickname: undefined,
  imageUrl: null,
  documents: [],
};

const lvBattery: BatteryCatalogOption = { ...hvBattery, id: 'b3', model: 'TP-LD53', topology: 'LV' };

const expansionSlave: BatteryCatalogOption = { ...hvBattery, id: 'b4', model: 'TP-HS3.6-EXP', topology: 'HV' };
const masterWithExpansion: BatteryCatalogOption = { ...hvBattery2, id: 'b5', model: 'TP-HS-MASTER', expansionModel: 'TP-HS3.6-EXP' };

function renderBatteryPicker(props: Partial<React.ComponentProps<typeof BatteryModelPicker>> = {}) {
  return render(
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <BatteryModelPicker
        batteries={[hvBattery, hvBattery2, lvBattery]}
        topology={null}
        selectedModel={null}
        secondarySelectedModel={null}
        loading={false}
        setTopology={vi.fn()}
        setBatteryModel={vi.fn()}
        setSecondaryBatteryModel={vi.fn()}
        userStockItems={[]}
        solution={null}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe('BatteryModelPicker', () => {
  it('shows loading skeleton', () => {
    renderBatteryPicker({ loading: true });
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows empty state when no batteries match the active topology', () => {
    renderBatteryPicker({ batteries: [lvBattery], topology: 'HighVoltage' });
    expect(screen.getByText(/Nenhuma bateria HV cadastrada/)).toBeInTheDocument();
  });

  it('switches tabs via selectTab', () => {
    const setTopology = vi.fn();
    renderBatteryPicker({ setTopology });
    fireEvent.click(screen.getByRole('button', { name: /LV/ }));
    expect(setTopology).toHaveBeenCalledWith('LowVoltage');
  });

  it('selects first model when none selected', () => {
    const setBatteryModel = vi.fn();
    const setTopology = vi.fn();
    renderBatteryPicker({ setBatteryModel, setTopology });
    fireEvent.click(screen.getByText('TP-HS3.6').closest('[role="button"]') as HTMLElement);
    expect(setBatteryModel).toHaveBeenCalledWith('TP-HS3.6');
    expect(setTopology).toHaveBeenCalledWith('HighVoltage');
  });

  it('sets secondary model when primary already selected', () => {
    const setSecondaryBatteryModel = vi.fn();
    renderBatteryPicker({ selectedModel: 'TP-HS3.6', topology: 'HighVoltage', setSecondaryBatteryModel });
    fireEvent.click(screen.getByText('TP-HS7.2').closest('[role="button"]') as HTMLElement);
    expect(setSecondaryBatteryModel).toHaveBeenCalledWith('TP-HS7.2');
  });

  it('unmarks primary and promotes secondary when clicking the selected primary', () => {
    const setBatteryModel = vi.fn();
    const setSecondaryBatteryModel = vi.fn();
    renderBatteryPicker({
      selectedModel: 'TP-HS3.6',
      secondarySelectedModel: 'TP-HS7.2',
      topology: 'HighVoltage',
      setBatteryModel,
      setSecondaryBatteryModel,
    });
    fireEvent.click(screen.getByText('TP-HS3.6').closest('[role="button"]') as HTMLElement);
    expect(setBatteryModel).toHaveBeenCalledWith('TP-HS7.2');
    expect(setSecondaryBatteryModel).toHaveBeenCalledWith(null);
  });

  it('unmarks secondary when clicking the selected secondary', () => {
    const setSecondaryBatteryModel = vi.fn();
    renderBatteryPicker({
      selectedModel: 'TP-HS3.6',
      secondarySelectedModel: 'TP-HS7.2',
      topology: 'HighVoltage',
      setSecondaryBatteryModel,
    });
    fireEvent.click(screen.getByText('TP-HS7.2').closest('[role="button"]') as HTMLElement);
    expect(setSecondaryBatteryModel).toHaveBeenCalledWith(null);
  });

  it('does nothing (both slots filled) when clicking a third battery', () => {
    const setBatteryModel = vi.fn();
    const setSecondaryBatteryModel = vi.fn();
    renderBatteryPicker({
      batteries: [hvBattery, hvBattery2, masterWithExpansion, expansionSlave],
      selectedModel: 'TP-HS3.6',
      secondarySelectedModel: 'TP-HS7.2',
      topology: 'HighVoltage',
      setBatteryModel,
      setSecondaryBatteryModel,
    });
    fireEvent.click(screen.getByText('TP-HS-MASTER').closest('[role="button"]') as HTMLElement);
    expect(setBatteryModel).not.toHaveBeenCalled();
    expect(setSecondaryBatteryModel).not.toHaveBeenCalled();
  });

  it('excludes expansion/slave models from the selectable grid', () => {
    renderBatteryPicker({ batteries: [hvBattery, masterWithExpansion, expansionSlave], topology: 'HighVoltage' });
    expect(screen.queryByText('TP-HS3.6-EXP')).not.toBeInTheDocument();
    expect(screen.getByText('TP-HS-MASTER')).toBeInTheDocument();
  });

  it('shows summary with solution quantity and secondary battery when both selected', () => {
    const solution: Solution = {
      inverterId: 'i1',
      inverterModel: 'X1',
      batteryId: 'b1',
      batteryModel: 'TP-HS3.6',
      batteryQty: 2,
      pvPowerKw: null,
      accessories: [],
    };
    renderBatteryPicker({
      selectedModel: 'TP-HS3.6',
      secondarySelectedModel: 'TP-HS7.2',
      topology: 'HighVoltage',
      solution,
    });
    expect(screen.getByText(/TP-HS3.6 · 3.6 kWh · x2 \+ TP-HS7.2 · 3.6 kWh/)).toBeInTheDocument();
  });

  it('shows "modelo pendente" summary when topology chosen but no model selected', () => {
    renderBatteryPicker({ topology: 'HighVoltage' });
    expect(screen.getByText(/Alta tensão \(HV\) · modelo pendente/)).toBeInTheDocument();
  });

  it('shows in-stock badge when the user has the battery in stock', () => {
    const userStockItems: UserStockItem[] = [
      { id: 's1', productType: 'battery', productModel: 'TP-HS3.6', unitValue: 100, createdAt: '', updatedAt: '' },
    ];
    renderBatteryPicker({ topology: 'HighVoltage', userStockItems });
    expect(screen.getByText('No catálogo')).toBeInTheDocument();
  });

  it('opens the image preview modal and document preview modal', () => {
    renderBatteryPicker({ topology: 'HighVoltage' });
    const zoomButtons = screen.getAllByRole('button').filter((btn) => btn.className.includes('cursor-zoom-in'));
    fireEvent.click(zoomButtons[0]);
    fireEvent.click(screen.getByText('Manual'));
  });

  it('shows "Sem anexos" when a battery has no documents', () => {
    renderBatteryPicker({ batteries: [hvBattery2], topology: 'HighVoltage' });
    expect(screen.getByText('Sem anexos')).toBeInTheDocument();
  });

  it('supports keyboard activation (Enter) to select a battery', () => {
    const setBatteryModel = vi.fn();
    renderBatteryPicker({ topology: 'HighVoltage', setBatteryModel });
    const card = screen.getByText('TP-HS3.6').closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(setBatteryModel).toHaveBeenCalledWith('TP-HS3.6');
  });

  it('ignores other keys on the card', () => {
    const setBatteryModel = vi.fn();
    renderBatteryPicker({ topology: 'HighVoltage', setBatteryModel });
    const card = screen.getByText('TP-HS3.6').closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(card, { key: 'Tab' });
    expect(setBatteryModel).not.toHaveBeenCalled();
  });
});

const inverter1: InverterCatalogOption = {
  id: 'i1',
  model: 'X1-Hybrid-5.0kW-G4',
  nickname: 'Inversor 1',
  topology: 'HV',
  phases: 1,
  standardPowerKva: 5,
  peakPowerKva: 7,
  maxPowerPerPhaseW: null,
  imageUrl: 'https://example.com/i1.png',
  documents: [{ name: 'Datasheet', url: 'https://example.com/ds.pdf' }],
  flags: [],
};

const inverter2: InverterCatalogOption = {
  ...inverter1,
  id: 'i2',
  model: 'X3-Hybrid-8.0kW-G4',
  nickname: undefined,
  imageUrl: null,
  documents: [],
};

function renderInverterPicker(props: Partial<React.ComponentProps<typeof InverterModelPicker>> = {}) {
  return render(
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <InverterModelPicker
        inverters={[inverter1, inverter2]}
        availableModels={null}
        selectedModel={null}
        loading={false}
        setInverterModel={vi.fn()}
        userStockItems={[]}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe('InverterModelPicker', () => {
  it('shows loading skeleton', () => {
    renderInverterPicker({ loading: true });
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('selects "Todos" (null model)', () => {
    const setInverterModel = vi.fn();
    renderInverterPicker({ selectedModel: 'X1-Hybrid-5.0kW-G4', setInverterModel });
    fireEvent.click(screen.getByText('Todos').closest('[role="button"]') as HTMLElement);
    expect(setInverterModel).toHaveBeenCalledWith(null);
  });

  it('supports keyboard activation on "Todos"', () => {
    const setInverterModel = vi.fn();
    renderInverterPicker({ setInverterModel });
    const card = screen.getByText('Todos').closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(card, { key: ' ' });
    expect(setInverterModel).toHaveBeenCalledWith(null);
  });

  it('selects a specific inverter model', () => {
    const setInverterModel = vi.fn();
    renderInverterPicker({ setInverterModel });
    fireEvent.click(screen.getByText('X1-Hybrid-5.0kW-G4').closest('[role="button"]') as HTMLElement);
    expect(setInverterModel).toHaveBeenCalledWith('X1-Hybrid-5.0kW-G4');
  });

  it('supports keyboard activation on a specific inverter', () => {
    const setInverterModel = vi.fn();
    renderInverterPicker({ setInverterModel });
    const card = screen.getByText('X1-Hybrid-5.0kW-G4').closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(setInverterModel).toHaveBeenCalledWith('X1-Hybrid-5.0kW-G4');
    fireEvent.keyDown(card, { key: 'x' });
    expect(setInverterModel).toHaveBeenCalledTimes(1);
  });

  it('narrows visible inverters by availableModels', () => {
    renderInverterPicker({ availableModels: new Set(['X1-Hybrid-5.0kW-G4']) });
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.queryByText('X3-Hybrid-8.0kW-G4')).not.toBeInTheDocument();
  });

  it('shows an empty state when availableModels narrows to zero', () => {
    renderInverterPicker({ availableModels: new Set() });
    expect(screen.getByText(/Nenhum inversor com solução aprovada/)).toBeInTheDocument();
  });

  it('shows in-stock badge for inverters the user has in stock', () => {
    const userStockItems: UserStockItem[] = [
      { id: 's1', productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 100, createdAt: '', updatedAt: '' },
    ];
    renderInverterPicker({ userStockItems });
    expect(screen.getByText('No catálogo')).toBeInTheDocument();
  });

  it('opens image and document preview modals', () => {
    renderInverterPicker();
    const zoomButtons = screen.getAllByRole('button').filter((btn) => btn.className.includes('cursor-zoom-in'));
    fireEvent.click(zoomButtons[0]);
    fireEvent.click(screen.getByText('Datasheet'));
  });

  it('shows "Sem anexos" for inverters without documents', () => {
    renderInverterPicker({ inverters: [inverter2] });
    expect(screen.getByText('Sem anexos')).toBeInTheDocument();
  });
});
