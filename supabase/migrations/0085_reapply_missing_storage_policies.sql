-- Production has storage.objects with RLS enabled but zero policies on it —
-- confirmed via `select * from pg_policies where schemaname='storage' and
-- tablename='objects'` returning no rows, despite migrations 0006/0007
-- (which create them) both showing as applied in
-- supabase_migrations.schema_migrations. The bucket rows and their
-- file_size_limit/allowed_mime_types (from 0006/0048) are present, so this
-- isn't a case of the migrations never running — the policies were lost
-- some other way (same class of drift as 0083 reverting 0080's trigger).
--
-- With no policies at all, public reads on these buckets still work because
-- they're marked `public = true` (public buckets serve GETs from
-- /storage/v1/object/public/... without going through RLS), which is why
-- this went unnoticed until someone tried to upload a supplier logo — any
-- write to storage.objects always requires an explicit RLS policy,
-- regardless of the bucket's public flag.
drop policy if exists "public read product assets" on storage.objects;
create policy "public read product assets"
  on storage.objects for select
  using (bucket_id = 'product-assets');

drop policy if exists "admin write product assets" on storage.objects;
create policy "admin write product assets"
  on storage.objects for all
  using (bucket_id = 'product-assets' and public.is_admin())
  with check (bucket_id = 'product-assets' and public.is_admin());

drop policy if exists "public read profile assets" on storage.objects;
create policy "public read profile assets"
  on storage.objects for select
  using (bucket_id = 'profile-assets');

drop policy if exists "users write own profile assets" on storage.objects;
create policy "users write own profile assets"
  on storage.objects for all
  using (
    bucket_id = 'profile-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'profile-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
