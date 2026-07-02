-- ESS rules can target multiple battery models with per-model quantity limits.

alter table ess_compatibility_rules
  add column if not exists battery_configs jsonb not null default '[]'::jsonb;

update ess_compatibility_rules
set battery_configs = jsonb_build_array(
  jsonb_build_object(
    'battery_model', battery_model,
    'battery_topology', battery_topology,
    'min_battery_qty', min_battery_qty,
    'max_battery_qty', max_battery_qty
  )
)
where battery_model is not null
  and battery_topology is not null
  and battery_configs = '[]'::jsonb;
