// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AccessoryRow, AccessoryRuleRow, BatteryRow, InverterRow } from '../types';
import { AccessoriesEditor, accessoryCategories } from './AccessoriesEditor';

function makeAccessory(partial: Partial<AccessoryRow> & Pick<AccessoryRow, 'id' | 'model'>): AccessoryRow {
  return { description: '', active: true, image_url: null, documents: [], ...partial };
}

function makeRule(partial: Partial<AccessoryRuleRow> & Pick<AccessoryRuleRow, 'id' | 'accessory_id'>): AccessoryRuleRow {
  return {
    name: 'Regra',
    inclusion: 'required',
    trigger_metric: 'per_solution',
    min_quantity: 1,
    inverter_model: null,
    inverter_models: null,
    battery_model: null,
    grid_topology: null,
    battery_topology: null,
    quantity_per_match: 1,
    comment: null,
    active: true,
    ...partial,
  };
}

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

describe('accessoryCategories', () => {
  it('categorizes as "system" when there are no rules for the accessory', () => {
    expect(accessoryCategories('a1', [])).toEqual(new Set(['system']));
  });

  it('categorizes by inverter/battery targeting across all matching rules', () => {
    const rules = [
      makeRule({ id: 'r1', accessory_id: 'a1', inverter_models: ['X1'] }),
      makeRule({ id: 'r2', accessory_id: 'a1', battery_model: 'TP-HS3.6' }),
    ];
    expect(accessoryCategories('a1', rules)).toEqual(new Set(['inverter', 'battery']));
  });

  it('categorizes as "system" when a matching rule has neither inverter nor battery filters', () => {
    const rules = [makeRule({ id: 'r1', accessory_id: 'a1' })];
    expect(accessoryCategories('a1', rules)).toEqual(new Set(['system']));
  });
});

function ControlledEditor(overrides: {
  rows?: AccessoryRow[];
  rules?: AccessoryRuleRow[];
  inverters?: InverterRow[];
  batteries?: BatteryRow[];
  onSave?: (afterPersist?: () => void) => void;
  onRemove?: (id: string) => void;
  onSaveRule?: (afterPersist?: () => void) => void;
  onRemoveRule?: (id: string) => void;
  removingIds?: Set<string>;
  saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<AccessoryRow>>({});
  const [ruleForm, setRuleForm] = useState<Partial<AccessoryRuleRow>>({});
  return (
    <AccessoriesEditor
      rows={overrides.rows ?? []}
      form={form}
      setForm={setForm}
      onSave={overrides.onSave ?? vi.fn()}
      onRemove={overrides.onRemove ?? vi.fn()}
      removingIds={overrides.removingIds ?? new Set()}
      uploadAsset={vi.fn().mockResolvedValue('https://cdn.example.com/x.png')}
      rules={overrides.rules ?? []}
      saving={overrides.saving ?? false}
      ruleForm={ruleForm}
      setRuleForm={setRuleForm}
      onSaveRule={overrides.onSaveRule ?? vi.fn()}
      onRemoveRule={overrides.onRemoveRule ?? vi.fn()}
      inverters={overrides.inverters ?? [makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
      batteries={overrides.batteries ?? [battery]}
    />
  );
}

describe('AccessoriesEditor: listing', () => {
  it('shows each accessory with active/inactive badge', () => {
    render(<ControlledEditor rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' })]} />);
    expect(screen.getByText('Smart Meter')).toBeInTheDocument();
    expect(screen.getByText('ativo')).toBeInTheDocument();
  });

  it('filters by search', () => {
    render(
      <ControlledEditor
        rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' }), makeAccessory({ id: 'a2', model: 'Matebox' })]}
      />
    );
    fireEvent.change(screen.getByLabelText('Buscar acessório por modelo'), { target: { value: 'matebox' } });
    expect(screen.getByText('Matebox')).toBeInTheDocument();
    expect(screen.queryByText('Smart Meter')).not.toBeInTheDocument();
  });

  it('filters by category when a rule targets an inverter or battery', () => {
    render(
      <ControlledEditor
        rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' }), makeAccessory({ id: 'a2', model: 'Matebox' })]}
        rules={[makeRule({ id: 'r1', accessory_id: 'a2', inverter_models: ['X1'] })]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Por inversor/ }));
    expect(screen.getByText('Matebox')).toBeInTheDocument();
    expect(screen.queryByText('Smart Meter')).not.toBeInTheDocument();
  });
});

describe('AccessoriesEditor: general form', () => {
  it('opens blank for a new accessory and saves', () => {
    const onSave = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Novo acessório/ }));
    expect(screen.getByRole('dialog', { name: 'Novo acessório' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('switches to the media tab', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo acessório/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mídias' }));
    expect(screen.getByPlaceholderText('URL da imagem')).toBeInTheDocument();
  });

  it('removes via the confirm popover', async () => {
    const onRemove = vi.fn();
    render(<ControlledEditor rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' })]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Smart Meter' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));
    expect(onRemove).toHaveBeenCalledWith('a1');
  });
});

describe('AccessoriesEditor: rules tab', () => {
  it('prompts to save the accessory first when there is no id yet', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo acessório/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Regras de aplicação' }));
    expect(screen.getByText('Salve o acessório antes de cadastrar regras de aplicação.')).toBeInTheDocument();
  });

  it('lists only rules for the current accessory, and shows the empty state otherwise', () => {
    render(
      <ControlledEditor
        rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' })]}
        rules={[makeRule({ id: 'r1', accessory_id: 'a1', name: 'Regra do Smart Meter' })]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regras de aplicação' }));

    expect(screen.getByText('Regra do Smart Meter')).toBeInTheDocument();
  });

  it('opens the new-rule modal, toggles an inverter filter, and saves', () => {
    const onSaveRule = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' })]} onSaveRule={onSaveRule} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regras de aplicação' }));
    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));

    const ruleDialog = screen.getByRole('dialog', { name: /Nova regra/ });
    expect(within(ruleDialog).getByText('Qualquer inversor.')).toBeInTheDocument();

    fireEvent.click(within(ruleDialog).getByRole('button', { name: 'X1-Hybrid-5.0kW-G4' }));
    expect(within(ruleDialog).getByText('1 inversor(es) selecionado(s).')).toBeInTheDocument();

    fireEvent.click(within(ruleDialog).getByRole('button', { name: /Salvar/ }));
    expect(onSaveRule).toHaveBeenCalled();
  });

  it('disables "Quantidade mínima" when the trigger is "Por solução"', () => {
    render(<ControlledEditor rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regras de aplicação' }));
    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));

    expect(screen.getByLabelText(/^Quantidade mínima/)).toBeDisabled();
  });

  it('removes a rule via the confirm popover', async () => {
    const onRemoveRule = vi.fn();
    render(
      <ControlledEditor
        rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' })]}
        rules={[makeRule({ id: 'r1', accessory_id: 'a1', name: 'Regra 1' })]}
        onRemoveRule={onRemoveRule}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regras de aplicação' }));

    fireEvent.click(screen.getByRole('button', { name: 'Remover Regra 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    expect(onRemoveRule).toHaveBeenCalledWith('r1');
  });
});
