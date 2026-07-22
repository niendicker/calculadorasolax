// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SavedProject } from '@/lib/types';
import { useProjectActions } from './useProjectActions';

const fakeProject: SavedProject = {
  id: 'p1',
  name: 'Casa de praia',
  clientId: null,
  address: '',
  notes: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
  residentialOptions: {
    topology: null,
    batteryModel: null,
    secondaryBatteryModel: null,
    inverterModel: null,
    gridType: null,
    loads: [],
    peakCalcMode: 'sum',
    desiredFeatures: [],
    whiteTariff: null,
    microgrid: null,
    generator: null,
    atsPhotoUrl: null,
    atsBackupAcknowledged: false,
    maxPowerPerPhaseW: null,
  },
  solution: null,
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
      companyAddress: '',
      companyLogoUrl: '',
    },
    router,
    locale: 'pt',
    saveCurrentProject: vi.fn().mockResolvedValue(fakeProject),
    newProjectDraft: vi.fn(),
    cancelProjectDraft: vi.fn(),
    loadProject: vi.fn(),
    removeProject: vi.fn().mockResolvedValue(undefined),
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

    expect(props.loadProject).toHaveBeenCalledWith('p1');
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
});
