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
    const onScroll = () => setScrolled(element.scrollTop > 8);
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
