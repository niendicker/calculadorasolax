-- Keep admin_activity_logs as a FIFO queue of at most 150 entries: whenever a
-- new log is inserted, trim anything past the 150 most recent (oldest first).

alter table admin_activity_logs
  drop constraint if exists admin_activity_logs_entity_type_check;

alter table admin_activity_logs
  add constraint admin_activity_logs_entity_type_check
  check (entity_type in ('inverter', 'battery', 'accessory', 'solution', 'rule', 'load_catalog_item'));

create or replace function public.trim_admin_activity_logs()
returns trigger
language plpgsql
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

drop trigger if exists admin_activity_logs_fifo on admin_activity_logs;

create trigger admin_activity_logs_fifo
  after insert on admin_activity_logs
  for each statement
  execute function public.trim_admin_activity_logs();

-- Trim any existing backlog down to 150 right away.
delete from admin_activity_logs
where id in (
  select id from admin_activity_logs
  order by created_at desc, id desc
  offset 150
);
