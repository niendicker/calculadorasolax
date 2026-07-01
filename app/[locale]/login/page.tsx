import type { Metadata } from 'next';
import { AuthPanel } from '@/components/auth/AuthPanel';

export const metadata: Metadata = {
  title: 'Login | Calculadora SolaX',
  description: 'Acesse, cadastre-se ou recupere sua senha na Calculadora SolaX.',
};

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { locale } = await params;
  const { redirect } = await searchParams;

  return <AuthPanel locale={locale} redirectTo={redirect ?? `/${locale}`} />;
}
