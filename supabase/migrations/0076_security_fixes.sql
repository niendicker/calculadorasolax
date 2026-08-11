-- Security fixes from the 2026-08-11 review:
--
-- 1) profiles.role privilege escalation: the RLS policies on `profiles` are
--    row-scoped only (auth.uid() = id), with no column-level restriction, so
--    any authenticated user could set their own `role` to 'admin' — either
--    at signup, via raw_user_meta_data (handle_new_user trusted it blindly),
--    or afterwards with a plain `update profiles set role = 'admin' ...`
--    from their own already-authenticated session. `role` gates
--    public.is_admin(), which in turn gates most admin-only RLS policies and
--    app/api/admin/* routes, so this was a full privilege escalation to
--    admin for any signed-up user.
--
-- 2) quote_shares could be created for a project the inserting user doesn't
--    own (the INSERT policy only checked `user_id`, never that `project_id`
--    actually belongs to that user). Combined with the public, unauthenticated
--    /api/quote-shares/[token]/respond route — which trusts the share's
--    project_id via the service-role client to flip that project's status
--    and append a project_events row — this let a user tamper with another
--    user's project status/history if they ever learned that project's id.

-- 1a) Stop trusting client-controlled signup metadata for role. Every new
-- profile is created as 'user'; admins are promoted out-of-band (direct SQL)
-- or by an already-admin session, both covered by the guard trigger below.
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
    'user'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), profiles.phone),
    updated_at = now();

  return new;
end;
$$;

-- 1b) Column-level guard: a normal end-user session (PostgREST 'authenticated'
-- role — i.e. everything going through the browser client, including the
-- profile upsert AuthPanel.tsx does right after signup) can never change
-- `role` on insert or update unless it's already an admin. Scoped to
-- auth.role() = 'authenticated' specifically so it doesn't affect direct SQL
-- (Studio/migrations, which run as postgres) or a service-role admin tool,
-- if one is added later.
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
    elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role_guard();

-- 2) quote_shares: require the referenced project to actually belong to the
-- inserting user. SELECT/UPDATE/DELETE stay row-scoped by user_id as before.
drop policy if exists "users manage own quote shares" on public.quote_shares;

create policy "users read own quote shares"
  on public.quote_shares for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users insert own quote shares"
  on public.quote_shares for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

create policy "users update own quote shares"
  on public.quote_shares for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own quote shares"
  on public.quote_shares for delete
  to authenticated
  using (auth.uid() = user_id);
