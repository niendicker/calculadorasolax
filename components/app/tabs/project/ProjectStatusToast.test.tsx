// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectStatusToast } from './ProjectStatusToast';

describe('ProjectStatusToast', () => {
  it('shows the message text', () => {
    render(<ProjectStatusToast message="Projeto removido." onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Projeto removido.');
  });

  it('dismisses via the close button', () => {
    const onDismiss = vi.fn();
    render(<ProjectStatusToast message="Projeto removido." onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after the countdown', () => {
    vi.useFakeTimers();
    try {
      const onDismiss = vi.fn();
      render(<ProjectStatusToast message="Projeto removido." onDismiss={onDismiss} />);

      expect(onDismiss).not.toHaveBeenCalled();
      vi.advanceTimersByTime(5000);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
