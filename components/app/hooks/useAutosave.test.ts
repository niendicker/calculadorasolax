// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedProject } from '@/lib/types';
import { AUTOSAVE_DEBOUNCE_MS, useAutosave } from './useAutosave';

const fakeProject = { id: 'p1', name: 'Casa' } as SavedProject;

function setup(initialProps: { enabled: boolean; data: unknown; saveCurrentProject: () => Promise<SavedProject> }) {
  return renderHook((props) => useAutosave(props), { initialProps });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutosave', () => {
  it('does not save on mount even though the baseline snapshot technically "changed" from nothing', () => {
    const saveCurrentProject = vi.fn().mockResolvedValue(fakeProject);
    setup({ enabled: true, data: { a: 1 }, saveCurrentProject });

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);
    });

    expect(saveCurrentProject).not.toHaveBeenCalled();
  });

  it('schedules a save after the debounce once data changes while enabled', async () => {
    const saveCurrentProject = vi.fn().mockResolvedValue(fakeProject);
    const { result, rerender } = setup({ enabled: true, data: { a: 1 }, saveCurrentProject });

    rerender({ enabled: true, data: { a: 2 }, saveCurrentProject });
    expect(result.current.status).toBe('pending');
    expect(saveCurrentProject).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });

    expect(saveCurrentProject).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it('resets the debounce timer on every further change (does not fire mid-typing)', async () => {
    const saveCurrentProject = vi.fn().mockResolvedValue(fakeProject);
    const { rerender } = setup({ enabled: true, data: { a: 1 }, saveCurrentProject });

    rerender({ enabled: true, data: { a: 2 }, saveCurrentProject });
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1000);
    });
    rerender({ enabled: true, data: { a: 3 }, saveCurrentProject });
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1000);
    });
    expect(saveCurrentProject).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(saveCurrentProject).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a save while disabled', () => {
    const saveCurrentProject = vi.fn().mockResolvedValue(fakeProject);
    const { rerender } = setup({ enabled: false, data: { a: 1 }, saveCurrentProject });

    rerender({ enabled: false, data: { a: 2 }, saveCurrentProject });
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);
    });

    expect(saveCurrentProject).not.toHaveBeenCalled();
  });

  it('re-baselines without saving when it becomes enabled with already-different data (e.g. a project just loaded)', () => {
    const saveCurrentProject = vi.fn().mockResolvedValue(fakeProject);
    const { rerender } = setup({ enabled: false, data: { a: 1 }, saveCurrentProject });

    rerender({ enabled: true, data: { a: 999 } as unknown, saveCurrentProject });
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);
    });

    expect(saveCurrentProject).not.toHaveBeenCalled();
  });

  it('flushes an immediately pending save when it becomes disabled instead of losing the edit', async () => {
    const saveCurrentProject = vi.fn().mockResolvedValue(fakeProject);
    const { rerender } = setup({ enabled: true, data: { a: 1 }, saveCurrentProject });

    rerender({ enabled: true, data: { a: 2 }, saveCurrentProject });
    act(() => {
      vi.advanceTimersByTime(2000); // well short of the debounce
    });
    expect(saveCurrentProject).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ enabled: false, data: { a: 2 }, saveCurrentProject });
    });

    expect(saveCurrentProject).toHaveBeenCalledTimes(1);
  });

  it('reports an error status without throwing when the save fails', async () => {
    const saveCurrentProject = vi.fn().mockRejectedValue(new Error('boom'));
    const { result, rerender } = setup({ enabled: true, data: { a: 1 }, saveCurrentProject });

    rerender({ enabled: true, data: { a: 2 }, saveCurrentProject });
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });

    expect(result.current.status).toBe('error');
  });
});
