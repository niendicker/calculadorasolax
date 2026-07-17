// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppFooter } from './AppFooter';

describe('AppFooter', () => {
  it('renders the app name and current year', () => {
    render(<AppFooter />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('SolaX Calculator');
    expect(footer).toHaveTextContent(String(new Date().getFullYear()));
  });
});
