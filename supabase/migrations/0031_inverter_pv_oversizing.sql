-- PV oversizing option for inverter catalog (admin-defined, 50% or 100%).

alter table inverters
  add column if not exists pv_oversizing_percent integer not null default 100;

alter table inverters
  drop constraint if exists inverters_pv_oversizing_percent_check;

alter table inverters
  add constraint inverters_pv_oversizing_percent_check
  check (pv_oversizing_percent in (50, 100));
