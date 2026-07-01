-- Inverter battery ports are currently supported as one or two ports.

alter table inverters
  drop constraint if exists inverters_battery_ports_check;

update inverters
set battery_ports = least(2, greatest(1, coalesce(battery_ports, 1)));

alter table inverters
  add constraint inverters_battery_ports_check
  check (battery_ports in (1, 2));
