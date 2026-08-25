import { useState } from 'react';
import type { useRouter } from 'next/navigation';
import type { createClient } from '@/lib/supabase/client';

export function useAppNavigationActions({
  supabase,
  router,
  locale,
  loadProject,
  openWorkspace,
  changeTab,
  setProfile,
  setUserEmail,
  clearUserData,
  setMobileMenuOpen,
  openPurchasesTab,
  openProfile,
  openClientsManager,
  profileDirty,
}: {
  supabase: ReturnType<typeof createClient>;
  router: ReturnType<typeof useRouter>;
  locale: string;
  loadProject: (id: string) => void;
  openWorkspace?: (id: string) => void;
  changeTab: (tab: 'project' | 'sizing' | 'catalog' | 'purchases' | 'myStock' | 'clients' | 'profile') => void;
  setProfile: (profile: null) => void;
  setUserEmail: (email: string | null) => void;
  clearUserData: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  openPurchasesTab: () => void;
  openProfile: () => void;
  openClientsManager: () => void;
  profileDirty: boolean;
}) {
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  function openProjectFromClient(id: string) {
    if (openWorkspace) {
      openWorkspace(id);
      return;
    }
    loadProject(id);
    changeTab('project');
  }

  function backToProject() {
    changeTab('project');
  }

  async function signOut() {
    if (signingOut) return;
    if (profileDirty && !window.confirm('Você tem alterações não salvas no perfil. Deseja sair mesmo assim?')) return;

    setSignOutError(null);
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setSignOutError('Não foi possível sair agora. Tente novamente.');
        return;
      }

      setProfile(null);
      setUserEmail(null);
      setMobileMenuOpen(false);
      clearUserData();
      router.replace(`/${locale}/login`);
      router.refresh();
    } catch {
      setSignOutError('Não foi possível sair agora. Tente novamente.');
    } finally {
      setSigningOut(false);
    }
  }

  function openMobilePurchasesTab() {
    setMobileMenuOpen(false);
    openPurchasesTab();
  }

  function openMobileProfile() {
    setMobileMenuOpen(false);
    openProfile();
  }

  function openMobileClientsManager() {
    setMobileMenuOpen(false);
    openClientsManager();
  }

  return { openProjectFromClient, backToProject, signOut, signOutError, signingOut, openMobilePurchasesTab, openMobileProfile, openMobileClientsManager };
}
