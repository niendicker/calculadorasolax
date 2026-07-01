-- ESS rule limits used to generate and validate approved combinations.

alter table ess_compatibility_rules
  add column if not exists max_parallel_inverters int not null default 1 check (max_parallel_inverters > 0),
  add column if not exists max_battery_qty int not null default 1 check (max_battery_qty > 0);
