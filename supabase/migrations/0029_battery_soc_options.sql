-- Battery minimum SOC is configured through fixed supported options.

update batteries
set min_soc_percent = case
  when coalesce(min_soc_percent, 10) <= 5 then 5
  else 10
end;

alter table batteries
  drop constraint if exists batteries_min_soc_percent_options_check,
  add constraint batteries_min_soc_percent_options_check
    check (min_soc_percent in (5, 10));
