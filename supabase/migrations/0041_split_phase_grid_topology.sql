-- Bifásico (split-phase 220V) is a distinct connection type from Monofásico,
-- but approved_solutions only accepted 1p_220V/3p_220V/3p_380V, so the app
-- silently mapped Bifásico requests onto Monofásico's approved combinations.
-- Add 2p_220V as its own grid_topology value.

alter table approved_solutions
  drop constraint if exists approved_solutions_grid_topology_check;

alter table approved_solutions
  add constraint approved_solutions_grid_topology_check
  check (grid_topology in ('1p_220V', '2p_220V', '3p_220V', '3p_380V'));
