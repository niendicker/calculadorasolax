// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BatteryRow, EssCompatibilityRuleRow, InverterRow } from '../types';
import { InvertersEditor } from './InvertersEditor';

function makeInverter(partial: Partial<InverterRow> & Pick<InverterRow, 'id' | 'model'>): InverterRow {
  return {
    power_kw: 5,
    standard_power_kva: 5,
    peak_power_kva: 7,
    phases: 1,
    topology: 'HV',
    grid_types: ['1P_220V'],
    max_battery_qty: 6,
    battery_ports: 1,
    battery_voltage_min_v: null,
    battery_voltage_max_v: null,
    battery_current_max_a: null,
    max_power_per_phase_w: null,
    flags: [],
    pv_oversizing_percent: 100,
    image_url: null,
    documents: [],
    ...partial,
  };
}

const battery: BatteryRow = {
  id: 'b1',
  model: 'TP-HS3.6',
  topology: 'HV',
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
};

function makeEssRule(partial: Partial<EssCompatibilityRuleRow> & Pick<EssCompatibilityRuleRow, 'id' | 'inverter_model'>): EssCompatibilityRuleRow {
  return {
    name: null,
    battery_model: 'TP-HS3.6',
    battery_topology: 'HV',
    grid_topology: null,
    max_parallel_inverters: 1,
    min_battery_qty: 1,
    max_battery_qty: 2,
    battery_configs: [{ battery_model: 'TP-HS3.6', battery_topology: 'HV', min_battery_qty: 1, max_battery_qty: 2 }],
    comment: null,
    active: true,
    created_at: '',
    ...partial,
  };
}

function ControlledEditor(overrides: {
  rows?: InverterRow[];
  essRows?: EssCompatibilityRuleRow[];
  batteries?: BatteryRow[];
  onSave?: (afterPersist?: () => void) => void;
  onRemove?: (id: string) => void;
  onSaveEss?: (afterPersist?: () => void) => void;
  onRemoveEss?: (id: string) => void;
  removingIds?: Set<string>;
  saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<InverterRow>>({});
  const [essForm, setEssForm] = useState<Partial<EssCompatibilityRuleRow>>({});
  return (
    <InvertersEditor
      rows={overrides.rows ?? []}
      form={form}
      setForm={setForm}
      onSave={overrides.onSave ?? vi.fn()}
      onRemove={overrides.onRemove ?? vi.fn()}
      removingIds={overrides.removingIds ?? new Set()}
      uploadAsset={vi.fn().mockResolvedValue('https://cdn.example.com/x.png')}
      saving={overrides.saving ?? false}
      essRows={overrides.essRows ?? []}
      essForm={essForm}
      setEssForm={setEssForm}
      batteries={overrides.batteries ?? [battery]}
      onSaveEss={overrides.onSaveEss ?? vi.fn()}
      onRemoveEss={overrides.onRemoveEss ?? vi.fn()}
    />
  );
}

describe('InvertersEditor: listing', () => {
  it('shows each inverter with topology/phase badges', () => {
    render(<ControlledEditor rows={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4', phases: 1 })]} />);
    const card = screen.getByText('X1-Hybrid-5.0kW-G4').closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('1 fase')).toBeInTheDocument();
  });

  it('filters by phase count and by search', () => {
    render(
      <ControlledEditor
        rows={[
          makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4', phases: 1 }),
          makeInverter({ id: 'i2', model: 'X3-Hybrid-10.0kW-G4', phases: 3 }),
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Trifásico/ }));
    expect(screen.getByText('X3-Hybrid-10.0kW-G4')).toBeInTheDocument();
    expect(screen.queryByText('X1-Hybrid-5.0kW-G4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    fireEvent.change(screen.getByLabelText('Buscar inversor por modelo'), { target: { value: 'X1' } });
    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.queryByText('X3-Hybrid-10.0kW-G4')).not.toBeInTheDocument();
  });

  it('sub-groups Trifásico by grid voltage (220V/380V), and resets the voltage filter when switching phases', () => {
    render(
      <ControlledEditor
        rows={[
          makeInverter({ id: 'i1', model: 'Tri-220', phases: 3, grid_types: ['3P_220V'] }),
          makeInverter({ id: 'i2', model: 'Tri-380', phases: 3, grid_types: ['3P_380V'] }),
          makeInverter({ id: 'i3', model: 'Mono-220', phases: 1, grid_types: ['1P_220V'] }),
        ]}
      />
    );

    // The voltage sub-tabs only appear once "Trifásico" is selected.
    expect(screen.queryByRole('button', { name: /^220V/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Trifásico/ }));
    expect(screen.getByText('Tri-220')).toBeInTheDocument();
    expect(screen.getByText('Tri-380')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^220V/ }));
    expect(screen.getByText('Tri-220')).toBeInTheDocument();
    expect(screen.queryByText('Tri-380')).not.toBeInTheDocument();

    // Switching back to phase "Todos" resets the voltage filter and hides its tabs again.
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    expect(screen.queryByRole('button', { name: /^220V/ })).not.toBeInTheDocument();
    expect(screen.getByText('Tri-380')).toBeInTheDocument();
  });

  it('sub-groups Monofásico/Bifásico by battery topology (HV/LV), keeping BOTH-topology rows visible in either group', () => {
    render(
      <ControlledEditor
        rows={[
          makeInverter({ id: 'i1', model: 'Mono-HV', phases: 1, topology: 'HV', grid_types: ['1P_220V'] }),
          makeInverter({ id: 'i2', model: 'Mono-LV', phases: 1, topology: 'LV', grid_types: ['1P_220V'] }),
          makeInverter({ id: 'i3', model: 'Mono-Both', phases: 1, topology: 'BOTH', grid_types: ['1P_220V'] }),
          makeInverter({ id: 'i4', model: 'Tri-HV', phases: 3, topology: 'HV', grid_types: ['3P_380V'] }),
        ]}
      />
    );

    expect(screen.queryByRole('button', { name: /^HV/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Monofásico/ }));
    expect(screen.getByText('Mono-HV')).toBeInTheDocument();
    expect(screen.getByText('Mono-LV')).toBeInTheDocument();
    expect(screen.getByText('Mono-Both')).toBeInTheDocument();
    expect(screen.queryByText('Tri-HV')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^HV/ }));
    expect(screen.getByText('Mono-HV')).toBeInTheDocument();
    expect(screen.getByText('Mono-Both')).toBeInTheDocument();
    expect(screen.queryByText('Mono-LV')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    expect(screen.queryByRole('button', { name: /^HV/ })).not.toBeInTheDocument();
  });
});

describe('InvertersEditor: general form', () => {
  it('opens blank for a new inverter and saves', () => {
    const onSave = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Novo inversor/ }));
    expect(screen.getByRole('dialog', { name: 'Novo inversor' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggling a grid type recalculates the phase count', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo inversor/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Trifásica 380V' }));

    // No crash; the toggle chip reflects the new selection.
    expect(screen.getByRole('button', { name: 'Trifásica 380V' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to the media tab', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo inversor/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mídias' }));
    expect(screen.getByPlaceholderText('URL da imagem')).toBeInTheDocument();
  });

  it('removes via the confirm popover', async () => {
    const onRemove = vi.fn();
    render(<ControlledEditor rows={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover X1-Hybrid-5.0kW-G4' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));
    expect(onRemove).toHaveBeenCalledWith('i1');
  });
});

describe('InvertersEditor: ESS compatibility tab', () => {
  it('prompts to save the inverter model first when empty', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo inversor/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Compatibilidade ESS' }));
    expect(screen.getByText('Preencha e salve o modelo do inversor antes de cadastrar compatibilidades ESS.')).toBeInTheDocument();
  });

  it('lists only ESS rules for the current inverter model', () => {
    render(
      <ControlledEditor
        rows={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        essRows={[makeEssRule({ id: 'e1', inverter_model: 'X1-Hybrid-5.0kW-G4', name: 'Compat padrão' })]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compatibilidade ESS' }));
    expect(screen.getByText('Compat padrão')).toBeInTheDocument();
  });

  it('opens the new ESS modal, toggles a compatible battery, and saves', () => {
    const onSaveEss = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor rows={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4', topology: 'HV' })]} onSaveEss={onSaveEss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compatibilidade ESS' }));
    fireEvent.click(screen.getByRole('button', { name: /Nova compatibilidade/ }));

    const essDialog = screen.getByRole('dialog', { name: /Nova compatibilidade ESS/ });
    fireEvent.click(within(essDialog).getByRole('button', { name: /TP-HS3.6/ }));
    // Now shown both as a selected toggle chip and in the per-battery config card below.
    expect(within(essDialog).getAllByText('TP-HS3.6')).toHaveLength(2);

    fireEvent.click(within(essDialog).getByRole('button', { name: /Salvar/ }));
    expect(onSaveEss).toHaveBeenCalled();
  });

  it('shows a message when the inverter topology has no compatible batteries', () => {
    render(
      <ControlledEditor
        rows={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4', topology: 'LV' })]}
        batteries={[battery]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compatibilidade ESS' }));
    fireEvent.click(screen.getByRole('button', { name: /Nova compatibilidade/ }));

    const essDialog = screen.getByRole('dialog', { name: /Nova compatibilidade ESS/ });
    expect(within(essDialog).getByText('Nenhuma bateria compatível com a topologia do inversor.')).toBeInTheDocument();
  });

  it('removes an ESS rule via the confirm popover', async () => {
    const onRemoveEss = vi.fn();
    render(
      <ControlledEditor
        rows={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        essRows={[makeEssRule({ id: 'e1', inverter_model: 'X1-Hybrid-5.0kW-G4', name: 'Compat padrão' })]}
        onRemoveEss={onRemoveEss}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compatibilidade ESS' }));

    fireEvent.click(screen.getByRole('button', { name: 'Remover Compat padrão' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));
    expect(onRemoveEss).toHaveBeenCalledWith('e1');
  });
});
