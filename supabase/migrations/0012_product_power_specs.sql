-- Product electrical specs used by admin catalog and sizing UI.

alter table inverters
  add column if not exists standard_power_kva numeric,
  add column if not exists peak_power_kva numeric,
  add column if not exists battery_ports int not null default 1 check (battery_ports > 0);

alter table batteries
  add column if not exists standard_power_kw numeric,
  add column if not exists peak_power_kw numeric,
  add column if not exists min_soc_percent numeric not null default 10 check (
    min_soc_percent >= 0 and min_soc_percent < 100
  );

update inverters
set
  standard_power_kva = coalesce(standard_power_kva, power_kw),
  peak_power_kva = coalesce(peak_power_kva, power_kw * 2),
  battery_ports = coalesce(battery_ports, 1);

update batteries
set
  standard_power_kw = coalesce(standard_power_kw, capacity_kwh),
  peak_power_kw = coalesce(peak_power_kw, capacity_kwh),
  min_soc_percent = coalesce(min_soc_percent, 10);
