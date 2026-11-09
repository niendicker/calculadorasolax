// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAppShellState } from './useAppShellState';

function Shell() {
  const { scrollRef, scrolled } = useAppShellState('ciWorkspace');
  return <section ref={scrollRef} aria-label="Conteúdo" data-compact={scrolled} />;
}

function scrollToPosition(element: HTMLElement, top: number) {
  Object.defineProperty(element, 'scrollTop', { value: top, configurable: true });
  fireEvent.scroll(element);
}

describe('application header scrolling', () => {
  it('stays stable when compacting the header clamps the bottom scroll position by 16px', () => {
    Element.prototype.scrollTo = vi.fn();
    render(<Shell />);
    const content = screen.getByRole('region', { name: 'Conteúdo' });
    scrollToPosition(content, 25);
    expect(content).toHaveAttribute('data-compact', 'true');
    // The shorter header enlarges the viewport at the bottom of the page.
    scrollToPosition(content, 9);
    expect(content).toHaveAttribute('data-compact', 'true');
    scrollToPosition(content, 0);
    expect(content).toHaveAttribute('data-compact', 'false');
    // Expanding it restores 16px of overflow, which must not compact it again.
    scrollToPosition(content, 16);
    expect(content).toHaveAttribute('data-compact', 'false');
  });

  it('does not start the resize cycle when content only overflows by a few pixels', () => {
    Element.prototype.scrollTo = vi.fn();
    render(<Shell />);
    const content = screen.getByRole('region', { name: 'Conteúdo' });
    for (const top of [0, 6, 10, 16, 24, 16, 0]) {
      scrollToPosition(content, top);
      expect(content).toHaveAttribute('data-compact', 'false');
    }
  });
});
