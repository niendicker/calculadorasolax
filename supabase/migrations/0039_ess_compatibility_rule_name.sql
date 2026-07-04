-- Optional display name for ESS compatibility rules, so admins can
-- identify a rule without reading its inverter/battery/quantity details.

alter table ess_compatibility_rules add column if not exists name text;
