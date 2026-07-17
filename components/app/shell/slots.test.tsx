// @vitest-environment jsdom

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader, PageSummary, SetSummaryActiveProvider, SummaryPortalProvider, TitleBarPortalProvider } from './slots';

describe('PageHeader', () => {
  it('renders nothing when there is no title bar target in context', () => {
    const { container } = render(<PageHeader>Título da página</PageHeader>);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Título da página')).not.toBeInTheDocument();
  });

  it('portals its children into the provided title bar element instead of rendering inline', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const { container } = render(
      <TitleBarPortalProvider value={target}>
        <PageHeader>Título da página</PageHeader>
      </TitleBarPortalProvider>
    );

    // Nothing rendered in the component's own tree...
    expect(container).toBeEmptyDOMElement();
    // ...it landed in the portal target instead.
    expect(target).toHaveTextContent('Título da página');

    document.body.removeChild(target);
  });
});

describe('PageSummary', () => {
  it('renders nothing and does not crash when there is no summary target in context', () => {
    const { container } = render(<PageSummary>Resumo</PageSummary>);
    expect(container).toBeEmptyDOMElement();
  });

  it('portals its children into the provided summary element', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    render(
      <SummaryPortalProvider value={target}>
        <PageSummary>Resumo do projeto</PageSummary>
      </SummaryPortalProvider>
    );

    expect(target).toHaveTextContent('Resumo do projeto');

    document.body.removeChild(target);
  });

  it('reports itself active on mount and inactive on unmount, so the shell can hide its empty state', () => {
    const setActive = vi.fn();
    const target = document.createElement('div');

    function Wrapper({ show }: { show: boolean }) {
      return (
        <SummaryPortalProvider value={target}>
          <SetSummaryActiveProvider value={setActive}>
            {show && <PageSummary>Resumo</PageSummary>}
          </SetSummaryActiveProvider>
        </SummaryPortalProvider>
      );
    }

    const { rerender } = render(<Wrapper show={true} />);
    expect(setActive).toHaveBeenCalledWith(true);

    setActive.mockClear();
    rerender(<Wrapper show={false} />);
    expect(setActive).toHaveBeenCalledWith(false);
  });

  it('does not re-invoke setActive on every re-render, only on mount/unmount', () => {
    const setActive = vi.fn();
    const target = document.createElement('div');

    function Wrapper({ label }: { label: string }) {
      const [, force] = useState(0);
      void force;
      return (
        <SummaryPortalProvider value={target}>
          <SetSummaryActiveProvider value={setActive}>
            <PageSummary>{label}</PageSummary>
          </SetSummaryActiveProvider>
        </SummaryPortalProvider>
      );
    }

    const { rerender } = render(<Wrapper label="primeiro" />);
    expect(setActive).toHaveBeenCalledTimes(1);

    rerender(<Wrapper label="segundo" />);
    expect(setActive).toHaveBeenCalledTimes(1);
  });
});
