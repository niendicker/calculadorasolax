-- Inverter phase options supported by admin catalog.

alter table inverters
  drop constraint if exists inverters_phases_check;

update inverters
set phases = case
  when phases in (1, 2, 3) then phases
  when phases < 1 then 1
  else 3
end;

alter table inverters
  add constraint inverters_phases_check
  check (phases in (1, 2, 3));
