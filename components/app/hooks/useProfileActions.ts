import { useState } from 'react';
import type { useRouter } from 'next/navigation';
import { isAddressEmpty } from '@/lib/address';
import type { createClient } from '@/lib/supabase/client';
import type { InlineProfile } from '../types';
import { uploadPublicAsset } from '@/lib/data/storage-repository';
import { saveProfileRecord } from '@/lib/data/profile-repository';

export function useProfileActions({
  supabase,
  profile,
  setProfile,
  router,
  locale,
  clearUserData,
  setActiveTab,
}: {
  supabase: ReturnType<typeof createClient>;
  profile: InlineProfile | null;
  setProfile: (profile: InlineProfile | null) => void;
  router: ReturnType<typeof useRouter>;
  locale: string;
  clearUserData: () => void;
  setActiveTab: (tab: 'profile') => void;
}) {
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  // Snapshot of the profile as last loaded/saved — compared against the live
  // `profile` state to warn before navigating away with unsaved edits, since
  // ProfileTab has no autosave and the shell has several distinct nav paths
  // (sidebar, bottom nav, "Mais" sheet) that can all leave this tab.
  const [profileSnapshot, setProfileSnapshot] = useState<InlineProfile | null>(null);
  const profileDirty = Boolean(profile && profileSnapshot && JSON.stringify(profile) !== JSON.stringify(profileSnapshot));

  function openProfile() {
    setProfileMessage(null);
    setProfileError(null);

    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }

    setProfileSnapshot(profile);
    setActiveTab('profile');
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    setProfileSaving(true);
    setProfileMessage(null);
    setProfileError(null);

    try {
      await saveProfileRecord(supabase, {
      id: profile.id,
      email: profile.email,
      full_name: profile.fullName.trim(),
      phone: profile.phone.trim(),
      role: profile.role,
      company_name: profile.companyName.trim(),
      company_address: isAddressEmpty(profile.companyAddress) ? null : profile.companyAddress,
      company_logo_url: profile.companyLogoUrl.trim(),
      company_document: profile.companyDocument.trim() || null,
      updated_at: new Date().toISOString(),
      });
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.');
      setProfileSaving(false);
      return;
    }

    setProfileSaving(false);

    setProfileMessage('Perfil atualizado.');
    setProfileSnapshot(profile);
  }

  async function uploadCompanyLogo(file: File | undefined) {
    if (!file || !profile) return;

    setProfileSaving(true);
    setProfileError(null);

    const extension = file.name.split('.').pop();
    const path = `${profile.id}/logo/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
    setProfileSaving(false);
    try {
      const publicUrl = await uploadPublicAsset(supabase, 'profile-assets', path, file);
      setProfile({ ...profile, companyLogoUrl: publicUrl });
      setProfileMessage('Logomarca carregada. Salve o perfil para manter a alteração.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Falha ao carregar a logomarca.');
      return;
    }
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      const response = await fetch('/api/account/delete', { method: 'POST' });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDeleteAccountError(result.error ?? 'Não foi possível excluir a conta. Tente novamente.');
        setDeletingAccount(false);
        return;
      }

      await supabase.auth.signOut();
      clearUserData();
      router.replace(`/${locale}/login`);
      router.refresh();
    } catch {
      setDeleteAccountError('Não foi possível excluir a conta. Tente novamente.');
      setDeletingAccount(false);
    }
  }

  return {
    profileSaving,
    profileMessage,
    profileError,
    profileDirty,
    openProfile,
    saveProfile,
    uploadCompanyLogo,
    deleteAccountOpen,
    setDeleteAccountOpen,
    deleteConfirmText,
    setDeleteConfirmText,
    deletingAccount,
    deleteAccountError,
    setDeleteAccountError,
    deleteAccount,
  };
}
