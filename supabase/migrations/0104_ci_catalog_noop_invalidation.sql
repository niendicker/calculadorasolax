-- Saving an unchanged row must not invalidate the published catalog or a
-- generation in progress. Keep the revision and invalidation rules aligned:
-- only updated_at is bookkeeping; every other catalog field still counts.
create or replace function public.ci_solution_source() returns jsonb language plpgsql security definer
set search_path=public,pg_temp as $$
declare sources jsonb;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Apenas administradores podem gerar soluções C&I.';end if;
  select jsonb_build_object(
    'inverters',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_inverters t),'[]'),
    'batteries',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_batteries t),'[]'),
    'pcs',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by inverter_id) from public.ci_pcs_specs t),'[]'),
    'batterySpecs',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by battery_id) from public.ci_battery_specs t),'[]'),
    'rules',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_compatibility_rules t),'[]'),
    'products',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_bess_products t),'[]'),
    'accessories',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_accessories t),'[]'),
    'accessoryRules',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_accessory_rules t),'[]'),
    'sts',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by accessory_id) from public.ci_sts_specs t),'[]'),
    'stsRules',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_sts_compatibility_rules t),'[]')
  ) into sources;
  return jsonb_build_object('revision',md5(sources::text),'sources',sources);
end $$;

create or replace function public.invalidate_ci_solution_generation() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' then
    if (to_jsonb(new)-'updated_at') is not distinct from (to_jsonb(old)-'updated_at') then return null;end if;
  end if;
  perform pg_advisory_xact_lock(612014,1);
  update public.ci_solution_generations set is_current=false,invalidated_at=now(),invalidation_reason=tg_table_name where is_current;
  return null;
end $$;

-- Do not reactivate previously invalidated generations: their catalog may
-- have really changed. Publish a fresh generation after this migration.
