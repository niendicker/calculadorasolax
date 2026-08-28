// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { createClient } from '@/lib/supabase/client';
import type { ResidentialOptions } from '@/lib/types';
import { describe, expect, it, vi } from 'vitest';
import { useSizingController } from './useSizingController';

const residentialOptions: ResidentialOptions = {
  topology: 'HighVoltage',
  batteryModel: null,
  secondaryBatteryModel: null,
  inverterModel: null,
  minInverterQty: null,
  gridType: null,
  loads: [],
  peakCalcMode: 'sum',
  operationHours: 0,
  desiredFeatures: [],
  whiteTariff: null,
  microgrid: null,
  generator: null,
  pv: null,
  atsPhotoUrl: null,
  atsBackupAcknowledged: false,
  maxPowerPerPhaseW: null,
};

function setup() {
  const setters = {
    setBatteryModel: vi.fn(),
    setSecondaryBatteryModel: vi.fn(),
    setInverterModel: vi.fn(),
    setMinInverterQty: vi.fn(),
    setMaxPowerPerPhaseW: vi.fn(),
    resetResidential: vi.fn(),
    setSolution: vi.fn(),
    setSummaryDrawerOpen: vi.fn(),
  };
  const calculate = vi.fn();
  const { result } = renderHook(() =>
    useSizingController({
      supabase: {} as ReturnType<typeof createClient>,
      profile: null,
      residentialOptions,
      batteryCatalog: [],
      inverterCatalog: [],
      approvedInverterCombos: [],
      calculate,
      solution: null,
      ...setters,
    })
  );
  return { result, setters, calculate };
}

describe('useSizingController', () => {
  it('updates equipment selections without recalculating automatically', () => {
    const { result, setters, calculate } = setup();

    act(() => {
      result.current.setBatteryModel('battery-1');
      result.current.setSecondaryBatteryModel('battery-2');
      result.current.setInverterModel('inverter-1');
      result.current.setMinInverterQty(2);
    });

    expect(setters.setBatteryModel).toHaveBeenCalledWith('battery-1');
    expect(setters.setSecondaryBatteryModel).toHaveBeenCalledWith('battery-2');
    expect(setters.setInverterModel).toHaveBeenCalledWith('inverter-1');
    expect(setters.setMinInverterQty).toHaveBeenCalledWith(2);
    expect(calculate).not.toHaveBeenCalled();
  });

  it('keeps calculation available as an explicit action', () => {
    const { result, calculate, setters } = setup();

    act(() => result.current.calculateAndShowSummary());

    expect(calculate).toHaveBeenCalledTimes(1);
    expect(setters.setSummaryDrawerOpen).toHaveBeenCalledWith(true);
  });
});
