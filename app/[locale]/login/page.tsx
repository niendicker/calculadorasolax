import { AuthPanel } from '@/components/auth/AuthPanel';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { locale } = await params;
  const { redirect } = await searchParams;

  return <AuthPanel locale={locale} redirectTo={redirect ?? `/${locale}/profile`} />;
}
