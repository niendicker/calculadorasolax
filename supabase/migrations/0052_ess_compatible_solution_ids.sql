-- The calculate-residential Edge Function's ESS-compatibility check compared
-- a solution's *total* battery_quantity directly against
-- ess_compatibility_rules' min/max_battery_qty. Those limits are per-port
-- (see buildRuleGeneratedSolutions in components/admin/helpers.ts, which
-- multiplies them by inverterQty * portsActive to get the solution's total
-- battery_quantity when generating approved_solutions rows). Any solution
-- needing more than one inverter (or more than one battery port) to reach
-- that total therefore always failed the Edge Function's check, even when
-- perfectly valid — multi-inverter solutions never got recommended.
--
-- Centralizing the scaled comparison here, in the one place both the admin
-- rule generator and the Deno Edge Function already read from, instead of
-- re-deriving it in a second application runtime that can't share code with
-- the first.
create or replace function public.ess_compatible_solution_ids(
  p_battery_model text,
  p_battery_topology text,
  p_grid_topology text,
  p_solution_ids uuid[]
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_rule boolean;
  result uuid[];
begin
  -- Mirrors matchingEssBatteryConfig's fallback: a rule with no battery_configs
  -- entries falls back to its own legacy battery_model/topology/qty columns.
  select exists (
    select 1
    from ess_compatibility_rules r
    cross join lateral jsonb_to_recordset(
      case when jsonb_array_length(coalesce(r.battery_configs, '[]'::jsonb)) > 0
        then r.battery_configs
        else jsonb_build_array(jsonb_build_object(
          'battery_model', r.battery_model,
          'battery_topology', r.battery_topology,
          'min_battery_qty', r.min_battery_qty,
          'max_battery_qty', r.max_battery_qty
        ))
      end
    ) as bc(battery_model text, battery_topology text, min_battery_qty int, max_battery_qty int)
    where r.active
      and bc.battery_model = p_battery_model
      and (bc.battery_topology is null or bc.battery_topology = p_battery_topology)
      and (r.grid_topology is null or r.grid_topology = p_grid_topology)
  ) into has_rule;

  -- No ESS rule mentions this battery at all: it's unrestricted, same as the
  -- old "relevantRules.length === 0" short-circuit that skipped filtering.
  if not has_rule then
    return p_solution_ids;
  end if;

  select coalesce(array_agg(distinct s.id), '{}')
  into result
  from approved_solutions s
  join ess_compatibility_rules r
    on r.active
   and r.inverter_model = s.inverter_model
   and (r.grid_topology is null or r.grid_topology = p_grid_topology)
  cross join lateral jsonb_to_recordset(
    case when jsonb_array_length(coalesce(r.battery_configs, '[]'::jsonb)) > 0
      then r.battery_configs
      else jsonb_build_array(jsonb_build_object(
        'battery_model', r.battery_model,
        'battery_topology', r.battery_topology,
        'min_battery_qty', r.min_battery_qty,
        'max_battery_qty', r.max_battery_qty
      ))
    end
  ) as bc(battery_model text, battery_topology text, min_battery_qty int, max_battery_qty int)
  where s.id = any(p_solution_ids)
    and bc.battery_model = p_battery_model
    and (bc.battery_topology is null or bc.battery_topology = p_battery_topology)
    -- Same clamp ranges/fallbacks as the old clampNumber(value, min, max, 1) calls.
    and s.inverter_quantity <= least(10, greatest(1, coalesce(r.max_parallel_inverters, 1)))
    and s.battery_quantity >= least(7, greatest(1, coalesce(bc.min_battery_qty, 1))) * s.inverter_quantity * s.battery_ports_used
    and s.battery_quantity <= least(15, greatest(1, coalesce(bc.max_battery_qty, 1))) * s.inverter_quantity * s.battery_ports_used;

  return result;
end;
$$;

grant execute on function public.ess_compatible_solution_ids(text, text, text, uuid[]) to service_role, authenticated;
