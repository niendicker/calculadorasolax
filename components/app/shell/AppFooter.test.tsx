// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppFooter } from './AppFooter';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AppFooter', () => {
  const renderFooter = () => render(<AppFooter version="0.1.0" onOpenAbout={vi.fn()} />);

  it('renders the current year and description', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(String(new Date().getFullYear()));
    expect(footer).toHaveTextContent('Dimensionamento de sistemas híbridos solar + bateria');
    expect(footer).toHaveTextContent('v0.1.0');
  });

  it('opens the about area when requested', () => {
    const onOpenAbout = vi.fn();
    render(<AppFooter version="2.3.0" onOpenAbout={onOpenAbout} />);
    screen.getByRole('button', { name: 'Sobre e contribuir' }).click();
    expect(onOpenAbout).toHaveBeenCalledOnce();
  });
});
