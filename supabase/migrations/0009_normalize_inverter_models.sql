-- Normalize inverter model names used by the customer-facing calculator.

with model_map(old_model, new_model) as (
  values
    ('X1-HYB-5.0-LV', 'X1-HYB-5.0-LV'),
    ('X1-Hybrid-5.0kW-G4', 'X1-Hybrid-5.0'),
    ('X1-Hybrid-7.5kW-G4', 'X1-Hybrid-7.5'),
    ('X1-SPT-6.0K', 'X1-SPT-6.0K'),
    ('X3-Hybrid-10.0kW-G4', 'X3-Hybrid-10.0'),
    ('X3-Hybrid-15.0kW-G4', 'X3-Hybrid-15.0'),
    ('X3-Hybrid-5.5kW-G4 LV', 'X3-Hybrid-5.5 LV'),
    ('X3-Hybrid-8.3kW-G4 LV', 'X3-Hybrid-8.3 LV'),
    ('X3-ULT-15K-GLV', 'X3-ULT-15K-GLV'),
    ('X3-ULT-30K', 'X3-ULT-30K')
)
update approved_solutions s
set
  inverter_model = m.new_model,
  raw_solution = jsonb_set(s.raw_solution, '{inverter,model}', to_jsonb(m.new_model))
from model_map m
where s.inverter_model = m.old_model;

with model_map(old_model, new_model) as (
  values
    ('X1-HYB-5.0-LV', 'X1-HYB-5.0-LV'),
    ('X1-Hybrid-5.0kW-G4', 'X1-Hybrid-5.0'),
    ('X1-Hybrid-7.5kW-G4', 'X1-Hybrid-7.5'),
    ('X1-SPT-6.0K', 'X1-SPT-6.0K'),
    ('X3-Hybrid-10.0kW-G4', 'X3-Hybrid-10.0'),
    ('X3-Hybrid-15.0kW-G4', 'X3-Hybrid-15.0'),
    ('X3-Hybrid-5.5kW-G4 LV', 'X3-Hybrid-5.5 LV'),
    ('X3-Hybrid-8.3kW-G4 LV', 'X3-Hybrid-8.3 LV'),
    ('X3-ULT-15K-GLV', 'X3-ULT-15K-GLV'),
    ('X3-ULT-30K', 'X3-ULT-30K')
)
update accessory_rules r
set inverter_model = m.new_model
from model_map m
where r.inverter_model = m.old_model;

delete from inverters
where model not in (
  'X1-HYB-5.0-LV',
  'X1-Hybrid-5.0',
  'X1-Hybrid-7.5',
  'X1-SPT-6.0K',
  'X3-Hybrid-10.0',
  'X3-Hybrid-15.0',
  'X3-Hybrid-5.5 LV',
  'X3-Hybrid-8.3 LV',
  'X3-ULT-15K-GLV',
  'X3-ULT-30K'
);

insert into inverters (model, power_kw, phases, topology, grid_types, max_battery_qty)
values
  ('X1-HYB-5.0-LV', 5.0, 1, 'LV', array['singlePhase_220'], 9),
  ('X1-Hybrid-5.0', 5.0, 1, 'HV', array['singlePhase_220'], 16),
  ('X1-Hybrid-7.5', 7.5, 1, 'HV', array['singlePhase_220'], 16),
  ('X1-SPT-6.0K', 6.0, 1, 'HV', array['singlePhase_220'], 14),
  ('X3-Hybrid-10.0', 10.0, 3, 'HV', array['threePhase_380'], 26),
  ('X3-Hybrid-15.0', 15.0, 3, 'HV', array['threePhase_380'], 39),
  ('X3-Hybrid-5.5 LV', 5.5, 3, 'LV', array['threePhase_220'], 22),
  ('X3-Hybrid-8.3 LV', 8.3, 3, 'LV', array['threePhase_220'], 33),
  ('X3-ULT-15K-GLV', 15.0, 3, 'HV', array['threePhase_220'], 108),
  ('X3-ULT-30K', 30.0, 3, 'HV', array['threePhase_380'], 156)
on conflict (model) do update set
  power_kw = excluded.power_kw,
  phases = excluded.phases,
  topology = excluded.topology,
  grid_types = excluded.grid_types,
  max_battery_qty = excluded.max_battery_qty;
