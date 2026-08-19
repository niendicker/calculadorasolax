import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SinglePageApp } from '@/components/app/SinglePageApp';
import { createClient } from '@/lib/supabase/server';
import { hasAcceptedCurrentLegalDocuments } from '@/lib/legal-documents';

export const metadata: Metadata = {
  title: 'Dimensionamento',
  description: 'Simulação residencial para dimensionamento de sistemas híbridos SolaX.',
};

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?redirect=/${locale}`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('terms_accepted_at, terms_accepted_version')
    .eq('id', user.id)
    .maybeSingle();

  if (!hasAcceptedCurrentLegalDocuments(profile)) {
    redirect(`/${locale}/aceite-termos?redirect=${encodeURIComponent(`/${locale}`)}`);
  }

  return <SinglePageApp />;
}
