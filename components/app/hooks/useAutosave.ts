import { useEffect, useRef, useState } from 'react';
import type { SavedProject } from '@/lib/types';

// Long on purpose: this fires with no explicit "Salvar" button anymore, so it
// must never trigger mid-typing — only once the user has actually paused.
export const AUTOSAVE_DEBOUNCE_MS = 12000;

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Debounced autosave for the sizing wizard, replacing the old "Salvar
 * projeto" button. While `enabled`, any change to `data` (a snapshot the
 * caller re-creates every render) schedules a save AUTOSAVE_DEBOUNCE_MS after
 * the user stops editing. Becoming enabled (e.g. switching into the sizing
 * tab, or a project finishing its load) re-baselines without saving — that's
 * pre-existing state, not an edit worth persisting. Becoming disabled with a
 * save still queued flushes it immediately instead of silently losing it. */
export function useAutosave({
  enabled,
  data,
  saveCurrentProject,
}: {
  enabled: boolean;
  data: unknown;
  saveCurrentProject: () => Promise<SavedProject>;
}) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const serialized = JSON.stringify(data);
  const baselineRef = useRef(serialized);
  const wasEnabledRef = useRef(enabled);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveCurrentProjectRef = useRef(saveCurrentProject);

  useEffect(() => {
    saveCurrentProjectRef.current = saveCurrentProject;
  }, [saveCurrentProject]);

  useEffect(() => {
    async function runSave() {
      setStatus('saving');
      try {
        await saveCurrentProjectRef.current();
        setStatus('saved');
        setLastSavedAt(new Date());
      } catch {
        setStatus('error');
      }
    }

    const justEnabled = enabled && !wasEnabledRef.current;
    const justDisabled = !enabled && wasEnabledRef.current;
    wasEnabledRef.current = enabled;

    if (justEnabled) {
      baselineRef.current = serialized;
      return;
    }

    if (justDisabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        void runSave();
      }
      return;
    }

    if (!enabled) return;
    if (serialized === baselineRef.current) return;
    baselineRef.current = serialized;

    setStatus('pending');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      void runSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [serialized, enabled]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  return { status, lastSavedAt };
}
