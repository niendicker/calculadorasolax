-- Product media and public client-facing technical documents.

alter table inverters
  add column if not exists image_url text,
  add column if not exists documents jsonb not null default '[]'::jsonb;

alter table batteries
  add column if not exists image_url text,
  add column if not exists documents jsonb not null default '[]'::jsonb;

alter table accessories
  add column if not exists image_url text,
  add column if not exists documents jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('product-assets', 'product-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "public read product assets" on storage.objects;
create policy "public read product assets"
  on storage.objects for select
  using (bucket_id = 'product-assets');

drop policy if exists "admin write product assets" on storage.objects;
create policy "admin write product assets"
  on storage.objects for all
  using (bucket_id = 'product-assets' and public.is_admin())
  with check (bucket_id = 'product-assets' and public.is_admin());
