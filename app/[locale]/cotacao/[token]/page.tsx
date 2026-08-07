import { notFound } from 'next/navigation';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { QuoteShareView } from '@/components/quote-share/QuoteShareView';
import type { QuoteShareSnapshot } from '@/components/app/helpers';
import type { QuoteShareStatus } from '@/lib/types';

export const metadata = {
  title: 'Orçamento | Calculadora SolaX',
};

/** Public, no-login page for a shared quote — deliberately doesn't call
 *  supabase.auth.getUser() (see login/termos/privacidade for the same
 *  pattern): the end customer opening this link has no session at all, so
 *  the row is read with the service-role client instead, same as every
 *  other privileged read/write in app/api/purchase-orders/*. */
export default async function QuoteSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data } = await service.from('quote_shares').select('status, snapshot, responded_at').eq('id', token).maybeSingle();
  if (!data) notFound();

  return (
    <QuoteShareView
      token={token}
      status={data.status as QuoteShareStatus}
      snapshot={data.snapshot as QuoteShareSnapshot}
      respondedAt={data.responded_at as string | null}
    />
  );
}
