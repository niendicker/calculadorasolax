// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LoadCatalogRow } from '../types';
import { LoadCatalogEditor } from './LoadCatalogEditor';

function makeRow(partial: Partial<LoadCatalogRow> & Pick<LoadCatalogRow, 'id' | 'name_pt' | 'category'>): LoadCatalogRow {
  return {
    name_en: '',
    name_zh: '',
    power_w: 1000,
    ip_in_ratio: 1,
    active: true,
    ...partial,
  };
}

function ControlledEditor(overrides: {
  rows?: LoadCatalogRow[];
  onSave?: (afterPersist?: () => void) => void;
  onRemove?: (id: string) => void;
  onDeactivate?: (id: string) => void;
  removingIds?: Set<string>;
  saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<LoadCatalogRow>>({});
  return (
    <LoadCatalogEditor
      rows={overrides.rows ?? []}
      form={form}
      setForm={setForm}
      onSave={overrides.onSave ?? vi.fn()}
      onRemove={overrides.onRemove ?? vi.fn()}
      onDeactivate={overrides.onDeactivate ?? vi.fn()}
      removingIds={overrides.removingIds ?? new Set()}
      saving={overrides.saving ?? false}
    />
  );
}

describe('LoadCatalogEditor: listing', () => {
  it('shows each row with its category/active badges and specs', () => {
    render(<ControlledEditor rows={[makeRow({ id: 'l1', name_pt: 'Chuveiro', category: 'Aquecimento', power_w: 5500 })]} />);
    expect(screen.getByText('Chuveiro')).toBeInTheDocument();
    expect(screen.getByText('Aquecimento')).toBeInTheDocument();
    expect(screen.getByText('ativa')).toBeInTheDocument();
    expect(screen.getByText('5500 VA')).toBeInTheDocument();
  });

  it('filters by search text across the three name fields', () => {
    render(
      <ControlledEditor
        rows={[
          makeRow({ id: 'l1', name_pt: 'Chuveiro', category: 'Aquecimento' }),
          makeRow({ id: 'l2', name_pt: 'Ar-condicionado', category: 'Climatização' }),
        ]}
      />
    );
    fireEvent.change(screen.getByLabelText('Buscar carga por nome'), { target: { value: 'chuveiro' } });
    expect(screen.getByText('Chuveiro')).toBeInTheDocument();
    expect(screen.queryByText('Ar-condicionado')).not.toBeInTheDocument();
  });

  it('shows a category filter only when there is more than one category', () => {
    const { rerender } = render(<ControlledEditor rows={[makeRow({ id: 'l1', name_pt: 'A', category: 'X' })]} />);
    expect(screen.queryByText('Categoria')).not.toBeInTheDocument();

    rerender(
      <ControlledEditor
        rows={[makeRow({ id: 'l1', name_pt: 'A', category: 'X' }), makeRow({ id: 'l2', name_pt: 'B', category: 'Y' })]}
      />
    );
    expect(screen.getByText('Categoria')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /X/ }));
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });
});

describe('LoadCatalogEditor: form', () => {
  it('opens a blank form for a new item, and titles it accordingly', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova carga/ }));
    expect(screen.getByRole('dialog', { name: 'Nova carga' })).toBeInTheDocument();
  });

  it('opens the form pre-filled when editing an existing row', () => {
    render(<ControlledEditor rows={[makeRow({ id: 'l1', name_pt: 'Chuveiro', category: 'Aquecimento' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Editar carga' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Chuveiro')).toBeInTheDocument();
  });

  it('calls onSave, closing the form afterwards via the afterPersist callback', () => {
    const onSave = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Nova carga/ }));

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('edits every field of the form', () => {
    // "Potência"/"IP/IN"'s tooltip text also starts with the label itself, so
    // getByLabelText's regex can match both the input and the tooltip icon.
    function fieldInput(label: RegExp) {
      return screen.getAllByLabelText(label).find((el) => el.tagName === 'INPUT') as HTMLInputElement;
    }

    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova carga/ }));

    fireEvent.change(screen.getByLabelText('Nome (PT)'), { target: { value: 'Chuveiro' } });
    expect(screen.getByLabelText('Nome (PT)')).toHaveValue('Chuveiro');

    fireEvent.change(screen.getByLabelText(/^Nome \(EN\)/), { target: { value: 'Shower' } });
    expect(screen.getByLabelText(/^Nome \(EN\)/)).toHaveValue('Shower');

    fireEvent.change(screen.getByLabelText(/^Nome \(ZH\)/), { target: { value: '淋浴' } });
    expect(screen.getByLabelText(/^Nome \(ZH\)/)).toHaveValue('淋浴');

    fireEvent.change(fieldInput(/^Potência/), { target: { value: '5500' } });
    expect(fieldInput(/^Potência/)).toHaveValue(5500);

    fireEvent.change(fieldInput(/^IP\/IN/), { target: { value: '2' } });
    expect(fieldInput(/^IP\/IN/)).toHaveValue(2);

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Aquecimento' } });
    expect(screen.getByLabelText('Categoria')).toHaveValue('Aquecimento');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativa' }));
  });

  it('closes the form via the close button', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Nova carga/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Nova carga' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('LoadCatalogEditor: remove/deactivate', () => {
  it('removes via the confirm popover', async () => {
    const onRemove = vi.fn();
    render(<ControlledEditor rows={[makeRow({ id: 'l1', name_pt: 'Chuveiro', category: 'X' })]} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover Chuveiro' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 }));

    expect(onRemove).toHaveBeenCalledWith('l1');
  });

  it('deactivates via the confirm popover', async () => {
    const onDeactivate = vi.fn();
    render(<ControlledEditor rows={[makeRow({ id: 'l1', name_pt: 'Chuveiro', category: 'X' })]} onDeactivate={onDeactivate} />);

    fireEvent.click(screen.getByRole('button', { name: /Desativar/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }, { timeout: 1000 }));

    expect(onDeactivate).toHaveBeenCalledWith('l1');
  });

  it('only offers Desativar for active rows', async () => {
    const onDeactivate = vi.fn();
    render(
      <ControlledEditor
        rows={[makeRow({ id: 'l1', name_pt: 'Chuveiro', category: 'X', active: false })]}
        onDeactivate={onDeactivate}
      />
    );
    expect(screen.queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument();
  });
});
