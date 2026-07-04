import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Administração | Calculadora SolaX',
  description: 'Administre produtos, combinações aprovadas e regras da Calculadora SolaX.',
};

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?redirect=/${locale}/admin`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, terms_accepted_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') redirect(`/${locale}/profile`);

  if (!profile?.terms_accepted_at) {
    redirect(`/${locale}/aceite-termos?redirect=${encodeURIComponent(`/${locale}/admin`)}`);
  }

  return <AdminPanel />;
}
