-- Minimum battery quantity per ESS compatibility rule.

alter table ess_compatibility_rules
  add column if not exists min_battery_qty int not null default 1;

update ess_compatibility_rules
set
  min_battery_qty = least(7, greatest(1, coalesce(min_battery_qty, 1))),
  max_battery_qty = greatest(max_battery_qty, least(7, greatest(1, coalesce(min_battery_qty, 1))));

alter table ess_compatibility_rules
  drop constraint if exists ess_compatibility_rules_min_battery_qty_check,
  add constraint ess_compatibility_rules_min_battery_qty_check
    check (min_battery_qty between 1 and 7),
  add constraint ess_compatibility_rules_battery_qty_range_check
    check (max_battery_qty >= min_battery_qty);
