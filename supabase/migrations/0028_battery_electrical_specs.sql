-- Store battery electrical specifications.

alter table batteries
  add column if not exists nominal_voltage_v numeric not null default 0,
  add column if not exists voltage_min_v numeric not null default 0,
  add column if not exists voltage_max_v numeric not null default 0,
  add column if not exists recommended_current_a numeric not null default 0,
  add column if not exists max_current_a numeric not null default 0;
