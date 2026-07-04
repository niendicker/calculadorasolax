import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SinglePageApp } from '@/components/app/SinglePageApp';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Dimensionamento | Calculadora SolaX',
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

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('terms_accepted_at')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.terms_accepted_at) {
      redirect(`/${locale}/aceite-termos?redirect=${encodeURIComponent(`/${locale}`)}`);
    }
  }

  return <SinglePageApp />;
}
