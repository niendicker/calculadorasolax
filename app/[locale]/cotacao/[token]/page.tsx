import { notFound } from 'next/navigation';
import { QuoteShareView } from '@/components/quote-share/QuoteShareView';
import { createServiceClient } from '@/lib/supabase/service';
import type { QuoteShareSnapshot } from '@/components/app/helpers';
import type { QuoteShareStatus } from '@/lib/types';
import { isQuoteShareExpired } from '@/lib/quote-share';

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

  const service = createServiceClient();

  const { data } = await service
    .from('quote_shares')
    .select('status, snapshot, responded_at, project_id, first_viewed_at, created_at')
    .eq('id', token)
    .maybeSingle();
  if (!data || isQuoteShareExpired(data.created_at)) notFound();

  // Logged once (guarded by first_viewed_at) so a customer refreshing the
  // page repeatedly doesn't spam the seller's Histórico with duplicate
  // "visualizou" entries.
  if (!data.first_viewed_at) {
    const viewedAt = new Date().toISOString();
    await service.from('quote_shares').update({ first_viewed_at: viewedAt }).eq('id', token);
    await service.from('project_events').insert({
      project_id: data.project_id,
      actor_id: null,
      event_type: 'quote_link_viewed',
    });
  }

  return (
    <QuoteShareView
      token={token}
      status={data.status as QuoteShareStatus}
      snapshot={data.snapshot as unknown as QuoteShareSnapshot}
      respondedAt={data.responded_at as string | null}
    />
  );
}
