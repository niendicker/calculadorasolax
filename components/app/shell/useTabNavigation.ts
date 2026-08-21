'use client';

import type { Dispatch, SetStateAction } from 'react';

export type AppTab = 'project' | 'sizing' | 'catalog' | 'purchases' | 'myStock' | 'clients' | 'profile';

/** Centralizes tab changes and the unsaved-profile guard used by desktop and
 * mobile navigation. It deliberately owns no routing or domain state. */
export function useTabNavigation({
  activeTab,
  setActiveTab,
  profileDirty,
  setMobileMenuOpen,
}: {
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  profileDirty: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}) {
  function changeTab(tab: AppTab) {
    if (activeTab === 'profile' && tab !== 'profile' && profileDirty) {
      if (!window.confirm('Você tem alterações não salvas no perfil. Sair sem salvar?')) return;
    }
    setActiveTab(tab);
  }

  function openMobileTab(tab: 'project' | 'catalog' | 'myStock' | 'clients') {
    changeTab(tab);
    setMobileMenuOpen(false);
  }

  return { changeTab, openMobileTab };
}
