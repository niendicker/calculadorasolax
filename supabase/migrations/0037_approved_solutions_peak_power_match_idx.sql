-- Keep residential recommendation lookups indexed after matching nominal and surge power separately.

create index if not exists approved_solutions_match_peak_idx
  on approved_solutions (
    active,
    grid_topology,
    battery_topology,
    rated_power_w,
    peak_power_w,
    available_energy_wh
  );
