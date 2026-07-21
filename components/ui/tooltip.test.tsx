// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoLabel, Tooltip } from './tooltip';

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
