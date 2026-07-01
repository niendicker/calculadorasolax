-- Standardize ESS rule grid topology values to the internal grid acronyms.

alter table ess_compatibility_rules
  drop constraint if exists ess_compatibility_rules_grid_topology_check;

update ess_compatibility_rules
set grid_topology = case grid_topology
  when '1p_220V' then '1P_220V'
  when '2p_220V' then '2P_220V'
  when '3p_220V' then '3P_220V'
  when '3p_380V' then '3P_380V'
  else grid_topology
end
where grid_topology is not null;

alter table ess_compatibility_rules
  add constraint ess_compatibility_rules_grid_topology_check
  check (
    grid_topology is null
    or grid_topology in ('1P_220V', '2P_220V', '3P_220V', '3P_380V')
  );
