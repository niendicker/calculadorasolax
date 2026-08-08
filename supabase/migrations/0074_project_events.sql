-- Append-only audit trail for a project's communication/negotiation
-- milestones (quote shared, link viewed, accepted/rejected, manual status
-- changes) — same shape as purchase_order_events (0063_supplier_procurement.sql),
-- which already proved this pattern for supplier communications. Powers a
-- "Histórico" timeline on the project summary instead of the single
-- "Atualizado em" timestamp today.
create table if not exists project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists project_events_project_idx on project_events (project_id, created_at);

alter table project_events enable row level security;

-- Owner-scoped by joining back to projects, same idiom as
-- purchase_order_events' own SELECT policy — but this table also allows a
-- direct authenticated INSERT (purchase_order_events instead wraps every
-- insert in a security definer RPC, because those RPCs also perform
-- privileged business logic; logging a project event has none, so a plain
-- RLS-scoped insert is simpler and just as safe).
create policy "users read own project events"
  on project_events for select
  to authenticated
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "users insert own project events"
  on project_events for insert
  to authenticated
  with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

-- No anon policy: the customer-driven events (quote_link_viewed,
-- quote_accepted, quote_rejected) are inserted by the service-role client in
-- the public quote page/respond route, same as quote_shares itself.

-- Tracks whether/when the customer has opened a share link at all, so the
-- public page can log a quote_link_viewed event once instead of on every
-- reload.
alter table quote_shares add column if not exists first_viewed_at timestamptz;
