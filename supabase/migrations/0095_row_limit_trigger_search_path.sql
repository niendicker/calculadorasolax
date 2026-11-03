-- enforce_user_row_limit() counted rows through an unqualified table name, so
-- it depended on the caller's search_path. Restores via pg_dump (which clears
-- search_path) failed with `relation "clients" does not exist`. Qualify the
-- table with its schema and pin an empty search_path so the lookup is stable.
create or replace function public.enforce_user_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows integer := tg_argv[0]::integer;
  current_count integer;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
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
