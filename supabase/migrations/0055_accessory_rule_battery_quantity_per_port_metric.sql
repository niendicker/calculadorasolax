-- New trigger_metric: 'battery_quantity_per_port' gates on the average
-- battery count per physical port (battery_quantity / (inverter_quantity *
-- battery_ports_used)) instead of a solution-wide total — for rules like
-- "once a port has 4+ batteries, add 1 accessory per port in use".
alter table accessory_rules
  drop constraint if exists accessory_rules_trigger_metric_check;

alter table accessory_rules
  add constraint accessory_rules_trigger_metric_check
  check (
    trigger_metric in ('per_solution', 'inverter_quantity', 'battery_quantity', 'battery_ports_used', 'battery_quantity_per_port')
  );
