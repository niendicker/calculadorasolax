-- Structured inverter feature flags. Future flags can be added by the app catalog
-- without changing the table shape.

alter table inverters
  add column if not exists flags text[] not null default '{}';
