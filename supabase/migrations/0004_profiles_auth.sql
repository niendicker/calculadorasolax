create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), profiles.phone),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

create policy "users read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "users insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "users update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "public write accessories" on accessories;
drop policy if exists "public write accessory_rules" on accessory_rules;
drop policy if exists "public write inverters" on inverters;
drop policy if exists "public write batteries" on batteries;
drop policy if exists "public write approved_solutions" on approved_solutions;

create policy "authenticated write accessories"
  on accessories for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated write accessory_rules"
  on accessory_rules for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated write inverters"
  on inverters for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated write batteries"
  on batteries for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated write approved_solutions"
  on approved_solutions for all
  to authenticated
  using (true)
  with check (true);
