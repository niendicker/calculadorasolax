-- Store structured battery flags and maximum association per inverter battery port.

alter table batteries
  add column if not exists flags text[] not null default '{}',
  add column if not exists max_association_qty int not null default 15;

update batteries
set max_association_qty = least(15, greatest(1, coalesce(max_association_qty, 15)));

alter table batteries
  drop constraint if exists batteries_max_association_qty_check,
  add constraint batteries_max_association_qty_check
    check (max_association_qty between 1 and 15);
