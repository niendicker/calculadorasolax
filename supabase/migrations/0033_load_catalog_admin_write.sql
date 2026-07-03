-- Allow admins to manage load_catalog entries (previously read-only, seeded once).

create policy "admin write load_catalog"
  on load_catalog for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
