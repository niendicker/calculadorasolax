-- Allow administrators to read the append-only project event stream so the
-- metrics dashboard can count supplier quote requests without exposing other
-- users' project history to regular accounts.
create policy "admins read project events"
  on public.project_events for select
  to authenticated
  using (public.is_admin());
