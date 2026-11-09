// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CiSolarPanel } from './CiSolarPanel';
import { defaultCiOptions } from '@/lib/store/defaults';

describe('CiSolarPanel', () => {
  it('renders disabled state by default with toggle button', () => {
    const onChange = vi.fn();
    render(<CiSolarPanel ciOptions={defaultCiOptions} onChange={onChange} />);

    expect(screen.getByText('Geração Fotovoltaica (FV)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Habilitar Geração FV' })).toBeInTheDocument();
    expect(screen.getByText(/A integração solar fotovoltaica está desativada/i)).toBeInTheDocument();
  });

  it('enables solar when clicking toggle button', () => {
    const onChange = vi.fn();
    render(<CiSolarPanel ciOptions={defaultCiOptions} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Habilitar Geração FV' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        solar: expect.objectContaining({ enabled: true }),
      })
    );
  });

  it('renders input fields and updates solar parameters when enabled', () => {
    const onChange = vi.fn();
    const ciOptionsWithSolar = {
      ...defaultCiOptions,
      solar: {
        enabled: true,
        installedPowerKwp: 100,
        inverterPowerKw: 80,
        dailyYieldKwhPerKwp: 4.5,
        prioritizeBessCharging: true,
      },
    };

    render(<CiSolarPanel ciOptions={ciOptionsWithSolar} onChange={onChange} />);

    expect(screen.getByText('Sistema FV Habilitado')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Potência dos Módulos/i })).toHaveValue(100);
    expect(screen.getByRole('spinbutton', { name: /Potência dos Inversores/i })).toHaveValue(80);

    const kwpInput = screen.getByRole('spinbutton', { name: /Potência dos Módulos/i });
    fireEvent.change(kwpInput, { target: { value: '150' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        solar: expect.objectContaining({ installedPowerKwp: 150 }),
      })
    );
  });

  it('navigates prev and next when callbacks provided', () => {
    const onNavigatePrev = vi.fn();
    const onNavigateNext = vi.fn();
    render(
      <CiSolarPanel
        ciOptions={defaultCiOptions}
        onChange={vi.fn()}
        onNavigatePrev={onNavigatePrev}
        onNavigateNext={onNavigateNext}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Voltar para BESS/i }));
    expect(onNavigatePrev).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /Avançar para Curva de carga/i }));
    expect(onNavigateNext).toHaveBeenCalledOnce();
  });
});

it('converts CA inverter power at project FP without scaling the DC array or energy yield', () => {
  const onChange = vi.fn();
  render(<CiSolarPanel ciOptions={{ ...defaultCiOptions, acPowerFactor: 0.8, solar: { ...defaultCiOptions.solar!, enabled: true, inverterPowerKw: 80, installedPowerKwp: 120 } }} onChange={onChange} />);
  expect(screen.getByRole('spinbutton', { name: /Potência dos Inversores/ })).toHaveValue(100);
  expect(screen.getByRole('spinbutton', { name: /Potência dos Módulos/ })).toHaveValue(120);
  fireEvent.change(screen.getByRole('spinbutton', { name: /Potência dos Inversores/ }), { target: { value: '125' } });
  expect(onChange.mock.calls.at(-1)![0].solar).toMatchObject({ inverterPowerKw: 100, installedPowerKwp: 120, dailyYieldKwhPerKwp: 4.5 });
});
