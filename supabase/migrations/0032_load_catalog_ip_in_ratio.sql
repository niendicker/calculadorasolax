-- IP/IN ratio (starting/inrush apparent power divided by nominal apparent power)
-- per load catalog item. Used to estimate the system's peak apparent power for
-- loads with motor/compressor inrush current (air conditioners, pumps, fridges).
-- Defaults to 1 (no surge above nominal) for purely resistive/electronic loads.

alter table load_catalog
  add column if not exists ip_in_ratio numeric not null default 1;

alter table load_catalog
  drop constraint if exists load_catalog_ip_in_ratio_check;

alter table load_catalog
  add constraint load_catalog_ip_in_ratio_check
  check (ip_in_ratio >= 1);

-- Compressor/motor loads: higher starting current draw.
update load_catalog set ip_in_ratio = 3 where name_pt in (
  'Ar-condicionado 9000 BTU',
  'Ar-condicionado 12000 BTU',
  'Ar-condicionado 18000 BTU',
  'Bomba d''água 1/2 CV',
  'Bomba d''água 1 CV',
  'Freezer horizontal',
  'Geladeira duplex'
);

-- Lighter motor-driven loads: moderate starting current draw.
update load_catalog set ip_in_ratio = 2 where name_pt in (
  'Lavadora de roupas',
  'Secadora de roupas',
  'Máquina de lavar louça'
);
