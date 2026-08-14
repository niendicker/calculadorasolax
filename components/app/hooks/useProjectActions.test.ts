// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import type { SavedProject } from '@/lib/types';
import { useProjectActions } from './useProjectActions';

const fakeProject: SavedProject = {
  id: 'p1',
  name: 'Casa de praia',
  clientId: null,
  address: emptyAddress(),
  notes: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: 'draft',
  residentialOptions: {
    topology: null,
    batteryModel: null,
    secondaryBatteryModel: null,
    inverterModel: null,
    minInverterQty: null,
    gridType: null,
    loads: [],
    peakCalcMode: 'sum',
    operationHours: 0,
    desiredFeatures: [],
    whiteTariff: null,
    microgrid: null,
    generator: null,
    pv: null,
    atsPhotoUrl: null,
    atsBackupAcknowledged: false,
    maxPowerPerPhaseW: null,
  },
  solution: null,
  services: [],
};

function setup(overrides: Partial<Parameters<typeof useProjectActions>[0]> = {}) {
  const router = { push: vi.fn() } as unknown as Parameters<typeof useProjectActions>[0]['router'];
  const props = {
    profile: {
      id: 'user-1',
      email: 'a@b.com',
      fullName: '',
      phone: '',
      role: 'user' as const,
      companyName: '',
      companyAddress: emptyAddress(),
      companyLogoUrl: '',
      companyDocument: '',
    },
    router,
    locale: 'pt',
    saveCurrentProject: vi.fn().mockResolvedValue(fakeProject),
    newProjectDraft: vi.fn(),
    cancelProjectDraft: vi.fn(),
    loadProject: vi.fn(),
    removeProject: vi.fn().mockResolvedValue(undefined),
    duplicateProject: vi.fn().mockResolvedValue(fakeProject),
    refreshProjectSolution: vi.fn().mockResolvedValue(fakeProject),
    updateProjectStatus: vi.fn().mockResolvedValue(fakeProject),
    setActiveTab: vi.fn(),
    ...overrides,
  };
  const { result } = renderHook(() => useProjectActions(props));
  return { result, props, router };
}

describe('useProjectActions: saveProject', () => {
  it('redirects to login instead of saving when there is no profile', async () => {
    const { result, props, router } = setup({ profile: null });

    await act(async () => {
      await result.current.saveProject();
    });

    expect(router.push).toHaveBeenCalledWith('/pt/login?redirect=/pt');
    expect(props.saveCurrentProject).not.toHaveBeenCalled();
  });

  it('sets a success status naming the saved project', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.saveProject();
    });

    expect(result.current.projectStatus).toContain('Casa de praia');
  });

  it('surfaces a limit-reached error message verbatim', async () => {
    const { result } = setup({
      saveCurrentProject: vi.fn().mockRejectedValue(new Error('Limite de 15 projetos salvos atingido.')),
    });

    await act(async () => {
      await result.current.saveProject();
    });

    expect(result.current.projectStatus).toBe('Limite de 15 projetos salvos atingido.');
  });

  it('falls back to a generic message for any other error', async () => {
    const { result } = setup({ saveCurrentProject: vi.fn().mockRejectedValue(new Error('db exploded')) });

    await act(async () => {
      await result.current.saveProject();
    });

    expect(result.current.projectStatus).toBe('Não foi possível salvar o projeto. Tente novamente.');
  });
});

describe('useProjectActions: statusId / dismissProjectStatus', () => {
  it('bumps statusId on every new status, even repeated messages', () => {
    const { result } = setup();
    expect(result.current.statusId).toBe(0);

    act(() => result.current.openProject('p1'));
    expect(result.current.statusId).toBe(1);

    act(() => result.current.openProjectSizing('p1'));
    expect(result.current.projectStatus).toBe('Projeto carregado.');
    expect(result.current.statusId).toBe(2);
  });

  it('dismissProjectStatus clears the status without touching statusId', () => {
    const { result } = setup();
    act(() => result.current.openProject('p1'));
    expect(result.current.projectStatus).not.toBeNull();

    act(() => result.current.dismissProjectStatus());

    expect(result.current.projectStatus).toBeNull();
    expect(result.current.statusId).toBe(1);
  });
});

describe('useProjectActions: draft lifecycle', () => {
  it('startNewProject calls newProjectDraft and clears the status', async () => {
    const { result, props } = setup();
    await act(async () => {
      await result.current.saveProject();
    });
    expect(result.current.projectStatus).not.toBeNull();

    act(() => result.current.startNewProject());

    expect(props.newProjectDraft).toHaveBeenCalled();
    expect(result.current.projectStatus).toBeNull();
  });

  it('cancelNewProject calls cancelProjectDraft and clears the status', async () => {
    const { result, props } = setup();
    await act(async () => {
      await result.current.saveProject();
    });

    act(() => result.current.cancelNewProject());

    expect(props.cancelProjectDraft).toHaveBeenCalled();
    expect(result.current.projectStatus).toBeNull();
  });
});

describe('useProjectActions: open/openSizing/delete', () => {
  it('openProject loads the project and reports it loaded', () => {
    const { result, props } = setup();

    act(() => result.current.openProject('p1'));

    expect(props.loadProject).toHaveBeenCalledWith('p1');
    expect(result.current.projectStatus).toBe('Projeto carregado.');
  });

  it('openProjectSizing loads the project, switches tab and reports it loaded', () => {
    const { result, props } = setup();

    act(() => result.current.openProjectSizing('p1'));

    expect(props.loadProject).toHaveBeenCalledWith('p1', { showDetails: false });
    expect(props.setActiveTab).toHaveBeenCalledWith('sizing');
    expect(result.current.projectStatus).toBe('Projeto carregado.');
  });

  it('deleteProject removes the project and reports success', async () => {
    const { result, props } = setup();

    await act(async () => {
      await result.current.deleteProject('p1');
    });

    expect(props.removeProject).toHaveBeenCalledWith('p1');
    expect(result.current.projectStatus).toBe('Projeto removido.');
  });

  it('deleteProject reports failure without throwing when removeProject rejects', async () => {
    const { result } = setup({ removeProject: vi.fn().mockRejectedValue(new Error('nope')) });

    await act(async () => {
      await result.current.deleteProject('p1');
    });

    expect(result.current.projectStatus).toBe('Não foi possível remover o projeto.');
  });

  it('duplicateProject duplicates the project and reports success with its name', async () => {
    const { result, props } = setup({
      duplicateProject: vi.fn().mockResolvedValue({ ...fakeProject, name: 'Casa de praia (cópia)' }),
    });

    await act(async () => {
      await result.current.duplicateProject('p1');
    });

    expect(props.duplicateProject).toHaveBeenCalledWith('p1');
    expect(result.current.projectStatus).toBe('Projeto duplicado como "Casa de praia (cópia)".');
  });

  it('duplicateProject reports the limit message without throwing when the cap is reached', async () => {
    const { result } = setup({
      duplicateProject: vi.fn().mockRejectedValue(new Error('Limite de 15 projetos salvos atingido.')),
    });

    await act(async () => {
      await result.current.duplicateProject('p1');
    });

    expect(result.current.projectStatus).toBe('Limite de 15 projetos salvos atingido.');
  });

  it('duplicateProject reports a generic failure without throwing on other errors', async () => {
    const { result } = setup({ duplicateProject: vi.fn().mockRejectedValue(new Error('db exploded')) });

    await act(async () => {
      await result.current.duplicateProject('p1');
    });

    expect(result.current.projectStatus).toBe('Não foi possível duplicar o projeto. Tente novamente.');
  });
});

describe('useProjectActions: refreshProjectSolution', () => {
  it('reports success and tracks refreshingProjectId only while in flight', async () => {
    const { result } = setup();
    expect(result.current.refreshingProjectId).toBeNull();

    const promise = act(async () => {
      await result.current.refreshProjectSolution('p1');
    });
    await promise;

    expect(result.current.projectStatus).toBe('Solução recalculada.');
    expect(result.current.refreshingProjectId).toBeNull();
  });

  it('reports a friendly message for the internal project_not_found code', async () => {
    const { result } = setup({
      refreshProjectSolution: vi.fn().mockRejectedValue(new Error('project_not_found')),
    });

    await act(async () => {
      await result.current.refreshProjectSolution('p1');
    });

    expect(result.current.projectStatus).toBe('Projeto não encontrado. Atualize a lista e tente novamente.');
  });

  it('reports a friendly message for the internal missing_battery_model code', async () => {
    const { result } = setup({
      refreshProjectSolution: vi.fn().mockRejectedValue(new Error('missing_battery_model')),
    });

    await act(async () => {
      await result.current.refreshProjectSolution('p1');
    });

    expect(result.current.projectStatus).toBe(
      'Este projeto não tem uma bateria selecionada. Abra-o no Dimensionamento antes de recalcular.'
    );
  });

  it('surfaces a specific calculation error message verbatim instead of a generic fallback', async () => {
    const { result } = setup({
      refreshProjectSolution: vi.fn().mockRejectedValue(
        new Error('Nenhuma combinação aprovada atende a essa carga, bateria e tipo de rede. Tente reduzir as cargas, aumentar a capacidade da bateria ou escolher outro modelo.')
      ),
    });

    await act(async () => {
      await result.current.refreshProjectSolution('p1');
    });

    expect(result.current.projectStatus).toBe(
      'Nenhuma combinação aprovada atende a essa carga, bateria e tipo de rede. Tente reduzir as cargas, aumentar a capacidade da bateria ou escolher outro modelo.'
    );
  });

  it('falls back to a generic message when the rejection has no message', async () => {
    const { result } = setup({ refreshProjectSolution: vi.fn().mockRejectedValue('not an Error') });

    await act(async () => {
      await result.current.refreshProjectSolution('p1');
    });

    expect(result.current.projectStatus).toBe('Não foi possível recalcular a solução. Tente novamente.');
  });
});

describe('useProjectActions: updateProjectStatus', () => {
  it('reports success naming the new status label', async () => {
    const { result, props } = setup();

    await act(async () => {
      await result.current.updateProjectStatus('p1', 'sent');
    });

    expect(props.updateProjectStatus).toHaveBeenCalledWith('p1', 'sent');
    expect(result.current.projectStatus).toBe('Cotação marcada como "Enviada".');
  });

  it('reports a generic failure without throwing when the update rejects', async () => {
    const { result } = setup({ updateProjectStatus: vi.fn().mockRejectedValue(new Error('db down')) });

    await act(async () => {
      await result.current.updateProjectStatus('p1', 'accepted');
    });

    expect(result.current.projectStatus).toBe('Não foi possível atualizar o status da cotação. Tente novamente.');
  });
});
