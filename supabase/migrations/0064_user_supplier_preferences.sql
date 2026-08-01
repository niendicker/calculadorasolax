-- Lets each user pick a limited number of preferred suppliers (limit set by
-- the admin) whose offers should feed their pricing/availability, on top of
-- suppliers the admin marks as mandatory defaults for every account.

alter table public.suppliers
  add column if not exists is_default_for_all boolean not null default false;

-- Single-row table of platform-wide settings. The `id boolean` + check
-- constraint is a standard "singleton table" trick: only one row (id = true)
-- can ever exist, so there's never an ambiguous "which settings row" query.
create table public.app_settings (
  id boolean primary key default true check (id),
  max_user_suppliers integer not null default 2 check (max_user_suppliers >= 0),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

alter table public.app_settings enable row level security;

create policy "authenticated read app settings" on public.app_settings for select to authenticated
  using (true);
create policy "admins manage app settings" on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table public.user_supplier_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, supplier_id)
);

alter table public.user_supplier_preferences enable row level security;

create policy "users read own supplier preferences" on public.user_supplier_preferences for select to authenticated
  using (auth.uid() = user_id or public.is_admin());
create policy "users manage own supplier preferences" on public.user_supplier_preferences for insert to authenticated
  with check (auth.uid() = user_id);
create policy "users remove own supplier preferences" on public.user_supplier_preferences for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- Enforces the admin-configured selection limit at the database layer too
-- (the frontend checks proactively against the same app_settings row for a
-- fast/clear error before ever reaching Supabase — see lib/limits.ts).
create or replace function public.enforce_user_supplier_preference_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_allowed integer;
  current_count integer;
begin
  select max_user_suppliers into max_allowed from public.app_settings where id = true;
  select count(*) into current_count from public.user_supplier_preferences where user_id = new.user_id;

  if current_count >= max_allowed then
    raise exception 'limit_reached: user % already has % of % allowed supplier preferences',
      new.user_id, current_count, max_allowed
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger user_supplier_preferences_limit_check
  before insert on public.user_supplier_preferences
  for each row execute function public.enforce_user_supplier_preference_limit();
