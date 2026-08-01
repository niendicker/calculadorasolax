// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PresetCard } from './PresetCard';

const preset = {
  name: 'Residencial essencial',
  description: 'Cargas básicas de uma casa',
  loads: [
    { name: 'Chuveiro', powerW: 5500, qty: 1, ipInRatio: 1 },
    { name: 'Geladeira', powerW: 150, qty: 1, ipInRatio: 3 },
  ],
};

describe('PresetCard', () => {
  it('renders name, description, load count, peak kVA and daily kWh, and calls onAdd when clicked', () => {
    const onAdd = vi.fn();
    render(<PresetCard preset={preset} onAdd={onAdd} operationHours={4} />);

    expect(screen.getByText('Residencial essencial')).toBeInTheDocument();
    expect(screen.getByText('Cargas básicas de uma casa')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // load count

    fireEvent.click(screen.getByRole('button'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('omits the description paragraph when the preset has none', () => {
    const onAdd = vi.fn();
    render(<PresetCard preset={{ ...preset, description: '' }} onAdd={onAdd} operationHours={4} />);

    expect(screen.queryByText('Cargas básicas de uma casa')).not.toBeInTheDocument();
  });

  it('adds right-padding for the delete button when withDeleteSpacing is set', () => {
    const onAdd = vi.fn();
    render(<PresetCard preset={preset} onAdd={onAdd} operationHours={4} withDeleteSpacing />);

    expect(screen.getByRole('button')).toHaveClass('pr-9');
  });

  it('does not add right-padding when withDeleteSpacing is unset', () => {
    const onAdd = vi.fn();
    render(<PresetCard preset={preset} onAdd={onAdd} operationHours={4} />);

    expect(screen.getByRole('button')).not.toHaveClass('pr-9');
  });

  it('computes peak kVA and daily kWh from the loads and operationHours', () => {
    const onAdd = vi.fn();
    // peakKva = (5500*1*1 + 150*3*1) / 1000 = 5.95 -> "6.0"
    // dailyKwh = 4 * (5500*1 + 150*1) / 1000 = 22.6 -> "22.6"
    render(<PresetCard preset={preset} onAdd={onAdd} operationHours={4} />);

    expect(screen.getByText('6.0')).toBeInTheDocument();
    expect(screen.getByText('22.6')).toBeInTheDocument();
  });

  it('defaults a missing ipInRatio to 1 when computing peak kVA', () => {
    const onAdd = vi.fn();
    const presetNoRatio = { name: 'Sem IP/IN', description: '', loads: [{ name: 'X', powerW: 1000, qty: 1 } as never] };
    // peakKva = 1000*1*1 / 1000 = 1.0
    render(<PresetCard preset={presetNoRatio} onAdd={onAdd} operationHours={0} />);

    expect(screen.getByText('1.0')).toBeInTheDocument();
  });
});
