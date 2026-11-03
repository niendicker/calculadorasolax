-- 0095_user_feature_flags.sql
-- Add user-level feature flags in profiles with admin-only management and security guard.

-- 1) Add feature_flags column to profiles
alter table public.profiles
  add column if not exists feature_flags text[] not null default '{}';

-- Validate allowed flags
alter table public.profiles
  drop constraint if exists profiles_feature_flags_known_check;
alter table public.profiles
  add constraint profiles_feature_flags_known_check
  check (feature_flags <@ array['ci', 'ci_backup']::text[]);

-- Ensure ci_backup requires ci
alter table public.profiles
  drop constraint if exists profiles_ci_backup_requires_ci_check;
alter table public.profiles
  add constraint profiles_ci_backup_requires_ci_check
  check (not ('ci_backup' = any(feature_flags)) or ('ci' = any(feature_flags)));

-- 2) Update enforce_profile_role_guard to prevent self-escalation of feature_flags
create or replace function public.enforce_profile_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.role := 'user';
      new.feature_flags := '{}';
    elsif tg_op = 'UPDATE' then
      if new.role is distinct from old.role then
        new.role := old.role;
      end if;
      if new.feature_flags is distinct from old.feature_flags then
        new.feature_flags := old.feature_flags;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 3) Admin update policy on profiles
drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
