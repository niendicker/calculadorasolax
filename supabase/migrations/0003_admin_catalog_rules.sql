-- Admin-managed product catalog and automatic accessory rules.
-- The write policies below are permissive because this project does not yet
-- have an admin authentication flow. Replace them with authenticated admin
-- policies before exposing the admin route publicly.

create unique index if not exists inverters_model_key on inverters (model);
create unique index if not exists batteries_model_key on batteries (model);

create table if not exists accessories (
  id uuid primary key default gen_random_uuid(),
  model text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists accessory_rules (
  id uuid primary key default gen_random_uuid(),
  accessory_id uuid not null references accessories(id) on delete cascade,
  name text not null,
  inclusion text not null check (inclusion in ('required', 'optional')),
  trigger_metric text not null check (
    trigger_metric in ('inverter_quantity', 'battery_quantity', 'battery_ports_used')
  ),
  min_quantity int not null check (min_quantity > 0),
  inverter_model text,
  battery_model text,
  grid_topology text check (grid_topology is null or grid_topology in ('1p_220V', '3p_220V', '3p_380V')),
  battery_topology text check (battery_topology is null or battery_topology in ('HV', 'LV')),
  quantity_per_match int not null default 1 check (quantity_per_match > 0),
  comment text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table accessories enable row level security;
alter table accessory_rules enable row level security;

create policy "public read accessories" on accessories for select using (true);
create policy "public write accessories" on accessories for all using (true) with check (true);
create policy "public read accessory_rules" on accessory_rules for select using (true);
create policy "public write accessory_rules" on accessory_rules for all using (true) with check (true);

create policy "public write inverters" on inverters for all using (true) with check (true);
create policy "public write batteries" on batteries for all using (true) with check (true);
create policy "public write approved_solutions" on approved_solutions for all using (true) with check (true);

create index if not exists accessory_rules_match_idx
  on accessory_rules (
    active,
    trigger_metric,
    min_quantity,
    inverter_model,
    battery_model,
    grid_topology,
    battery_topology
  );

insert into accessories (model, description)
select distinct accessory->>'model', null
from approved_solutions
cross join lateral jsonb_array_elements(accessories) as accessory
where accessory->>'model' is not null
on conflict (model) do nothing;
