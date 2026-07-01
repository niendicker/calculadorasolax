import { redirect } from 'next/navigation';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { createClient } from '@/lib/supabase/server';

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
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') redirect(`/${locale}/profile`);

  return <AdminPanel />;
}
