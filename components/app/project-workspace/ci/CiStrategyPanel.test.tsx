// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultCiOptions } from '@/lib/store/defaults';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiStrategyPanel } from './CiStrategyPanel';

function ControlledPanel({ initial }: { initial?: Partial<CommercialIndustrialOptions> }) {
  const [ciOptions, setCiOptions] = useState<CommercialIndustrialOptions>({ ...defaultCiOptions, ...initial });
  return <CiStrategyPanel ciOptions={ciOptions} onChange={(partial) => setCiOptions((s) => ({ ...s, ...partial }))} />;
}

describe('CiStrategyPanel', () => {
  it('never offers BASE as a selectable strategy', () => {
    render(<ControlledPanel />);
    // Anchored at the start: the Híbrido card's own description text
    // mentions "Peak Shaving" and "Load Shifting" by name (it explains how
    // it combines them), which would otherwise also match an unanchored
    // /Peak Shaving/ or /Load Shifting/ query against its accessible name.
    expect(screen.getByRole('button', { name: /^Peak Shaving/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Load Shifting/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Híbrido/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^BASE/ })).not.toBeInTheDocument();
  });

  it('defaults to Híbrido without financial ranking controls', () => {
    render(<ControlledPanel />);
    expect(screen.getByRole('button', { name: /^Híbrido/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Payback' })).not.toBeInTheDocument();
  });

  it('selects a strategy', () => {
    render(<ControlledPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Peak Shaving/ }));
    expect(screen.getByRole('button', { name: /^Peak Shaving/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Híbrido/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps legacy ranking values invisible while preserving financial assumptions', () => {
    render(<ControlledPanel initial={{rankingCriterion:'NPV'}}/>);
    for(const name of ['Payback','ROI','VPL (NPV)'])expect(screen.queryByRole('button',{name})).not.toBeInTheDocument();
    expect(screen.getByLabelText('Taxa de desconto')).toHaveValue(12);
  });

  it('edits financial assumptions and clamps them to their bounds', () => {
    render(<ControlledPanel />);
    fireEvent.change(screen.getByLabelText('Taxa de desconto'), { target: { value: '15' } });
    expect(screen.getByLabelText('Taxa de desconto')).toHaveValue(15);

    fireEvent.change(screen.getByLabelText('Taxa de desconto'), { target: { value: '150' } });
    expect(screen.getByLabelText('Taxa de desconto')).toHaveValue(100);

    fireEvent.change(screen.getByLabelText('Horizonte de análise'), { target: { value: '99' } });
    expect(screen.getByLabelText('Horizonte de análise')).toHaveValue(30);

    fireEvent.change(screen.getByLabelText('Meses faturados por ano'), { target: { value: '13' } });
    expect(screen.getByLabelText('Meses faturados por ano')).toHaveValue(12);

    fireEvent.change(screen.getByLabelText('Inflação energética anual'), { target: { value: '-2.5' } });
    expect(screen.getByLabelText('Inflação energética anual')).toHaveValue(-2.5);
  });

  it('calls onNavigatePrev and onNavigateNext when clicked', () => {
    const onNavigatePrev = vi.fn();
    const onNavigateNext = vi.fn();
    render(
      <CiStrategyPanel
        ciOptions={defaultCiOptions}
        onChange={vi.fn()}
        onNavigatePrev={onNavigatePrev}
        onNavigateNext={onNavigateNext}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Voltar para Tarifa/i }));
    expect(onNavigatePrev).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /Avançar para Resultados/i }));
    expect(onNavigateNext).toHaveBeenCalledOnce();
  });
});
