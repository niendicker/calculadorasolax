// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CiBackupPanel } from './CiBackupPanel';
import { defaultCiOptions } from '@/lib/store/defaults';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';

describe('CiBackupPanel', () => {
  it('preserves the observed peak when converting an average-based curve selection to direct values',()=>{
    const loadCurve={points:[10,30].map((powerKw,index)=>({timestamp:`2026-01-01T0${index}:00:00Z`,powerKw})),resolutionMinutes:60 as const,timezone:'America/Sao_Paulo',source:'csv' as const,periodStart:'2025-12-31',periodEnd:'2025-12-31',profileBasis:'representative_period' as const};
    const backup={...defaultCiOptions.backup!,enabled:true,targetPowerKw:20,autonomyHours:2,safetyMarginPercent:0,curveSelection:{method:'average' as const,startTimestamp:loadCurve.points[0].timestamp,endTimestampExclusive:'2026-01-01T02:00:00Z'}};
    const change=vi.fn();
    render(<CiBackupPanel section="backup" ciOptions={{...defaultCiOptions,loadCurve,backup}} onChange={change}/>);
    fireEvent.click(screen.getByRole('button',{name:'Usar valores diretos'}));
    expect(change).toHaveBeenCalledWith({backup:expect.objectContaining({curveSelection:undefined,targetPowerKw:20,targetPeakPowerKw:30,autonomyHours:2})});
  });
  it('renders disabled state by default with toggle button', () => {
    const onChange = vi.fn();
    render(<CiBackupPanel ciOptions={defaultCiOptions} onChange={onChange} />);

    expect(screen.getByRole('heading', { name: 'Backup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Habilitar Backup' })).toBeInTheDocument();
    expect(screen.getByText(/Backup desativado/i)).toBeInTheDocument();
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
    expect(screen.getByRole('spinbutton', { name: /Potência crítica contínua/i })).toHaveValue(50);
    expect(screen.getByRole('spinbutton', { name: /Autonomia desejada/i })).toHaveValue(4);

    const powerInput = screen.getByRole('spinbutton', { name: /Potência crítica contínua/i });
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
    expect(screen.getByText('20.00 kVA')).toBeInTheDocument();

    // Add a new load
    fireEvent.change(screen.getByPlaceholderText(/Nome da carga/i), { target: { value: 'Iluminação' } });
    fireEvent.change(screen.getByPlaceholderText(/Potência unitária/i), { target: { value: '3' } });
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

  it('allows quickly adding a critical load from presets catalog', () => {
    const onChange = vi.fn();
    const ciOptionsDetailed: CommercialIndustrialOptions = {
      ...defaultCiOptions,
      backup: {
        enabled: true,
        inputMode: 'detailed',
        targetPowerKw: 0,
        autonomyHours: 3,
        loads: [],
        safetyMarginPercent: 10,
      },
    };

    render(<CiBackupPanel ciOptions={ciOptionsDetailed} onChange={onChange} />);

    expect(screen.getByText('Catálogo rápido de cargas comerciais essenciais:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Data Center \/ Servidores TI/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        backup: expect.objectContaining({
          loads: [
            expect.objectContaining({
              name: 'Data Center / Servidores TI',
              powerW: 5000,
              quantity: 2,
            }),
          ],
        }),
      })
    );
  });

  it('enables generator and updates generator parameters', () => {
    const onChange = vi.fn();
    const ciOptionsBackupEnabled = {
      ...defaultCiOptions,
      backup: {
        enabled: true,
        inputMode: 'simple' as const,
        targetPowerKw: 50,
        autonomyHours: 4,
        loads: [],
        safetyMarginPercent: 10,
      },
    };

    render(<CiBackupPanel ciOptions={ciOptionsBackupEnabled} onChange={onChange} />);

    expect(screen.getByText('Grupo Motor Gerador (GMG)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Integrar Gerador' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        generator: expect.objectContaining({ enabled: true }),
      })
    );
  });
});
