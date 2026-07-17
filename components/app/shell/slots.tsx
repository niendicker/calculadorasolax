'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const TitleBarPortalContext = createContext<HTMLDivElement | null>(null);
const SummaryPortalContext = createContext<HTMLDivElement | null>(null);
const SetSummaryActiveContext = createContext<((active: boolean) => void) | null>(null);

export const TitleBarPortalProvider = TitleBarPortalContext.Provider;
export const SummaryPortalProvider = SummaryPortalContext.Provider;
export const SetSummaryActiveProvider = SetSummaryActiveContext.Provider;

/** Renders `children` into the shell's title bar row, wherever the tab happens to mount. */
export function PageHeader({ children }: { children: ReactNode }) {
  const target = useContext(TitleBarPortalContext);
  if (!target) return null;
  return createPortal(children, target);
}

/** Renders `children` into the shell's right-hand summary panel. Pair with a tab that
 *  wants its own summary content; tabs without one simply don't render this. */
export function PageSummary({ children }: { children: ReactNode }) {
  const target = useContext(SummaryPortalContext);
  const setActive = useContext(SetSummaryActiveContext);

  // Mount-only: tells the shell a summary is present so it can hide its
  // generic empty state, without re-running on every render (children is a
  // fresh JSX node each time, so it can't be a dependency here).
  useEffect(() => {
    setActive?.(true);
    return () => setActive?.(false);
  }, [setActive]);

  if (!target) return null;
  return createPortal(children, target);
}
