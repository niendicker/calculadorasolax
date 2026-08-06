-- Fixes a quota bug: when a supplier a user had already picked in
-- user_supplier_preferences is later promoted to is_default_for_all by an
-- admin, the old preference row was never cleaned up. It keeps counting
-- against the user's max_user_suppliers quota even though the supplier now
-- shows separately (locked) as a mandatory default — so a user who should
-- get 2 picks on top of the defaults could only add 1 more.

-- One-off cleanup: any preference row that duplicates a now-default
-- supplier is redundant (the supplier is already included for every account
-- regardless of this table) and was only ever eating into the quota.
delete from public.user_supplier_preferences usp
using public.suppliers s
where usp.supplier_id = s.id
  and s.is_default_for_all;

-- The quota check must never count a default-for-all supplier — it isn't a
-- "pick" the user is spending their quota on.
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

  select count(*) into current_count
  from public.user_supplier_preferences usp
  join public.suppliers s on s.id = usp.supplier_id
  where usp.user_id = new.user_id
    and not s.is_default_for_all;

  if current_count >= max_allowed then
    raise exception 'limit_reached: user % already has % of % allowed supplier preferences',
      new.user_id, current_count, max_allowed
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Keeps the same cleanup from recurring: as soon as a supplier is promoted
-- to a mandatory default, drop everyone's now-redundant preference row for
-- it instead of leaving it to silently eat into their quota forever.
create or replace function public.clear_preferences_for_new_default_supplier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default_for_all and not old.is_default_for_all then
    delete from public.user_supplier_preferences where supplier_id = new.id;
  end if;
  return new;
end;
$$;

create trigger supplier_promoted_to_default
  after update on public.suppliers
  for each row execute function public.clear_preferences_for_new_default_supplier();
