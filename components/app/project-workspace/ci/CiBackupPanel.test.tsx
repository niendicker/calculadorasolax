// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CiBackupPanel } from './CiBackupPanel';
import { defaultCiOptions } from '@/lib/store/defaults';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';

describe('CiBackupPanel', () => {
  it('renders disabled state by default with toggle button', () => {
    const onChange = vi.fn();
    render(<CiBackupPanel ciOptions={defaultCiOptions} onChange={onChange} />);

    expect(screen.getByText('Proteção para Falta de Rede (Backup C&I)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Habilitar Backup' })).toBeInTheDocument();
    expect(screen.getByText(/A proteção de backup está desativada/i)).toBeInTheDocument();
  });

  it('enables backup when clicking toggle button', () => {
    const onChange = vi.fn();
    render(<CiBackupPanel ciOptions={defaultCiOptions} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Habilitar Backup' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        backup: expect.objectContaining({ enabled: true }),
      })
    );
  });

  it('renders simple mode inputs and handles value changes', () => {
    const onChange = vi.fn();
    const ciOptionsWithBackup: CommercialIndustrialOptions = {
      ...defaultCiOptions,
      backup: {
        enabled: true,
        inputMode: 'simple',
        targetPowerKw: 50,
        targetPeakPowerKw: 75,
        autonomyHours: 4,
        loads: [],
        safetyMarginPercent: 10,
      },
    };

    render(<CiBackupPanel ciOptions={ciOptionsWithBackup} onChange={onChange} />);

    expect(screen.getByText('Backup Habilitado')).toBeInTheDocument();
    expect(screen.getByLabelText(/Potência crítica contínua/i)).toHaveValue(50);
    expect(screen.getByLabelText(/Autonomia desejada/i)).toHaveValue(4);

    const powerInput = screen.getByLabelText(/Potência crítica contínua/i);
    fireEvent.change(powerInput, { target: { value: '60' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        backup: expect.objectContaining({ targetPowerKw: 60 }),
      })
    );
  });

  it('supports detailed mode and allows adding and removing loads', () => {
    const onChange = vi.fn();
    const ciOptionsDetailed: CommercialIndustrialOptions = {
      ...defaultCiOptions,
      backup: {
        enabled: true,
        inputMode: 'detailed',
        targetPowerKw: 0,
        autonomyHours: 3,
        loads: [
          { id: 'load-1', name: 'Servidores TI', powerW: 10000, quantity: 2, usageFactor: 1 },
        ],
        safetyMarginPercent: 10,
      },
    };

    render(<CiBackupPanel ciOptions={ciOptionsDetailed} onChange={onChange} />);

    expect(screen.getByText('Servidores TI')).toBeInTheDocument();
    expect(screen.getByText('20.00 kW')).toBeInTheDocument();

    // Add a new load
    fireEvent.change(screen.getByPlaceholderText(/Nome da carga/i), { target: { value: 'Iluminação' } });
    fireEvent.change(screen.getByPlaceholderText(/Potência unitária/i), { target: { value: '3000' } });
    fireEvent.change(screen.getByPlaceholderText(/Quantidade/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar carga' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        backup: expect.objectContaining({
          loads: expect.arrayContaining([
            expect.objectContaining({ name: 'Iluminação', powerW: 3000, quantity: 1 }),
          ]),
        }),
      })
    );
  });
});
