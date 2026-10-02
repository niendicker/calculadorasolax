// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Client, ProjectInfo } from '@/lib/types';
import { ProjectInfoEditor } from './ProjectInfoEditor';

const projectInfo: ProjectInfo = {
  name: 'Residência Silva',
  clientId: 'client-1',
  address: { postalCode: '01310-100', street: 'Avenida Paulista', number: '100', complement: '', district: 'Bela Vista', city: 'São Paulo', state: 'SP' },
  notes: 'Acesso pela garagem.',
};

const clients: Client[] = [
  { id: 'client-1', name: 'Marcelo Grande', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' },
  { id: 'client-2', name: 'Cliente Novo', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' },
];

describe('ProjectInfoEditor', () => {
  it('edits identification, address and notes and exposes save/cancel actions', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(<ProjectInfoEditor projectInfo={projectInfo} clients={clients} onChange={onChange} onSave={onSave} onCancel={onCancel} />);

    expect(screen.getByRole('heading', { name: 'Editar projeto' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do projeto')).toHaveValue('Residência Silva');
    expect(screen.getByLabelText('Cliente')).toHaveValue('client-1');

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Instalação Nova' } });
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'client-2' } });
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '42' } });
    fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'rj' } });
    fireEvent.change(screen.getByDisplayValue('Acesso pela garagem.'), { target: { value: 'Entrada lateral.' } });

    expect(onChange).toHaveBeenNthCalledWith(1, { name: 'Instalação Nova' });
    expect(onChange).toHaveBeenNthCalledWith(2, { clientId: 'client-2' });
    expect(onChange).toHaveBeenNthCalledWith(3, { address: { ...projectInfo.address, number: '42' } });
    expect(onChange).toHaveBeenNthCalledWith(4, { address: { ...projectInfo.address, state: 'RJ' } });
    expect(onChange).toHaveBeenNthCalledWith(5, { notes: 'Entrada lateral.' });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Visão geral' }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('requires a project name before allowing the form to be saved', () => {
    const onSave = vi.fn();
    render(<ProjectInfoEditor projectInfo={{ ...projectInfo, name: '   ' }} clients={[]} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Informe um nome para o projeto.');
    const saveButton = screen.getByRole('button', { name: 'Salvar alterações' });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voltar para Visão geral' })).not.toBeInTheDocument();
  });
});
