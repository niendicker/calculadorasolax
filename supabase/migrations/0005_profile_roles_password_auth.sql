alter table profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'user')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), profiles.phone),
    updated_at = now();

  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

drop policy if exists "authenticated write accessories" on accessories;
drop policy if exists "authenticated write accessory_rules" on accessory_rules;
drop policy if exists "authenticated write inverters" on inverters;
drop policy if exists "authenticated write batteries" on batteries;
drop policy if exists "authenticated write approved_solutions" on approved_solutions;

create policy "admin write accessories"
  on accessories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin write accessory_rules"
  on accessory_rules for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin write inverters"
  on inverters for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin write batteries"
  on batteries for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin write approved_solutions"
  on approved_solutions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
