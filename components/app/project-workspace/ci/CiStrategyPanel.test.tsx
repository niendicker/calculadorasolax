// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(screen.getByRole('button', { name: /Peak Shaving/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load Shifting/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Híbrido/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^BASE/ })).not.toBeInTheDocument();
  });

  it('defaults to Híbrido (matching defaultCiOptions) and Payback', () => {
    render(<ControlledPanel />);
    expect(screen.getByRole('button', { name: /Híbrido/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Payback' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects a strategy', () => {
    render(<ControlledPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Peak Shaving/ }));
    expect(screen.getByRole('button', { name: /Peak Shaving/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Híbrido/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects a ranking criterion', () => {
    render(<ControlledPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'NPV' }));
    expect(screen.getByRole('button', { name: 'NPV' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Payback' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('edits financial assumptions and clamps them to their bounds', () => {
    render(<ControlledPanel />);
    fireEvent.change(screen.getByLabelText('Taxa de desconto (%/ano)'), { target: { value: '15' } });
    expect(screen.getByLabelText('Taxa de desconto (%/ano)')).toHaveValue(15);

    fireEvent.change(screen.getByLabelText('Taxa de desconto (%/ano)'), { target: { value: '150' } });
    expect(screen.getByLabelText('Taxa de desconto (%/ano)')).toHaveValue(100);

    fireEvent.change(screen.getByLabelText('Horizonte de análise (anos)'), { target: { value: '99' } });
    expect(screen.getByLabelText('Horizonte de análise (anos)')).toHaveValue(30);

    fireEvent.change(screen.getByLabelText('Meses faturados por ano'), { target: { value: '13' } });
    expect(screen.getByLabelText('Meses faturados por ano')).toHaveValue(12);

    fireEvent.change(screen.getByLabelText('Inflação energética anual (%)'), { target: { value: '-2.5' } });
    expect(screen.getByLabelText('Inflação energética anual (%)')).toHaveValue(-2.5);
  });
});
