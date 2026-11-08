// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldHelpLabel, FieldHelpProvider } from './field-help';
import { Field } from './shared-ui';

afterEach(() => vi.useRealTimers());

describe('C&I field help', () => {
  it('preserves plain labels outside the C&I provider', () => {
    render(<Field label="Modelo"><input /></Field>);
    expect(screen.getByLabelText('Modelo')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens on hover and keyboard focus, exposes the description, and closes with Escape', () => {
    vi.useFakeTimers();
    render(<FieldHelpProvider tips={{ Modelo: 'Código do fabricante.' }}>
      <Field label="Modelo"><input /></Field>
    </FieldHelpProvider>);
    const help = screen.getByRole('button', { name: 'Ajuda: Modelo' });
    expect(help).toHaveAccessibleDescription('Código do fabricante.');
    expect(screen.getByLabelText('Modelo')).toBeInTheDocument();
    fireEvent.mouseEnter(help);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText('Código do fabricante.')).toBeVisible();
    fireEvent.mouseLeave(help);
    expect(screen.getByText('Código do fabricante.')).not.toBeVisible();
    act(() => help.focus());
    act(() => vi.advanceTimersByTime(300));
    expect(help).toHaveFocus();
    expect(screen.getByText('Código do fabricante.')).toBeVisible();
    fireEvent.keyDown(help, { key: 'Escape' });
    expect(screen.getByText('Código do fabricante.')).not.toBeVisible();
    expect(help).toHaveFocus();
  });

  it('keeps checkboxes and form submission unchanged when help is clicked or activated by keyboard', () => {
    vi.useFakeTimers();
    const submit = vi.fn(event => event.preventDefault());
    const change = vi.fn();
    render(<FieldHelpProvider tips={{ Ativa: 'Disponibiliza a regra.' }}>
      <form onSubmit={submit}><label>
        <input type="checkbox" aria-label="Ativa" onChange={change} />
        <FieldHelpLabel label="Ativa" />
      </label></form>
    </FieldHelpProvider>);
    const help = screen.getByRole('button', { name: 'Ajuda: Ativa' });
    fireEvent.click(help);
    for (const key of ['Enter', ' ']) fireEvent.keyDown(help, { key });
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText('Disponibiliza a regra.')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Ativa' })).not.toBeChecked();
    expect(change).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
