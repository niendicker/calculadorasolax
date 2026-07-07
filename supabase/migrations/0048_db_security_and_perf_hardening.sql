-- Security/optimization hardening pass following a full DB audit.

-- 1) Fix admin_activity_logs FIFO trim: migration 0043 tightened RLS on this
-- table down to admin-only SELECT/INSERT policies, with no DELETE policy.
-- Since inserts happen through the normal authenticated browser client (not
-- a service-role backend), the trigger's DELETE has been silently blocked
-- by RLS ever since — the table grows unbounded instead of capping at 150.
-- Making the trim function SECURITY DEFINER (same pattern as public.is_admin())
-- lets it bypass RLS for its own cleanup, regardless of who triggered the insert.
create or replace function public.trim_admin_activity_logs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from admin_activity_logs
  where id in (
    select id from admin_activity_logs
    order by created_at desc, id desc
    offset 150
  );
  return null;
end;
$$;

-- Trim the backlog that accumulated while the trigger was silently broken.
delete from admin_activity_logs
where id in (
  select id from admin_activity_logs
  order by created_at desc, id desc
  offset 150
);

-- 2) Missing indexes on FK/lookup columns (Postgres does not auto-index FKs).
create index if not exists admin_activity_logs_actor_id_idx on admin_activity_logs (actor_id);
create index if not exists app_simulations_user_id_idx on app_simulations (user_id);
create index if not exists accessory_rules_accessory_id_idx on accessory_rules (accessory_id);

-- 3) app_simulations accepts inserts from the anon key with `with check (true)`
-- and no size bounds — cap the JSONB payload arrays to something well above
-- realistic usage (loads is already capped at 20 per project by
-- lib/limits.ts/ACCOUNT_LIMITS.loadsPerProject) to block abuse via
-- direct REST calls that skip the frontend entirely.
alter table app_simulations
  drop constraint if exists app_simulations_loads_limit;
alter table app_simulations
  add constraint app_simulations_loads_limit
  check (jsonb_array_length(coalesce(loads, '[]'::jsonb)) <= 50);

alter table app_simulations
  drop constraint if exists app_simulations_accessories_limit;
alter table app_simulations
  add constraint app_simulations_accessories_limit
  check (jsonb_array_length(coalesce(accessories, '[]'::jsonb)) <= 30);

-- 4) Storage buckets had no file size/type limits at all.
update storage.buckets
set file_size_limit = 20971520, -- 20MB, covers product datasheets/manuals (PDF) and photos
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
where id = 'product-assets';

update storage.buckets
set file_size_limit = 5242880, -- 5MB, logos only
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
where id = 'profile-assets';
