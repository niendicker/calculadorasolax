-- Per-category sell margin (%) applied on top of the user's own stock price
-- when computing a solution's total cost for economic analyses (see
-- calculateSystemCost in components/app/helpers.ts). Lives on profiles since
-- it's a single per-account setting, not a list — same shape as the existing
-- company_name/company_address columns. Services are priced directly by the
-- user with no separate cost basis, so they're intentionally excluded.

alter table profiles
  add column if not exists margin_inverter_percent numeric(6, 2) not null default 0 check (margin_inverter_percent >= 0),
  add column if not exists margin_battery_percent numeric(6, 2) not null default 0 check (margin_battery_percent >= 0),
  add column if not exists margin_accessory_percent numeric(6, 2) not null default 0 check (margin_accessory_percent >= 0);
