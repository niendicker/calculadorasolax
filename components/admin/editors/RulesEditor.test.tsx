// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AccessoryRow, AccessoryRuleRow, BatteryRow, EssCompatibilityRuleRow, InverterRow } from '../types';
import { RulesEditor, type RulesJumpTarget } from './RulesEditor';

function makeAccessory(partial: Partial<AccessoryRow> & Pick<AccessoryRow, 'id' | 'model'>): AccessoryRow {
  return { description: '', active: true, image_url: null, documents: [], ...partial };
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
    scale_with_metric: false,
    metric_divisor: 1,
    comment: null,
    desired_features: [],
    active: true,
    accessories: null,
    ...partial,
  };
}

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
  accessories?: AccessoryRow[];
  inverters?: InverterRow[];
  batteries?: BatteryRow[];
  rules?: AccessoryRuleRow[];
  essRows?: EssCompatibilityRuleRow[];
  onSaveRule?: (afterPersist?: () => void) => void;
  onRemoveRule?: (id: string) => void;
  onSaveEss?: (afterPersist?: () => void) => void;
  onRemoveEss?: (id: string) => void;
  removingIds?: Set<string>;
  saving?: boolean;
  jumpTarget?: RulesJumpTarget;
}) {
  const [ruleForm, setRuleForm] = useState<Partial<AccessoryRuleRow>>({});
  const [essForm, setEssForm] = useState<Partial<EssCompatibilityRuleRow>>({});
  return (
    <RulesEditor
      accessories={overrides.accessories ?? [makeAccessory({ id: 'a1', model: 'Smart Meter' })]}
      inverters={overrides.inverters ?? [makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
      batteries={overrides.batteries ?? [battery]}
      rules={overrides.rules ?? []}
      ruleForm={ruleForm}
      setRuleForm={setRuleForm}
      onSaveRule={overrides.onSaveRule ?? vi.fn()}
      onRemoveRule={overrides.onRemoveRule ?? vi.fn()}
      essRows={overrides.essRows ?? []}
      essForm={essForm}
      setEssForm={setEssForm}
      onSaveEss={overrides.onSaveEss ?? vi.fn()}
      onRemoveEss={overrides.onRemoveEss ?? vi.fn()}
      removingIds={overrides.removingIds ?? new Set()}
      saving={overrides.saving ?? false}
      jumpTarget={overrides.jumpTarget ?? null}
    />
  );
}

describe('RulesEditor: scope switching', () => {
  it('defaults to the "Regras de acessórios" scope with no jump target', () => {
    render(<ControlledEditor rules={[makeRule({ id: 'r1', accessory_id: 'a1', name: 'Regra do Smart Meter' })]} />);
    expect(screen.getByText('Regra do Smart Meter')).toBeInTheDocument();
  });

  it('starts on the "Compatibilidade ESS" scope, pre-filtered to the inverter, when jumping from an inverter', () => {
    render(
      <ControlledEditor
        essRows={[
          makeEssRule({ id: 'e1', inverter_model: 'X1-Hybrid-5.0kW-G4', name: 'Compat X1' }),
          makeEssRule({ id: 'e2', inverter_model: 'other-model', name: 'Compat outro' }),
        ]}
        jumpTarget={{ scope: 'ess', inverterModel: 'X1-Hybrid-5.0kW-G4' }}
      />
    );
    expect(screen.getByText('Compat X1')).toBeInTheDocument();
    expect(screen.queryByText('Compat outro')).not.toBeInTheDocument();
  });

  it('starts on the "Regras de acessórios" scope, pre-filtered to the accessory, when jumping from an accessory', () => {
    render(
      <ControlledEditor
        rules={[
          makeRule({ id: 'r1', accessory_id: 'a1', name: 'Regra A', accessories: { model: 'Smart Meter' } }),
          makeRule({ id: 'r2', accessory_id: 'a2', name: 'Regra B', accessories: { model: 'Matebox' } }),
        ]}
        jumpTarget={{ scope: 'accessory', accessoryId: 'a1', accessoryModel: 'Smart Meter' }}
      />
    );
    expect(screen.getByText('Regra A')).toBeInTheDocument();
    expect(screen.queryByText('Regra B')).not.toBeInTheDocument();
  });

  it('switches scope via the segmented tabs', () => {
    render(
      <ControlledEditor
        rules={[makeRule({ id: 'r1', accessory_id: 'a1', name: 'Regra A', accessories: { model: 'Smart Meter' } })]}
        essRows={[makeEssRule({ id: 'e1', inverter_model: 'X1-Hybrid-5.0kW-G4', name: 'Compat X1' })]}
      />
    );
    expect(screen.getByText('Regra A')).toBeInTheDocument();
    expect(screen.queryByText('Compat X1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Compatibilidade ESS/ }));
    expect(screen.getByText('Compat X1')).toBeInTheDocument();
    expect(screen.queryByText('Regra A')).not.toBeInTheDocument();
  });
});

describe('RulesEditor: accessory rules', () => {
  it('creates a new rule with the accessory pre-selected from a jump target, and saves', () => {
    const onSaveRule = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSaveRule={onSaveRule} jumpTarget={{ scope: 'accessory', accessoryId: 'a1', accessoryModel: 'Smart Meter' }} />);

    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));
    const dialog = screen.getByRole('dialog', { name: /Nova regra/ });
    expect(within(dialog).getByLabelText('Acessório')).toHaveValue('a1');

    fireEvent.click(within(dialog).getByRole('button', { name: /Salvar/ }));
    expect(onSaveRule).toHaveBeenCalled();
  });

  it('requires picking an accessory explicitly when there is no jump target', () => {
    render(<ControlledEditor accessories={[makeAccessory({ id: 'a1', model: 'Smart Meter' }), makeAccessory({ id: 'a2', model: 'Matebox' })]} />);

    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));
    const dialog = screen.getByRole('dialog', { name: /Nova regra/ });
    expect(within(dialog).getByLabelText('Acessório')).toHaveValue('');

    fireEvent.change(within(dialog).getByLabelText('Acessório'), { target: { value: 'a2' } });
    expect(within(dialog).getByLabelText('Acessório')).toHaveValue('a2');
  });

  it('has no obrigatório/opcional choice — every rule-applied accessory is required', () => {
    render(<ControlledEditor rules={[makeRule({ id: 'r1', accessory_id: 'a1', name: 'Regra A', accessories: { model: 'Smart Meter' } })]} />);

    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));
    expect(screen.queryByLabelText('Inclusão')).not.toBeInTheDocument();

    const card = screen.getByText('Regra A').closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).queryByText('obrigatório')).not.toBeInTheDocument();
    expect(within(card).queryByText('opcional')).not.toBeInTheDocument();
  });

  it('toggles "Escalar quantidade com o limiar", disabled when the trigger is "Por solução"', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));
    const dialog = screen.getByRole('dialog', { name: /Nova regra/ });

    expect(within(dialog).getByRole('checkbox', { name: /Escalar quantidade com o limiar/ })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Limiar baseado em'), { target: { value: 'battery_ports_used' } });
    const scaleCheckbox = within(dialog).getByRole('checkbox', { name: /Escalar quantidade com o limiar/ });
    expect(scaleCheckbox).not.toBeDisabled();

    fireEvent.click(scaleCheckbox);
    expect(scaleCheckbox).toBeChecked();
  });

  it('only shows "Agrupar a cada" once scaling is on, and lets the group size be edited', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));
    const dialog = screen.getByRole('dialog', { name: /Nova regra/ });

    fireEvent.change(within(dialog).getByLabelText('Limiar baseado em'), { target: { value: 'battery_quantity' } });
    expect(within(dialog).queryByLabelText(/^Agrupar a cada/)).not.toBeInTheDocument();

    const scaleCheckbox = within(dialog).getByRole('checkbox', { name: /Escalar quantidade com o limiar/ });
    expect(scaleCheckbox).not.toBeDisabled();
    fireEvent.click(scaleCheckbox);
    fireEvent.change(within(dialog).getByLabelText(/^Agrupar a cada/), { target: { value: '4' } });
    expect(within(dialog).getByLabelText(/^Agrupar a cada/)).toHaveValue(4);
  });

  it('hides "Agrupar a cada" for "Baterias por porta" — it always scales by total ports, not a group size', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));
    const dialog = screen.getByRole('dialog', { name: /Nova regra/ });

    fireEvent.change(within(dialog).getByLabelText('Limiar baseado em'), { target: { value: 'battery_quantity_per_port' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Escalar quantidade com o limiar/ }));
    expect(within(dialog).queryByLabelText(/^Agrupar a cada/)).not.toBeInTheDocument();
  });

  it('shows the scaling formula in the rule card details when scale_with_metric is on', () => {
    render(
      <ControlledEditor
        rules={[
          makeRule({
            id: 'r1',
            accessory_id: 'a1',
            name: 'Regra A',
            accessories: { model: 'Smart Meter' },
            trigger_metric: 'battery_ports_used',
            quantity_per_match: 1,
            scale_with_metric: true,
          }),
        ]}
      />
    );
    const card = screen.getByText('Regra A').closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('1 a cada 1 de Portas de bateria')).toBeInTheDocument();
  });

  it('shows "X por porta em uso" for battery_quantity_per_port instead of an "a cada" group size', () => {
    render(
      <ControlledEditor
        rules={[
          makeRule({
            id: 'r1',
            accessory_id: 'a1',
            name: 'Regra B',
            accessories: { model: 'Smart Meter' },
            trigger_metric: 'battery_quantity_per_port',
            quantity_per_match: 1,
            scale_with_metric: true,
          }),
        ]}
      />
    );
    const card = screen.getByText('Regra B').closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('1 por porta em uso')).toBeInTheDocument();
  });

  it('groups rules into sections by accessory, with a count badge per section', () => {
    render(
      <ControlledEditor
        rules={[
          makeRule({ id: 'r1', accessory_id: 'a1', name: 'Regra A1', accessories: { model: 'Smart Meter' } }),
          makeRule({ id: 'r2', accessory_id: 'a1', name: 'Regra A2', accessories: { model: 'Smart Meter' } }),
          makeRule({ id: 'r3', accessory_id: 'a2', name: 'Regra B1', accessories: { model: 'Matebox' } }),
        ]}
      />
    );
    const headerRow = screen.getByText('Smart Meter').closest('div') as HTMLElement;
    expect(within(headerRow).getByText('2')).toBeInTheDocument();

    const smartMeterGroup = headerRow.parentElement as HTMLElement;
    expect(within(smartMeterGroup).getByText('Regra A1')).toBeInTheDocument();
    expect(within(smartMeterGroup).getByText('Regra A2')).toBeInTheDocument();
    expect(within(smartMeterGroup).queryByText('Regra B1')).not.toBeInTheDocument();
  });

  it('removes a rule via the confirm popover', async () => {
    const onRemoveRule = vi.fn();
    render(
      <ControlledEditor
        rules={[makeRule({ id: 'r1', accessory_id: 'a1', name: 'Regra A', accessories: { model: 'Smart Meter' } })]}
        onRemoveRule={onRemoveRule}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remover Regra A' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));
    expect(onRemoveRule).toHaveBeenCalledWith('r1');
  });

  it('groups accessory rules by "Limiar baseado em", then by accessory model', () => {
    render(
      <ControlledEditor
        rules={[
          makeRule({ id: 'r1', accessory_id: 'a1', name: 'Regra Qtd. baterias', accessories: { model: 'Smart Meter' }, trigger_metric: 'battery_quantity' }),
          makeRule({ id: 'r2', accessory_id: 'a1', name: 'Regra Por solução', accessories: { model: 'Smart Meter' }, trigger_metric: 'per_solution' }),
          makeRule({ id: 'r3', accessory_id: 'a2', name: 'Regra Qtd. inversores', accessories: { model: 'Matebox' }, trigger_metric: 'inverter_quantity' }),
        ]}
      />
    );

    // All three rules show up when no threshold tab is selected.
    expect(screen.getByText('Regra Qtd. baterias')).toBeInTheDocument();
    expect(screen.getByText('Regra Por solução')).toBeInTheDocument();
    expect(screen.getByText('Regra Qtd. inversores')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: (_, el) => el.textContent === 'Qtd. baterias1' }));
    expect(screen.getByText('Regra Qtd. baterias')).toBeInTheDocument();
    expect(screen.queryByText('Regra Por solução')).not.toBeInTheDocument();
    expect(screen.queryByText('Regra Qtd. inversores')).not.toBeInTheDocument();
  });
});

describe('RulesEditor: ESS compatibility', () => {
  it('creates a new compatibility with the inverter pre-selected from a jump target, and saves', () => {
    const onSaveEss = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSaveEss={onSaveEss} jumpTarget={{ scope: 'ess', inverterModel: 'X1-Hybrid-5.0kW-G4' }} />);

    fireEvent.click(screen.getByRole('button', { name: /Nova compatibilidade/ }));
    const dialog = screen.getByRole('dialog', { name: /Nova compatibilidade ESS/ });
    expect(within(dialog).getByLabelText('Modelo')).toHaveValue('X1-Hybrid-5.0kW-G4');
    expect(within(dialog).getByRole('button', { name: /TP-HS3.6/ })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /TP-HS3.6/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Salvar/ }));
    expect(onSaveEss).toHaveBeenCalled();
  });

  it('requires picking an inverter explicitly when there is no jump target', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Compatibilidade ESS/ }));
    fireEvent.click(screen.getByRole('button', { name: /Nova compatibilidade/ }));

    const dialog = screen.getByRole('dialog', { name: /Nova compatibilidade ESS/ });
    expect(within(dialog).getByLabelText('Modelo')).toHaveValue('');
    expect(within(dialog).getByText('Selecione um inversor para listar baterias compatíveis.')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Modelo'), { target: { value: 'X1-Hybrid-5.0kW-G4' } });
    expect(within(dialog).getByRole('button', { name: /TP-HS3.6/ })).toBeInTheDocument();
  });

  it('removes an ESS rule via the confirm popover', async () => {
    const onRemoveEss = vi.fn();
    render(
      <ControlledEditor
        essRows={[makeEssRule({ id: 'e1', inverter_model: 'X1-Hybrid-5.0kW-G4', name: 'Compat X1' })]}
        onRemoveEss={onRemoveEss}
        jumpTarget={{ scope: 'ess', inverterModel: 'X1-Hybrid-5.0kW-G4' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remover Compat X1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));
    expect(onRemoveEss).toHaveBeenCalledWith('e1');
  });

  it('groups ESS rows by the inverter cadastro\'s network type, then by inverter model', () => {
    render(
      <ControlledEditor
        inverters={[
          makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4', grid_types: ['1P_220V'] }),
          makeInverter({ id: 'i2', model: 'X3-Hybrid-10.0kW-G4', grid_types: ['3P_380V'] }),
        ]}
        essRows={[
          makeEssRule({ id: 'e1', inverter_model: 'X1-Hybrid-5.0kW-G4', name: 'Compat X1 Mono', grid_topology: '1p_220V' }),
          makeEssRule({ id: 'e2', inverter_model: 'X3-Hybrid-10.0kW-G4', name: 'Compat X3 Tri', grid_topology: '3p_380V' }),
          // No grid_topology pinned — should still land under the network its inverter is
          // actually registered for, taken from the inverter's own cadastro, not left in limbo.
          makeEssRule({ id: 'e3', inverter_model: 'X1-Hybrid-5.0kW-G4', name: 'Compat X1 sem rede fixa', grid_topology: null }),
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Compatibilidade ESS/ }));

    // All three rules show up when no network-type tab is selected.
    expect(screen.getByText('Compat X1 Mono')).toBeInTheDocument();
    expect(screen.getByText('Compat X3 Tri')).toBeInTheDocument();
    expect(screen.getByText('Compat X1 sem rede fixa')).toBeInTheDocument();

    // Switching to the "Monofásica 220V" tab keeps only rules whose inverter is
    // registered for that network — including the one with no grid_topology pinned.
    fireEvent.click(screen.getByRole('button', { name: /Monofásica 220V/ }));
    expect(screen.getByText('Compat X1 Mono')).toBeInTheDocument();
    expect(screen.getByText('Compat X1 sem rede fixa')).toBeInTheDocument();
    expect(screen.queryByText('Compat X3 Tri')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Trifásica 380V/ }));
    expect(screen.getByText('Compat X3 Tri')).toBeInTheDocument();
    expect(screen.queryByText('Compat X1 Mono')).not.toBeInTheDocument();
    expect(screen.queryByText('Compat X1 sem rede fixa')).not.toBeInTheDocument();
  });
});
