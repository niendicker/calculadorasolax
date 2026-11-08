alter table public.ci_bess_products
  add column ac_voltages_v integer[] not null default '{}'
  check(ac_voltages_v <@ array[220,380]::integer[] and array_position(ac_voltages_v,null) is null);
comment on column public.ci_bess_products.ac_voltages_v is 'Documented AC line-to-line operating voltages. Empty means not documented; do not infer from DC voltage or model name.';

-- New queries need the voltage declaration in each immutable solution.
update public.ci_solution_generations set is_current=false,invalidated_at=now(),invalidation_reason='ac_operating_voltage' where is_current;
