import { ResetPasswordPanel } from '@/components/auth/ResetPasswordPanel';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <ResetPasswordPanel locale={locale} />;
}
