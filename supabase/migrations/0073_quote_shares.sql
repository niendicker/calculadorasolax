-- Public, no-login quote links: a snapshot of a saved project's solution
-- that the end customer can open (via an unguessable UUID token) and
-- respond to with "Aceitar"/"Recusar", closing the loop that today only
-- happens informally over WhatsApp/PDF (see ProjectStatus in lib/types).
create table if not exists quote_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  status text not null default 'sent' check (status in ('sent', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists quote_shares_project_id_idx on quote_shares (project_id);
create index if not exists quote_shares_user_id_idx on quote_shares (user_id);

alter table quote_shares enable row level security;

-- The seller only creates/lists their own share links — the snapshot can
-- include final sale figures, still their customer's data to control.
create policy "users manage own quote shares"
  on quote_shares for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No anon policy: the public quote page and the accept/decline route read
-- and write through the service-role client instead (same pattern already
-- used by app/api/purchase-orders/*), since the end customer has no session
-- at all — see notify-supplier-email/submit-to-partner routes.
