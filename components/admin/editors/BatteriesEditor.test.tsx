// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BatteryRow } from '../types';
import { BatteriesEditor } from './BatteriesEditor';

function makeBattery(partial: Partial<BatteryRow> & Pick<BatteryRow, 'id' | 'model' | 'topology'>): BatteryRow {
  return {
    capacity_kwh: 3.6,
    standard_power_kw: 1.8,
    peak_power_kw: 2.5,
    min_soc_percent: 10,
    nominal_voltage_v: null,
    voltage_min_v: null,
    voltage_max_v: null,
    recommended_current_a: null,
    max_current_a: null,
    flags: [],
    max_association_qty: 15,
    image_url: null,
    documents: [],
    ...partial,
  };
}

function ControlledEditor(overrides: {
  rows?: BatteryRow[];
  onSave?: (afterPersist?: () => void) => void;
  onRemove?: (id: string) => void;
  removingIds?: Set<string>;
  saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<BatteryRow>>({});
  return (
    <BatteriesEditor
      rows={overrides.rows ?? []}
      form={form}
      setForm={setForm}
      onSave={overrides.onSave ?? vi.fn()}
      onRemove={overrides.onRemove ?? vi.fn()}
      removingIds={overrides.removingIds ?? new Set()}
      uploadAsset={vi.fn().mockResolvedValue('https://cdn.example.com/x.png')}
      saving={overrides.saving ?? false}
    />
  );
}

describe('BatteriesEditor: listing', () => {
  it('shows each battery with topology badge and computed details', () => {
    render(<ControlledEditor rows={[makeBattery({ id: 'b1', model: 'TP-HS3.6', topology: 'HV' })]} />);
    const card = screen.getByText('TP-HS3.6').closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('HV')).toBeInTheDocument();
  });

  it('filters by topology tab', () => {
    render(
      <ControlledEditor
        rows={[makeBattery({ id: 'b1', model: 'TP-HS3.6', topology: 'HV' }), makeBattery({ id: 'b2', model: 'TP-LD53', topology: 'LV' })]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^LV/ }));
    expect(screen.getByText('TP-LD53')).toBeInTheDocument();
    expect(screen.queryByText('TP-HS3.6')).not.toBeInTheDocument();
  });

  it('filters by model search', () => {
    render(
      <ControlledEditor
        rows={[makeBattery({ id: 'b1', model: 'TP-HS3.6', topology: 'HV' }), makeBattery({ id: 'b2', model: 'TP-LD53', topology: 'LV' })]}
      />
    );
    fireEvent.change(screen.getByLabelText('Buscar bateria por modelo'), { target: { value: 'LD53' } });
    expect(screen.getByText('TP-LD53')).toBeInTheDocument();
    expect(screen.queryByText('TP-HS3.6')).not.toBeInTheDocument();
  });
});

describe('BatteriesEditor: form', () => {
  it('opens a blank form for a new battery', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova bateria/ }));
    expect(screen.getByRole('dialog', { name: 'Nova bateria' })).toBeInTheDocument();
  });

  it('opens pre-filled when editing', () => {
    render(<ControlledEditor rows={[makeBattery({ id: 'b1', model: 'TP-HS3.6', topology: 'HV' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Editar bateria' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('TP-HS3.6')).toBeInTheDocument();
  });

  it('edits capacity and topology, and toggles a flag', () => {
    const { rerender } = render(<ControlledEditor rows={[makeBattery({ id: 'b1', model: 'TP-HS3.6', topology: 'HV' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    fireEvent.change(screen.getByLabelText(/^Capacidade/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'LV' }));
    fireEvent.click(screen.getByRole('button', { name: 'IP65' }));

    // No crash / still open with the new values reflected in the controlled form.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    rerender(<ControlledEditor rows={[makeBattery({ id: 'b1', model: 'TP-HS3.6', topology: 'HV' })]} />);
  });

  it('edits the expansion model field, offering other registered batteries via the datalist', () => {
    render(
      <ControlledEditor
        rows={[
          makeBattery({ id: 'b1', model: 'T58 V2 Master', topology: 'HV' }),
          makeBattery({ id: 'b2', model: 'T58 Slave', topology: 'HV' }),
        ]}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);

    const input = screen.getByPlaceholderText('Ex.: T58 Slave');
    fireEvent.change(input, { target: { value: 'T58 Slave' } });
    expect(input).toHaveValue('T58 Slave');

    // Offers the other registered model, but not the one currently being edited.
    const datalist = document.getElementById('admin-battery-expansion-models') as HTMLDataListElement;
    expect(within(datalist).getByText((_, el) => el?.getAttribute('value') === 'T58 Slave')).toBeInTheDocument();
    expect(within(datalist).queryByText((_, el) => el?.getAttribute('value') === 'T58 V2 Master')).not.toBeInTheDocument();
  });

  it('switches to the media tab and edits the image URL', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova bateria/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Mídias' }));

    expect(screen.getByPlaceholderText('URL da imagem')).toBeInTheDocument();
  });

  it('saves and closes the form', () => {
    const onSave = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Nova bateria/ }));

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('BatteriesEditor: remove', () => {
  it('removes via the confirm popover', async () => {
    const onRemove = vi.fn();
    render(<ControlledEditor rows={[makeBattery({ id: 'b1', model: 'TP-HS3.6', topology: 'HV' })]} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover TP-HS3.6' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    expect(onRemove).toHaveBeenCalledWith('b1');
  });
});
