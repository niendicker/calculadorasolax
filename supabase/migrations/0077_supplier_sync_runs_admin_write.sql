-- app/api/admin/suppliers/[supplierId]/sync/route.ts already verifies the
-- caller is an admin in application code, then used a service-role client
-- (bypassing RLS entirely) for every write because supplier_sync_runs had no
-- insert/update policy — only "admins read sync runs" (select). Every other
-- table that route touches (supplier_integrations, supplier_offers,
-- supplier_product_mappings) already has an "admins manage ... for all"
-- policy, so this was the one gap forcing the whole route onto service role.
--
-- Replacing it with the same for-all/is_admin() policy lets the route use
-- the normal RLS-scoped client throughout: Postgres re-checks is_admin() on
-- every write instead of trusting the route's own role check blindly, the
-- same defense-in-depth every other admin-write policy already has.
drop policy if exists "admins read sync runs" on public.supplier_sync_runs;

create policy "admins manage sync runs"
  on public.supplier_sync_runs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
