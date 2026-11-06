-- C&I accessories do not use residential accessory_rules.
create table public.ci_accessory_rules (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name))>0),
 accessory_id uuid not null references public.ci_accessories(id) on delete restrict,
 active boolean not null default true,
 pcs_id uuid references public.ci_pcs_specs(inverter_id) on delete restrict,
 battery_id uuid references public.ci_battery_specs(battery_id) on delete restrict,
 bess_product_id uuid references public.ci_bess_products(id) on delete restrict,
 compatibility_id uuid references public.ci_compatibility_rules(id) on delete restrict,
 backup boolean, generator boolean, line_voltage_v integer check(line_voltage_v in (380,400)),
 inclusion text not null check(inclusion in ('required','optional','bundled')),
 metric text not null check(metric in ('system','pcs','battery','string','bess')),
 min_count integer not null default 1 check(min_count>0), max_count integer check(max_count>=min_count),
 quantity integer not null default 1 check(quantity>0), divisor integer not null default 1 check(divisor>0),
 requires_ids uuid[] not null default '{}', excludes_ids uuid[] not null default '{}',
 reference_document text not null check(length(btrim(reference_document))>0),
 check(not(accessory_id=any(requires_ids)) and not(accessory_id=any(excludes_ids))),
 check(not(requires_ids && excludes_ids)),
 check(array_position(requires_ids,null) is null and array_position(excludes_ids,null) is null),
 check(bess_product_id is null or (pcs_id is null and battery_id is null and compatibility_id is null))
);
create function public.validate_ci_accessory_dependencies() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from unnest(new.requires_ids || new.excludes_ids) as dependency(accessory_id) where not exists(select 1 from public.ci_accessories a where a.id=dependency.accessory_id)) then raise exception 'Dependências devem pertencer ao catálogo de acessórios C&I.'; end if;
 return new;
end $$;
create trigger ci_accessory_dependencies before insert or update on public.ci_accessory_rules for each row execute function public.validate_ci_accessory_dependencies();
alter table public.ci_accessory_rules enable row level security;
create policy "authenticated read active ci accessory rules" on public.ci_accessory_rules for select to authenticated using(active);
create policy "admin manage ci accessory rules" on public.ci_accessory_rules for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.ci_accessory_rules to authenticated;
grant select on public.ci_accessory_rules to service_role;
alter table public.admin_activity_logs drop constraint admin_activity_logs_entity_type_check;
alter table public.admin_activity_logs add constraint admin_activity_logs_entity_type_check check(entity_type in ('inverter','battery','accessory','ci_bess_product','ci_pcs','ci_battery','ci_compatibility','ci_sts','ci_sts_compatibility','ci_accessory','ci_accessory_rule','solution','rule','load_catalog_item','load_preset'));

-- Arrays represent documented dependencies: retain their product identities on deletion.
create function public.restrict_ci_accessory_dependency_delete() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.ci_accessory_rules r where old.id=any(r.requires_ids) or old.id=any(r.excludes_ids)) then
  raise foreign_key_violation using message='Acessório referenciado por dependências ou exclusões de regras C&I.';
 end if;
 return old;
end $$;
create trigger ci_accessory_dependency_delete before delete on public.ci_accessories for each row execute function public.restrict_ci_accessory_dependency_delete();
