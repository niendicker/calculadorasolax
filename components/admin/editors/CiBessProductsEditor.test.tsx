// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CiBessProductRow } from '../types';
import { CiBessProductsEditor } from './CiBessProductsEditor';

function makeProduct(partial: Partial<CiBessProductRow> & Pick<CiBessProductRow, 'id' | 'model'>): CiBessProductRow {
  return {
    manufacturer: 'Acme',
    description: '',
    active: true,
    module_power_kw: 50,
    module_capacity_kwh: 100,
    efficiency_percent: 95,
    soc_min_percent: 10,
    soc_max_percent: 100,
    warranty_years: 10,
    image_url: null,
    documents: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

function ControlledEditor(overrides: {
  rows?: CiBessProductRow[];
  onSave?: (afterPersist?: () => void) => void;
  onDeactivate?: (id: string) => void;
  removingIds?: Set<string>;
  saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<CiBessProductRow>>({});
  return (
    <CiBessProductsEditor
      rows={overrides.rows ?? []}
      form={form}
      setForm={setForm}
      onSave={overrides.onSave ?? vi.fn()}
      onDeactivate={overrides.onDeactivate ?? vi.fn()}
      removingIds={overrides.removingIds ?? new Set()}
      uploadAsset={vi.fn().mockResolvedValue('https://cdn.example.com/x.png')}
      saving={overrides.saving ?? false}
    />
  );
}

describe('CiBessProductsEditor: listing', () => {
  it('shows each product with model, manufacturer and active/inactive badge', () => {
    render(<ControlledEditor rows={[makeProduct({ id: 'p1', model: 'PowerStack 50', manufacturer: 'Acme' })]} />);
    expect(screen.getByText('PowerStack 50')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('ativo')).toBeInTheDocument();
  });

  it('filters by search across model and manufacturer', () => {
    render(
      <ControlledEditor
        rows={[
          makeProduct({ id: 'p1', model: 'PowerStack 50', manufacturer: 'Acme' }),
          makeProduct({ id: 'p2', model: 'VoltCube', manufacturer: 'Contoso' }),
        ]}
      />
    );
    fireEvent.change(screen.getByLabelText('Buscar produto C&I por modelo ou fabricante'), {
      target: { value: 'contoso' },
    });
    expect(screen.getByText('VoltCube')).toBeInTheDocument();
    expect(screen.queryByText('PowerStack 50')).not.toBeInTheDocument();
  });

  it('filters by status', () => {
    render(
      <ControlledEditor
        rows={[
          makeProduct({ id: 'p1', model: 'PowerStack 50', active: true }),
          makeProduct({ id: 'p2', model: 'VoltCube', active: false }),
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Inativos/ }));
    expect(screen.getByText('VoltCube')).toBeInTheDocument();
    expect(screen.queryByText('PowerStack 50')).not.toBeInTheDocument();
  });

  it('never offers a hard-delete action, only edit and deactivate', () => {
    render(
      <ControlledEditor
        rows={[
          makeProduct({ id: 'p1', model: 'PowerStack 50', active: true }),
          makeProduct({ id: 'p2', model: 'VoltCube', active: false }),
        ]}
      />
    );
    expect(screen.queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar PowerStack 50' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desativar VoltCube/ })).not.toBeInTheDocument();
  });
});

describe('CiBessProductsEditor: form', () => {
  it('opens blank for a new product and saves', () => {
    const onSave = vi.fn((afterPersist?: () => void) => afterPersist?.());
    render(<ControlledEditor onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Novo produto/ }));
    expect(screen.getByRole('dialog', { name: 'Novo produto C&I' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('edits model, manufacturer, description, technical fields and the active checkbox, then switches to media', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo produto/ }));

    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'PowerStack 50' } });
    expect(screen.getByLabelText('Modelo')).toHaveValue('PowerStack 50');

    fireEvent.change(screen.getByLabelText('Fabricante'), { target: { value: 'Acme' } });
    expect(screen.getByLabelText('Fabricante')).toHaveValue('Acme');

    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Módulo BESS de 50kW.' } });
    expect(screen.getByLabelText('Descrição')).toHaveValue('Módulo BESS de 50kW.');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativo' }));

    const powerInput = screen.getByLabelText(/^Potência/, { selector: 'input' });
    fireEvent.change(powerInput, { target: { value: '50' } });
    expect(powerInput).toHaveValue(50);

    fireEvent.click(screen.getByRole('button', { name: 'Mídias' }));
    fireEvent.change(screen.getByPlaceholderText('URL da imagem'), { target: { value: 'https://cdn.example.com/x.png' } });
    expect(screen.getByPlaceholderText('URL da imagem')).toHaveValue('https://cdn.example.com/x.png');
  });

  it('closes the form via the close button', () => {
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Novo produto/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Novo produto C&I' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deactivates an active product via the confirm popover', async () => {
    const onDeactivate = vi.fn();
    render(
      <ControlledEditor rows={[makeProduct({ id: 'p1', model: 'PowerStack 50' })]} onDeactivate={onDeactivate} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Desativar PowerStack 50' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }, { timeout: 1000 }));
    expect(onDeactivate).toHaveBeenCalledWith('p1');
  });
});
