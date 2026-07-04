import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TermsAcceptanceForm } from '@/components/auth/TermsAcceptanceForm';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Aceite dos termos | Calculadora SolaX',
  description: 'Aceite os Termos de Uso e a Política de Privacidade para continuar.',
};

export default async function AcceptTermsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { locale } = await params;
  const { redirect: redirectTo } = await searchParams;
  const target = redirectTo || `/${locale}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?redirect=${encodeURIComponent(target)}`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('terms_accepted_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.terms_accepted_at) redirect(target);

  return <TermsAcceptanceForm locale={locale} redirectTo={target} />;
}
