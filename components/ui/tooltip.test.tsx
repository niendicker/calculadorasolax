// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InfoLabel, InfoTooltip, Tooltip } from './tooltip';

describe('Tooltip / InfoLabel', () => {
  it('shows the tooltip content after the hover delay, portaled outside the trigger', async () => {
    const { container } = render(
      <div data-testid="clipping-ancestor" style={{ overflow: 'hidden' }}>
        <Tooltip content="Explicação da dica">
          <span>Gatilho</span>
        </Tooltip>
      </div>
    );

    const trigger = screen.getByText('Gatilho');
    fireEvent.mouseEnter(trigger.parentElement as HTMLElement);

    const bubble = await screen.findByText('Explicação da dica', undefined, { timeout: 1000 });

    // The bubble must NOT be a descendant of the clipping ancestor — that's
    // the whole point of portaling to document.body instead of using CSS
    // `absolute` positioning relative to the trigger.
    const clippingAncestor = container.querySelector('[data-testid="clipping-ancestor"]') as HTMLElement;
    expect(within(clippingAncestor).queryByText('Explicação da dica')).not.toBeInTheDocument();
    expect(document.body.contains(bubble)).toBe(true);
  });

  it('hides the tooltip (opacity-0) before hover and shows it (opacity-100) after', async () => {
    render(
      <Tooltip content="Dica">
        <span>Gatilho</span>
      </Tooltip>
    );

    const bubble = screen.getByText('Dica');
    expect(bubble).toHaveClass('opacity-0');

    fireEvent.mouseEnter(screen.getByText('Gatilho').parentElement as HTMLElement);
    await waitFor(() => expect(bubble).toHaveClass('opacity-100'), { timeout: 1000 });

    fireEvent.mouseLeave(screen.getByText('Gatilho').parentElement as HTMLElement);
    expect(bubble).toHaveClass('opacity-0');
  });

  it('InfoLabel renders the label and exposes the tip as both an aria-label and tooltip content', async () => {
    render(<InfoLabel label="Campo X" tip="Explica o campo X" />);
    expect(screen.getByText('Campo X')).toBeInTheDocument();

    const icon = screen.getByLabelText('Explica o campo X');
    fireEvent.mouseEnter(icon.parentElement?.parentElement as HTMLElement);
    await screen.findByText('Explica o campo X', { selector: 'span.pointer-events-none' }, { timeout: 1000 });
  });
});

describe('InfoTooltip', () => {
  it('opens on tap, describes its trigger and closes on a second tap or outside press', () => {
    render(<InfoTooltip label="Sobre o campo">Explicação detalhada</InfoTooltip>);
    const trigger = screen.getByRole('button', { name: 'Sobre o campo' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ top: 200, left: 120, right: 144, bottom: 224, width: 24, height: 24, x: 120, y: 200, toJSON: () => ({}) });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAccessibleDescription('Explicação detalhada');
    expect(screen.getByRole('tooltip').closest('.fixed')).toHaveClass('z-[90]');
    expect(screen.getByRole('tooltip').closest('.fixed')).toHaveStyle({ top: '190px', left: '120px' });
    fireEvent.click(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens on keyboard focus and handles Escape before an enclosing dialog', async () => {
    const escape = vi.fn();
    render(<div onKeyDown={escape}><InfoTooltip label="Ajuda">Orientação</InfoTooltip></div>);
    const trigger = screen.getByRole('button', { name: 'Ajuda' });
    fireEvent.focus(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Orientação');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(escape).not.toHaveBeenCalled();
    fireEvent.focus(trigger);
    fireEvent.blur(trigger);
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
