-- ESS rules derive grid compatibility from the selected inverter catalog entry.

update ess_compatibility_rules
set grid_topology = null
where grid_topology is not null;
