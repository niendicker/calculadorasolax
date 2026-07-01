-- Allow accessory rules to target multiple inverter models.

alter table accessory_rules
  add column if not exists inverter_models text[] not null default '{}';

update accessory_rules
set inverter_models = array[inverter_model]
where inverter_model is not null
  and cardinality(inverter_models) = 0;
