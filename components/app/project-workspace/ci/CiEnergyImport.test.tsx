// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultCiOptions } from '@/lib/store/defaults';
import { CiEnergyImport } from './CiEnergyImport';

async function chooseFile(content: string) {
  fireEvent.change(screen.getByLabelText('Importar CSV de consumo e geração'), { target: { files: [new File([content], 'simulacao.csv', { type: 'text/csv' })] } });
  return screen.findByRole('button', { name: 'Aplicar' });
}

describe('CiEnergyImport', () => {
  it('updates consumption and solar together in a single change after confirming the detected mapping', async () => {
    const onChange = vi.fn();
    render(<CiEnergyImport ciOptions={defaultCiOptions} onChange={onChange} />);
    const apply = await chooseFile('timestamp,consumptionKw,generationKw\n2026-01-01T12:00:00-03:00,100,50\n2026-01-01T12:15:00-03:00,110,60');
    expect(screen.getByRole('combobox',{name:'Coluna de consumo'})).toHaveTextContent('consumptionKw');
    expect(screen.getByRole('combobox',{name:'Coluna de geração'})).toHaveTextContent('generationKw');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(apply);
    expect(onChange).toHaveBeenCalledTimes(1);
    const change = onChange.mock.calls[0][0];
    expect(change.loadCurve.points.map((point: { powerKw: number }) => point.powerKw)).toEqual([100, 110]);
    expect(change.solar.enabled).toBe(true);
    expect(change.solar.generationCurve.points.map((point: { powerKw: number }) => point.powerKw)).toEqual([50, 60]);
    expect(screen.getByText(/Curva de carga e Solar FV preenchidos/)).toBeInTheDocument();
  });

  it('does not modify either series when a file violates the interval limit', async () => {
    const onChange = vi.fn();
    render(<CiEnergyImport ciOptions={defaultCiOptions} onChange={onChange} />);
    fireEvent.click(await chooseFile('timestamp,consumptionKw,generationKw\n2026-01-01T12:00:00Z,100,50\n2026-01-01T12:05:00Z,110,60'));
    expect(screen.getByRole('alert')).toHaveTextContent('mínimo');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows mapping an unfamiliar generator column and converting its interval energy', async () => {
    const onChange = vi.fn();
    render(<CiEnergyImport ciOptions={defaultCiOptions} onChange={onChange} />);
    const apply = await chooseFile('date,PV AC output\n01/01/2026 12:00,25');
    fireEvent.click(screen.getByRole('combobox',{name:'Coluna de geração'}));
    const column = await screen.findByRole('option',{name:'PV AC output'});
    fireEvent.pointerDown(column,{pointerType:'mouse'});
    fireEvent.click(column);
    fireEvent.click(screen.getByRole('combobox',{name:'Unidade de geração'}));
    const unit = await screen.findByRole('option',{name:'kWh'});
    fireEvent.pointerDown(unit,{pointerType:'mouse'});
    fireEvent.click(unit);
    fireEvent.click(apply);
    expect(onChange.mock.calls[0][0].solar.generationCurve.points[0].powerKw).toBe(100);
    expect(onChange.mock.calls[0][0].loadCurve).toBeUndefined();
  });

  it('rejects a separate generation file whose timestamps do not cover existing consumption', async () => {
    const onChange = vi.fn();
    render(<CiEnergyImport ciOptions={{ ...defaultCiOptions, loadCurve: { points: [{ timestamp: '2026-01-01T15:00:00Z', powerKw: 100 }], resolutionMinutes: 15, timezone: 'America/Sao_Paulo', periodStart: '2026-01-01', periodEnd: '2026-01-01', profileBasis: 'representative_period', source: 'csv' } }} onChange={onChange} />);
    fireEvent.click(await chooseFile('timestamp,generationKw\n2026-01-02T15:00:00Z,50'));
    expect(screen.getByRole('alert')).toHaveTextContent('mesmos horários');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument());
  });
  it('defaults a generic power column to generation when importing from Solar FV', async () => {
    const onChange = vi.fn();
    render(<CiEnergyImport ciOptions={defaultCiOptions} onChange={onChange} defaultSeries="generation" />);
    fireEvent.click(await chooseFile('timestamp,powerKw\n2026-01-01T12:00:00Z,40'));
    expect(onChange.mock.calls[0][0].loadCurve).toBeUndefined();
    expect(onChange.mock.calls[0][0].solar.generationCurve.points[0].powerKw).toBe(40);
  });

});
