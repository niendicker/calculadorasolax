import type { Metadata } from 'next';
import { ResetPasswordPanel } from '@/components/auth/ResetPasswordPanel';

export const metadata: Metadata = {
  title: 'Nova senha | Calculadora SolaX',
  description: 'Defina uma nova senha para acessar a Calculadora SolaX.',
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <ResetPasswordPanel locale={locale} />;
}
