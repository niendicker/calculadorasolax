import type { useRouter } from 'next/navigation';
import type { createClient } from '@/lib/supabase/client';

export function useAppNavigationActions({
  supabase,
  router,
  locale,
  loadProject,
  changeTab,
  setProfile,
  setUserEmail,
  clearUserData,
  setMobileMenuOpen,
  openPurchasesTab,
  openProfile,
  openClientsManager,
}: {
  supabase: ReturnType<typeof createClient>;
  router: ReturnType<typeof useRouter>;
  locale: string;
  loadProject: (id: string) => void;
  changeTab: (tab: 'project' | 'sizing' | 'catalog' | 'purchases' | 'myStock' | 'clients' | 'profile') => void;
  setProfile: (profile: null) => void;
  setUserEmail: (email: string | null) => void;
  clearUserData: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  openPurchasesTab: () => void;
  openProfile: () => void;
  openClientsManager: () => void;
}) {
  function openProjectFromClient(id: string) {
    loadProject(id);
    changeTab('project');
  }

  function backToProject() {
    changeTab('project');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setUserEmail(null);
    setMobileMenuOpen(false);
    clearUserData();
    router.replace(`/${locale}/login`);
    router.refresh();
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

  return { openProjectFromClient, backToProject, signOut, openMobilePurchasesTab, openMobileProfile, openMobileClientsManager };
}
