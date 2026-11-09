'use client';

import { useEffect, useRef, useState } from 'react';

type AppTab = 'project' | 'sizing' | 'ciWorkspace' | 'catalog' | 'purchases' | 'myStock' | 'clients' | 'profile';

/** UI-only state for the application chrome. Domain state remains in the
 * wizard store and feature hooks; this hook owns only portals, drawers and
 * scroll behavior. */
export function useAppShellState(activeTab: AppTab) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [summaryDrawerOpen, setSummaryDrawerOpen] = useState(false);
  const [titleBarEl, setTitleBarEl] = useState<HTMLDivElement | null>(null);
  const [summaryEl, setSummaryEl] = useState<HTMLDivElement | null>(null);
  const [summaryActive, setSummaryActive] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Compacting the header (py-4 -> py-2) releases 16px into this scroller.
    // Near the bottom, the browser clamps scrollTop by that same amount.
    // Separate thresholds prevent that layout change from expanding the header
    // again and starting an endless resize/scroll cycle.
    const onScroll = () => setScrolled(previous => previous ? element.scrollTop > 8 : element.scrollTop > 24);
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  return {
    mobileMenuOpen,
    setMobileMenuOpen,
    summaryDrawerOpen,
    setSummaryDrawerOpen,
    titleBarEl,
    setTitleBarEl,
    summaryEl,
    setSummaryEl,
    summaryActive,
    setSummaryActive,
    scrolled,
    scrollRef,
  };
}
