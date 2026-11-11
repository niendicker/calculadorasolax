// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Zap } from 'lucide-react';
import { NumberField, NumberFieldControl } from './number-field';

it('labels the input without the unit and describes it with the unit chip', () => {
  render(<NumberField label="Potência" unit="kVA" value={12} onChange={() => {}} icon={<Zap />} />);
  const input = screen.getByLabelText('Potência');
  expect(input).toHaveAttribute('type', 'number');
  expect(input).toHaveAccessibleDescription('kVA');
  expect(screen.getByText('kVA')).toBeInTheDocument();
});

it('marks optional fields, renders tooltip and hint, and selects the value on focus', () => {
  render(<NumberField label="Pico" unit="kVA" optional tip="Partida de motores." tipLabel="Sobre o pico" hint="Equivalente a 10 kW" value={5} onChange={() => {}} />);
  expect(screen.getByLabelText('Pico (opcional)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sobre o pico' })).toBeInTheDocument();
  expect(screen.getByText('Equivalente a 10 kW')).toBeInTheDocument();
  const input = screen.getByLabelText('Pico (opcional)') as HTMLInputElement;
  const select = vi.spyOn(input, 'select');
  fireEvent.focus(input);
  expect(select).toHaveBeenCalled();
});

it('shows the clear button only with a value and keeps aria-label on the bare control', () => {
  const onClear = vi.fn();
  const { rerender } = render(<NumberFieldControl aria-label="Quantidade" unit="un." value="" onChange={() => {}} onClear={onClear} />);
  expect(screen.getByLabelText('Quantidade')).toBeInTheDocument();
  expect(screen.queryByLabelText('Limpar campo')).not.toBeInTheDocument();
  rerender(<NumberFieldControl aria-label="Quantidade" unit="un." value="3" onChange={() => {}} onClear={onClear} />);
  fireEvent.click(screen.getByLabelText('Limpar campo'));
  expect(onClear).toHaveBeenCalledOnce();
});

it('prevents clearing disabled and read-only values', () => {
  const onClear = vi.fn();
  const { rerender } = render(<NumberField label="Potência" unit="kVA" value={12} onChange={() => {}} onClear={onClear} disabled />);
  fireEvent.click(screen.getByLabelText('Limpar campo'));
  rerender(<NumberField label="Potência" unit="kVA" value={12} onChange={() => {}} onClear={onClear} readOnly />);
  fireEvent.click(screen.getByLabelText('Limpar campo'));
  expect(onClear).not.toHaveBeenCalled();
});

it('preserves an existing accessible description alongside the unit', () => {
  render(<><p id="power-help">Potência aparente</p><NumberField label="Potência" unit="kVA" aria-describedby="power-help" value={12} onChange={() => {}} /></>);
  expect(screen.getByLabelText('Potência')).toHaveAccessibleDescription('Potência aparente kVA');
});
