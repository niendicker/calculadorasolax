-- Product-level energy performance inputs used by the financial projection.
-- Defaults keep existing catalog rows compatible while allowing admins to
-- replace assumptions with manufacturer data.

alter table inverters
  add column if not exists battery_charge_efficiency_percent numeric not null default 97,
  add column if not exists battery_discharge_efficiency_percent numeric not null default 97,
  add column if not exists standby_consumption_w numeric not null default 0,
  add column if not exists max_battery_charge_power_w numeric,
  add column if not exists max_battery_discharge_power_w numeric;

alter table batteries
  add column if not exists round_trip_efficiency_percent numeric not null default 95,
  add column if not exists initial_soh_percent numeric not null default 100,
  add column if not exists annual_soh_loss_percent numeric not null default 2,
  add column if not exists warranty_end_soh_percent numeric;

alter table inverters
  add constraint inverters_battery_charge_efficiency_check
    check (battery_charge_efficiency_percent > 0 and battery_charge_efficiency_percent <= 100),
  add constraint inverters_battery_discharge_efficiency_check
    check (battery_discharge_efficiency_percent > 0 and battery_discharge_efficiency_percent <= 100),
  add constraint inverters_standby_consumption_check check (standby_consumption_w >= 0),
  add constraint inverters_max_battery_charge_power_check
    check (max_battery_charge_power_w is null or max_battery_charge_power_w > 0),
  add constraint inverters_max_battery_discharge_power_check
    check (max_battery_discharge_power_w is null or max_battery_discharge_power_w > 0);

alter table batteries
  add constraint batteries_round_trip_efficiency_check
    check (round_trip_efficiency_percent > 0 and round_trip_efficiency_percent <= 100),
  add constraint batteries_initial_soh_check check (initial_soh_percent > 0 and initial_soh_percent <= 100),
  add constraint batteries_annual_soh_loss_check check (annual_soh_loss_percent >= 0 and annual_soh_loss_percent < 100),
  add constraint batteries_warranty_end_soh_check
    check (warranty_end_soh_percent is null or (warranty_end_soh_percent > 0 and warranty_end_soh_percent <= 100));
