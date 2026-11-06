-- STS extends the shared accessory ID, with C&I-only specifications and approvals.
create table public.ci_sts_specs (
  accessory_id uuid primary key references public.accessories(id) on delete restrict,
  active boolean not null default true,
  rated_current_380v_a numeric not null check (rated_current_380v_a > 0 and rated_current_380v_a < 'Infinity'::numeric),
  rated_current_400v_a numeric not null check (rated_current_400v_a > 0 and rated_current_400v_a < 'Infinity'::numeric),
  frequency_hz integer[] not null default '{50,60}' check (cardinality(frequency_hz) > 0 and frequency_hz <@ array[50,60] and array_position(frequency_hz,null) is null),
  ems_included boolean not null default false,
  reference_document text not null check (length(btrim(reference_document)) > 0),
  revision text not null check (length(btrim(revision)) > 0)
);
create table public.ci_sts_compatibility_rules (
  id uuid primary key default gen_random_uuid(),
  accessory_id uuid not null references public.ci_sts_specs(accessory_id) on delete restrict,
  pcs_id uuid references public.ci_pcs_specs(inverter_id) on delete restrict,
  bess_product_id uuid references public.ci_bess_products(id) on delete restrict,
  max_pcs integer not null check (max_pcs > 0),
  line_voltage_v integer not null check (line_voltage_v in (380,400)),
  frequency_hz integer not null check (frequency_hz in (50,60)),
  active boolean not null default true,
  approval_status text not null default 'draft' check (approval_status in ('draft','approved','revoked')),
  reference_document text not null default '',
  revision text not null default '',
  communication_profile text not null default '',
  firmware text not null default '',
  check ((pcs_id is null) <> (bess_product_id is null)),
  check (approval_status <> 'approved' or (length(btrim(reference_document))>0 and length(btrim(revision))>0 and length(btrim(communication_profile))>0 and length(btrim(firmware))>0))
);
create unique index ci_sts_pcs_target on public.ci_sts_compatibility_rules(accessory_id,pcs_id,line_voltage_v,frequency_hz) where pcs_id is not null;
create unique index ci_sts_bess_target on public.ci_sts_compatibility_rules(accessory_id,bess_product_id,line_voltage_v,frequency_hz) where bess_product_id is not null;
create function public.validate_ci_sts_approval() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.approval_status <> 'approved' or not new.active then return new; end if;
  if not exists (select 1 from public.ci_sts_specs s join public.accessories a on a.id=s.accessory_id where s.accessory_id=new.accessory_id and s.active and a.active and new.frequency_hz=any(s.frequency_hz)) then raise exception 'STS e acessório precisam estar ativos e suportar a frequência aprovada.'; end if;
  if new.pcs_id is not null and not exists (select 1 from public.ci_pcs_specs p where p.inverter_id=new.pcs_id and p.active and p.supports_backup and new.max_pcs<=p.max_parallel_units) then raise exception 'PCS deve suportar backup e a quantidade deve respeitar seu paralelismo.'; end if;
  if new.bess_product_id is not null and not exists (select 1 from public.ci_bess_products b where b.id=new.bess_product_id and b.active) then raise exception 'BESS integrado precisa estar ativo.'; end if;
  return new;
end $$;
create trigger ci_sts_approval before insert or update on public.ci_sts_compatibility_rules for each row execute function public.validate_ci_sts_approval();
alter table public.ci_sts_specs enable row level security;
alter table public.ci_sts_compatibility_rules enable row level security;
create policy "authenticated read active ci sts" on public.ci_sts_specs for select to authenticated using (active and exists(select 1 from public.accessories a where a.id=accessory_id and a.active));
create policy "authenticated read approved ci sts rules" on public.ci_sts_compatibility_rules for select to authenticated using (
 active and approval_status='approved' and exists(select 1 from public.ci_sts_specs s join public.accessories a on a.id=s.accessory_id where s.accessory_id=ci_sts_compatibility_rules.accessory_id and s.active and a.active)
 and ((pcs_id is not null and exists(select 1 from public.ci_pcs_specs p where p.inverter_id=pcs_id and p.active and p.supports_backup and max_pcs<=p.max_parallel_units))
 or (bess_product_id is not null and exists(select 1 from public.ci_bess_products b where b.id=bess_product_id and b.active)))
);
create policy "admin manage ci sts" on public.ci_sts_specs for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admin manage ci sts rules" on public.ci_sts_compatibility_rules for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.ci_sts_specs, public.ci_sts_compatibility_rules to authenticated;
grant select on public.ci_sts_specs, public.ci_sts_compatibility_rules to service_role;
alter table public.admin_activity_logs drop constraint if exists admin_activity_logs_entity_type_check;
alter table public.admin_activity_logs add constraint admin_activity_logs_entity_type_check check(entity_type in ('inverter','battery','accessory','ci_bess_product','ci_pcs','ci_battery','ci_compatibility','ci_sts','ci_sts_compatibility','solution','rule','load_catalog_item','load_preset'));
-- No manufacturer compatibility or maximum PCS count is seeded or inferred.
