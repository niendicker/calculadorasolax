import { useState } from 'react';
import type { useRouter } from 'next/navigation';
import type { createClient } from '@/lib/supabase/client';
import type { InlineProfile } from '../types';

export function useProfileActions({
  supabase,
  profile,
  setProfile,
  router,
  locale,
  clearUserData,
}: {
  supabase: ReturnType<typeof createClient>;
  profile: InlineProfile | null;
  setProfile: (profile: InlineProfile | null) => void;
  router: ReturnType<typeof useRouter>;
  locale: string;
  clearUserData: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  function openProfile() {
    setProfileMessage(null);
    setProfileError(null);

    if (!profile) {
      router.push(`/${locale}/login?redirect=/${locale}`);
      return;
    }

    setProfileOpen(true);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    setProfileSaving(true);
    setProfileMessage(null);
    setProfileError(null);

    const { error: saveError } = await supabase.from('profiles').upsert({
      id: profile.id,
      email: profile.email,
      full_name: profile.fullName.trim(),
      phone: profile.phone.trim(),
      role: profile.role,
      company_name: profile.companyName.trim(),
      company_address: profile.companyAddress.trim(),
      company_logo_url: profile.companyLogoUrl.trim(),
      updated_at: new Date().toISOString(),
    });

    setProfileSaving(false);

    if (saveError) {
      setProfileError(saveError.message);
      return;
    }

    setProfileMessage('Perfil atualizado.');
  }

  async function uploadCompanyLogo(file: File | undefined) {
    if (!file || !profile) return;

    setProfileSaving(true);
    setProfileError(null);

    const extension = file.name.split('.').pop();
    const path = `${profile.id}/logo/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
    const { error: uploadError } = await supabase.storage
      .from('profile-assets')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    setProfileSaving(false);

    if (uploadError) {
      setProfileError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from('profile-assets').getPublicUrl(path);
    setProfile({ ...profile, companyLogoUrl: data.publicUrl });
    setProfileMessage('Logomarca carregada. Salve o perfil para manter a alteração.');
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
    profileOpen,
    setProfileOpen,
    profileSaving,
    profileMessage,
    profileError,
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
