// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteResponseActions } from './QuoteResponseActions';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('QuoteResponseActions', () => {
  it('renders both Aceitar/Recusar buttons initially', () => {
    render(<QuoteResponseActions token="token-1" />);
    expect(screen.getByRole('button', { name: /Aceitar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recusar/ })).toBeInTheDocument();
  });

  it('posts the accepted decision and shows the confirmation, hiding the buttons', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'accepted' }) });
    render(<QuoteResponseActions token="token-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Aceitar/ }));

    await waitFor(() => expect(screen.getByText(/Orçamento aceito/)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/quote-shares/token-1/respond',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'accepted' }) })
    );
    expect(screen.queryByRole('button', { name: /Aceitar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recusar/ })).not.toBeInTheDocument();
  });

  it('posts the rejected decision and shows the confirmation', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'rejected' }) });
    render(<QuoteResponseActions token="token-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Recusar/ }));

    await waitFor(() => expect(screen.getByText(/Orçamento recusado/)).toBeInTheDocument());
  });

  it('shows an inline error and keeps the buttons when the request fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'already_responded' }) });
    render(<QuoteResponseActions token="token-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Aceitar/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Aceitar/ })).toBeInTheDocument();
  });

  it('shows an inline error when the network request itself throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    render(<QuoteResponseActions token="token-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Recusar/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
