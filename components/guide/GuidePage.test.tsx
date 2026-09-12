// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getGuideContent } from '@/content/guide';
import { GuidePage } from './GuidePage';

describe('GuidePage', () => {
  it('renders the full guide with steps, sections and FAQ content', () => {
    render(<GuidePage content={getGuideContent('pt')} />);

    expect(screen.getByRole('heading', { name: 'Guia básico da Calculadora SolaX' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fluxo recomendado na Área de trabalho' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Microrrede' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dúvidas comuns' })).toBeInTheDocument();
    expect(screen.getByText('Use nomes que facilitem encontrar o projeto depois.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Por que não aparece uma solução?' })).toBeInTheDocument();
  });

  it('expands a collapsed step and FAQ answer', () => {
    render(<GuidePage content={getGuideContent('pt')} />);

    const loadsSummary = screen.getByText('Configure as cargas').closest('summary');
    expect(loadsSummary).toBeInTheDocument();
    expect(loadsSummary?.parentElement).not.toHaveAttribute('open');
    fireEvent.click(loadsSummary!);
    expect(loadsSummary?.parentElement).toHaveAttribute('open');
    expect(screen.getByText('Use a seção Cargas da Área de trabalho para descrever a instalação.')).toBeInTheDocument();

    const faqSummary = document.querySelector('#guide-faq-0 > summary') as HTMLElement;
    expect(faqSummary).toBeInTheDocument();
    fireEvent.click(faqSummary!);
    expect(faqSummary?.parentElement).toHaveAttribute('open');
    expect(screen.getByText(/Verifique se há cargas, bateria, rede/)).toBeInTheDocument();
  });

  it('opens the mobile index and closes it after navigation', () => {
    render(<GuidePage content={getGuideContent('pt')} />);

    const indexButton = screen.getByRole('button', { name: 'Índice' });
    expect(indexButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(indexButton);

    expect(indexButton).toHaveAttribute('aria-expanded', 'true');
    const mobileIndex = screen.getAllByRole('navigation', { name: 'Índice do guia' }).at(-1)!;
    expect(mobileIndex).toBeInTheDocument();
    fireEvent.click(mobileIndex.querySelector('a')!);
    expect(indexButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('uses the embedded layout without rendering the standalone hero', () => {
  const content = getGuideContent('pt');
  render(<GuidePage content={content} embedded />);

  expect(screen.queryByText(content.eyebrow)).not.toBeInTheDocument();
  expect(screen.getByText(`${content.steps.length} etapas para começar`)).toBeInTheDocument();
});
});
