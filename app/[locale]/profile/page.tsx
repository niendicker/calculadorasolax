import { redirect } from 'next/navigation';
import { ProfilePanel } from '@/components/auth/ProfilePanel';
import { createClient } from '@/lib/supabase/server';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?redirect=/${locale}/profile`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, role')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <ProfilePanel
      locale={locale}
      initialProfile={{
        id: user.id,
        email: profile?.email ?? user.email ?? '',
        full_name: profile?.full_name ?? user.user_metadata?.full_name ?? '',
        phone: profile?.phone ?? user.user_metadata?.phone ?? '',
        role: profile?.role ?? 'user',
      }}
    />
  );
}
