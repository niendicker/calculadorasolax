-- Admin user list and application usage metrics.

create table if not exists app_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  project_name text,
  client_name text,
  topology text,
  grid_type text,
  peak_w numeric not null default 0,
  daily_kwh numeric not null default 0,
  loads jsonb not null default '[]'::jsonb,
  inverter_model text,
  battery_model text,
  accessories jsonb not null default '[]'::jsonb,
  solution_code text,
  created_at timestamptz not null default now()
);

alter table app_simulations enable row level security;

drop policy if exists "anyone insert app simulations" on app_simulations;
create policy "anyone insert app simulations"
  on app_simulations for insert
  with check (true);

drop policy if exists "admin read app simulations" on app_simulations;
create policy "admin read app simulations"
  on app_simulations for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admin read profiles" on profiles;
create policy "admin read profiles"
  on profiles for select
  to authenticated
  using (public.is_admin());

create index if not exists app_simulations_created_at_idx on app_simulations (created_at desc);
create index if not exists app_simulations_grid_type_idx on app_simulations (grid_type);
create index if not exists app_simulations_inverter_model_idx on app_simulations (inverter_model);
create index if not exists app_simulations_battery_model_idx on app_simulations (battery_model);
