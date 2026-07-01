-- ESS compatibility rules between inverter and battery models.

create table if not exists ess_compatibility_rules (
  id uuid primary key default gen_random_uuid(),
  inverter_model text not null,
  battery_model text not null,
  battery_topology text check (battery_topology is null or battery_topology in ('HV', 'LV')),
  grid_topology text check (grid_topology is null or grid_topology in ('1p_220V', '3p_220V', '3p_380V')),
  comment text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (inverter_model, battery_model, grid_topology)
);

alter table ess_compatibility_rules enable row level security;

create policy "public read ess_compatibility_rules"
  on ess_compatibility_rules for select
  using (true);

create policy "admin write ess_compatibility_rules"
  on ess_compatibility_rules for all
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists ess_compatibility_rules_match_idx
  on ess_compatibility_rules (active, inverter_model, battery_model, battery_topology, grid_topology);
