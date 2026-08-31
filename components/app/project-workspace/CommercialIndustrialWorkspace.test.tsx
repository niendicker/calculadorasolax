// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultCiOptions, defaultProjectInfo } from '@/lib/store/defaults';
import { CommercialIndustrialWorkspace } from './CommercialIndustrialWorkspace';

const { listActiveCiBessProducts } = vi.hoisted(() => ({ listActiveCiBessProducts: vi.fn() }));
vi.mock('@/lib/data/ci-bess-products-repository', () => ({ listActiveCiBessProducts }));

function renderWorkspace(overrides: { currentCiProjectId?: string | null } = {}) {
  return render(
    <CommercialIndustrialWorkspace
      projectInfo={defaultProjectInfo}
      clients={[]}
      onUpdateProjectInfo={vi.fn()}
      onSaveProject={vi.fn()}
      onBackToProjects={vi.fn()}
      ciOptions={defaultCiOptions}
      onUpdateCiOptions={vi.fn()}
      currentCiProjectId={overrides.currentCiProjectId ?? null}
      autosaveStatus="idle"
      autosaveLastSavedAt={null}
    />
  );
}

describe('CommercialIndustrialWorkspace', () => {
  it('shows the project identification card on Visão geral, and the BESS panel on Configuração BESS', async () => {
    listActiveCiBessProducts.mockResolvedValue([]);
    renderWorkspace();

    expect(screen.getByLabelText('Nome do projeto')).toBeInTheDocument();
    expect(screen.queryByText('Produto BESS')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Configuração BESS' }));

    expect(await screen.findByText('Produto BESS')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do projeto')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Visão geral' }));
    expect(screen.getByLabelText('Nome do projeto')).toBeInTheDocument();
  });

  it('shows the tariff panel on Tarifa', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Tarifa' }));
    expect(screen.getByText('Tarifa de energia')).toBeInTheDocument();
  });

  it('shows the strategy panel on Estratégia', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Estratégia' }));
    expect(screen.getByText('Estratégia de despacho')).toBeInTheDocument();
  });

  it('shows the results panel on Resultados, prompting to save first when there is no saved project yet', () => {
    renderWorkspace({ currentCiProjectId: null });
    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));
    expect(screen.getByText(/Salve o projeto/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Calcular/ })).not.toBeInTheDocument();
  });

  it('shows the Calcular button once the project has been saved', () => {
    renderWorkspace({ currentCiProjectId: 'ci-project-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));
    expect(screen.getByRole('button', { name: 'Calcular' })).toBeInTheDocument();
  });
});
