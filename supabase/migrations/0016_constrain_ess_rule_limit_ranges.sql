-- Constrain ESS rule limits to the admin-supported ranges.

alter table ess_compatibility_rules
  drop constraint if exists ess_compatibility_rules_max_parallel_inverters_check,
  drop constraint if exists ess_compatibility_rules_max_battery_qty_check;

update ess_compatibility_rules
set
  max_parallel_inverters = least(10, greatest(1, coalesce(max_parallel_inverters, 1))),
  max_battery_qty = least(15, greatest(2, coalesce(max_battery_qty, 2)));

alter table ess_compatibility_rules
  alter column max_parallel_inverters set default 1,
  alter column max_battery_qty set default 2,
  add constraint ess_compatibility_rules_max_parallel_inverters_check
    check (max_parallel_inverters between 1 and 10),
  add constraint ess_compatibility_rules_max_battery_qty_check
    check (max_battery_qty between 2 and 15);
