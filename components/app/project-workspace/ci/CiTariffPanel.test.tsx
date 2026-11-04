// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultCiOptions } from '@/lib/store/defaults';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiTariffPanel } from './CiTariffPanel';

function ControlledPanel({ initial }: { initial?: Partial<CommercialIndustrialOptions> }) {
  const [ciOptions, setCiOptions] = useState<CommercialIndustrialOptions>({ ...defaultCiOptions, ...initial });
  return <CiTariffPanel ciOptions={ciOptions} onChange={(partial) => setCiOptions((s) => ({ ...s, ...partial }))} />;
}

describe('CiTariffPanel', () => {
  it('renders sensible defaults when the project has no tariff yet', () => {
    render(<ControlledPanel />);
    expect(screen.getByLabelText('Início')).toHaveValue('18:00');
    expect(screen.getByLabelText('Fim')).toHaveValue('21:00');
    expect(screen.getByRole('button', { name: 'Verde' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cativo' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('edits energy and demand rates', () => {
    render(<ControlledPanel />);
    fireEvent.change(screen.getByLabelText('Ponta (R$/MWh)'), { target: { value: '850' } });
    expect(screen.getByLabelText('Ponta (R$/MWh)')).toHaveValue(850);

    fireEvent.change(screen.getByLabelText('Fora ponta (R$/MWh)'), { target: { value: '420' } });
    expect(screen.getByLabelText('Fora ponta (R$/MWh)')).toHaveValue(420);

    fireEvent.change(screen.getByLabelText('Demanda contratada (kW)'), { target: { value: '300' } });
    expect(screen.getByLabelText('Demanda contratada (kW)')).toHaveValue(300);
  });

  it('switches modality and market', () => {
    render(<ControlledPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Azul' }));
    expect(screen.getByRole('button', { name: 'Azul' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Verde' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Livre (ACL)' }));
    expect(screen.getByRole('button', { name: 'Livre (ACL)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cativo' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clamps tax percentages to 0-100', () => {
    render(<ControlledPanel />);
    fireEvent.change(screen.getByLabelText('ICMS (%)'), { target: { value: '250' } });
    expect(screen.getByLabelText('ICMS (%)')).toHaveValue(100);

    fireEvent.change(screen.getByLabelText('PIS/COFINS (%)'), { target: { value: '-10' } });
    expect(screen.getByLabelText('PIS/COFINS (%)')).toHaveValue(0);
  });

  it('calls onNavigatePrev and onNavigateNext when clicked', () => {
    const onNavigatePrev = vi.fn();
    const onNavigateNext = vi.fn();
    render(
      <CiTariffPanel
        ciOptions={defaultCiOptions}
        onChange={vi.fn()}
        onNavigatePrev={onNavigatePrev}
        onNavigateNext={onNavigateNext}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Voltar para Curva de carga/i }));
    expect(onNavigatePrev).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /Avançar para Estratégia/i }));
    expect(onNavigateNext).toHaveBeenCalledOnce();
  });

  it('applies tariff presets and peak window presets', () => {
    render(<ControlledPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'CPFL Paulista (A4 Verde)' }));
    expect(screen.getByLabelText('Ponta (R$/MWh)')).toHaveValue(1420);
    expect(screen.getByLabelText('Fora ponta (R$/MWh)')).toHaveValue(510);
    expect(screen.getByLabelText('Tarifa de demanda (R$/kW-mês)')).toHaveValue(46.8);

    fireEvent.click(screen.getByRole('button', { name: '17:30–20:30' }));
    expect(screen.getByLabelText('Início')).toHaveValue('17:30');
    expect(screen.getByLabelText('Fim')).toHaveValue('20:30');
  });
});
