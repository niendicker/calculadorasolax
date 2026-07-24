// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AccessoryRow, AccessoryRuleRow } from '../types';
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
    scale_with_metric: false,
    metric_divisor: 1,
    comment: null,
    desired_features: [],
    active: true,
    ...partial,
  };
}

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
  onSave?: (afterPersist?: () => void) => void;
  onRemove?: (id: string) => void;
  onViewRules?: (accessoryId: string, accessoryModel: string) => void;
  removingIds?: Set<string>;
  saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<AccessoryRow>>({});
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
      onViewRules={overrides.onViewRules ?? vi.fn()}
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
        rows={[
          makeAccessory({ id: 'a1', model: 'Smart Meter' }),
          makeAccessory({ id: 'a2', model: 'Matebox' }),
          makeAccessory({ id: 'a3', model: 'Kit CFTV' }),
        ]}
        rules={[
          makeRule({ id: 'r1', accessory_id: 'a2', inverter_models: ['X1'] }),
          makeRule({ id: 'r2', accessory_id: 'a3', battery_model: 'TP-HS3.6' }),
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Por inversor/ }));
    expect(screen.getByText('Matebox')).toBeInTheDocument();
    expect(screen.queryByText('Smart Meter')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    fireEvent.click(screen.getByRole('button', { name: /Por bateria/ }));
    expect(screen.getByText('Kit CFTV')).toBeInTheDocument();
    expect(screen.queryByText('Matebox')).not.toBeInTheDocument();
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

  it('edits model, nickname, description and the active checkbox, then switches to the media tab and edits it', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo acessório/ }));

    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'Smart Meter' } });
    expect(screen.getByLabelText('Modelo')).toHaveValue('Smart Meter');

    fireEvent.change(screen.getByPlaceholderText('Ex.: Kit de Fixação'), { target: { value: 'Medidor' } });
    expect(screen.getByPlaceholderText('Ex.: Kit de Fixação')).toHaveValue('Medidor');

    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Mede o consumo.' } });
    expect(screen.getByLabelText('Descrição')).toHaveValue('Mede o consumo.');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Mídias' }));
    fireEvent.change(screen.getByPlaceholderText('URL da imagem'), { target: { value: 'https://cdn.example.com/x.png' } });
    expect(screen.getByPlaceholderText('URL da imagem')).toHaveValue('https://cdn.example.com/x.png');

    fireEvent.click(screen.getByRole('button', { name: /Adicionar link/ }));
    expect(screen.getByPlaceholderText('Nome do documento')).toHaveValue('Datasheet');
  });

  it('closes the form via the close button', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo acessório/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Novo acessório' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removes via the confirm popover', async () => {
    const onRemove = vi.fn();
    render(<ControlledEditor rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' })]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Smart Meter' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));
    expect(onRemove).toHaveBeenCalledWith('a1');
  });

  it('only shows the "Ver regras" link once the accessory has an id, and calls onViewRules with it', () => {
    const onViewRules = vi.fn();
    render(<ControlledEditor rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' })]} onViewRules={onViewRules} />);

    fireEvent.click(screen.getByRole('button', { name: /Novo acessório/ }));
    expect(screen.queryByRole('button', { name: /Ver regras de aplicação/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Novo acessório' }));

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: /Ver regras de aplicação/ }));
    expect(onViewRules).toHaveBeenCalledWith('a1', 'Smart Meter');
  });

  it('shows the rule count next to the "Ver regras" link', () => {
    render(
      <ControlledEditor
        rows={[makeAccessory({ id: 'a1', model: 'Smart Meter' })]}
        rules={[
          makeRule({ id: 'r1', accessory_id: 'a1' }),
          makeRule({ id: 'r2', accessory_id: 'a1' }),
          makeRule({ id: 'r3', accessory_id: 'a2' }),
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('button', { name: 'Ver regras de aplicação (2)' })).toBeInTheDocument();
  });
});

