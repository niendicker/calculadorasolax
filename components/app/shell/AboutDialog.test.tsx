// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AboutDialog } from './AboutDialog';

describe('AboutDialog', () => {
  it('keeps the contribution disabled for empty or whitespace-only content', () => {
    render(<AboutDialog open onClose={vi.fn()} version="1.2.3" />);

    const submit = screen.getByRole('button', { name: 'Enviar contribuição' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Como podemos melhorar?'), { target: { value: '          ' } });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Bug' }));
    expect(screen.getByText('Informações técnicas da aplicação serão incluídas automaticamente.')).toBeInTheDocument();
  });

  it('sends bug metadata, shows loading, then clears only after success', async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn((..._args: Parameters<typeof fetch>) => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AboutDialog open onClose={vi.fn()} version="1.2.3" />);

    fireEvent.click(screen.getByRole('button', { name: 'Bug' }));
    const textarea = screen.getByLabelText('Como podemos melhorar?');
    fireEvent.change(textarea, { target: { value: 'O cálculo falhou nesta etapa.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar contribuição' }));

    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled();
    const payload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(payload.kind).toBe('bug');
    expect(payload.metadata).toEqual(expect.objectContaining({ version: '1.2.3', route: expect.any(String), viewport: expect.any(String), userAgent: expect.any(String), timestamp: expect.any(String) }));
    expect(textarea).toHaveValue('O cálculo falhou nesta etapa.');

    resolveRequest(new Response(JSON.stringify({ status: 'sent' }), { status: 200 }));
    await waitFor(() => expect(screen.getByText('Contribuição enviada. Obrigado pelo feedback.')).toBeInTheDocument());
    expect(textarea).toHaveValue('');
  });

  it('keeps the message after a failed submission and closes with Escape', async () => {
    const onClose = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Falha temporária.' }), { status: 502 })));
    render(<AboutDialog open onClose={onClose} version="1.2.3" />);

    const textarea = screen.getByLabelText('Como podemos melhorar?');
    fireEvent.change(textarea, { target: { value: 'Uma sugestão importante para o fluxo.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar contribuição' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária.');
    expect(textarea).toHaveValue('Uma sugestão importante para o fluxo.');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
