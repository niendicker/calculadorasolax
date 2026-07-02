-- ESS maximum battery quantity per port can be one when the battery association limit is one.

update ess_compatibility_rules
set max_battery_qty = least(15, greatest(1, coalesce(max_battery_qty, 1)));

alter table ess_compatibility_rules
  drop constraint if exists ess_compatibility_rules_max_battery_qty_check,
  add constraint ess_compatibility_rules_max_battery_qty_check
    check (max_battery_qty between 1 and 15);
