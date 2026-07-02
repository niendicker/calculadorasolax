-- Store inverter battery-side electrical limits.

alter table inverters
  add column if not exists battery_voltage_min_v numeric not null default 0,
  add column if not exists battery_voltage_max_v numeric not null default 0,
  add column if not exists battery_current_max_a numeric not null default 0;
