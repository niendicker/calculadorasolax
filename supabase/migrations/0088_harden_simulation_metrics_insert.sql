-- app_simulations is written by authenticated application flows only.
-- The original migration allowed anonymous inserts with `with check (true)`,
-- which meant a caller using the public Supabase key could forge metrics for
-- any user_id or bypass the application API entirely. The API already
-- authenticates the caller and replaces user_id with auth.uid(); enforce the
-- same invariant at the database boundary.

drop policy if exists "anyone insert app simulations" on public.app_simulations;
drop policy if exists "authenticated insert own app simulations" on public.app_simulations;

create policy "authenticated insert own app simulations"
  on public.app_simulations for insert
  to authenticated
  with check (auth.uid() = user_id);
