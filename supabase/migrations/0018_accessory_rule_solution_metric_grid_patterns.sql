-- Accessory rules can target each solution and use the standard grid acronyms.

alter table accessory_rules
  drop constraint if exists accessory_rules_trigger_metric_check,
  drop constraint if exists accessory_rules_grid_topology_check;

update accessory_rules
set grid_topology = case grid_topology
  when '1p_220V' then '1P_220V'
  when '2p_220V' then '2P_220V'
  when '3p_220V' then '3P_220V'
  when '3p_380V' then '3P_380V'
  else grid_topology
end
where grid_topology is not null;

alter table accessory_rules
  add constraint accessory_rules_trigger_metric_check
  check (
    trigger_metric in ('per_solution', 'inverter_quantity', 'battery_quantity', 'battery_ports_used')
  ),
  add constraint accessory_rules_grid_topology_check
  check (
    grid_topology is null
    or grid_topology in ('1P_220V', '2P_220V', '3P_220V', '3P_380V')
  );
