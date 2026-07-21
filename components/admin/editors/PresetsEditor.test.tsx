// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LoadCatalogRow, PresetRow } from '../types';
import { PresetsEditor } from './PresetsEditor';

const catalogItem: LoadCatalogRow = {
  id: 'c1',
  name_pt: 'Chuveiro',
  name_en: '',
  name_zh: '',
  power_w: 5500,
  category: 'Aquecimento',
  ip_in_ratio: 1,
  active: true,
};

function makePreset(partial: Partial<PresetRow> & Pick<PresetRow, 'id' | 'name'>): PresetRow {
  return { description: '', loads: [], display_order: 0, ...partial };
}

function ControlledEditor(overrides: {
  rows?: PresetRow[];
  loadCatalogItems?: LoadCatalogRow[];
  onSave?: (afterPersist?: () => void) => void;
  onRemove?: (id: string) => void;
  removingIds?: Set<string>;
  saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<PresetRow>>({});
  return (
    <PresetsEditor
      rows={overrides.rows ?? []}
      loadCatalogItems={overrides.loadCatalogItems ?? [catalogItem]}
      form={form}
      setForm={setForm}
      onSave={overrides.onSave ?? vi.fn()}
      onRemove={overrides.onRemove ?? vi.fn()}
      removingIds={overrides.removingIds ?? new Set()}
      saving={overrides.saving ?? false}
    />
  );
}

describe('PresetsEditor: listing', () => {
  it('shows each preset with its load count badge', () => {
    render(<ControlledEditor rows={[makePreset({ id: 'p1', name: 'Residencial', loads: [{ name: 'A', powerW: 1, hoursPerDay: 1, qty: 1, ipInRatio: 1 }] })]} />);
    expect(screen.getByText('Residencial')).toBeInTheDocument();
    expect(screen.getByText('1 carga')).toBeInTheDocument();
  });

  it('pluralizes the load count', () => {
    render(
      <ControlledEditor
        rows={[
          makePreset({
            id: 'p1',
            name: 'Residencial',
            loads: [
              { name: 'A', powerW: 1, hoursPerDay: 1, qty: 1, ipInRatio: 1 },
              { name: 'B', powerW: 1, hoursPerDay: 1, qty: 1, ipInRatio: 1 },
            ],
          }),
        ]}
      />
    );
    expect(screen.getByText('2 cargas')).toBeInTheDocument();
  });
});

describe('PresetsEditor: building the load list', () => {
  it('shows the empty state, and adding from the catalog appends a load', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo preset/ }));
    expect(screen.getByText('Nenhuma carga adicionada ainda. Use a busca abaixo para adicionar do catálogo.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Chuveiro'));

    expect(screen.getByText('Cargas do preset (1)')).toBeInTheDocument();
    expect(screen.getByText('5500 VA · IP/IN 1×')).toBeInTheDocument();
  });

  it('filters the catalog search box', () => {
    render(
      <ControlledEditor
        loadCatalogItems={[catalogItem, { ...catalogItem, id: 'c2', name_pt: 'Ar-condicionado' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Novo preset/ }));

    fireEvent.change(screen.getByLabelText('Buscar carga no catálogo'), { target: { value: 'chuveiro' } });

    expect(screen.getByText('Chuveiro')).toBeInTheDocument();
    expect(screen.queryByText('Ar-condicionado')).not.toBeInTheDocument();
  });

  it('removes a load from the preset', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo preset/ }));
    fireEvent.click(screen.getByText('Chuveiro'));

    fireEvent.click(screen.getByRole('button', { name: 'Remover Chuveiro' }));

    expect(screen.getByText('Nenhuma carga adicionada ainda. Use a busca abaixo para adicionar do catálogo.')).toBeInTheDocument();
  });

  it('edits hours/qty on an added load', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo preset/ }));
    fireEvent.click(screen.getByText('Chuveiro'));

    fireEvent.change(screen.getByLabelText('Horas/dia', { exact: false }), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Qtd', { exact: false }), { target: { value: '3' } });

    expect(screen.getByText('5500 VA · IP/IN 1×')).toBeInTheDocument(); // unaffected field stays
  });

  it('edits the preset name and description', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo preset/ }));

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Residencial' } });
    expect(screen.getByLabelText('Nome')).toHaveValue('Residencial');

    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Uso geral' } });
    expect(screen.getByLabelText('Descrição')).toHaveValue('Uso geral');
  });

  it('closes the form via the close button', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo preset/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Novo preset' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('PresetsEditor: form actions', () => {
  it('opens pre-filled when editing, and titles the form with the preset name', () => {
    render(<ControlledEditor rows={[makePreset({ id: 'p1', name: 'Residencial' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Editar "Residencial"' })).toBeInTheDocument();
  });

  it('saves and closes the form', () => {
    const onSave = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Novo preset/ }));

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removes a preset via the confirm popover', async () => {
    const onRemove = vi.fn();
    render(<ControlledEditor rows={[makePreset({ id: 'p1', name: 'Residencial' })]} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover Residencial' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    expect(onRemove).toHaveBeenCalledWith('p1');
  });
});
