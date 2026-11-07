-- Documented electrical envelopes for a cabinet treated as one commercial module.
alter table public.ci_bess_products
  add column charge_power_kw numeric check(charge_power_kw > 0),
  add column ac_charge_efficiency_percent numeric check(ac_charge_efficiency_percent > 0 and ac_charge_efficiency_percent <= 100),
  add column ac_discharge_efficiency_percent numeric check(ac_discharge_efficiency_percent > 0 and ac_discharge_efficiency_percent <= 100),
  add column dc_voltage_min_v numeric check(dc_voltage_min_v > 0),
  add column dc_voltage_max_v numeric check(dc_voltage_max_v >= dc_voltage_min_v),
  add column dc_charge_current_a numeric check(dc_charge_current_a > 0),
  add column dc_discharge_current_a numeric check(dc_discharge_current_a > 0),
  add column dc_charge_power_kw numeric check(dc_charge_power_kw > 0),
  add column dc_discharge_power_kw numeric check(dc_discharge_power_kw > 0),
  add column electrical_reference text not null default '',
  add column supports_backup boolean not null default false,
  add column supports_solar boolean not null default false,
  add column supports_generator boolean not null default false;
alter table public.ci_compatibility_rules
  add column supports_solar boolean not null default false,
  add column supports_generator boolean not null default false;

create table public.ci_solution_generations (
  id uuid primary key default gen_random_uuid(),
  source_revision text not null,
  expected_count integer not null check(expected_count between 0 and 20000),
  status text not null default 'draft' check(status in ('draft','published','cancelled')),
  is_current boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  diagnostics jsonb not null default '[]' check(jsonb_typeof(diagnostics)='array'),
  check(not is_current or status='published')
);
create unique index ci_one_current_solution_generation on public.ci_solution_generations(is_current) where is_current;

create table public.ci_generated_solutions (
  generation_id uuid not null references public.ci_solution_generations(id) on delete cascade,
  solution_key text not null check(length(solution_key) between 1 and 200),
  source_kind text not null check(source_kind in ('cabinet','assembly')),
  source_id uuid not null,
  unit_count integer not null check(unit_count>0),
  series_count integer not null check(series_count>0),
  parallel_count integer not null check(parallel_count>0),
  discharge_power_kw numeric not null check(discharge_power_kw>0 and discharge_power_kw<'Infinity'::numeric),
  charge_power_kw numeric not null check(charge_power_kw>0 and charge_power_kw<'Infinity'::numeric),
  usable_energy_kwh numeric not null check(usable_energy_kwh>0 and usable_energy_kwh<'Infinity'::numeric),
  nominal_energy_kwh numeric not null check(nominal_energy_kwh>=usable_energy_kwh and nominal_energy_kwh<'Infinity'::numeric),
  applications text[] not null check(cardinality(applications)>0 and applications <@ array['peak_shaving','load_shifting','backup','solar','generator']::text[]),
  solution jsonb not null check(jsonb_typeof(solution)='object'),
  primary key(generation_id,solution_key),
  check(coalesce(solution->>'contractVersion'='ci-grouped-v1',false)),
  check(solution->>'key'=solution_key),
  check(solution->'source'->>'kind'=source_kind),
  check((solution->'source'->>'id')::uuid=source_id)
);
create index ci_generated_solution_requirement_idx on public.ci_generated_solutions(generation_id,discharge_power_kw,usable_energy_kwh);
create index ci_generated_solution_application_idx on public.ci_generated_solutions using gin(applications);
create index ci_generated_solution_source_idx on public.ci_generated_solutions(generation_id,source_kind,source_id,unit_count);

alter table public.ci_solution_generations enable row level security;
alter table public.ci_generated_solutions enable row level security;
create policy "read published ci generations" on public.ci_solution_generations for select to authenticated
  using(public.is_admin() or (is_current and status='published'));
create policy "read published ci solutions" on public.ci_generated_solutions for select to authenticated
  using(public.is_admin() or exists(select 1 from public.ci_solution_generations g where g.id=generation_id and g.is_current and g.status='published'));
-- Published snapshots are immutable to API clients, including administrators.
grant select on public.ci_solution_generations,public.ci_generated_solutions to authenticated,service_role;
revoke insert,update,delete on public.ci_solution_generations,public.ci_generated_solutions from authenticated;

-- One statement snapshot; JSONB canonical ordering supplies a deterministic revision.
create function public.ci_solution_source() returns jsonb language plpgsql security definer
set search_path=public,pg_temp as $$
declare sources jsonb;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Apenas administradores podem gerar soluções C&I.';end if;
  select jsonb_build_object(
    'inverters',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.ci_inverters t),'[]'),
    'batteries',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.ci_batteries t),'[]'),
    'pcs',coalesce((select jsonb_agg(to_jsonb(t) order by inverter_id) from public.ci_pcs_specs t),'[]'),
    'batterySpecs',coalesce((select jsonb_agg(to_jsonb(t) order by battery_id) from public.ci_battery_specs t),'[]'),
    'rules',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.ci_compatibility_rules t),'[]'),
    'products',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.ci_bess_products t),'[]'),
    'accessories',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.ci_accessories t),'[]'),
    'accessoryRules',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.ci_accessory_rules t),'[]'),
    'sts',coalesce((select jsonb_agg(to_jsonb(t) order by accessory_id) from public.ci_sts_specs t),'[]'),
    'stsRules',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.ci_sts_compatibility_rules t),'[]')
  ) into sources;
  return jsonb_build_object('revision',md5(sources::text),'sources',sources);
end $$;

create function public.ci_begin_solution_generation(p_source_revision text,p_expected_count integer) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare generation uuid;
begin
  if not public.is_admin() or auth.uid() is null then raise insufficient_privilege using message='Acesso negado.';end if;
  if public.ci_solution_source()->>'revision'<>p_source_revision then raise exception 'O catálogo mudou. Gere novamente as soluções.';end if;
  insert into public.ci_solution_generations(source_revision,expected_count,created_by) values(p_source_revision,p_expected_count,auth.uid()) returning id into generation;
  return generation;
end $$;

create function public.ci_append_solution_generation(p_generation_id uuid,p_solutions jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare expected integer;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Acesso negado.';end if;
  select expected_count into expected from public.ci_solution_generations where id=p_generation_id and created_by=auth.uid() and status='draft' for update;
  if not found then raise exception 'Geração indisponível para edição.';end if;
  if jsonb_typeof(p_solutions)<>'array' or jsonb_array_length(p_solutions)>500 then raise exception 'Lote de soluções inválido.';end if;
  insert into public.ci_generated_solutions(generation_id,solution_key,source_kind,source_id,unit_count,series_count,parallel_count,discharge_power_kw,charge_power_kw,usable_energy_kwh,nominal_energy_kwh,applications,solution)
  select p_generation_id,s->>'key',s->'source'->>'kind',(s->'source'->>'id')::uuid,
    (s->'counts'->>'units')::integer,(s->'counts'->>'series')::integer,(s->'counts'->>'parallel')::integer,
    (s->'ac'->>'dischargePowerKw')::numeric,(s->'ac'->>'chargePowerKw')::numeric,
    (s->'storage'->>'usableEnergyKwh')::numeric,(s->'storage'->>'nominalEnergyKwh')::numeric,
    array(select jsonb_array_elements_text(s->'applications')),s
  from jsonb_array_elements(p_solutions) s;
  if (select count(*) from public.ci_generated_solutions where generation_id=p_generation_id)>expected then raise exception 'Quantidade de soluções excede a geração declarada.';end if;
end $$;

create function public.ci_publish_solution_generation(p_generation_id uuid,p_diagnostics jsonb default '[]') returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare generation public.ci_solution_generations;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Acesso negado.';end if;
  perform pg_advisory_xact_lock(612014,1);
  select * into generation from public.ci_solution_generations where id=p_generation_id and created_by=auth.uid() for update;
  if not found then raise exception 'Geração não encontrada.';end if;
  if generation.status='published' and generation.is_current then return generation.id;end if;
  if generation.status<>'draft' then raise exception 'Geração indisponível para publicação.';end if;
  if public.ci_solution_source()->>'revision'<>generation.source_revision then raise exception 'O catálogo mudou durante a geração. Gere novamente as soluções.';end if;
  if (select count(*) from public.ci_generated_solutions where generation_id=p_generation_id)<>generation.expected_count then raise exception 'Geração incompleta. Nenhuma solução foi publicada.';end if;
  update public.ci_solution_generations set is_current=false where is_current;
  update public.ci_solution_generations set status='published',is_current=true,published_at=now(),diagnostics=p_diagnostics where id=p_generation_id;
  return p_generation_id;
end $$;

create function public.ci_cancel_solution_generation(p_generation_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise insufficient_privilege using message='Acesso negado.';end if;
  update public.ci_solution_generations set status='cancelled' where id=p_generation_id and created_by=auth.uid() and status='draft';
  if found then delete from public.ci_generated_solutions where generation_id=p_generation_id;end if;
end $$;

create function public.invalidate_ci_solution_generation() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(612014,1);
  update public.ci_solution_generations set is_current=false,invalidated_at=now(),invalidation_reason=tg_table_name where is_current;
  return null;
end $$;
do $$declare tab text;begin
  foreach tab in array array['ci_inverters','ci_batteries','ci_pcs_specs','ci_battery_specs','ci_compatibility_rules','ci_bess_products','ci_accessories','ci_accessory_rules','ci_sts_specs','ci_sts_compatibility_rules'] loop
    execute format('create trigger invalidate_ci_solutions after insert or update or delete on public.%I for each row execute function public.invalidate_ci_solution_generation()',tab);
  end loop;
end $$;
revoke all on function public.ci_solution_source(),public.ci_begin_solution_generation(text,integer),public.ci_append_solution_generation(uuid,jsonb),public.ci_publish_solution_generation(uuid,jsonb),public.ci_cancel_solution_generation(uuid),public.invalidate_ci_solution_generation() from public;
grant execute on function public.ci_solution_source(),public.ci_begin_solution_generation(text,integer),public.ci_append_solution_generation(uuid,jsonb),public.ci_publish_solution_generation(uuid,jsonb),public.ci_cancel_solution_generation(uuid) to authenticated;
