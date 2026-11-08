-- These columns exist in the real physical catalog; the disposable base fixture
-- deliberately starts with only those needed by earlier migrations.
alter table public.ci_inverters add column if not exists battery_ports integer,add column if not exists max_battery_qty integer;
alter table public.ci_batteries add column if not exists max_association_qty integer;
update public.ci_inverters set battery_ports=2,battery_current_max_a=200,max_battery_qty=1 where id='00000000-0000-0000-0000-000000000001';
update public.ci_batteries set max_association_qty=2 where id='00000000-0000-0000-0000-000000000003';

alter table public.ci_inverters add constraint inverters_battery_ports_check check(battery_ports in (1,2));
alter table public.inverters add column if not exists battery_ports integer not null default 1 check(battery_ports in (1,2));
