import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params;
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  let next = requestUrl.searchParams.get('next') ?? `/${locale}`;

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    if (next === `/${locale}` && data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.role === 'admin') next = `/${locale}/admin`;
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
