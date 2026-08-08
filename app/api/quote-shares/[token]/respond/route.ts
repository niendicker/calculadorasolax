import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

interface RespondInput {
  decision?: string;
}

/** Records the end customer's Aceitar/Recusar click on a public quote-share
 *  link — no auth gate at all, since the caller is the customer, who never
 *  has a session (see app/[locale]/cotacao/[token]/page.tsx, which reads the
 *  same table the same way). Also flips the parent project's status so the
 *  seller's own project list (its own RLS-scoped read) reflects the
 *  customer's decision without any extra sync mechanism. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let input: RespondInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  if (input.decision !== 'accepted' && input.decision !== 'rejected') {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  const decision = input.decision;

  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: share, error: shareError } = await service
    .from('quote_shares')
    .select('id, project_id, status')
    .eq('id', token)
    .maybeSingle();
  if (shareError) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (share.status !== 'sent') return NextResponse.json({ error: 'already_responded' }, { status: 409 });

  const { error: updateShareError } = await service
    .from('quote_shares')
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq('id', token);
  if (updateShareError) return NextResponse.json({ error: 'update_failed' }, { status: 500 });

  // updated_at is set explicitly (not just left to a DB default) so the
  // seller's project summary — which keys its Histórico refetch off this
  // field — picks up the new quote_accepted/quote_rejected event next time
  // it's loaded, the same way a manual status change already does.
  await service.from('projects').update({ status: decision, updated_at: new Date().toISOString() }).eq('id', share.project_id);

  await service.from('project_events').insert({
    project_id: share.project_id,
    actor_id: null,
    event_type: decision === 'accepted' ? 'quote_accepted' : 'quote_rejected',
    from_status: 'sent',
    to_status: decision,
  });

  return NextResponse.json({ status: decision });
}
