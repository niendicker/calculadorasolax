-- Per-user resource limits: caps how many rows a single user can accumulate
-- in a few self-service tables, and how many loads a single project can
-- hold. Enforced here as the source of truth regardless of client; the
-- frontend also checks proactively (lib/limits.ts) for a faster, friendlier
-- message before ever reaching the database. Numbers must match ACCOUNT_LIMITS
-- in lib/limits.ts.

create or replace function enforce_user_row_limit()
returns trigger
language plpgsql
as $$
declare
  max_rows integer := tg_argv[0]::integer;
  current_count integer;
begin
  execute format('select count(*) from %I where user_id = $1', tg_table_name)
    into current_count
    using new.user_id;

  if current_count >= max_rows then
    raise exception 'limit_reached: user % already has % of % allowed rows in %',
      new.user_id, current_count, max_rows, tg_table_name
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_limit_check on projects;
create trigger projects_limit_check
  before insert on projects
  for each row execute function enforce_user_row_limit(15);

drop trigger if exists user_load_catalog_limit_check on user_load_catalog;
create trigger user_load_catalog_limit_check
  before insert on user_load_catalog
  for each row execute function enforce_user_row_limit(20);

drop trigger if exists user_stock_items_limit_check on user_stock_items;
create trigger user_stock_items_limit_check
  before insert on user_stock_items
  for each row execute function enforce_user_row_limit(10);

drop trigger if exists clients_limit_check on clients;
create trigger clients_limit_check
  before insert on clients
  for each row execute function enforce_user_row_limit(50);

-- Loads per project live as a JSONB array inside residential_options, so this
-- is a CHECK constraint (applies on both insert and update) instead of a
-- row-counting trigger.
alter table projects
  drop constraint if exists projects_loads_limit;
alter table projects
  add constraint projects_loads_limit
  check (jsonb_array_length(coalesce(residential_options -> 'loads', '[]'::jsonb)) <= 20);
