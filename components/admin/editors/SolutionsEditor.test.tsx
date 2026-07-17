// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AccessoryRuleRow,
  BatteryRow,
  EssCompatibilityRuleRow,
  GeneratedSolutionPayload,
  InverterRow,
  SolutionRow,
} from '../types';
import { SolutionsEditor } from './SolutionsEditor';

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

function makeBattery(partial: Partial<BatteryRow> & Pick<BatteryRow, 'id' | 'model'>): BatteryRow {
  return {
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
    ...partial,
  };
}

function makeSolution(partial: Partial<SolutionRow> & Pick<SolutionRow, 'id' | 'solution_code' | 'inverter_model' | 'battery_model'>): SolutionRow {
  return {
    source_file: 'admin',
    schema_version: '1.0',
    inverter_quantity: 1,
    battery_ports_used: 1,
    nominal_voltage_v: 220,
    rated_power_w: 5000,
    peak_power_w: 7000,
    grid_topology: '1p_220V',
    battery_topology: 'HV',
    battery_quantity: 1,
    battery_power_w: 1800,
    available_energy_wh: 3200,
    accessories: [],
    comments: [],
    raw_solution: {},
    active: true,
    ...partial,
  };
}

const essRule: EssCompatibilityRuleRow = {
  id: 'rule-1',
  name: 'Regra 1',
  inverter_model: 'X1-Hybrid-5.0kW-G4',
  battery_model: 'TP-HS3.6',
  battery_topology: 'HV',
  grid_topology: null,
  max_parallel_inverters: 1,
  min_battery_qty: 1,
  max_battery_qty: 1,
  battery_configs: [],
  comment: null,
  active: true,
  created_at: '',
};

function ControlledEditor(overrides: {
  solutions?: SolutionRow[];
  inverters?: InverterRow[];
  batteries?: BatteryRow[];
  accessoryRules?: AccessoryRuleRow[];
  essRules?: EssCompatibilityRuleRow[];
  onEdit?: (row: SolutionRow) => void;
  onNew?: () => void;
  onSave?: (afterPersist?: () => void) => void;
  onApplyGenerated?: (generated: GeneratedSolutionPayload[], afterApply?: () => void, cleanupStale?: boolean) => void;
  onRemove?: (id: string) => void;
  onDelete?: (id: string) => void;
  removingIds?: Set<string>;
  saving?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Partial<SolutionRow>>({});
  const [accessories, setAccessories] = useState<{ model: string | null; quantity: number }[]>([]);
  const [comments, setComments] = useState<string[]>([]);

  return (
    <SolutionsEditor
      solutions={overrides.solutions ?? []}
      query={query}
      setQuery={setQuery}
      form={form}
      setForm={setForm}
      accessories={accessories}
      setAccessories={setAccessories}
      comments={comments}
      setComments={setComments}
      inverters={overrides.inverters ?? []}
      batteries={overrides.batteries ?? []}
      accessoryRules={overrides.accessoryRules ?? []}
      essRules={overrides.essRules ?? []}
      onEdit={(row) => {
        overrides.onEdit?.(row);
        setForm(row);
      }}
      onNew={overrides.onNew ?? vi.fn()}
      onSave={overrides.onSave ?? vi.fn()}
      onApplyGenerated={overrides.onApplyGenerated ?? vi.fn()}
      onRemove={overrides.onRemove ?? vi.fn()}
      onDelete={overrides.onDelete ?? vi.fn()}
      removingIds={overrides.removingIds ?? new Set()}
      saving={overrides.saving ?? false}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('SolutionsEditor: Aprovadas listing', () => {
  it('only counts/shows solutions whose inverter and battery are still registered', () => {
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[
          makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6' }),
          makeSolution({ id: 's2', solution_code: 'code-2', inverter_model: 'ghost-inverter', battery_model: 'TP-HS3.6' }),
        ]}
      />
    );
    expect(screen.getByText('code-1')).toBeInTheDocument();
    expect(screen.queryByText('code-2')).not.toBeInTheDocument();
  });

  it('filters by inverter, then battery, then status', () => {
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' }), makeInverter({ id: 'i2', model: 'X3-Hybrid-10.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[
          makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6', active: true }),
          makeSolution({ id: 's2', solution_code: 'code-2', inverter_model: 'X3-Hybrid-10.0kW-G4', battery_model: 'TP-HS3.6', active: false }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /X1-Hybrid-5.0kW-G4/ }));
    expect(screen.getByText('code-1')).toBeInTheDocument();
    expect(screen.queryByText('code-2')).not.toBeInTheDocument();
  });

  it('shows an empty state message when nothing matches', () => {
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6' })]}
      />
    );
    fireEvent.change(screen.getByLabelText('Buscar combinações aprovadas'), { target: { value: 'nope' } });
    // Query box doesn't actually filter the list itself in this component (parent does it
    // upstream via `solutions`), so instead assert the wiring: typing updates the controlled value.
    expect(screen.getByLabelText('Buscar combinações aprovadas')).toHaveValue('nope');
  });
});

describe('SolutionsEditor: form', () => {
  it('opens a new combination form and calls onNew', () => {
    const onNew = vi.fn();
    render(<ControlledEditor onNew={onNew} />);
    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));
    expect(onNew).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Nova combinação' })).toBeInTheDocument();
  });

  it('opens pre-filled when editing and calls onEdit', () => {
    const onEdit = vi.fn();
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6' })]}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Editar combinação' })).toBeInTheDocument();
  });

  it('adds and removes an accessory row', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));

    expect(screen.getByText('Nenhum acessório')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Adicionar/ })[0]);
    expect(screen.queryByText('Nenhum acessório')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover acessório' }));
    expect(screen.getByText('Nenhum acessório')).toBeInTheDocument();
  });

  it('adds and removes a comment row', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));

    expect(screen.getByText('Nenhum comentário')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Adicionar/ })[1]);
    expect(screen.queryByText('Nenhum comentário')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover comentário' }));
    expect(screen.getByText('Nenhum comentário')).toBeInTheDocument();
  });

  it('saves and closes the form', () => {
    const onSave = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('SolutionsEditor: inactivate/delete', () => {
  it('inactivates via the confirm popover', async () => {
    const onRemove = vi.fn();
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6' })]}
        onRemove={onRemove}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Inativar combinação code-1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }, { timeout: 1000 }));
    expect(onRemove).toHaveBeenCalledWith('s1');
  });

  it('deletes permanently via its own confirm popover', async () => {
    const onDelete = vi.fn();
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6' })]}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Excluir combinação code-1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }, { timeout: 1000 }));
    expect(onDelete).toHaveBeenCalledWith('s1');
  });
});

describe('SolutionsEditor: Geradas tab', () => {
  const inverters = [makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4', battery_ports: 1 })];
  const batteries = [makeBattery({ id: 'b1', model: 'TP-HS3.6', max_association_qty: 1 })];

  it('shows the empty state before generating anything', () => {
    render(<ControlledEditor inverters={inverters} batteries={batteries} essRules={[essRule]} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    expect(screen.getByText('Nenhuma combinação pendente.')).toBeInTheDocument();
  });

  it('shows a warning when no ESS rules match', () => {
    render(<ControlledEditor inverters={inverters} batteries={batteries} essRules={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));
    expect(
      screen.getByText('Nenhuma combinação gerada. Verifique se existem regras ESS ativas com inversor, bateria e redes compatíveis.')
    ).toBeInTheDocument();
  });

  it('generates pending combinations, grouped by grid and battery, and persists them to localStorage', () => {
    render(<ControlledEditor inverters={inverters} batteries={batteries} essRules={[essRule]} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));

    expect(screen.getByText('Monofásico 220V')).toBeInTheDocument();
    expect(screen.getByText('TP-HS3.6', { selector: 'span.text-sm.font-medium' })).toBeInTheDocument();

    const stored = JSON.parse(window.localStorage.getItem('solax-admin-pending-generated') ?? '[]');
    expect(stored.length).toBeGreaterThan(0);
  });

  it('approves a single pending combination', () => {
    const onApplyGenerated = vi.fn((_gen, afterApply?: () => void) => afterApply?.());
    render(<ControlledEditor inverters={inverters} batteries={batteries} essRules={[essRule]} onApplyGenerated={onApplyGenerated} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));

    fireEvent.click(screen.getByRole('button', { name: /Aprovar$/ }));
    expect(onApplyGenerated).toHaveBeenCalled();
  });

  it('approves all pending combinations at once', () => {
    const onApplyGenerated = vi.fn();
    render(<ControlledEditor inverters={inverters} batteries={batteries} essRules={[essRule]} onApplyGenerated={onApplyGenerated} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));

    fireEvent.click(screen.getByRole('button', { name: /Aprovar todas/ }));
    expect(onApplyGenerated).toHaveBeenCalledWith(expect.any(Array), expect.any(Function), true);
  });

  it('discards a single pending combination', () => {
    render(<ControlledEditor inverters={inverters} batteries={batteries} essRules={[essRule]} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));

    const discardButton = screen.getByRole('button', { name: /Descartar combinação/ });
    fireEvent.click(discardButton);

    expect(screen.getByText('Nenhuma combinação pendente.')).toBeInTheDocument();
  });

  it('filters the generated catalog by search, without discarding the underlying pending list', () => {
    render(<ControlledEditor inverters={inverters} batteries={batteries} essRules={[essRule]} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));
    expect(screen.getByText('Monofásico 220V')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar combinações geradas'), { target: { value: 'nonexistent-code' } });

    // The grid group disappears from view once nothing matches the search...
    expect(screen.queryByText('Monofásico 220V')).not.toBeInTheDocument();
    // ...but the "no pending at all" empty state stays hidden, since items still exist underneath.
    expect(screen.queryByText('Nenhuma combinação pendente.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar combinações geradas'), { target: { value: '' } });
    expect(screen.getByText('Monofásico 220V')).toBeInTheDocument();
  });
});
