// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LocaleError from './error';

describe('LocaleError', () => {
  const error = Object.assign(new Error('boom'), { digest: 'abc123' });
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a friendly message instead of the raw error', () => {
    render(<LocaleError error={error} reset={vi.fn()} />);
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('logs the error for diagnostics', () => {
    render(<LocaleError error={error} reset={vi.fn()} />);
    expect(console.error).toHaveBeenCalledWith(error);
  });

  it('calls reset() when "Tentar novamente" is clicked', () => {
    const reset = vi.fn();
    render(<LocaleError error={error} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(reset).toHaveBeenCalled();
  });

  it('reloads the page when "Recarregar página" is clicked', () => {
    render(<LocaleError error={error} reset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar página' }));
    expect(reloadSpy).toHaveBeenCalled();
  });
});
