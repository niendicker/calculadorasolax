-- C&I (Commercial & Industrial) BESS module — docs/CI-MODULE-PLAN.md
-- section 6. Additive only: existing residential projects and their
-- columns are untouched.

-- ================================================================
-- 1) projects: C&I discriminator + config/result columns
-- ================================================================
-- Mirrors residential_options/solution's role for C&I, under different
-- names on purpose (plan section 6.1's "débito técnico assumido
-- conscientemente") — renaming/reusing residential_options for C&I would
-- make a column mean two different things depending on installation_type.
alter table projects
  add column if not exists installation_type text not null default 'residential'
    check (installation_type in ('residential', 'commercial_industrial'));

alter table projects
  add column if not exists calculation_options jsonb not null default '{}'::jsonb;

-- Cache of the last selected/saved result, for opening a project without
-- re-querying project_calculation_runs — never the historical source of
-- truth (plan section 6.1).
alter table projects
  add column if not exists calculation_result jsonb;

alter table projects
  add column if not exists calculation_version text;

-- ================================================================
-- 2) project_calculation_runs: append-only study history
-- ================================================================
-- One row per calculation run. Snapshots are immutable once written (plan
-- section 1, decision 6) — editing a project's configuration never mutates
-- a past run, it only changes calculation_options for the *next* run.
create table if not exists project_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_type text not null check (installation_type in ('residential', 'commercial_industrial')),
  engine_version text not null,
  input_fingerprint text not null,
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  selected_scenario_id text,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists project_calculation_runs_project_idx
  on project_calculation_runs (project_id, created_at desc);

alter table project_calculation_runs enable row level security;

-- Owner-scoped by joining back to projects, same idiom as project_events
-- (0074_project_events.sql). No update/delete policy at all — that is what
-- makes this table append-only: RLS denies an action with no matching
-- policy by default, regardless of ownership.
create policy "users read own calculation runs"
  on project_calculation_runs for select
  to authenticated
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "users insert own calculation runs"
  on project_calculation_runs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  );

-- RLS policies alone are not enough — PostgREST/the Edge Function's
-- role still needs the underlying table privilege for the policy to ever
-- be evaluated (same lesson as 0090-0093's repairs for older tables;
-- confirmed empirically here with `supabase functions serve` against a
-- fresh local instance: a new table does not automatically inherit
-- select/insert/update/delete for authenticated/service_role in this
-- project's setup, only for the migration-running `postgres` role).
grant select, insert on table public.project_calculation_runs to authenticated;

-- ================================================================
-- 3) ci_bess_products: admin-managed BESS catalog
-- ================================================================
-- Technical specification only — no cost/markup columns. Pricing follows
-- the existing user_stock_items pattern (section below), same as
-- inverters/batteries already do for residential (plan section 4.3/6.1's
-- closed decision).
create table if not exists ci_bess_products (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  manufacturer text not null,
  description text,
  active boolean not null default true,
  module_power_kw numeric not null check (module_power_kw > 0),
  module_capacity_kwh numeric not null check (module_capacity_kwh > 0),
  efficiency_percent numeric not null check (efficiency_percent > 0 and efficiency_percent <= 100),
  soc_min_percent numeric not null check (soc_min_percent >= 0 and soc_min_percent < 100),
  soc_max_percent numeric not null check (soc_max_percent > 0 and soc_max_percent <= 100),
  warranty_years int not null check (warranty_years > 0),
  image_url text,
  documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (soc_min_percent < soc_max_percent)
);

alter table ci_bess_products enable row level security;

-- Same shape as approved_solutions' "public read active" policy, but
-- scoped to authenticated (plan section 4.3: "leitura restrita a usuários
-- autenticados"), not fully public.
create policy "authenticated read active ci_bess_products"
  on ci_bess_products for select
  to authenticated
  using (active);

-- Admin writes go through a service-role admin API route (same pattern as
-- load_catalog's admin editor), which bypasses RLS entirely — this policy
-- is defense-in-depth for the (currently unused) case of a direct
-- authenticated-role write.
create policy "admin write ci_bess_products"
  on ci_bess_products for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Matches load_catalog's exact grant shape (0093_grant_authenticated_user_data_access.sql):
-- authenticated only ever gets `select` at the privilege level, so the
-- "admin write" RLS policy above is truly defense-in-depth, not a usable
-- path — admin writes go through a service-role route, which needs the
-- full CRUD grant instead.
grant select on table public.ci_bess_products to authenticated;
grant select, insert, update, delete on table public.ci_bess_products to service_role;

-- ================================================================
-- 4) user_stock_items: add the C&I BESS product type
-- ================================================================
-- Extends the existing per-user pricing table (0044_user_stock_items.sql)
-- instead of inventing a parallel pricing mechanism for C&I.
alter table user_stock_items drop constraint if exists user_stock_items_product_type_check;
alter table user_stock_items add constraint user_stock_items_product_type_check
  check (product_type in ('inverter', 'battery', 'accessory', 'ci_bess'));
