-- Company branding used in generated reports.

alter table profiles
  add column if not exists company_name text not null default '',
  add column if not exists company_address text not null default '',
  add column if not exists company_logo_url text not null default '';

insert into storage.buckets (id, name, public)
values ('profile-assets', 'profile-assets', true)
on conflict (id) do update set public = true;

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
