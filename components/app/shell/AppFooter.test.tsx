// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppFooter } from './AppFooter';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AppFooter', () => {
  it('renders the app name and current year', () => {
    render(<AppFooter />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('SolaX Calculator');
    expect(footer).toHaveTextContent(String(new Date().getFullYear()));
  });

  it('renders no commit link when NEXT_PUBLIC_COMMIT_SHA is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_COMMIT_SHA', '');
    render(<AppFooter />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links to the deployed commit when NEXT_PUBLIC_COMMIT_SHA is set', () => {
    vi.stubEnv('NEXT_PUBLIC_COMMIT_SHA', 'abc1234def5678');
    render(<AppFooter />);
    const link = screen.getByRole('link', { name: 'abc1234' });
    expect(link).toHaveAttribute('href', 'https://github.com/niendicker/calculadorasolax/commit/abc1234def5678');
  });
});
