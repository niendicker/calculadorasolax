-- Warranty registration per product type. Inverters and accessories are
-- warranted by a fixed duration; batteries are additionally warranted by a
-- charge/discharge throughput (whichever limit is reached first), matching
-- how manufacturers actually publish battery warranty terms.
alter table inverters
  add column if not exists warranty_years integer not null default 10;

alter table batteries
  add column if not exists warranty_years integer not null default 10,
  add column if not exists warranty_cycles integer not null default 6000;

alter table accessories
  add column if not exists warranty_years integer not null default 2;

alter table inverters
  add constraint inverters_warranty_years_check check (warranty_years > 0);

alter table batteries
  add constraint batteries_warranty_years_check check (warranty_years > 0),
  add constraint batteries_warranty_cycles_check check (warranty_cycles > 0);

alter table accessories
  add constraint accessories_warranty_years_check check (warranty_years > 0);
