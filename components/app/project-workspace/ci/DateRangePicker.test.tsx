// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateRangePicker } from './DateRangePicker';

describe('DateRangePicker', () => {
  it('renders trigger button with formatted date range and days count', () => {
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate="2026-01-07"
        onChange={vi.fn()}
        maxDays={7}
      />
    );

    const trigger = screen.getByRole('button', { name: /Selecionar período/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('01/01/2026 – 07/01/2026');
    expect(trigger).toHaveTextContent('7 dias');
  });

  it('opens and closes dropdown dialog on trigger click', () => {
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate="2026-01-07"
        onChange={vi.fn()}
        maxDays={7}
      />
    );

    const trigger = screen.getByRole('button', { name: /Selecionar período/i });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: /Calendário de seleção de período/i })).toBeInTheDocument();

    // Clicking trigger again closes it
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes dialog on Escape key', () => {
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate="2026-01-07"
        onChange={vi.fn()}
        maxDays={7}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Selecionar período/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates between months', () => {
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate="2026-01-07"
        onChange={vi.fn()}
        maxDays={7}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Selecionar período/i }));
    expect(screen.getByText('Janeiro 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getByText('Fevereiro 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByText('Janeiro 2026')).toBeInTheDocument();
  });

  it('allows picking a new start and end date within the maxDays limit and applies it', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate="2026-01-07"
        onChange={onChange}
        maxDays={7}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Selecionar período/i }));

    // Click day 10 as new start date
    const day10Btn = screen.getByRole('button', { name: '10 de Janeiro de 2026' });
    fireEvent.click(day10Btn);

    // Duration updates to 1 dia
    expect(screen.getByText('1 dia')).toBeInTheDocument();

    // Click day 15 as end date (6 days inclusive <= 7)
    const day15Btn = screen.getByRole('button', { name: '15 de Janeiro de 2026' });
    expect(day15Btn).not.toBeDisabled();
    fireEvent.click(day15Btn);

    // Duration updates to 6 dias
    expect(screen.getByText('6 dias')).toBeInTheDocument();

    // Apply period
    const applyBtn = screen.getByRole('button', { name: 'Aplicar' });
    expect(applyBtn).not.toBeDisabled();
    fireEvent.click(applyBtn);

    expect(onChange).toHaveBeenCalledWith({
      startDate: '2026-01-10',
      endDate: '2026-01-15',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('automatically locks/disables dates beyond the upper range (maxDays)', () => {
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate="2026-01-07"
        onChange={vi.fn()}
        maxDays={7}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Selecionar período/i }));

    // Click day 10 as start date
    fireEvent.click(screen.getByRole('button', { name: '10 de Janeiro de 2026' }));

    // maxDays is 7, so day 10 + 6 = day 16 is the maximum allowed date
    const day16Btn = screen.getByRole('button', { name: '16 de Janeiro de 2026' });
    expect(day16Btn).not.toBeDisabled();

    // Day 17 is beyond max range (8 days) and must be blocked
    const day17Btn = screen.getByRole('button', { name: '17 de Janeiro de 2026' });
    expect(day17Btn).toBeDisabled();
    expect(day17Btn).toHaveAttribute('title', 'Bloqueado: limite máximo de 7 dias');

    // Day 20 is also blocked
    const day20Btn = screen.getByRole('button', { name: '20 de Janeiro de 2026' });
    expect(day20Btn).toBeDisabled();
  });

  it('cancels draft changes without invoking onChange when clicking Cancelar', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate="2026-01-07"
        onChange={onChange}
        maxDays={7}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Selecionar período/i }));

    // Select new start day
    fireEvent.click(screen.getByRole('button', { name: '10 de Janeiro de 2026' }));

    // Click Cancelar
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
