// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppFooter } from './AppFooter';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AppFooter', () => {
  it('renders the current year and description', () => {
    render(<AppFooter />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(String(new Date().getFullYear()));
    expect(footer).toHaveTextContent('Dimensionamento de sistemas híbridos solar + bateria');
  });

  it('shows nothing extra when NEXT_PUBLIC_COMMIT_SHA is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_COMMIT_SHA', '');
    render(<AppFooter />);
    expect(screen.getByRole('contentinfo').textContent?.trim()).toBe(
      `${new Date().getFullYear()} · Dimensionamento de sistemas híbridos solar + bateria`
    );
  });

  it('shows the short commit hash, with the full hash available in a tooltip', () => {
    vi.stubEnv('NEXT_PUBLIC_COMMIT_SHA', 'abc1234def5678');
    render(<AppFooter />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('abc1234');
    expect(screen.getByText('abc1234def5678')).toBeInTheDocument();
  });
});
