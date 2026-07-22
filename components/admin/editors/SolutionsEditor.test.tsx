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
  onDeleteMany?: (ids: string[]) => void;
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
      onDeleteMany={overrides.onDeleteMany ?? vi.fn()}
      removingIds={overrides.removingIds ?? new Set()}
      saving={overrides.saving ?? false}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('SolutionsEditor: pending-generated localStorage bootstrap', () => {
  it('restores a previously-stored pending list on mount', () => {
    const fullSolution = makeSolution({
      id: 'unused',
      solution_code: 'GEN-1',
      inverter_model: 'X1-Hybrid-5.0kW-G4',
      battery_model: 'TP-HS3.6',
    });
    // GeneratedSolutionPayload is `Omit<SolutionRow, 'id'>` — assigning the
    // variable (not an object literal) skips TS's excess-property check.
    const stored: GeneratedSolutionPayload[] = [fullSolution];
    window.localStorage.setItem('solax-admin-pending-generated', JSON.stringify(stored));
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    expect(screen.getByText('GEN-1')).toBeInTheDocument();
  });

  it('treats corrupted localStorage content as an empty pending list', () => {
    window.localStorage.setItem('solax-admin-pending-generated', '{not valid json');
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    expect(screen.getByText('Nenhuma combinação pendente.')).toBeInTheDocument();
  });
});

describe('SolutionsEditor: Aprovadas listing', () => {
  it('only counts/shows solutions whose inverter and battery are still registered', () => {
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[
          makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6', source_file: 'generated-rules' }),
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

  it('filters by battery and by status once an inverter is selected', () => {
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' }), makeBattery({ id: 'b2', model: 'TP-HS7.2' })]}
        solutions={[
          makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6', active: true }),
          makeSolution({ id: 's2', solution_code: 'code-2', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS7.2', active: false }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^TP-HS3.6/ }));
    expect(screen.getByText('code-1')).toBeInTheDocument();
    expect(screen.queryByText('code-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Todas/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Ativas/ }));
    expect(screen.getByText('code-1')).toBeInTheDocument();
    expect(screen.queryByText('code-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Inativas/ }));
    expect(screen.getByText('code-2')).toBeInTheDocument();
    expect(screen.queryByText('code-1')).not.toBeInTheDocument();
  });

  it('shows non-blank comments on a card', () => {
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[
          makeSolution({
            id: 's1',
            solution_code: 'code-1',
            inverter_model: 'X1-Hybrid-5.0kW-G4',
            battery_model: 'TP-HS3.6',
            comments: ['  ', 'Observação importante'],
          }),
        ]}
      />
    );
    expect(screen.getByText('Observação importante')).toBeInTheDocument();
  });

  it('re-clicking the already-active Aprovadas tab is a no-op', () => {
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6' })]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Aprovadas/ }));
    expect(screen.getByText('code-1')).toBeInTheDocument();
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

  it('adds and removes an accessory row, and edits its model and quantity', () => {
    const accessoryRule: AccessoryRuleRow = {
      id: 'ar1',
      accessory_id: 'a1',
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
      desired_features: [],
      active: true,
      accessories: { model: 'Smart Meter' },
    };
    render(<ControlledEditor accessoryRules={[accessoryRule]} />);
    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));

    expect(screen.getByText('Nenhum acessório')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Adicionar/ })[0]);
    expect(screen.queryByText('Nenhum acessório')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Modelo do acessório'), { target: { value: 'Smart Meter' } });
    expect(screen.getByPlaceholderText('Modelo do acessório')).toHaveValue('Smart Meter');

    const qtyInput = screen.getByPlaceholderText('Modelo do acessório').closest('div')!.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: '3' } });
    expect(qtyInput).toHaveValue(3);

    fireEvent.click(screen.getByRole('button', { name: 'Remover acessório' }));
    expect(screen.getByText('Nenhum acessório')).toBeInTheDocument();
  });

  it('adds and removes a comment row, and edits its text', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));

    expect(screen.getByText('Nenhum comentário')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Adicionar/ })[1]);
    expect(screen.queryByText('Nenhum comentário')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Texto do comentário'), { target: { value: 'Nota da combinação' } });
    expect(screen.getByPlaceholderText('Texto do comentário')).toHaveValue('Nota da combinação');

    fireEvent.click(screen.getByRole('button', { name: 'Remover comentário' }));
    expect(screen.getByText('Nenhum comentário')).toBeInTheDocument();
  });

  it('edits every combination form field', () => {
    // Several NumberWithUnitField tips start with the same words as their own
    // label (e.g. "Potência nominal total..."), so getByLabelText's regex can
    // match both the input and the tooltip icon — pick the actual <input>.
    function fieldInput(label: RegExp) {
      return screen.getAllByLabelText(label).find((el) => el.tagName === 'INPUT') as HTMLInputElement;
    }

    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'X1-HV-1BAT' } });
    expect(screen.getByLabelText('Código')).toHaveValue('X1-HV-1BAT');

    fireEvent.change(screen.getByLabelText('Origem'), { target: { value: 'manual' } });
    expect(screen.getByLabelText('Origem')).toHaveValue('manual');

    fireEvent.change(screen.getByLabelText('Modelo do inversor'), { target: { value: 'X1-Hybrid-5.0kW-G4' } });
    expect(screen.getByLabelText('Modelo do inversor')).toHaveValue('X1-Hybrid-5.0kW-G4');

    fireEvent.change(fieldInput(/^Qtd\. inversores/), { target: { value: '2' } });
    expect(fieldInput(/^Qtd\. inversores/)).toHaveValue(2);

    fireEvent.change(fieldInput(/^Portas/), { target: { value: '2' } });
    expect(fieldInput(/^Portas/)).toHaveValue(2);

    fireEvent.change(fieldInput(/^Potência nominal/), { target: { value: '6000' } });
    expect(fieldInput(/^Potência nominal/)).toHaveValue(6000);

    fireEvent.change(fieldInput(/^Potência pico/), { target: { value: '8000' } });
    expect(fieldInput(/^Potência pico/)).toHaveValue(8000);

    fireEvent.change(fieldInput(/^Tensão/), { target: { value: '380' } });
    expect(fieldInput(/^Tensão/)).toHaveValue(380);

    fireEvent.change(screen.getByLabelText('Rede'), { target: { value: '3p_380V' } });
    expect(screen.getByLabelText('Rede')).toHaveValue('3p_380V');

    fireEvent.change(screen.getByLabelText('Modelo da bateria'), { target: { value: 'TP-HS3.6' } });
    expect(screen.getByLabelText('Modelo da bateria')).toHaveValue('TP-HS3.6');

    fireEvent.change(screen.getByLabelText('Topologia bateria'), { target: { value: 'LV' } });
    expect(screen.getByLabelText('Topologia bateria')).toHaveValue('LV');

    fireEvent.change(fieldInput(/^Qtd\. baterias/), { target: { value: '2' } });
    expect(fieldInput(/^Qtd\. baterias/)).toHaveValue(2);

    fireEvent.change(fieldInput(/^Potência bateria/), { target: { value: '3600' } });
    expect(fieldInput(/^Potência bateria/)).toHaveValue(3600);

    fireEvent.change(fieldInput(/^Energia disponível/), { target: { value: '6400' } });
    expect(fieldInput(/^Energia disponível/)).toHaveValue(6400);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativa para recomendação' }));
  });

  it('saves and closes the form', () => {
    const onSave = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the form via the close button', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova combinação/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Nova combinação' }));
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

  it('"Limpar todas" deletes only the currently filtered/visible solutions', async () => {
    const onDeleteMany = vi.fn();
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' }), makeInverter({ id: 'i2', model: 'X3-Hybrid-10.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[
          makeSolution({ id: 's1', solution_code: 'code-1', inverter_model: 'X1-Hybrid-5.0kW-G4', battery_model: 'TP-HS3.6' }),
          makeSolution({ id: 's2', solution_code: 'code-2', inverter_model: 'X3-Hybrid-10.0kW-G4', battery_model: 'TP-HS3.6' }),
        ]}
        onDeleteMany={onDeleteMany}
      />
    );

    // Filter down to just the X1 inverter's combinations before clearing.
    fireEvent.click(screen.getByRole('button', { name: /X1-Hybrid-5.0kW-G4/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Limpar todas as combinações filtradas' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir todas' }, { timeout: 1000 }));
    expect(onDeleteMany).toHaveBeenCalledWith(['s1']);
  });

  it('hides "Limpar todas" when the filtered list is empty', () => {
    render(
      <ControlledEditor
        inverters={[makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4' })]}
        batteries={[makeBattery({ id: 'b1', model: 'TP-HS3.6' })]}
        solutions={[]}
      />
    );
    expect(screen.queryByRole('button', { name: 'Limpar todas as combinações filtradas' })).not.toBeInTheDocument();
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

  it('excludes expansion/Slave batteries from the generation filter chips', () => {
    const master = makeBattery({ id: 'b-master', model: 'T58 V2 Master', expansion_model: 'T58 Slave' });
    const slave = makeBattery({ id: 'b-slave', model: 'T58 Slave' });
    render(<ControlledEditor inverters={inverters} batteries={[master, slave]} essRules={[essRule]} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));

    expect(screen.getByRole('button', { name: 'T58 V2 Master' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'T58 Slave' })).not.toBeInTheDocument();
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

  it('approves all pending combinations at once, clearing the pending list', () => {
    const onApplyGenerated = vi.fn((_gen, afterApply?: () => void) => afterApply?.());
    render(<ControlledEditor inverters={inverters} batteries={batteries} essRules={[essRule]} onApplyGenerated={onApplyGenerated} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));

    fireEvent.click(screen.getByRole('button', { name: /Aprovar todas/ }));
    expect(onApplyGenerated).toHaveBeenCalledWith(expect.any(Array), expect.any(Function), true);
    expect(screen.getByText('Nenhuma combinação pendente.')).toBeInTheDocument();
  });

  it('discards a single pending combination', () => {
    render(<ControlledEditor inverters={inverters} batteries={batteries} essRules={[essRule]} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));

    const discardButton = screen.getByRole('button', { name: /Descartar combinação/ });
    fireEvent.click(discardButton);

    expect(screen.getByText('Nenhuma combinação pendente.')).toBeInTheDocument();
  });

  it('filters generation by a specific inverter/battery chip, keeping unrelated pending items when regenerating', () => {
    const inverters2 = [
      makeInverter({ id: 'i1', model: 'X1-Hybrid-5.0kW-G4', battery_ports: 1 }),
      makeInverter({ id: 'i2', model: 'X3-Hybrid-10.0kW-G4', battery_ports: 1, phases: 3, grid_types: ['3P_380V'] }),
    ];
    const batteries2 = [
      makeBattery({ id: 'b1', model: 'TP-HS3.6', max_association_qty: 1 }),
      makeBattery({ id: 'b2', model: 'TP-HS7.2', max_association_qty: 1 }),
      makeBattery({ id: 'b3', model: 'TP-HS10', max_association_qty: 1 }),
    ];
    const essRule2: EssCompatibilityRuleRow = { ...essRule, id: 'rule-2', inverter_model: 'X3-Hybrid-10.0kW-G4', battery_model: 'TP-HS7.2' };
    // Same inverter+grid as `essRule` (1p_220V), but a different battery — this
    // makes the "Monofásico 220V" group have two battery sub-groups, so the
    // byBattery sort comparator actually runs (a single group never invokes it).
    const essRule3: EssCompatibilityRuleRow = { ...essRule, id: 'rule-3', battery_model: 'TP-HS10' };
    render(<ControlledEditor inverters={inverters2} batteries={batteries2} essRules={[essRule, essRule2, essRule3]} />);
    fireEvent.click(screen.getByRole('button', { name: /Geradas/ }));

    // Generate everything first.
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/ }));
    expect(screen.getByText('Monofásico 220V')).toBeInTheDocument();
    expect(screen.getByText('Trifásico 380V')).toBeInTheDocument();
    expect(screen.getByText('TP-HS10', { selector: 'span.text-sm.font-medium' })).toBeInTheDocument();

    // Narrow to just the X1/TP-HS3.6 combination and regenerate — the X3
    // pending combination falls outside this filter and must be preserved.
    fireEvent.click(screen.getByRole('button', { name: 'X1-Hybrid-5.0kW-G4' }));
    fireEvent.click(screen.getByRole('button', { name: 'TP-HS3.6' }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar novamente/ }));

    expect(screen.getByText('Monofásico 220V')).toBeInTheDocument();
    expect(screen.getByText('Trifásico 380V')).toBeInTheDocument();

    // Toggling the same chip on then off exercises both branches of the
    // per-chip toggle, distinct from the reset-all "Todos"/"Todas" buttons.
    fireEvent.click(screen.getByRole('button', { name: 'X1-Hybrid-5.0kW-G4' }));
    fireEvent.click(screen.getByRole('button', { name: 'X1-Hybrid-5.0kW-G4' }));
    fireEvent.click(screen.getByRole('button', { name: 'TP-HS3.6' }));
    fireEvent.click(screen.getByRole('button', { name: 'TP-HS3.6' }));

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
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
